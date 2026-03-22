// src/app/api/earthquakes/route.ts
// 读取 Redis 预计算缓存（由腾讯云 cron 每5分钟写入）
// 兼容：Redis 无数据时降级实时计算

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CACHE_KEY = 'earthquakes:analyzed';
const USGS_API  = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

async function getFromRedis(): Promise<any | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(CACHE_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.result) return null;
    return JSON.parse(d.result);
  } catch { return null; }
}

// 降级：实时计算（逻辑与原版相同，仅作为备用）
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function minDistToRoute(lat: number, lon: number, coords: number[][]): number {
  let min = Infinity;
  for (let i = 0; i < coords.length; i += 5) {
    const d = haversineDistance(lat, lon, coords[i][1], coords[i][0]);
    if (d < min) min = d;
  }
  return min;
}
function getRadius(m: number) { return m>=8?500:m>=7?300:m>=6?150:m>=5?80:50; }
function getRisk(m: number, d: number) {
  const r = d/getRadius(m);
  return r<0.3?'HIGH':r<0.7?'MEDIUM':r<1?'LOW':'NONE';
}

async function computeLive(analyzeCables: boolean) {
  const usgsRes = await fetch(USGS_API, { next: { revalidate: 300 } });
  if (!usgsRes.ok) throw new Error('USGS fetch failed');
  const { features = [] } = await usgsRes.json();

  const earthquakes = features.map((f: any) => {
    const p = f.properties, [lon, lat, depth] = f.geometry.coordinates;
    return { id: f.id, magnitude: p.mag, place: p.place, time: new Date(p.time).toISOString(),
      tsunami: p.tsunami===1, depth, latitude: lat, longitude: lon, url: p.url,
      displaySize: Math.max(6, p.mag*4),
      severity: p.mag>=7?'critical':p.mag>=6?'major':p.mag>=5?'moderate':'minor' };
  });

  if (!analyzeCables) return { count: earthquakes.length, earthquakes, source: 'USGS (live)', updated: new Date().toISOString() };

  const cables = await prisma.cable.findMany({
    where: { routeGeojson: { not: null as any }, status: { in: ['IN_SERVICE','UNDER_CONSTRUCTION'] } },
    select: { id: true, name: true, slug: true, routeGeojson: true },
  });

  const affectedCables: any[] = [];
  for (const eq of earthquakes) {
    const radius = getRadius(eq.magnitude), near: any[] = [];
    for (const c of cables) {
      if (!c.routeGeojson) continue;
      const geo = c.routeGeojson as any;
      const coords: number[][] = geo.type==='MultiLineString' ? geo.coordinates.flat() : geo.coordinates || [];
      if (!coords.length) continue;
      const lats = coords.map((p:number[]) => p[1]), lons = coords.map((p:number[]) => p[0]);
      if (eq.latitude < Math.min(...lats)-10 || eq.latitude > Math.max(...lats)+10 ||
          eq.longitude < Math.min(...lons)-10 || eq.longitude > Math.max(...lons)+10) continue;
      const dist = minDistToRoute(eq.latitude, eq.longitude, coords);
      if (dist <= radius) near.push({ cableId: c.id, cableName: c.name, cableSlug: c.slug, distanceKm: Math.round(dist), riskLevel: getRisk(eq.magnitude, dist) });
    }
    near.sort((a,b) => a.distanceKm-b.distanceKm);
    if (near.length > 0) affectedCables.push({ earthquakeId: eq.id, magnitude: eq.magnitude, place: eq.place, time: eq.time, affectedCount: near.length, cables: near.slice(0,10) });
  }

  return {
    count: earthquakes.length, earthquakes,
    analysis: { totalAffectedCables: affectedCables.reduce((s,a)=>s+a.affectedCount,0), events: affectedCables.sort((a,b)=>b.magnitude-a.magnitude) },
    source: 'USGS (live fallback)', updated: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const analyzeCables = new URL(request.url).searchParams.get('analyze') === 'true';

  try {
    // 优先读 Redis 预计算缓存
    const cached = await getFromRedis();
    if (cached) {
      // 如果不需要分析，剥掉 analysis 字段
      const result = analyzeCables ? cached : { count: cached.count, earthquakes: cached.earthquakes, source: cached.source, updated: cached.updated };
      return NextResponse.json({ ...result, source: 'redis_cache' }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=240', 'X-Cache': 'HIT' },
      });
    }

    // 降级：实时计算
    console.warn('[earthquakes] Redis cache miss, computing live');
    const live = await computeLive(analyzeCables);
    return NextResponse.json(live, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Earthquake API error:', error);
    return NextResponse.json({ error: 'Failed to process earthquake data' }, { status: 500 });
  }
}

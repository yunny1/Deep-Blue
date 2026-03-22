// scripts/earthquake-precompute.ts
// 地震数据预计算脚本 — 腾讯云每5分钟运行
// 拉取 USGS 数据 + 计算海缆影响 → 写入 Redis

import { PrismaClient } from '@prisma/client';
import { Redis } from '@upstash/redis';

const prisma = new PrismaClient();
const redis  = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const CACHE_KEY = 'earthquakes:analyzed';
const CACHE_TTL = 10 * 60; // 10分钟

const USGS_API = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function minDistanceToRoute(eqLat: number, eqLon: number, coords: number[][], interval = 5): number {
  let min = Infinity;
  for (let i = 0; i < coords.length; i += interval) {
    const d = haversineDistance(eqLat, eqLon, coords[i][1], coords[i][0]);
    if (d < min) min = d;
  }
  return min;
}

function getImpactRadius(mag: number): number {
  if (mag >= 8.0) return 500;
  if (mag >= 7.0) return 300;
  if (mag >= 6.0) return 150;
  if (mag >= 5.0) return 80;
  return 50;
}

function getRiskLevel(mag: number, dist: number): string {
  const ratio = dist / getImpactRadius(mag);
  if (ratio < 0.3) return 'HIGH';
  if (ratio < 0.7) return 'MEDIUM';
  if (ratio < 1.0) return 'LOW';
  return 'NONE';
}

function getSeverity(mag: number): string {
  if (mag >= 7) return 'critical';
  if (mag >= 6) return 'major';
  if (mag >= 5) return 'moderate';
  return 'minor';
}

async function main() {
  console.log(`[Earthquake Precompute] 开始 ${new Date().toISOString()}`);

  // 1. 拉取 USGS
  const usgsRes = await fetch(USGS_API, { headers: { 'User-Agent': 'DeepBlue/6.0' } });
  if (!usgsRes.ok) throw new Error(`USGS fetch failed: ${usgsRes.status}`);
  const usgsData = await usgsRes.json();
  const features = usgsData.features || [];
  console.log(`  USGS: ${features.length} 次地震`);

  // 2. 格式化地震数据
  const earthquakes = features.map((f: any) => {
    const p = f.properties;
    const [lon, lat, depth] = f.geometry.coordinates;
    return {
      id: f.id, magnitude: p.mag, place: p.place,
      time: new Date(p.time).toISOString(),
      tsunami: p.tsunami === 1, depth,
      latitude: lat, longitude: lon,
      url: p.url, type: p.type,
      displaySize: Math.max(6, p.mag * 4),
      severity: getSeverity(p.mag),
    };
  });

  // 3. 拉取所有有路由数据的在役海缆
  const cables = await prisma.cable.findMany({
    where: { routeGeojson: { not: null as any }, status: { in: ['IN_SERVICE', 'UNDER_CONSTRUCTION'] } },
    select: { id: true, name: true, slug: true, status: true, routeGeojson: true },
  });
  console.log(`  海缆: ${cables.length} 条参与分析`);

  // 4. 计算地震影响
  const affectedCables: any[] = [];
  for (const eq of earthquakes) {
    const radius = getImpactRadius(eq.magnitude);
    const near: any[] = [];

    for (const cable of cables) {
      if (!cable.routeGeojson) continue;
      const geo = cable.routeGeojson as any;
      let allCoords: number[][] = [];
      if (geo.type === 'MultiLineString') allCoords = geo.coordinates.flat();
      else if (geo.type === 'LineString') allCoords = geo.coordinates;
      if (allCoords.length === 0) continue;

      // 快速粗筛
      const lats = allCoords.map((c: number[]) => c[1]);
      const lons = allCoords.map((c: number[]) => c[0]);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);
      if (eq.latitude < minLat-10 || eq.latitude > maxLat+10 || eq.longitude < minLon-10 || eq.longitude > maxLon+10) continue;

      const dist = minDistanceToRoute(eq.latitude, eq.longitude, allCoords);
      if (dist <= radius) {
        near.push({ cableId: cable.id, cableName: cable.name, cableSlug: cable.slug, distanceKm: Math.round(dist), riskLevel: getRiskLevel(eq.magnitude, dist) });
      }
    }

    near.sort((a, b) => a.distanceKm - b.distanceKm);
    if (near.length > 0) {
      affectedCables.push({
        earthquakeId: eq.id, magnitude: eq.magnitude, place: eq.place,
        time: eq.time, affectedCount: near.length, cables: near.slice(0, 10),
      });
    }
  }

  // 5. 组装结果
  const payload = {
    count: earthquakes.length,
    earthquakes,
    analysis: {
      totalAffectedCables: affectedCables.reduce((s, a) => s + a.affectedCount, 0),
      events: affectedCables.sort((a, b) => b.magnitude - a.magnitude),
    },
    source: 'USGS Earthquake Hazards Program',
    updated: new Date().toISOString(),
  };

  // 6. 写入 Redis
  await redis.set(CACHE_KEY, JSON.stringify(payload), { ex: CACHE_TTL });
  console.log(`  Redis 写入: ✓  地震 ${earthquakes.length} 次，影响海缆事件 ${affectedCables.length} 个`);
  console.log(`[Earthquake Precompute] 完成`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('[Earthquake Precompute] 崩溃:', e);
  await prisma.$disconnect();
  process.exit(1);
});

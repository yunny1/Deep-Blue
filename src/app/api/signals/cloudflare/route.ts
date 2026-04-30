// src/app/api/signals/cloudflare/route.ts
// Cloudflare Radar 互联网中断监测
// Redis 缓存 5 分钟，避免每个用户都打外部 API

import { NextResponse } from 'next/server';

const CACHE_KEY = 'signals:cloudflare';
const CACHE_TTL = 5 * 60; // 5分钟

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
    const parsed = JSON.parse(d.result);
    // 检查是否在有效期内（防止 Redis TTL 未生效时返回过期数据）
    const age = Date.now() - new Date(parsed.lastChecked).getTime();
    if (age > CACHE_TTL * 1000) return null;
    return parsed;
  } catch { return null; }
}

async function writeToRedis(data: any): Promise<void> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(CACHE_KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([JSON.stringify(data), 'EX', CACHE_TTL]),
      cache: 'no-store',
    });
  } catch {}
}

async function fetchFromCloudflare(): Promise<any> {
  const CF_TOKEN = process.env.CLOUDFLARE_RADAR_TOKEN;

  if (!CF_TOKEN) {
    return { status: 'NORMAL', activeOutages: 0, affectedCountries: [], events: [], lastChecked: new Date().toISOString(), source: 'cloudflare_radar', error: 'No API token' };
  }

  // 最近24小时的互联网中断事件
  const since = new Date(Date.now() - 24*60*60*1000).toISOString();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/radar/annotations/outages?dateRange=1d&limit=20`,
    {
      headers: { Authorization: `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    }
  );

  if (!res.ok) throw new Error(`Cloudflare API ${res.status}`);
  const json = await res.json();
  const outages = json.result?.annotations || [];

  const events = outages.map((o: any) => ({
    id: String(o.id || ''),
    description: o.outage?.description || o.description || 'Internet disruption detected',
    affectedCountries: o.locations?.map((l: any) => l.code || l) || [],
    startDate: o.startDate || o.eventDate || new Date().toISOString(),
    isOngoing: !o.endDate,
  }));

  const activeOutages = events.filter((e: any) => e.isOngoing).length;
  const allCountries  = [...new Set(events.flatMap((e: any) => e.affectedCountries))] as string[];

  let status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED' = 'NORMAL';
  if (activeOutages >= 3) status = 'DISRUPTED';
  else if (activeOutages >= 1) status = 'DEGRADED';

  return { status, activeOutages, affectedCountries: allCountries, events, lastChecked: new Date().toISOString(), source: 'cloudflare_radar' };
}

export async function GET() {
  try {
    // 1. 先读 Redis 缓存
    const cached = await getFromRedis();
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=240', 'X-Cache': 'HIT' },
      });
    }

    // 2. 缓存没有，请求 Cloudflare
    const data = await fetchFromCloudflare();

    // 3. 写入 Redis
    await writeToRedis(data);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Cloudflare signal error:', error);
    // 降级：返回正常状态，不让前端报错
    return NextResponse.json({
      status: 'NORMAL', activeOutages: 0, affectedCountries: [], events: [],
      lastChecked: new Date().toISOString(), source: 'cloudflare_radar', error: 'Fetch failed',
    });
  }
}

// src/app/api/stats/route.ts
// 统计数据 API — Redis 缓存1小时，避免频繁查 DB

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CACHE_KEY = 'stats:global';
const CACHE_TTL = 60 * 60; // 1小时

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

export async function GET() {
  try {
    // 1. 先读缓存
    const cached = await getFromRedis();
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'X-Cache': 'HIT' },
      });
    }

    // 2. 查 DB
    const [totalCables, inService, underConstruction, planned, totalStations, totalCountries] = await Promise.all([
      prisma.cable.count(),
      prisma.cable.count({ where: { status: 'IN_SERVICE' } }),
      prisma.cable.count({ where: { status: 'UNDER_CONSTRUCTION' } }),
      prisma.cable.count({ where: { status: 'PLANNED' } }),
      prisma.landingStation.count(),
      prisma.country.count(),
    ]);

    const data = {
      cables: { total: totalCables, inService, underConstruction, planned },
      landingStations: totalStations,
      countries: totalCountries,
    };

    // 3. 写 Redis
    await writeToRedis(data);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

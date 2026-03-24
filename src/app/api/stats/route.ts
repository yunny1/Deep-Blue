// src/app/api/stats/route.ts
// 统计数据 API — Redis 缓存1小时，包含精确海缆分类
// v8: 排除 REMOVED + mergedInto
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CACHE_KEY = 'stats:global';
const CACHE_TTL = 60 * 60;

const DOMESTIC_OVERRIDES: Record<string, string[]> = {
  'taiwan-strait-express-1': ['CN', 'TW', 'HK', 'MO'],
};

// v8: 基础过滤条件 — 排除已合并 + 已移除 + 待审核
const ACTIVE_FILTER = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED'] as string[] },
};

async function getFromRedis(): Promise<any | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(CACHE_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d.result) return null;
    const raw = JSON.parse(d.result);
    const actual = Array.isArray(raw) ? raw[0] : raw;
    return typeof actual === 'string' ? JSON.parse(actual) : actual;
  } catch { return null; }
}

async function writeToRedis(data: any): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
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
    const cached = await getFromRedis();
    if (cached?.cables?.activeInternational !== undefined) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'X-Cache': 'HIT' },
      });
    }

    // v8: 所有查询使用统一的 ACTIVE_FILTER
    const [totalCables, inService, underConstruction, planned, decommissioned, totalStations, totalCountries] = await Promise.all([
      prisma.cable.count({ where: ACTIVE_FILTER }),
      prisma.cable.count({ where: { status: 'IN_SERVICE', mergedInto: null } }),
      prisma.cable.count({ where: { status: 'UNDER_CONSTRUCTION', mergedInto: null } }),
      prisma.cable.count({ where: { status: 'PLANNED', mergedInto: null } }),
      prisma.cable.count({ where: { status: 'DECOMMISSIONED', mergedInto: null } }),
      prisma.landingStation.count(),
      prisma.country.count({ where: { landingStations: { some: {} } } }),
    ]);

    const inServiceCables = await prisma.cable.findMany({
      where: { status: 'IN_SERVICE', mergedInto: null },
      select: {
        slug: true,
        landingStations: {
          select: { landingStation: { select: { countryCode: true } } },
        },
      },
    });

    let activeInternational = 0, activeDomestic = 0;
    for (const cable of inServiceCables) {
      const allCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];

      const override = DOMESTIC_OVERRIDES[cable.slug];
      if (override) {
        if (allCodes.every(c => override.includes(c))) { activeDomestic++; continue; }
      }

      if (new Set(allCodes).size <= 1) { activeDomestic++; continue; }
      activeInternational++;
    }

    const lengthResult = await prisma.cable.aggregate({
      _sum: { lengthKm: true },
      where: ACTIVE_FILTER,
    });
    const totalLengthKm = Math.round((lengthResult._sum.lengthKm || 0) / 10000) * 10000;

    const data = {
      cables: {
        total: totalCables,
        inService, underConstruction, planned, decommissioned,
        activeInternational, activeDomestic,
      },
      landingStations: totalStations,
      countries: totalCountries,
      totalLengthKm,
    };

    await writeToRedis(data);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

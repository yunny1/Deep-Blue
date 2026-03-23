// src/app/api/stats/route.ts
// 统计数据 API — Redis 缓存1小时，包含海缆类型分类
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CACHE_KEY = 'stats:global';
const CACHE_TTL = 60 * 60;

// 强制国内线覆盖：slug → 所属国家代码组（以逗号分隔）
const DOMESTIC_OVERRIDES: Record<string, string[]> = {
  'taiwan-strait-express-1': ['CN', 'TW', 'HK', 'MO'],
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
    return JSON.parse(d.result);
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
    if (cached) {
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'X-Cache': 'HIT' },
      });
    }

    // 基础计数
    const [totalCables, inService, underConstruction, planned, totalStations, totalCountries] = await Promise.all([
      prisma.cable.count({ where: { status: { not: 'PENDING_REVIEW' } } }),
      prisma.cable.count({ where: { status: 'IN_SERVICE' } }),
      prisma.cable.count({ where: { status: 'UNDER_CONSTRUCTION' } }),
      prisma.cable.count({ where: { status: 'PLANNED' } }),
      prisma.landingStation.count(),
      prisma.country.count({ where: { landingStations: { some: {} } } }),
    ]);

    // 海缆类型分类（国际/国内/支线）
    const cables = await prisma.cable.findMany({
      where: { status: { not: 'PENDING_REVIEW' } },
      select: {
        slug: true,
        landingStations: {
          select: { landingStation: { select: { countryCode: true } } },
        },
      },
    });

    let international = 0, domestic = 0, branch = 0;
    for (const cable of cables) {
      const allCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];

      // 检查强制覆盖
      const override = DOMESTIC_OVERRIDES[cable.slug];
      if (override) {
        const isDomestic = allCodes.every(c => override.includes(c));
        if (isDomestic) { domestic++; continue; }
      }

      // 国内线：所有登陆站都在同一个国家
      const uniqueCountries = new Set(allCodes);
      if (uniqueCountries.size <= 1) { domestic++; continue; }

      // 支线：本地只有1个登陆站且总站超过4
      const isBranch = cable.landingStations.length === 1 && cables.length > 4;
      if (isBranch) { branch++; continue; }

      international++;
    }

    // 总铺设里程
    const lengthResult = await prisma.cable.aggregate({
      _sum: { lengthKm: true },
      where: { status: { not: 'PENDING_REVIEW' } },
    });
    const totalLengthKm = Math.round((lengthResult._sum.lengthKm || 0) / 10000) * 10000;

    const data = {
      cables: {
        total: totalCables,
        inService, underConstruction, planned,
        international, domestic, branch,
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

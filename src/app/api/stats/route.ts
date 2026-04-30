// src/app/api/stats/route.ts
// 统计数据 API — Redis 缓存1小时,包含精确海缆分类
// v8: 排除 REMOVED + mergedInto
// v9(本轮): 改用 src/lib/cable-filters.ts 中的统一过滤器,与全平台一致
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ACTIVE_CABLE_FILTER, IN_SERVICE_FILTER, withInService } from '@/lib/cable-filters';

const CACHE_KEY = 'stats:global';
const CACHE_TTL = 60 * 60;

// 大中华区国家/地区代码:这些代码之间的海缆自动归为国内线
const CHINA_DOMESTIC_GROUP = ['CN', 'TW', 'HK', 'MO'];

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

    // v9: 总数用 ACTIVE_CABLE_FILTER(包含历史数据);
    //     分项计数用 withInService 等组合工具,避免硬编码 mergedInto: null
    const [totalCables, inService, underConstruction, planned, decommissioned, totalStations, totalCountries] = await Promise.all([
      prisma.cable.count({ where: ACTIVE_CABLE_FILTER }),
      prisma.cable.count({ where: { mergedInto: null, status: 'IN_SERVICE' } }),
      prisma.cable.count({ where: { mergedInto: null, status: 'UNDER_CONSTRUCTION' } }),
      prisma.cable.count({ where: { mergedInto: null, status: 'PLANNED' } }),
      prisma.cable.count({ where: { mergedInto: null, status: 'DECOMMISSIONED' } }),
      prisma.landingStation.count(),
      prisma.country.count({ where: { landingStations: { some: {} } } }),
    ]);

    const inServiceCables = await prisma.cable.findMany({
      where: IN_SERVICE_FILTER, // v9: 使用统一的 IN_SERVICE 过滤器
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

      if (allCodes.length > 1 && allCodes.every(c => CHINA_DOMESTIC_GROUP.includes(c))) { activeDomestic++; continue; }

      if (new Set(allCodes).size <= 1) { activeDomestic++; continue; }
      activeInternational++;
    }

    const lengthResult = await prisma.cable.aggregate({
      _sum: { lengthKm: true },
      where: ACTIVE_CABLE_FILTER, // v9: 使用统一过滤器
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

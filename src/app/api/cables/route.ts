// src/app/api/cables/route.ts
// 海缆数据 API v5 — Redis 缓存优先
// v9: 新增 isApproximateRoute 标记(大圆弧近似路由用虚线渲染)
// v8: 排除 REMOVED + mergedInto,返回 isNew / statusChanged 标记
// v5(本轮): 过滤条件改用 src/lib/cable-filters.ts 的 ACTIVE_CABLE_FILTER,
//        与全平台保持一致

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ACTIVE_CABLE_FILTER } from '@/lib/cable-filters';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function getCacheKey(includeGeo: boolean, includeDetails: boolean): string {
  if (includeGeo && includeDetails) return 'cables:geo:details';
  if (includeGeo) return 'cables:geo';
  return 'cables:list';
}

async function redisGet(key: string): Promise<any | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;

    const parsed = JSON.parse(data.result);
    if (parsed.value && typeof parsed.value === 'string' && !parsed.cables) {
      return JSON.parse(parsed.value);
    }
    return parsed;
  } catch { return null; }
}

async function redisSet(key: string, value: string, exSeconds: number): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value, ex: exSeconds }),
    });
  } catch {}
}

// v8: 7天内算"新增"或"状态变更"
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeGeo     = searchParams.get('geo') === 'true';
  const includeDetails = searchParams.get('details') === 'true';
  const skipCache      = searchParams.get('nocache') === 'true';

  const cacheKey = getCacheKey(includeGeo, includeDetails);

  if (!skipCache) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'X-Cache': 'HIT',
          'X-Cache-Key': cacheKey,
        },
      });
    }
  }

  try {
    const cables = await prisma.cable.findMany({
      where: ACTIVE_CABLE_FILTER, // v5: 改用统一过滤器,与全平台一致
      select: {
        id: true, name: true, slug: true, status: true,
        rfsDate: true, lengthKm: true, designCapacityTbps: true, fiberPairs: true,
        firstSeenAt: true,          // v8: 用于 isNew 标记
        statusChangedAt: true,      // v8: 用于 statusChanged 标记
        previousStatus: true,       // v8: 变更前的状态
        isApproximateRoute: true,   // v9: 大圆弧近似路由标记
        ...(includeGeo ? { routeGeojson: true } : {}),
        ...(includeDetails ? {
          vendor: { select: { name: true } },
          owners: { select: { company: { select: { name: true } } } },
        } : {}),
      },
      orderBy: [
        { status: 'asc' },
        { name: 'asc' },
      ],
    });

    const now = Date.now();
    const cablesWithFlags = cables.map(c => ({
      ...c,
      // v8: 7天内首次出现 → 新增标记
      isNew: c.firstSeenAt ? (now - new Date(c.firstSeenAt).getTime()) < SEVEN_DAYS_MS : false,
      // v8: 7天内状态变更 → 变更标记
      statusChanged: c.statusChangedAt ? (now - new Date(c.statusChangedAt).getTime()) < SEVEN_DAYS_MS : false,
      // v9: 近似路由标记(前端用虚线渲染)
      isApproximateRoute: (c as any).isApproximateRoute ?? false,
    }));

    const payload = { total: cablesWithFlags.length, cables: cablesWithFlags, generatedAt: new Date().toISOString() };

    const ttl = includeGeo ? 12 * 3600 : 3600;
    redisSet(cacheKey, JSON.stringify(payload), ttl).catch(() => {});

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Cache': 'MISS',
        'X-Cache-Key': cacheKey,
      },
    });
  } catch (error) {
    console.error('Failed to fetch cables:', error);
    return NextResponse.json({ error: 'Failed to fetch cables' }, { status: 500 });
  }
}

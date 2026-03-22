// src/app/api/cables/route.ts
// 海缆数据 API v2 — Redis 缓存优先
// 首次加载从数据库查询后写入 Redis，后续请求直接读缓存
// 缓存由 nightly-sync.ts 每晚刷新

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Redis key 设计：
//   cables:geo:details   — 包含 GeoJSON + vendor/owners（地图渲染用）
//   cables:list          — 不含 GeoJSON（列表页/搜索用）
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
      next: { revalidate: 300 }, // Next.js 层缓存 5 分钟
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeGeo     = searchParams.get('geo') === 'true';
  const includeDetails = searchParams.get('details') === 'true';
  const skipCache      = searchParams.get('nocache') === 'true';

  const cacheKey = getCacheKey(includeGeo, includeDetails);

  // ── 1. 读 Redis 缓存 ──────────────────────────────────────────
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

  // ── 2. 缓存未命中：查数据库 ───────────────────────────────────
  try {
    const cables = await prisma.cable.findMany({
      where: {
        // 只返回有路由数据的海缆（PENDING_REVIEW 暂不对外显示）
        NOT: { status: 'PENDING_REVIEW' },
        ...(includeGeo ? { routeGeojson: { not: null } } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        rfsDate: true,
        lengthKm: true,
        designCapacityTbps: true,
        fiberPairs: true,
        routeGeojson: includeGeo,
        vendor: includeDetails ? { select: { name: true } } : false,
        owners: includeDetails
          ? { select: { company: { select: { name: true } } } }
          : false,
      },
      orderBy: [
        // 在役的排前面，加载时优先渲染
        { status: 'asc' },
        { name: 'asc' },
      ],
    });

    const payload = { total: cables.length, cables, generatedAt: new Date().toISOString() };

    // ── 3. 写入 Redis 缓存（异步，不阻塞响应）──────────────────
    // geo+details 数据量大，缓存 12 小时；list 缓存 1 小时
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

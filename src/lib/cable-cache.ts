// src/lib/cable-cache.ts
// 海缆数据的 Redis 智能缓存层
// 解决原本 cables/route.ts 每次都直接查 Supabase 的性能问题
// 两个失效触发器：
//   1. 凌晨3点 cron → 全量刷新
//   2. AI 检测到重要新闻 → 精准刷新受影响区域

import { Redis } from '@upstash/redis';
import { prisma } from '@/lib/db';

// 复用已有的 Upstash Redis 连接（从环境变量自动读取）
const redis = Redis.fromEnv();

// 缓存 Key 定义
const CABLE_ALL_KEY = 'cables:all:geo';       // 全量海缆（含GeoJSON）
const CABLE_LIGHT_KEY = 'cables:all:light';   // 轻量海缆（不含GeoJSON，用于列表）

// 缓存过期时间：24小时（凌晨3点的 cron 会在到期前主动刷新）
const TTL_24H = 60 * 60 * 24;

// ─────────────────────────────────────────
// 读取：全量海缆数据（含 GeoJSON 路由）
// 地球渲染时调用，数据量最大，最需要缓存
// ─────────────────────────────────────────
export async function getCablesWithGeo() {
  try {
    const cached = await redis.get(CABLE_ALL_KEY);
    if (cached) {
      console.log('[CableCache] HIT — cables:all:geo from Redis');
      return cached as any[];
    }
  } catch (e) {
    // Redis 挂了也不影响主流程，直接降级查数据库
    console.warn('[CableCache] Redis read failed, falling back to Supabase');
  }

  console.log('[CableCache] MISS — querying Supabase for all cables with geo');
  const cables = await prisma.cable.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      rfsDate: true,
      lengthKm: true,
      designCapacityTbps: true,
      fiberPairs: true,
      routeGeojson: true,           // GeoJSON 路由坐标（这是最重的字段）
      vendor: { select: { name: true } },
      owners: { select: { company: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  // 写入 Redis，下次请求直接命中，不再查 Supabase
  try {
    await redis.set(CABLE_ALL_KEY, cables, { ex: TTL_24H });
    console.log(`[CableCache] Cached ${cables.length} cables (with geo) to Redis`);
  } catch (e) {
    console.warn('[CableCache] Redis write failed:', e);
  }

  return cables;
}

// ─────────────────────────────────────────
// 读取：轻量海缆数据（不含 GeoJSON）
// 用于搜索、列表等不需要地图渲染的场景
// ─────────────────────────────────────────
export async function getCablesLight() {
  try {
    const cached = await redis.get(CABLE_LIGHT_KEY);
    if (cached) {
      console.log('[CableCache] HIT — cables:all:light from Redis');
      return cached as any[];
    }
  } catch (e) {
    console.warn('[CableCache] Redis read failed, falling back to Supabase');
  }

  const cables = await prisma.cable.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      rfsDate: true,
      lengthKm: true,
      designCapacityTbps: true,
      fiberPairs: true,
      // routeGeojson 故意不选，保持轻量
      vendor: { select: { name: true } },
      owners: { select: { company: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  });

  try {
    await redis.set(CABLE_LIGHT_KEY, cables, { ex: TTL_24H });
  } catch (e) {
    console.warn('[CableCache] Redis write failed:', e);
  }

  return cables;
}

// ─────────────────────────────────────────
// 失效：清除所有海缆缓存
// 由凌晨3点的 cron 脚本触发
// ─────────────────────────────────────────
export async function invalidateAllCableCache(): Promise<number> {
  try {
    const keys = await redis.keys('cables:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    console.log(`[CableCache] Full invalidation: cleared ${keys.length} cache entries`);
    return keys.length;
  } catch (e) {
    console.error('[CableCache] Invalidation failed:', e);
    return 0;
  }
}

// ─────────────────────────────────────────
// 失效：精准清除某个地理区域的缓存
// 由 AI 新闻分析器触发（发现严重程度≥3的事件时）
// bbox = [minLon, minLat, maxLon, maxLat]
// ─────────────────────────────────────────
export async function invalidateRegionCache(
  bbox: [number, number, number, number],
  reason: string
): Promise<void> {
  try {
    // 清除全量缓存（因为区域事件可能影响整体状态展示）
    await redis.del(CABLE_ALL_KEY);
    await redis.del(CABLE_LIGHT_KEY);

    // 同时清除该区域专属的缓存 key（如果存在）
    const regionKey = `cables:region:${bbox.map(n => n.toFixed(1)).join(',')}`;
    await redis.del(regionKey);

    console.log(`[CableCache] Region invalidation (${reason}): bbox=${bbox}`);
  } catch (e) {
    console.error('[CableCache] Region invalidation failed:', e);
  }
}

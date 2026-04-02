// src/app/api/sovereign-network/routes/route.ts  v3
//
// 设计原则：Redis 里存的就是管理员的意图，完全信任，直接返回。
// 只有 Redis 完全为空（从未上传过）时，才用代码里的静态数据兜底。
// 不做任何字段层面的有效性过滤——那是上传时的责任，不是读取时的责任。

import { NextResponse } from 'next/server';
import { SOVEREIGN_ROUTES, type SovereignRoute } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch { return null; }
}

// 禁止任何层级缓存的响应头
const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
};

export async function GET() {
  const cached = await redisGet('sovereign-routes:v1');

  // 有 Redis 数据且能解析成数组 → 直接用，不加任何判断
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return NextResponse.json(
          { routes: parsed as SovereignRoute[], source: 'redis', total: parsed.length },
          { headers: NO_CACHE }
        );
      }
    } catch {
      // JSON 损坏（极端情况）才走兜底
    }
  }

  // Redis 为空：说明还从未上传过，使用初始静态数据
  return NextResponse.json(
    { routes: SOVEREIGN_ROUTES, source: 'static', total: SOVEREIGN_ROUTES.length },
    { headers: NO_CACHE }
  );
}

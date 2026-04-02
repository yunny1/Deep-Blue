// src/app/api/sovereign-network/routes/route.ts
//
// 动态路径数据接口：优先读 Redis，回退到静态数据。
// 用于自主权图谱页面在运行时获取最新路径数据（无需重新部署）。

import { NextResponse } from 'next/server';
import { SOVEREIGN_ROUTES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

export async function GET() {
  try {
    const cached = await redisGet('sovereign-routes:v1');
    if (cached) {
      const routes = JSON.parse(cached);
      return NextResponse.json({ routes, source: 'redis' });
    }
  } catch (e) {
    console.warn('[sovereign-routes GET] Redis read failed, using static:', e);
  }
  // 回退到静态数据
  return NextResponse.json({ routes: SOVEREIGN_ROUTES, source: 'static' });
}

// src/app/api/ai/analyze/route.ts
// AI 分析 API — 读取 Redis 预计算缓存
// 缓存由腾讯云 cron（scripts/ai-precompute.ts）每小时写入

import { NextRequest, NextResponse } from 'next/server';

const CACHE_KEY = 'ai:analysis:latest';

async function getFromRedis(): Promise<any | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;

    // @upstash/redis 存的是纯 JSON 字符串，直接 parse 即可
    const parsed = JSON.parse(data.result);

    // 兼容旧格式（raw fetch 存的是 {value: "...", ex: N}）
    if (parsed.value && typeof parsed.value === 'string' && !parsed.results) {
      return JSON.parse(parsed.value);
    }

    return parsed;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  if (!forceRefresh) {
    const cached = await getFromRedis();
    if (cached) {
      return NextResponse.json(
        { ...cached, cached: true, source: 'redis' },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'X-Cache': 'HIT' } }
      );
    }
  }

  if (!process.env.MINIMAX_API_KEY) {
    return NextResponse.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 503 });
  }

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      cached: false, source: 'empty',
      stats: { totalNewsScanned: 0, preFiltered: 0, aiAnalyzed: 0, relevant: 0, faults: 0, disruptions: 0 },
      results: [],
      hint: 'AI analysis is precomputed hourly.',
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' } }
  );
}

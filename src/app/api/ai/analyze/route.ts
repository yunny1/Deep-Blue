// src/app/api/ai/analyze/route.ts
// AI 分析 API v2 — 直接读 Redis 缓存，不再实时调用 MiniMax
// 预计算由腾讯云 cron（scripts/ai-precompute.ts）每小时完成
// 响应时间从 5-10s 降至 <100ms

import { NextRequest, NextResponse } from 'next/server';

const CACHE_KEY = 'ai:analysis:latest';

async function getFromRedis(): Promise<any | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Next.js 缓存控制：每 60 秒重新验证一次
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;
    // ai-precompute 存的是 { value: "...", ex: N } 格式
    const raw = typeof data.result === 'object' ? data.result.value : data.result;
    if (!raw) return null;
    return JSON.parse(raw);
    } catch { return null; }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // 1. 优先读 Redis 预计算缓存
  if (!forceRefresh) {
    const cached = await getFromRedis();
    if (cached) {
      return NextResponse.json(
        { ...cached, cached: true, source: 'redis' },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            'X-Cache': 'HIT',
          },
        }
      );
    }
  }

  // 2. Redis 无缓存（首次启动或 cron 未运行）
  //    返回空结果，前端会显示"暂无数据，正在准备..."
  //    不在这里实时调用 MiniMax（避免 Vercel serverless 超时）
  if (!process.env.MINIMAX_API_KEY) {
    return NextResponse.json(
      { error: 'MINIMAX_API_KEY not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'empty',
      stats: { totalNewsScanned: 0, preFiltered: 0, aiAnalyzed: 0, relevant: 0, faults: 0, disruptions: 0 },
      results: [],
      detectedCables: [],
      affectedCountries: [],
      hint: 'AI analysis is precomputed hourly. First result appears within 1 hour of deployment.',
    },
    {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    }
  );
}

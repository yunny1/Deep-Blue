// src/app/api/ai/analyze/route.ts
// AI 分析 API — 读取 Redis 预计算缓存
// 缓存由腾讯云 cron（scripts/ai-precompute.ts）每小时写入
//
// v2 改进：双 key 降级机制
//   1. 先读 ai:analysis:latest（2h TTL）
//   2. 如果 latest 过期，降级读 ai:analysis:backup（7天 TTL）
//   3. 只有两个 key 都不存在时才返回空结果

import { NextRequest, NextResponse } from 'next/server';

const CACHE_KEY  = 'ai:analysis:latest';
const BACKUP_KEY = 'ai:analysis:backup';

async function getFromRedis(key: string): Promise<any | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;

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
    // 第一优先：读 latest（最新数据，2h TTL）
    const cached = await getFromRedis(CACHE_KEY);
    if (cached) {
      return NextResponse.json(
        { ...cached, cached: true, source: 'redis' },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'X-Cache': 'HIT' } }
      );
    }

    // 第二优先：latest 过期时，降级读 backup（上一次成功的数据，7天 TTL）
    const backup = await getFromRedis(BACKUP_KEY);
    if (backup) {
      return NextResponse.json(
        { ...backup, cached: true, source: 'redis-backup', stale: true },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', 'X-Cache': 'HIT-BACKUP' } }
      );
    }
  }

  if (!process.env.QWEN_API_KEY) {
    return NextResponse.json({ error: 'QWEN_API_KEY not configured' }, { status: 503 });
  }

  // 两个 key 都不存在时才返回空结果
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

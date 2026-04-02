// src/app/api/admin/sovereign-routes-upload/route.ts
// 接收前端 SovereignRouteCompare 提交的路径数据，写入 Redis
// 这是数据链路里最关键的一环，必须确保写入的键名和读取的键名完全一致

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// TTL 365 天（秒）
const TTL = 365 * 24 * 60 * 60;

// 与 /api/sovereign-network/routes/route.ts 读取的键名完全一致
const REDIS_KEY = 'sovereign-routes:v1';

async function redisSet(key: string, value: string, ttl: number): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    // Upstash REST API: SET key value EX ttl
    const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([value, 'EX', ttl]),
    });
    const body = await res.json();
    // Upstash 成功时返回 { result: 'OK' }
    return res.ok && body?.result === 'OK';
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { routes } = body as { routes?: unknown[] };

  if (!Array.isArray(routes) || routes.length === 0) {
    return NextResponse.json(
      { error: 'routes 字段必须是非空数组', received: typeof routes },
      { status: 400 }
    );
  }

  // 写入 Redis 前做一次基础检查，确认数据结构合理
  const sample = routes[0] as Record<string, unknown>;
  const hasRequiredFields = sample.from && sample.to && sample.cables;
  if (!hasRequiredFields) {
    return NextResponse.json({
      error: '数据校验失败：第一条路径缺少 from / to / cables 字段',
      sample,
      hint: '这通常意味着 Excel 列名与预期不符，请使用诊断接口检查',
    }, { status: 400 });
  }

  const serialized = JSON.stringify(routes);
  const ok = await redisSet(REDIS_KEY, serialized, TTL);

  if (!ok) {
    return NextResponse.json(
      { error: 'Redis 写入失败，请检查 UPSTASH_REDIS_REST_URL 和 UPSTASH_REDIS_REST_TOKEN 环境变量' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success:  true,
    key:      REDIS_KEY,
    routes:   routes.length,
    ttlDays:  365,
    message:  `✓ ${routes.length} 条路径已写入 Redis（key: ${REDIS_KEY}，TTL: 365天）`,
  });
}

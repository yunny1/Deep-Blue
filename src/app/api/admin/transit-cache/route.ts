// src/app/api/admin/transit-cache/route.ts
// 管理员操作：清除 transit-analysis 的 Redis 缓存
// 使用场景：海缆数据更新后希望立即看到最新路径分析结果（正常情况下缓存 6 小时自动失效）

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'transit:analysis:v1';

export async function DELETE(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !tok) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  try {
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['del', CACHE_KEY]]),
    });
    return NextResponse.json({ ok: true, message: '路径分析缓存已清除，下次请求将重新计算（约 10-20 秒）' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

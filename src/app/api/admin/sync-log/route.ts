// src/app/api/admin/sync-log/route.ts
// GET    → 返回最近 50 条同步日志 + 所有冲突记录
// POST   → nightly-sync 写入日志或冲突（Cron secret 或 JWT 均可鉴权）
// DELETE → 标记指定冲突为 resolved

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const LOG_KEY      = 'sync:log';
const CONFLICT_KEY = 'sync:conflicts';

// 统一 Redis 客户端（直接用 REST API，与现有 clearCache 风格一致）
function redisRequest(body: any[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) throw new Error('Redis env not configured');
  return fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

async function redisSingle(cmd: any[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) throw new Error('Redis env not configured');
  const r = await fetch(`${url}/${cmd.join('/')}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  return r.json();
}

// ── GET ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 用 pipeline 同时取日志和冲突列表，减少往返
    const results = await redisRequest([
      ['lrange', LOG_KEY, 0, 49],
      ['lrange', CONFLICT_KEY, 0, 99],
    ]);

    const logs: any[]      = (results[0]?.result ?? []).map((s: any) =>
      typeof s === 'string' ? JSON.parse(s) : s
    );
    const conflicts: any[] = (results[1]?.result ?? []).map((s: any) =>
      typeof s === 'string' ? JSON.parse(s) : s
    );
    const unresolvedCount  = conflicts.filter((c: any) => !c.resolved).length;

    return NextResponse.json({ logs, conflicts, unresolvedCount });
  } catch (e: any) {
    return NextResponse.json({ logs: [], conflicts: [], unresolvedCount: 0, error: e.message });
  }
}

// ── POST ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 支持两种鉴权：管理员 JWT 或 Cron secret
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron     = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    try { await verifyAdminJWT(req); } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { type, entry } = await req.json() as { type: 'log' | 'conflict'; entry: any };
  if (!entry || !type) return NextResponse.json({ error: 'Missing type or entry' }, { status: 400 });

  const key    = type === 'conflict' ? CONFLICT_KEY : LOG_KEY;
  const maxLen = type === 'conflict' ? 99 : 49;

  try {
    await redisRequest([
      ['lpush', key, JSON.stringify(entry)],
      ['ltrim', key, 0, maxLen],
    ]);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { conflictId } = await req.json() as { conflictId?: string };
  if (!conflictId) return NextResponse.json({ error: 'Missing conflictId' }, { status: 400 });

  try {
    const result = await redisSingle(['lrange', CONFLICT_KEY, '0', '99']);
    const raw: any[] = result?.result ?? [];
    const conflicts = raw.map((s: any) => typeof s === 'string' ? JSON.parse(s) : s);

    const idx = conflicts.findIndex((c: any) => c.id === conflictId && !c.resolved);
    if (idx === -1) return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });

    conflicts[idx] = { ...conflicts[idx], resolved: true, resolvedAt: new Date().toISOString() };

    // 重建列表：del + 批量 rpush 保持时间顺序（最新在头部）
    const pipeline: any[] = [['del', CONFLICT_KEY]];
    // lrange 返回的已经是 newest-first，重建时用 rpush 反向填回去
    for (const c of [...conflicts].reverse()) {
      pipeline.push(['rpush', CONFLICT_KEY, JSON.stringify(c)]);
    }
    await redisRequest(pipeline);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

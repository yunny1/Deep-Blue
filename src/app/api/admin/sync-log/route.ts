// src/app/api/admin/sync-log/route.ts
// GET  → 返回最近 50 条同步日志 + 所有未处理冲突
// POST → nightly-sync 写入日志条目或冲突记录
// DELETE → 解决指定冲突（标记为 resolved）

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { verifyAdminJWT } from '@/lib/auth';

const redis = Redis.fromEnv();

const LOG_KEY      = 'sync:log';       // Redis List，最新条目在 index 0
const CONFLICT_KEY = 'sync:conflicts'; // Redis List，未解决冲突

const MAX_LOG_ENTRIES = 50;

export interface SyncLogEntry {
  id: string;
  timestamp: string;           // ISO 8601
  type: 'sync_run' | 'conflict' | 'route_protected' | 'manually_added_protected';
  cableSlug?: string;
  cableName?: string;
  summary: string;             // 一行摘要
  details?: Record<string, any>; // 结构化变更详情
}

export interface SyncConflict {
  id: string;
  timestamp: string;
  cableSlug: string;
  cableName: string;
  reviewStatus: string;        // MANUALLY_ADDED | ROUTE_FIXED
  conflictFields: Array<{
    field: string;
    current: any;
    incoming: any;
  }>;
  resolved: boolean;
  resolvedAt?: string;
}

// ── GET：读取日志和冲突 ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 读取最近 50 条日志
  const rawLogs = await redis.lrange(LOG_KEY, 0, MAX_LOG_ENTRIES - 1);
  const logs: SyncLogEntry[] = rawLogs.map(item =>
    typeof item === 'string' ? JSON.parse(item) : item
  );

  // 读取所有冲突（包括已解决的，前端可以过滤）
  const rawConflicts = await redis.lrange(CONFLICT_KEY, 0, 99);
  const conflicts: SyncConflict[] = rawConflicts.map(item =>
    typeof item === 'string' ? JSON.parse(item) : item
  );

  const unresolvedCount = conflicts.filter(c => !c.resolved).length;

  return NextResponse.json({ logs, conflicts, unresolvedCount });
}

// ── POST：nightly-sync 写入条目 ──────────────────────────────────
// 此接口由 nightly-sync 内部调用，使用 CRON_SECRET 鉴权而非 JWT
export async function POST(req: NextRequest) {
  // 支持两种鉴权方式：管理员 JWT 或 Cron secret
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const auth = await verifyAdminJWT(req);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { type, entry } = body as { type: 'log' | 'conflict'; entry: SyncLogEntry | SyncConflict };

  if (!entry || !type) {
    return NextResponse.json({ error: 'Missing type or entry' }, { status: 400 });
  }

  if (type === 'conflict') {
    // 冲突写入冲突列表（不去重，每次同步运行都记录）
    await redis.lpush(CONFLICT_KEY, JSON.stringify(entry));
    // 保留最近 100 条冲突记录
    await redis.ltrim(CONFLICT_KEY, 0, 99);
  } else {
    // 日志写入日志列表
    await redis.lpush(LOG_KEY, JSON.stringify(entry));
    await redis.ltrim(LOG_KEY, 0, MAX_LOG_ENTRIES - 1);
  }

  return NextResponse.json({ ok: true });
}

// ── DELETE：解决冲突 ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminJWT(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conflictId } = await req.json();
  if (!conflictId) return NextResponse.json({ error: 'Missing conflictId' }, { status: 400 });

  // 读取所有冲突，标记目标为 resolved，再写回
  const rawConflicts = await redis.lrange(CONFLICT_KEY, 0, 99);
  const conflicts: SyncConflict[] = rawConflicts.map(item =>
    typeof item === 'string' ? JSON.parse(item) : item
  );

  let found = false;
  const updated = conflicts.map(c => {
    if (c.id === conflictId && !c.resolved) {
      found = true;
      return { ...c, resolved: true, resolvedAt: new Date().toISOString() };
    }
    return c;
  });

  if (!found) return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });

  // 清空列表并重写（Redis List 不支持按值修改）
  await redis.del(CONFLICT_KEY);
  if (updated.length > 0) {
    // lpush 插入顺序是反的，所以先 reverse 再批量插入保持时间顺序
    for (const item of [...updated].reverse()) {
      await redis.lpush(CONFLICT_KEY, JSON.stringify(item));
    }
  }

  return NextResponse.json({ ok: true });
}

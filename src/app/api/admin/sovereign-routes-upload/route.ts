// src/app/api/admin/sovereign-routes-upload/route.ts  最终版
//
// 修复：
// 1. 移除"检查第一条路径"的脆弱校验——那个校验在 curMap 里有旧数据时会误报
// 2. 改为：接收数据后过滤掉空字段路径，只存有效的
// 3. 使用 Upstash pipeline 格式写入大值，更可靠
// 4. 返回详细信息，方便调试

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const REDIS_KEY = 'sovereign-routes:v1';
const TTL_SECONDS = 365 * 24 * 60 * 60;

async function redisPipelineSet(key: string, value: string, ttl: number): Promise<{ ok: boolean; result: unknown }> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { ok: false, result: 'env vars missing' };
  try {
    // 使用 Upstash pipeline 格式，对大 JSON 值更可靠
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['set', key, value, 'ex', ttl]]),
    });
    const body = await res.json();
    // pipeline 返回格式: [{"result":"OK"}]
    const result = Array.isArray(body) ? body[0]?.result : body?.result;
    return { ok: res.ok && result === 'OK', result };
  } catch (e) {
    return { ok: false, result: String(e) };
  }
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Request body 不是有效 JSON' }, { status: 400 });
  }

  const { routes } = body as { routes?: unknown[] };

  if (!Array.isArray(routes)) {
    return NextResponse.json(
      { error: `routes 必须是数组，收到的是 ${typeof routes}` },
      { status: 400 }
    );
  }

  // 过滤掉空字段的路径（防御性清洗，不再用"检查第一条"的脆弱方式）
  const validRoutes = routes.filter((r: unknown) => {
    if (!r || typeof r !== 'object') return false;
    const route = r as Record<string, unknown>;
    return (
      typeof route.from   === 'string' && route.from.trim().length   > 0 &&
      typeof route.to     === 'string' && route.to.trim().length     > 0 &&
      typeof route.cables === 'string' && route.cables.trim().length > 0
    );
  });

  const skipped = routes.length - validRoutes.length;

  if (validRoutes.length === 0) {
    return NextResponse.json({
      error: `所有 ${routes.length} 条路径都缺少 from/to/cables 字段，没有数据可以保存。` +
             `这通常意味着 Excel 列名不匹配，请用诊断接口确认。`,
      received: routes.length,
      valid: 0,
      // 返回前3条供调试
      sample: routes.slice(0, 3),
    }, { status: 400 });
  }

  const serialized = JSON.stringify(validRoutes);
  const { ok, result } = await redisPipelineSet(REDIS_KEY, serialized, TTL_SECONDS);

  if (!ok) {
    return NextResponse.json({
      error: `Redis 写入失败（pipeline 返回: ${JSON.stringify(result)}），请检查环境变量`,
      key: REDIS_KEY,
    }, { status: 500 });
  }

  return NextResponse.json({
    success:  true,
    key:      REDIS_KEY,
    saved:    validRoutes.length,
    skipped,
    ttlDays:  365,
    message:  `✓ ${validRoutes.length} 条有效路径已写入 Redis（跳过 ${skipped} 条空字段路径）`,
  });
}

// src/app/api/admin/sovereign-routes-upload/route.ts
//
// 接收管理后台上传的路径数据（已经过前端 AI 归一化），
// 存入 Upstash Redis，TTL 365天。
// 自主权图谱页面通过 /api/sovereign-network/routes 读取。

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Redis REST API 直接调用（避免引入额外 SDK，与项目已有的 Upstash 使用方式一致）
async function redisSet(key: string, value: string) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Upstash Redis 环境变量未配置');

  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // ex: 秒数，365天
    body: JSON.stringify([value, 'EX', 31536000]),
  });
  if (!res.ok) throw new Error(`Redis SET failed: ${await res.text()}`);
}

export async function POST(req: NextRequest) {
  // 管理员鉴权
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { routes } = await req.json() as { routes: unknown[] };
  if (!Array.isArray(routes) || routes.length === 0) {
    return NextResponse.json({ error: 'routes array is required' }, { status: 400 });
  }

  try {
    await redisSet('sovereign-routes:v1', JSON.stringify(routes));
    return NextResponse.json({
      success: true,
      count: routes.length,
      message: `已保存 ${routes.length} 条路径数据到 Redis，下次加载页面即生效`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sovereign-routes-upload]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

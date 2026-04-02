// src/app/api/sovereign-network/routes/route.ts
//
// 修复：
// 1. 从 Redis 读出的数据在返回前做有效性校验
// 2. 如果数据损坏（字段为空），自动回退到静态 SOVEREIGN_ROUTES
// 3. 提供 DELETE 方法用于清除损坏的 Redis 数据
// 4. 提供 POST 方法接收来自管理后台的路径上传（原有逻辑）

import { NextRequest, NextResponse } from 'next/server';
import { SOVEREIGN_ROUTES, type SovereignRoute } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

// 判断一条路径数据是否有效：from、to、cables 都不能是空字符串
function isValidRoute(r: unknown): r is SovereignRoute {
  if (!r || typeof r !== 'object') return false;
  const route = r as Record<string, unknown>;
  return (
    typeof route.from === 'string' && route.from.trim().length > 0 &&
    typeof route.to   === 'string' && route.to.trim().length   > 0 &&
    typeof route.cables === 'string' && route.cables.trim().length > 0
  );
}

async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch { return null; }
}

async function redisDel(key: string): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}

// GET：读取路径数据，自动回退到静态数据
export async function GET() {
  const cached = await redisGet('sovereign-routes:v1');

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as unknown[];

      // 有效性校验：统计有多少条路径的核心字段是完整的
      const validRoutes = parsed.filter(isValidRoute);
      const validRatio  = validRoutes.length / Math.max(parsed.length, 1);

      // 如果超过 50% 的路径数据损坏，判定为无效数据，回退到静态版本
      if (validRatio < 0.5 || validRoutes.length === 0) {
        console.warn(
          `[sovereign-routes] Redis 数据无效：` +
          `${parsed.length} 条中只有 ${validRoutes.length} 条有效（${Math.round(validRatio * 100)}%），` +
          `回退到静态数据（${SOVEREIGN_ROUTES.length} 条）`
        );
        return NextResponse.json({
          routes: SOVEREIGN_ROUTES,
          source: 'static-fallback',
          reason: 'redis-data-corrupt',
        });
      }

      // 数据有效，返回 Redis 中的路径
      return NextResponse.json({
        routes: validRoutes,
        source: 'redis',
        total: validRoutes.length,
      });
    } catch {
      // JSON 解析失败，回退
    }
  }

  // 没有 Redis 数据或解析失败，使用静态数据
  return NextResponse.json({
    routes: SOVEREIGN_ROUTES,
    source: 'static',
    total: SOVEREIGN_ROUTES.length,
  });
}

// DELETE：清除损坏的 Redis 数据（管理员调用）
// 清除后，页面下次加载会自动使用静态 SOVEREIGN_ROUTES
export async function DELETE(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (secret !== process.env.ADMIN_JWT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ok = await redisDel('sovereign-routes:v1');
  return NextResponse.json({
    success: ok,
    message: ok
      ? '已清除 Redis 中的损坏数据，页面将回退到静态路径数据（110条）'
      : '清除失败，请检查 Redis 连接',
  });
}

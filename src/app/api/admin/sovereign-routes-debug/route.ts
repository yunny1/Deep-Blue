// src/app/api/admin/sovereign-routes-debug/route.ts
// 诊断接口：直接读取 Redis 原始内容，帮助定位数据是否成功写入
// 访问后会告诉你：Redis 里有没有数据、有几条、第一条长什么样

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function redisRaw(key: string): Promise<unknown> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { error: 'Redis 环境变量未配置' };
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await res.json();
    return body; // 返回完整的 Upstash 响应体
  } catch (e) {
    return { error: String(e) };
  }
}

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const KEY = 'sovereign-routes:v1';
  const raw = await redisRaw(KEY);

  // 尝试解析 Redis 响应
  let parsed: unknown = null;
  let parseError: string | null = null;
  let summary: object = {};

  const rawAny = raw as Record<string, unknown>;
  if (rawAny?.result && typeof rawAny.result === 'string') {
    try {
      parsed = JSON.parse(rawAny.result);
      const arr = parsed as unknown[];
      if (Array.isArray(arr)) {
        summary = {
          totalRoutes:  arr.length,
          // 取前3条看 from/to/cables 是否有值
          first3Routes: arr.slice(0, 3).map((r: unknown) => {
            const route = r as Record<string, unknown>;
            return {
              id:      route.id      || '(空)',
              from:    route.from    || '(空)',
              to:      route.to      || '(空)',
              cables:  typeof route.cables === 'string'
                         ? route.cables.slice(0, 60) + (route.cables.length > 60 ? '…' : '')
                         : '(空)',
              safety:  route.safety  || '(空)',
              maxRisk: route.maxRisk ?? '(缺失)',
            };
          }),
          validRoutes: arr.filter((r: unknown) => {
            const route = r as Record<string, unknown>;
            return route.from && route.to && route.cables;
          }).length,
          emptyFromCount: arr.filter((r: unknown) => !(r as Record<string, unknown>).from).length,
          emptyCablesCount: arr.filter((r: unknown) => !(r as Record<string, unknown>).cables).length,
        };
      } else {
        summary = { error: 'Redis 数据不是数组', type: typeof parsed };
      }
    } catch (e) {
      parseError = String(e);
    }
  }

  return NextResponse.json({
    key: KEY,
    redisRawResponse: rawAny,                    // Upstash 原始返回（含 result 字段）
    hasData:          !!rawAny?.result,           // result 是否非空
    dataLength:       typeof rawAny?.result === 'string' ? rawAny.result.length : 0,
    parseError,
    summary,                                      // 解析成功时的摘要
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

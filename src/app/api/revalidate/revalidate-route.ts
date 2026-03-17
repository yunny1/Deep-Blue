// src/app/api/revalidate/route.ts
// 缓存失效触发端点
// 两个调用者会 POST 到这里：
//   1. 腾讯云服务器每天凌晨3点的 cron 脚本 → { type: 'full' }
//   2. AI 分析器发现严重程度≥3的事件   → { type: 'region', bbox: [...], reason: '...' }
//
// 安全保护：调用者必须在请求头里带上 x-revalidate-secret，
// 值必须和环境变量 REVALIDATE_SECRET 一致，否则返回 401。

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { invalidateAllCableCache, invalidateRegionCache } from '@/lib/cable-cache';

export async function POST(request: NextRequest) {
  // ── 安全验证 ──────────────────────────────────────────────
  const secret = request.headers.get('x-revalidate-secret');
  if (!secret || secret !== process.env.REVALIDATE_SECRET) {
    console.warn('[Revalidate] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, bbox, reason } = body;

  // ── 全量刷新（凌晨3点 cron 调用）─────────────────────────
  if (type === 'full') {
    const count = await invalidateAllCableCache();

    // 通知 Next.js 路由缓存也失效，让下一个访客触发重新生成
    revalidatePath('/');
    revalidatePath('/topology');
    revalidatePath('/compare');
    revalidatePath('/simulate');

    console.log(`[Revalidate] Full cache cleared: ${count} Redis entries + Next.js paths`);
    return NextResponse.json({
      success: true,
      type: 'full',
      redisEntriesCleared: count,
      pathsRevalidated: ['/', '/topology', '/compare', '/simulate'],
      timestamp: new Date().toISOString(),
    });
  }

  // ── 区域精准刷新（AI 事件触发）────────────────────────────
  if (type === 'region' && Array.isArray(bbox) && bbox.length === 4) {
    await invalidateRegionCache(
      bbox as [number, number, number, number],
      reason || 'AI news event trigger'
    );

    // 首页也需要刷新（风险面板、信号面板可能受影响）
    revalidatePath('/');

    console.log(`[Revalidate] Region cache cleared: bbox=${bbox}, reason=${reason}`);
    return NextResponse.json({
      success: true,
      type: 'region',
      bbox,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json(
    { error: 'Invalid request. type must be "full" or "region" (with bbox array)' },
    { status: 400 }
  );
}

// src/app/api/admin/approximate-routes/route.ts
// GET  → 返回所有待审核的近似路由海缆（isApproximateRoute=true 且未确认）
// POST → 管理员确认指定批次，标记为 ROUTE_REVIEWED

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// ── GET：列出待审核的近似路由 ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 查询：有近似路由 + 未被人工确认（ROUTE_FIXED / ROUTE_REVIEWED 均表示已处理）
  const cables = await prisma.cable.findMany({
    where: {
      isApproximateRoute: true,
      reviewStatus: { notIn: ['ROUTE_FIXED', 'ROUTE_REVIEWED', 'MANUALLY_ADDED'] },
    },
    select: {
      id: true, name: true, slug: true, status: true,
      reviewStatus: true, updatedAt: true,
      _count: { select: { landingStations: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ cables, total: cables.length });
}

// ── POST：批量确认近似路由 ─────────────────────────────────────────
// body: { slugs: string[] }  → 确认指定海缆
// body: { all: true }        → 确认当前所有待审核海缆
export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { slugs?: string[]; all?: boolean };

  if (!body.slugs?.length && !body.all) {
    return NextResponse.json({ error: '请传入 slugs 数组或 all:true' }, { status: 400 });
  }

  const where = body.all
    ? {
        isApproximateRoute: true,
        routeGeojson: { not: null },
        reviewStatus: { notIn: ['ROUTE_FIXED', 'ROUTE_REVIEWED', 'MANUALLY_ADDED'] },
      }
    : { slug: { in: body.slugs! } };

  const result = await prisma.cable.updateMany({
    where,
    data: { reviewStatus: 'ROUTE_REVIEWED' },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}

// src/app/api/admin/pending-routes/route.ts
// 返回所有 routeGeojson = NULL 的海缆，供 /admin/governance 展示待绘制任务列表

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cables = await prisma.cable.findMany({
    where: { routeGeojson: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      rfsDate: true,
      reviewStatus: true,
      updatedAt: true,
      _count: { select: { landingStations: true } },
    },
    orderBy: [
      { status: 'asc' },
      { name: 'asc' },
    ],
  });

  return NextResponse.json({ cables, total: cables.length });
}

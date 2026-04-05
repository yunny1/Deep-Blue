// src/app/api/admin/pending-routes/route.ts
// 返回所有 routeGeojson = NULL 的海缆，供治理页面显示"待绘制路线"任务列表

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminJWT } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await verifyAdminJWT(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
      // 在役缆优先（有路线需求更紧迫），再按名称排序
      { status: 'asc' },
      { name: 'asc' },
    ],
  });

  return NextResponse.json({ cables, total: cables.length });
}

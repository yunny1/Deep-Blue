// src/app/api/admin/cable-search/route.ts
// 修复:返回安全的标量类型,彻底消除 React #31(vendor/owners 是 Company 对象)
// v2(本轮): 改用 src/lib/cable-filters.ts 的 ADMIN_CABLE_FILTER 与全平台一致

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';
import { ADMIN_CABLE_FILTER } from '@/lib/cable-filters';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q || q.length < 2) return NextResponse.json({ cables: [] });

  const cables = await prisma.cable.findMany({
    where: {
      ...ADMIN_CABLE_FILTER, // v2: 与全平台过滤一致(管理员视角:保留 PENDING_REVIEW)
      name: { contains: q, mode: 'insensitive' },
    },
    select: {
      id: true, slug: true, name: true, status: true,
      lengthKm: true, fiberPairs: true, rfsDate: true,
      reviewStatus: true,
      vendor: { select: { name: true } },
      owners: { select: { company: { select: { name: true } } } },
      _count: { select: { landingStations: true } },
    },
    take: 10,
    orderBy: { name: 'asc' },
  });

  const safe = cables.map(c => ({
    id:           c.id,
    slug:         c.slug,
    name:         c.name,
    status:       c.status,
    reviewStatus: c.reviewStatus,
    lengthKm:     c.lengthKm,
    fiberPairs:   c.fiberPairs,
    rfsYear:      c.rfsDate ? new Date(c.rfsDate).getFullYear() : null,
    vendor:       c.vendor?.name ?? null,
    owners:       c.owners.map(o => o.company.name),
    stationCount: c._count.landingStations,
  }));

  return NextResponse.json({ cables: safe });
}

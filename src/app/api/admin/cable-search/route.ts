// src/app/api/admin/cable-search/route.ts
// 修复：返回安全的标量类型，彻底消除 React #31（vendor/owners 是 Company 对象）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q || q.length < 2) return NextResponse.json({ cables: [] });

  const cables = await prisma.cable.findMany({
    where: {
      name: { contains: q, mode: 'insensitive' },
      status: { notIn: ['REMOVED'] },
      mergedInto: null,
    },
    select: {
      id: true, slug: true, name: true, status: true,
      lengthKm: true, fiberPairs: true, rfsDate: true,
      reviewStatus: true,
      // 关联字段：只取 .name，不返回整个 Company 对象
      vendor: { select: { name: true } },
      owners: { select: { company: { select: { name: true } } } },
      _count: { select: { landingStations: true } },
    },
    take: 10,
    orderBy: { name: 'asc' },
  });

  // 把所有关联对象展开成纯字符串，防止前端拿到对象后直接渲染导致 React #31
  const safe = cables.map(c => ({
    id:           c.id,
    slug:         c.slug,
    name:         c.name,
    status:       c.status,
    reviewStatus: c.reviewStatus,
    lengthKm:     c.lengthKm,
    fiberPairs:   c.fiberPairs,
    rfsYear:      c.rfsDate ? new Date(c.rfsDate).getFullYear() : null,
    // 关键：vendor 和 owners 只返回字符串，不返回对象
    vendor:       c.vendor?.name ?? null,
    owners:       c.owners.map(o => o.company.name),
    stationCount: c._count.landingStations,
  }));

  return NextResponse.json({ cables: safe });
}

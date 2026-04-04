// src/app/api/admin/delete-cable/route.ts
// 删除海缆及其所有关联数据（通过 Prisma，无需手写列名）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

async function clearCache() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['del', 'cables:geo:details'],
      ['del', 'cables:geo'],
      ['del', 'cables:list'],
    ]),
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 1) return NextResponse.json({ cables: [] });

  const cables = await prisma.cable.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, name: true, slug: true, status: true,
      lengthKm: true, rfsDate: true,
      _count: { select: { landingStations: true } },
    },
    take: 20,
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ cables });
}

export async function DELETE(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await req.json() as { slug?: string };
  if (!slug?.trim()) return NextResponse.json({ error: 'slug 必填' }, { status: 400 });

  const cable = await prisma.cable.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!cable) return NextResponse.json({ error: `找不到海缆：${slug}` }, { status: 404 });

  // 用事务按依赖顺序删除所有关联，再删主体
  await prisma.$transaction(async (tx) => {
    // 关联表（Prisma 知道真实列名，无需手写）
    await tx.cableLandingStation.deleteMany({ where: { cableId: cable.id } });

    // 以下表若 schema 里有就删，若报错说明 schema 里没有该 model，可注释掉
    try { await (tx as any).cableOwnership.deleteMany({ where: { cableId: cable.id } }); } catch {}
    try { await (tx as any).cableEvent.deleteMany({     where: { cableId: cable.id } }); } catch {}
    try { await (tx as any).cableNameAlias.deleteMany({ where: { cableId: cable.id } }); } catch {}
    try {
      await (tx as any).cableMergeLog.deleteMany({
        where: { OR: [{ cableId: cable.id }, { mergedIntoId: cable.id }] },
      });
    } catch {}

    // 最后删主体
    await tx.cable.delete({ where: { id: cable.id } });
  });

  await clearCache();
  return NextResponse.json({ success: true, deleted: cable.name });
}

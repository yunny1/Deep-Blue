// src/app/api/admin/pending-review/route.ts
// PENDING_REVIEW 海缆管理 API
// GET  → 列出所有待审核海缆及其最相似的 TG 海缆
// POST → 管理员决策：merge（合并到TG）或 keep（保留独立）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page  = parseInt(searchParams.get('page') || '1');
  const limit = 20;

  const [items, total] = await Promise.all([
    prisma.cable.findMany({
      where: { status: 'PENDING_REVIEW' },
      select: {
        id: true, name: true, slug: true, lengthKm: true, rfsDate: true,
        _count: { select: { landingStations: true } },
        landingStations: {
          take: 5,
          include: { landingStation: { select: { name: true, countryCode: true } } },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cable.count({ where: { status: 'PENDING_REVIEW' } }),
  ]);

  // 对每条 PENDING_REVIEW 的海缆，找最相似的 TG 海缆（用名称前缀模糊匹配）
  const enriched = await Promise.all(items.map(async item => {
    // 取 sn- 前缀之后的部分作为搜索关键词
    const searchName = item.name;
    const similar = await prisma.cable.findMany({
      where: {
        NOT: { status: 'PENDING_REVIEW' },
        id: { not: { startsWith: 'sn-' } },
        name: { contains: searchName.split(' ')[0], mode: 'insensitive' },
      },
      select: { id: true, name: true, status: true, lengthKm: true, rfsDate: true,
                _count: { select: { landingStations: true } } },
      take: 3,
    });
    return { ...item, similarCables: similar };
  }));

  return NextResponse.json({ items: enriched, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(request: NextRequest) {
  const { id, action, mergeIntoId } = await request.json();
  // action: 'merge' | 'keep' | 'discard'

  if (!id || !action) {
    return NextResponse.json({ error: 'Missing id or action' }, { status: 400 });
  }

  const snCable = await prisma.cable.findUnique({ where: { id } });
  if (!snCable) return NextResponse.json({ error: 'Cable not found' }, { status: 404 });

  if (action === 'keep') {
    // 保留为独立海缆，状态改为 IN_SERVICE
    await prisma.cable.update({ where: { id }, data: { status: 'IN_SERVICE' } });
    return NextResponse.json({ success: true, message: `${snCable.name} 已确认为独立海缆` });
  }

  if (action === 'discard') {
    // 丢弃：删除这条重复记录
    await prisma.cableLandingStation.deleteMany({ where: { cableId: id } });
    await prisma.cableOwnership.deleteMany({ where: { cableId: id } });
    await prisma.cable.delete({ where: { id } });
    return NextResponse.json({ success: true, message: `${snCable.name} 已删除` });
  }

  if (action === 'merge' && mergeIntoId) {
    // 合并：把 sn- 这条的登陆站追加到 TG 海缆，然后删除 sn- 记录
    const tgCable = await prisma.cable.findUnique({ where: { id: mergeIntoId } });
    if (!tgCable) return NextResponse.json({ error: 'Target cable not found' }, { status: 404 });

    const snStations = await prisma.cableLandingStation.findMany({
      where: { cableId: id },
      include: { landingStation: true },
    });

    for (const ls of snStations) {
      await prisma.cableLandingStation.upsert({
        where: { cableId_landingStationId: { cableId: mergeIntoId, landingStationId: ls.landingStationId } },
        update: {},
        create: { cableId: mergeIntoId, landingStationId: ls.landingStationId },
      }).catch(() => {});
    }

    // 补充 TG 缺失的长度/RFS
    const updates: any = {};
    if (!tgCable.lengthKm && snCable.lengthKm) updates.lengthKm = snCable.lengthKm;
    if (!tgCable.rfsDate && snCable.rfsDate) updates.rfsDate = snCable.rfsDate;
    if (Object.keys(updates).length > 0) {
      await prisma.cable.update({ where: { id: mergeIntoId }, data: updates });
    }

    // 删除 sn- 记录
    await prisma.cableLandingStation.deleteMany({ where: { cableId: id } });
    await prisma.cableOwnership.deleteMany({ where: { cableId: id } });
    await prisma.cable.delete({ where: { id } });

    return NextResponse.json({ success: true, message: `已合并 ${snCable.name} 到 ${tgCable.name}，补充 ${snStations.length} 个登陆站` });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// src/app/api/admin/dlq/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/dlq — 获取待处理的地理编码死信队列
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'PENDING';
  const page   = parseInt(searchParams.get('page') || '1');
  const limit  = 50;

  const [items, total] = await Promise.all([
    prisma.unresolvedLocation.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.unresolvedLocation.count({ where: { status } }),
  ]);

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}

// POST /api/admin/dlq — 人工确认一条 DLQ 记录
// body: { id, lat, lng, countryCode, standardizedCity }
export async function POST(request: NextRequest) {
  const { id, lat, lng, countryCode, standardizedCity } = await request.json();

  if (!id || !lat || !lng || !countryCode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 获取原始记录
  const dlq = await prisma.unresolvedLocation.findUnique({ where: { id } });
  if (!dlq) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  // 写入地理编码字典（下次直接命中缓存）
  await prisma.locationDictionary.upsert({
    where: { rawString: dlq.rawString },
    update: { latitude: lat, longitude: lng, countryCode, standardizedCity, source: 'Manual Admin' },
    create: {
      rawString: dlq.rawString,
      standardizedCity,
      countryCode,
      latitude: lat,
      longitude: lng,
      source: 'Manual Admin',
    },
  });

  // 更新 DLQ 状态为已解决
  await prisma.unresolvedLocation.update({
    where: { id },
    data: { status: 'RESOLVED', updatedAt: new Date() },
  });

  // 同时更新数据库里所有使用这个站名但坐标为 (0,0) 的登陆站
  if (dlq.rawString) {
    await prisma.landingStation.updateMany({
      where: {
        name: dlq.rawString,
        latitude: 0,
        longitude: 0,
      },
      data: { latitude: lat, longitude: lng, countryCode },
    });
  }

  return NextResponse.json({ success: true });
}

// PATCH /api/admin/dlq — 批量忽略（永久标记为 IGNORED）
export async function PATCH(request: NextRequest) {
  const { ids } = await request.json();
  if (!ids?.length) return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });

  await prisma.unresolvedLocation.updateMany({
    where: { id: { in: ids } },
    data: { status: 'IGNORED', updatedAt: new Date() },
  });

  return NextResponse.json({ success: true, count: ids.length });
}

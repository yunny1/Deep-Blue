// src/app/api/admin/update-station-coords/route.ts
//
// 登陆站坐标修改接口
// 允许管理员直接修正数据库里登陆站的经纬度坐标
// 坐标错误会导致路由生成错误，这个接口提供一个快速的修复通道

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// GET：查询某条海缆的所有登陆站（含坐标）
export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug')?.trim();
  if (!slug) return NextResponse.json({ error: 'slug 为必填项' }, { status: 400 });

  const cable = await prisma.cable.findUnique({
    where: { slug },
    select: {
      id: true, name: true,
      landingStations: {
        select: {
          landingStation: {
            select: {
              id: true, name: true, nameZh: true,
              city: true, countryCode: true,
              latitude: true, longitude: true,
            },
          },
        },
      },
    },
  });

  if (!cable) return NextResponse.json({ error: `找不到海缆：${slug}` }, { status: 404 });

  return NextResponse.json({
    cableName: cable.name,
    stations: cable.landingStations.map(ls => ls.landingStation),
  });
}

// POST：更新单个登陆站的坐标
export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { stationId, latitude, longitude } = await req.json() as {
    stationId: string;
    latitude: number;
    longitude: number;
  };

  if (!stationId?.trim()) {
    return NextResponse.json({ error: 'stationId 为必填项' }, { status: 400 });
  }
  if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
    return NextResponse.json({ error: '纬度必须在 -90 到 90 之间' }, { status: 400 });
  }
  if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: '经度必须在 -180 到 180 之间' }, { status: 400 });
  }

  // 先确认这个站点存在
  const station = await prisma.landingStation.findUnique({
    where: { id: stationId },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  if (!station) {
    return NextResponse.json({ error: `找不到登陆站：${stationId}` }, { status: 404 });
  }

  const updated = await prisma.landingStation.update({
    where: { id: stationId },
    data:  { latitude, longitude },
    select: { id: true, name: true, latitude: true, longitude: true },
  });

  return NextResponse.json({
    ok: true,
    message: `已更新 ${updated.name} 的坐标：[${longitude}, ${latitude}]`,
    before: { lat: station.latitude, lng: station.longitude },
    after:  { lat: updated.latitude, lng: updated.longitude },
  });
}

// src/app/api/admin/cable-detail/route.ts
// 拉取单条海缆的完整现有数据，供管理后台的字段对比合并面板使用。
// 返回所有可编辑字段的当前值，以及关联的登陆站和运营商列表。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get('slug')?.trim();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const cable = await prisma.cable.findUnique({
    where: { slug },
    select: {
      id:                true,
      name:              true,
      slug:              true,
      status:            true,
      lengthKm:          true,
      designCapacityTbps: true,
      fiberPairs:        true,
      rfsDate:           true,
      notes:             true,
      routeGeojson:      true,
      isApproximateRoute: true,
      reviewStatus:      true,
      vendor: { select: { name: true } },
      owners: { select: { company: { select: { name: true } } } },
      landingStations: {
        select: {
          landingStation: {
            select: {
              id:          true,
              name:        true,
              nameZh:      true,
              city:        true,
              countryCode: true,
              latitude:    true,
              longitude:   true,
            },
          },
        },
      },
    },
  });

  if (!cable) return NextResponse.json({ error: 'Cable not found' }, { status: 404 });

  return NextResponse.json({
    id:            cable.id,
    slug:          cable.slug,
    name:          cable.name,
    status:        cable.status,
    lengthKm:      cable.lengthKm?.toString() ?? null,
    capacityTbps:  cable.designCapacityTbps?.toString() ?? null,
    fiberPairs:    cable.fiberPairs?.toString() ?? null,
    // rfsDate 存的是 DateTime，返回给前端时只取年份字符串（与表单格式一致）
    rfsDate:       cable.rfsDate ? new Date(cable.rfsDate).getFullYear().toString() : null,
    vendor:        cable.vendor?.name ?? null,
    owners:        cable.owners.map(o => o.company.name).join(', ') || null,
    notes:         cable.notes ?? null,
    // routeGeojson 是 JSON 类型，只告诉前端"有没有"，不传原始数据（可能很大）
    hasRouteGeojson:    cable.routeGeojson !== null,
    isApproximateRoute: cable.isApproximateRoute,
    reviewStatus:       cable.reviewStatus ?? null,
    landingStations: cable.landingStations.map(ls => ({
      id:          ls.landingStation.id,
      name:        ls.landingStation.name,
      nameZh:      ls.landingStation.nameZh,
      city:        ls.landingStation.city,
      countryCode: ls.landingStation.countryCode,
      lat:         ls.landingStation.latitude,
      lng:         ls.landingStation.longitude,
    })),
  });
}

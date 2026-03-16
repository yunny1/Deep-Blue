// src/app/api/cables/route.ts
// 海缆数据API - 返回所有海缆
// ?geo=true 包含GeoJSON路由（用于地图渲染）
// ?details=true 包含vendor和owners信息（用于颜色编码）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeGeo = searchParams.get('geo') === 'true';
  const includeDetails = searchParams.get('details') === 'true';

  try {
    const cables = await prisma.cable.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        rfsDate: true,
        lengthKm: true,
        designCapacityTbps: true,
        fiberPairs: true,
        routeGeojson: includeGeo,
        // 当 details=true 时，也返回建造商和运营商信息（用于颜色编码）
        vendor: includeDetails ? { select: { name: true } } : false,
        owners: includeDetails ? {
          select: { company: { select: { name: true } } },
        } : false,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      total: cables.length,
      cables,
    });
  } catch (error) {
    console.error('Failed to fetch cables:', error);
    return NextResponse.json({ error: 'Failed to fetch cables' }, { status: 500 });
  }
}

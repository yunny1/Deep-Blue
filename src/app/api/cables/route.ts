// src/app/api/cables/route.ts
// 海缆数据API - 返回所有海缆的基本信息和GeoJSON路由
// 前端地图组件调用这个API来获取数据并渲染

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/cables — 获取所有海缆
// 可选参数: ?geo=true (包含GeoJSON路由数据，用于地图渲染)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeGeo = searchParams.get('geo') === 'true';

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
        // GeoJSON数据很大（每条海缆几十KB），只在需要地图渲染时才返回
        routeGeojson: includeGeo,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      total: cables.length,
      cables,
    });
  } catch (error) {
    console.error('Failed to fetch cables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cables' },
      { status: 500 }
    );
  }
}

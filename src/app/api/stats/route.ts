// src/app/api/stats/route.ts
// 统计数据API - 返回首页Dashboard所需的全局统计数字
// 比如：全球海缆总数、在建数、登陆站数、事件数等

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/stats — 获取全局统计
export async function GET() {
  try {
    // Promise.all 并行执行所有查询（速度比逐个查询快5倍）
    const [
      totalCables,
      inService,
      underConstruction,
      planned,
      totalStations,
      totalCountries,
    ] = await Promise.all([
      prisma.cable.count(),
      prisma.cable.count({ where: { status: 'IN_SERVICE' } }),
      prisma.cable.count({ where: { status: 'UNDER_CONSTRUCTION' } }),
      prisma.cable.count({ where: { status: 'PLANNED' } }),
      prisma.landingStation.count(),
      prisma.country.count(),
    ]);

    return NextResponse.json({
      cables: {
        total: totalCables,
        inService,
        underConstruction,
        planned,
      },
      landingStations: totalStations,
      countries: totalCountries,
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

// src/app/api/search/route.ts
// 全局搜索API — 同时搜索海缆、登陆站和国家
// 支持模糊匹配，返回按类别分组的结果

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  // 没有搜索词时返回空结果
  if (!query || query.length < 2) {
    return NextResponse.json({ cables: [], stations: [], countries: [] });
  }

  try {
    // 三个搜索并行执行（速度是串行的3倍）
    const [cables, stations, countries] = await Promise.all([
      // 搜索海缆：按名称模糊匹配，返回前8条
      prisma.cable.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          lengthKm: true,
        },
        take: 8,
        orderBy: { name: 'asc' },
      }),

      // 搜索登陆站：按名称模糊匹配，返回前6条
      prisma.landingStation.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
        },
        select: {
          id: true,
          name: true,
          countryCode: true,
          latitude: true,
          longitude: true,
        },
        take: 6,
        orderBy: { name: 'asc' },
      }),

      // 搜索国家：按英文名或国家代码匹配，返回前5条
      prisma.country.findMany({
        where: {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          code: true,
          nameEn: true,
          _count: { select: { landingStations: true } },
        },
        take: 5,
        orderBy: { nameEn: 'asc' },
      }),
    ]);

    return NextResponse.json({
      cables,
      stations,
      countries,
      total: cables.length + stations.length + countries.length,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

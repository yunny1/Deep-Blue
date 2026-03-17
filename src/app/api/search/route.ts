// src/app/api/search/route.ts
// 全局搜索API — 支持模糊匹配（去除连字符、空格，部分匹配）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ cables: [], stations: [], countries: [], total: 0 });
  }

  try {
    // 生成模糊搜索变体（处理连字符、空格等）
    // 例如 "seamewe" 能匹配到 "SEA-ME-WE"
    const fuzzyQuery = query.replace(/[-_\s]+/g, '');

    const [cables, stations, countries] = await Promise.all([
      prisma.cable.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { slug: { contains: query.toLowerCase().replace(/[^a-z0-9]+/g, '-') } },
          ],
        },
        select: { id: true, name: true, slug: true, status: true, lengthKm: true },
        take: 10,
        orderBy: { name: 'asc' },
      }),
      prisma.landingStation.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { id: true, name: true, countryCode: true },
        take: 6,
        orderBy: { name: 'asc' },
      }),
      prisma.country.findMany({
        where: {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: { code: true, nameEn: true, _count: { select: { landingStations: true } } },
        take: 5,
        orderBy: { nameEn: 'asc' },
      }),
    ]);

    // 如果标准搜索结果少于3条，用模糊变体再搜一次
    let allCables = cables;
    if (cables.length < 3 && fuzzyQuery !== query.toLowerCase()) {
      const fuzzyCables = await prisma.cable.findMany({
        where: { slug: { contains: fuzzyQuery.toLowerCase() } },
        select: { id: true, name: true, slug: true, status: true, lengthKm: true },
        take: 5,
      });
      // 合并去重
      const existingIds = new Set(cables.map(c => c.id));
      for (const fc of fuzzyCables) {
        if (!existingIds.has(fc.id)) { allCables.push(fc); existingIds.add(fc.id); }
      }
    }

    return NextResponse.json({
      cables: allCables.slice(0, 10),
      stations,
      countries,
      total: allCables.length + stations.length + countries.length,
    });
  } catch (error) {
    console.error('Search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

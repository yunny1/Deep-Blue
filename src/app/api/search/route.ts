// src/app/api/search/route.ts
// 全局搜索API — 支持标准化模糊匹配
// seamewe / seamwe3 / sea me we 都能匹配到 SEA-ME-WE 3

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 标准化搜索字符串：去掉连字符、空格、下划线、点，全部小写
// 例：'SEA-ME-WE 3' → 'seamewe3'，'seamewe' → 'seamewe'，于是两者可以前缀匹配
function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[-\s_./]/g, '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query || query.length < 1) {
    return NextResponse.json({ cables: [], stations: [], countries: [], total: 0 });
  }

  const normQ = normalizeQuery(query);

  try {
    // 同时跑三个查询
    const [allCables, stations, countries] = await Promise.all([
      // 海缆：先拉较宽的候选集，再在 JS 里做标准化过滤
      prisma.cable.findMany({
        where: {
          OR: [
            // 原始字符串包含查询（保留原有能力）
            { name: { contains: query, mode: 'insensitive' } },
            // slug 包含查询（如 sea-me-we-3 contains seamewe 失败，但 slug contains 'sea' 能命中）
            { slug: { contains: query.toLowerCase() } },
          ],
        },
        select: { id: true, name: true, slug: true, status: true, lengthKm: true },
        take: 50, // 先取多一些，后面再过滤排序
        orderBy: { name: 'asc' },
      }),

      // 登陆站
      prisma.landingStation.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { id: true, name: true, countryCode: true },
        take: 6,
        orderBy: { name: 'asc' },
      }),

      // 国家
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

    // 对海缆结果做标准化二次过滤 + 排序
    // 匹配策略（优先级从高到低）：
    //   1. 标准化后完全相等（seamewe3 === seamewe3）
    //   2. 标准化后前缀匹配（seamewe 前缀 seamewe3）
    //   3. 标准化后包含（me 包含在 seamewe3 里）
    //   4. 原始名称包含（已经在 prisma 查询里处理）
    const scoreCable = (name: string): number => {
      const norm = normalizeQuery(name);
      if (norm === normQ) return 100;
      if (norm.startsWith(normQ)) return 80;
      if (normQ.length >= 3 && norm.includes(normQ)) return 60;
      return 40; // 通过 prisma 的 contains 命中，但标准化后不匹配
    };

    // 同时补充一次标准化搜索（解决 seamewe 匹配不到 SEA-ME-WE 3 的核心问题）
    // 从数据库里拉出标准化后能匹配的海缆（prisma 不支持在数据库里做 replace，所以在 JS 里过滤）
    // 为了效率，只在 normQ.length >= 3 时才做这个补充查询
    let extraCables: typeof allCables = [];
    if (normQ.length >= 3) {
      // 拉出名称中含有查询前3字母的所有海缆，然后在 JS 里标准化过滤
      const prefix3 = query.slice(0, 3);
      const candidates = await prisma.cable.findMany({
        where: { name: { contains: prefix3, mode: 'insensitive' } },
        select: { id: true, name: true, slug: true, status: true, lengthKm: true },
        take: 100,
      });
      extraCables = candidates.filter(c => {
        const norm = normalizeQuery(c.name);
        return norm.includes(normQ) || norm.startsWith(normQ);
      });
    }

    // 合并去重，按得分排序，取前8条
    const cableMap = new Map<string, typeof allCables[0]>();
    for (const c of [...allCables, ...extraCables]) {
      cableMap.set(c.id, c);
    }

    const cables = [...cableMap.values()]
      .sort((a, b) => scoreCable(b.name) - scoreCable(a.name))
      .slice(0, 8);

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

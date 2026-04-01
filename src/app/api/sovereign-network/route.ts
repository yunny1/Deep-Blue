// src/app/api/sovereign-network/route.ts
//
// 为自主权网络图谱专用的海缆 GeoJSON 接口。
// 从数据库中查询出现在主权路径中的海缆真实路由，
// 并返回用于前端名称查找的索引，供 SovereignNetworkMap 渲染真实路线。

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 主权路径中出现的所有海缆的搜索关键词。
// 策略：对每条海缆取其名称中最具区分度的片段，用 contains 模糊匹配。
// 这样既能匹配 "Russia-Japan Cable Network (RJCN)" 也能匹配数据库中的变体写法。
const SOVEREIGN_CABLE_TERMS = [
  'Russia-Japan Cable Network',
  'Hokkaido-Sakhalin',
  'Asia Direct Cable',
  'PEACE Cable',
  'Asia Link Cable',
  'Vietnam-Singapore Cable System',
  'Thailand-Indonesia-Singapore',
  'Indonesia Global Gateway',
  'Batam Singapore Cable System',
  'INSICA',
  'South Atlantic Inter Link',
  'Nigeria Cameroon Submarine Cable',
  'Asia Submarine-cable Express',
  'SEA-H2X',
  'MYUS',
  'Dumai-Melaka Cable System',
  'Batam Dumai Melaka',
  'Batam-Rengit Cable System',
  'Batam Sarawak Internet Cable',
  'TGN-IA2',
  'ALPHA',
  'MIST',
  'Asia Connect Cable',
  'BtoBE',
  'Bridge One',
  'SEACOM',
  'TGN-Pacific',
  'RJCN',
  'HSCS',
];

export async function GET() {
  try {
    // 并发查询所有相关海缆（name 模糊匹配）
    const cables = await prisma.cable.findMany({
      where: {
        mergedInto: null,
        status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] },
        OR: SOVEREIGN_CABLE_TERMS.map(term => ({
          name: { contains: term, mode: 'insensitive' as const },
        })),
      },
      select: {
        slug: true,
        name: true,
        routeGeojson: true,
        landingStations: {
          select: {
            landingStation: {
              select: {
                name: true,
                latitude: true,
                longitude: true,
                countryCode: true,
                city: true,
              },
            },
          },
        },
      },
    });

    // 构建名称索引：多种名称写法 → slug
    // 目的是让前端能用 sovereign-routes.ts 里的显示名称找到对应的数据库记录
    const nameIndex: Record<string, string> = {};
    for (const cable of cables) {
      // 完整名称
      nameIndex[cable.name.toLowerCase()] = cable.slug;
      // 括号内的缩写，例如 "(RJCN)" → "rjcn"
      const abbrMatch = cable.name.match(/\(([A-Z0-9][A-Z0-9\-/]+)\)/g);
      if (abbrMatch) {
        abbrMatch.forEach(m => {
          const abbr = m.slice(1, -1); // 去掉括号
          nameIndex[abbr.toLowerCase()] = cable.slug;
        });
      }
      // 无括号的短名称（取第一个词）
      const firstWord = cable.name.split(/[\s(]/)[0];
      if (firstWord.length > 3) {
        nameIndex[firstWord.toLowerCase()] = cable.slug;
      }
    }

    // 序列化 routeGeojson（Prisma 返回的是 JsonValue，需要转换）
    const result = cables.map(c => ({
      slug: c.slug,
      name: c.name,
      routeGeojson: c.routeGeojson as GeoJSON.Geometry | null,
      stations: c.landingStations
        .map(cls => cls.landingStation)
        .filter(s => s.latitude != null && s.longitude != null)
        .map(s => ({
          name: s.name,
          lng: s.longitude as number,
          lat: s.latitude as number,
          country: s.countryCode,
          city: s.city,
        })),
    }));

    return NextResponse.json({ cables: result, nameIndex });
  } catch (e) {
    console.error('[SovereignNetwork API]', e);
    return NextResponse.json({ error: 'Failed to load cable data' }, { status: 500 });
  }
}

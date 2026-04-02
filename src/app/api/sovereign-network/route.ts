// src/app/api/sovereign-network/route.ts
// 新增：在返回的 cable 数据里包含 status 字段

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CANONICAL_CABLE_NAMES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 从数据库查询 26 条保留海缆的完整数据（含 status）
    const cables = await prisma.cable.findMany({
      where: {
        OR: CANONICAL_CABLE_NAMES.map(name => ({
          name: { contains: name.replace(/\s*\([^)]+\)/g, '').trim(), mode: 'insensitive' as const },
        })),
        status: { not: 'REMOVED' },
      },
      select: {
        slug: true,
        name: true,
        status: true,           // ← 新增：在役/退役/计划中
        lengthKm: true,
        fiberPairs: true,
        rfsDate: true,
        routeGeojson: true,
        vendor: {
          select: { name: true },
        },
        owners: {
          select: {
            company: { select: { name: true } },
          },
        },
        landingStations: {
          select: {
            landingStation: {
              select: {
                name: true,
                city: true,
                countryCode: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });

    // 构建 nameIndex（用于前端模糊匹配）
    const nameIndex: Record<string, string> = {};
    for (const cable of cables) {
      const key = cable.name.toLowerCase();
      nameIndex[key] = cable.slug;
      // 括号内缩写也加入索引
      Array.from(cable.name.matchAll(/\(([^)]+)\)/g)).forEach(m => {
        nameIndex[m[1].toLowerCase()] = cable.slug;
      });
      // 去掉括号的简化名也加入
      const simplified = cable.name.replace(/\s*\([^)]+\)/g, '').trim().toLowerCase();
      if (simplified !== key) nameIndex[simplified] = cable.slug;
    }

    const result = cables.map(c => ({
      slug: c.slug,
      name: c.name,
      status: c.status,                            // ← 新增
      lengthKm: c.lengthKm,
      
      fiberPairs: c.fiberPairs,
      rfsDate: c.rfsDate,
      routeGeojson: c.routeGeojson ?? null,
      vendor: c.vendor?.name ?? null,              // Company 对象取 .name
      owners: c.owners.map(o => o.company.name),  // 同上
      stations: c.landingStations.map(ls => ({
        name: ls.landingStation.name,
        city: ls.landingStation.city,
        country: ls.landingStation.countryCode,
        lat: ls.landingStation.latitude,
        lng: ls.landingStation.longitude,
      })),
    }));

    return NextResponse.json({ cables: result, nameIndex });
  } catch (e) {
    console.error('[sovereign-network]', e);
    return NextResponse.json({ cables: [], nameIndex: {} });
  }
}

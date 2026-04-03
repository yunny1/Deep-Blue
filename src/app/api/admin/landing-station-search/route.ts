// src/app/api/admin/landing-station-search/route.ts
// 搜索现有登陆站，供管理后台录入页的登陆站选择器使用。
// 支持按英文名、中文名、城市、国家代码模糊匹配，最多返回 15 条。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!q) return NextResponse.json({ stations: [] });

  // 国家代码通常是两位大写字母，精确匹配；否则做多字段模糊搜索
  const isCountryCode = /^[A-Za-z]{2}$/.test(q);

  const stations = await prisma.landingStation.findMany({
    where: isCountryCode
      ? { countryCode: { equals: q.toUpperCase() } }
      : {
          OR: [
            { name:    { contains: q, mode: 'insensitive' } },
            { nameZh:  { contains: q, mode: 'insensitive' } },
            { city:    { contains: q, mode: 'insensitive' } },
            { countryCode: { contains: q, mode: 'insensitive' } },
          ],
        },
    select: {
      id:          true,
      name:        true,
      nameZh:      true,
      city:        true,
      countryCode: true,
      latitude:    true,
      longitude:   true,
      // 顺带返回该站关联的海缆数量，方便用户判断站点是否"主流"
      _count: { select: { cables: true } },
    },
    orderBy: [
      // 关联海缆越多的站越靠前（说明数据质量越好）
      { cables: { _count: 'desc' } },
      { name: 'asc' },
    ],
    take: 15,
  });

  return NextResponse.json({
    stations: stations.map(s => ({
      id:          s.id,
      name:        s.name,
      nameZh:      s.nameZh,
      city:        s.city,
      countryCode: s.countryCode,
      lat:         s.latitude,
      lng:         s.longitude,
      cableCount:  s._count.cables,
    })),
  });
}

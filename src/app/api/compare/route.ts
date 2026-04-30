// src/app/api/compare/route.ts
// 海缆对比API — 同时返回两条海缆的完整数据用于并排比较
// 用法: /api/compare?a=cable-slug-1&b=cable-slug-2
//
// v2(本轮): 修复关键 bug — 之前查询海缆时完全没加过滤,
//          即使该缆已被 REMOVED / merged 也能被对比。
//          改用 src/lib/cable-filters.ts 的 ACTIVE_CABLE_FILTER。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateRiskScore } from '@/lib/risk-engine';
import { ACTIVE_CABLE_FILTER } from '@/lib/cable-filters';

async function getCableFullData(slugOrId: string) {
  // v2: 改用 findFirst + ACTIVE_CABLE_FILTER + (slug OR id) 形式,
  // 替代旧的"两次 findUnique 串行查"。这样既能用 slug 也能用 id 查,
  // 同时确保被删除/合并的缆不会出现在对比工具里。
  const cable = await prisma.cable.findFirst({
    where: {
      ...ACTIVE_CABLE_FILTER,
      OR: [{ slug: slugOrId }, { id: slugOrId }],
    },
    include: {
      vendor: true,
      owners: { include: { company: true } },
      landingStations: {
        include: { landingStation: { include: { country: true } } },
      },
    },
  });
  if (!cable) return null;

  const countryCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];
  const risk = calculateRiskScore(cable.routeGeojson, countryCodes, cable.owners.length);

  return {
    id: cable.id,
    name: cable.name,
    slug: cable.slug,
    status: cable.status,
    lengthKm: cable.lengthKm,
    rfsDate: cable.rfsDate,
    designCapacityTbps: cable.designCapacityTbps,
    fiberPairs: cable.fiberPairs,
    technology: cable.technology,
    estimatedLifespan: cable.estimatedLifespan,
    vendor: cable.vendor?.name || null,
    ownerCount: cable.owners.length,
    owners: cable.owners.map(o => o.company.name),
    stationCount: cable.landingStations.length,
    countryCount: countryCodes.length,
    countries: countryCodes,
    risk,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slugA = searchParams.get('a');
  const slugB = searchParams.get('b');

  if (!slugA || !slugB) {
    return NextResponse.json({ error: 'Both ?a= and ?b= parameters required' }, { status: 400 });
  }

  try {
    const [cableA, cableB] = await Promise.all([
      getCableFullData(slugA),
      getCableFullData(slugB),
    ]);

    if (!cableA) return NextResponse.json({ error: `Cable "${slugA}" not found` }, { status: 404 });
    if (!cableB) return NextResponse.json({ error: `Cable "${slugB}" not found` }, { status: 404 });

    // 计算共同国家
    const commonCountries = cableA.countries.filter(c => cableB.countries.includes(c));

    return NextResponse.json({
      cableA,
      cableB,
      comparison: {
        commonCountries,
        commonCountryCount: commonCountries.length,
        longerCable: (cableA.lengthKm || 0) > (cableB.lengthKm || 0) ? 'A' : 'B',
        higherRisk: cableA.risk.scoreOverall > cableB.risk.scoreOverall ? 'A' : 'B',
        moreStations: cableA.stationCount > cableB.stationCount ? 'A' : 'B',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Compare API error:', error);
    return NextResponse.json({ error: 'Comparison failed' }, { status: 500 });
  }
}

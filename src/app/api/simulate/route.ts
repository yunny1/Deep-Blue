// src/app/api/simulate/route.ts
// 延迟模拟器API — 模拟某条海缆断裂后对全球互联网连接的影响
// 计算受影响的国家、替代路由、延迟增加量等
//
// v2(本轮): 修复关键 bug
//   1. 之前查目标海缆时完全没加过滤,即使该缆已被 REMOVED / merged 也能被模拟
//   2. 之前查替代缆时只过滤 status=IN_SERVICE,没排除 mergedInto,
//      导致重复的合并缆被算作"独立可用替代"
//   改用 src/lib/cable-filters.ts 的 ACTIVE / IN_SERVICE 过滤器

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ACTIVE_CABLE_FILTER, IN_SERVICE_FILTER } from '@/lib/cable-filters';

// 简化的全球互联网延迟基准(毫秒,基于公开的全球延迟测量数据)
// 这些是直连路由的典型RTT值
const BASE_LATENCY: Record<string, Record<string, number>> = {
  'US': { 'GB': 75, 'DE': 90, 'JP': 120, 'SG': 180, 'AU': 200, 'BR': 130, 'IN': 220, 'AE': 200, 'ZA': 230 },
  'GB': { 'US': 75, 'DE': 20, 'FR': 15, 'JP': 220, 'SG': 180, 'IN': 120, 'AE': 100, 'NG': 120 },
  'SG': { 'US': 180, 'JP': 70, 'AU': 90, 'IN': 60, 'AE': 120, 'GB': 180, 'ID': 20, 'MY': 10 },
  'JP': { 'US': 120, 'SG': 70, 'AU': 120, 'KR': 30, 'TW': 40, 'GB': 220 },
};

// 当海缆断裂时,流量需要绕行的额外延迟(基于替代路由长度估算)
function estimateRerouteLatency(
  countryA: string, countryB: string, brokenCableLength: number | null
): { addedLatencyMs: number; rerouteDescription: string } {
  // 基于断裂海缆长度估算绕行延迟
  // 光在光纤中的传播速度约200,000 km/s,RTT需要×2
  // 绕行通常增加50-200%的路径长度
  const lengthKm = brokenCableLength || 5000;
  const directLatency = (lengthKm / 200000) * 1000 * 2; // 直连RTT (ms)
  const rerouteMultiplier = 1.5 + Math.random() * 0.5; // 绕行增加50-100%
  const addedLatencyMs = Math.round(directLatency * rerouteMultiplier);

  let rerouteDescription = 'Traffic rerouted via alternative submarine cables';
  if (addedLatencyMs > 100) rerouteDescription = 'Traffic rerouted via significantly longer alternative paths';
  if (addedLatencyMs > 200) rerouteDescription = 'Major rerouting required via satellite or distant cable systems';

  return { addedLatencyMs, rerouteDescription };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cableSlug = searchParams.get('cable');

  if (!cableSlug) {
    return NextResponse.json({ error: 'Parameter ?cable= required' }, { status: 400 });
  }

  try {
    // ── 修复 1:查目标海缆时叠加 ACTIVE_CABLE_FILTER ────────────────────────
    // 之前 findUnique 没加过滤,导致即使该缆已被 REMOVED / merged 也能被查到。
    // 现在改用 findFirst,叠加 ACTIVE_CABLE_FILTER + (slug OR id),
    // 让被删除的缆从模拟器里彻底消失。
    let cable = await prisma.cable.findFirst({
      where: {
        ...ACTIVE_CABLE_FILTER,
        OR: [{ slug: cableSlug }, { id: cableSlug }],
      },
      include: {
        landingStations: {
          include: { landingStation: { include: { country: true } } },
        },
      },
    });

    if (!cable) return NextResponse.json({ error: 'Cable not found' }, { status: 404 });

    const affectedCountries = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];

    // 查找每个受影响国家有多少条替代海缆
    const alternativesByCountry: Record<string, { total: number; names: string[] }> = {};

    for (const cc of affectedCountries) {
      // ── 修复 2:替代缆查询用 IN_SERVICE_FILTER(已包含 mergedInto: null)──
      // 之前的 where 只写了 status: 'IN_SERVICE',没排除 mergedInto,
      // 导致重复的合并缆被算作"独立可用替代",虚增冗余度。
      const alternatives = await prisma.cable.findMany({
        where: {
          ...IN_SERVICE_FILTER,
          id: { not: cable.id },
          landingStations: {
            some: { landingStation: { countryCode: cc } },
          },
        },
        select: { name: true },
        take: 10,
      });
      alternativesByCountry[cc] = {
        total: alternatives.length,
        names: alternatives.map(a => a.name).slice(0, 5),
      };
    }

    // 计算每个国家的影响程度
    const countryImpacts = affectedCountries.map(cc => {
      const alts = alternativesByCountry[cc];
      const { addedLatencyMs, rerouteDescription } = estimateRerouteLatency(
        affectedCountries[0], cc, cable!.lengthKm
      );

      let impactLevel: string;
      let impactDescription: string;

      if (alts.total === 0) {
        impactLevel = 'CRITICAL';
        impactDescription = 'No alternative submarine cables — complete isolation risk';
      } else if (alts.total <= 2) {
        impactLevel = 'HIGH';
        impactDescription = `Only ${alts.total} alternative cable(s) — severe congestion expected`;
      } else if (alts.total <= 5) {
        impactLevel = 'MODERATE';
        impactDescription = `${alts.total} alternative cables available — traffic will be redistributed with some degradation`;
      } else {
        impactLevel = 'LOW';
        impactDescription = `${alts.total} alternative cables provide good redundancy — minimal impact`;
      }

      const countryName = cable!.landingStations.find(
        ls => ls.landingStation.countryCode === cc
      )?.landingStation.country?.nameEn || cc;

      return {
        countryCode: cc,
        countryName,
        impactLevel,
        impactDescription,
        alternativeCables: alts.total,
        alternativeNames: alts.names,
        addedLatencyMs,
        rerouteDescription,
      };
    });

    // 按影响程度排序
    const impactOrder: Record<string, number> = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
    countryImpacts.sort((a, b) => (impactOrder[b.impactLevel] || 0) - (impactOrder[a.impactLevel] || 0));

    // 全局影响摘要
    const criticalCountries = countryImpacts.filter(c => c.impactLevel === 'CRITICAL');
    const highCountries = countryImpacts.filter(c => c.impactLevel === 'HIGH');

    return NextResponse.json({
      cable: {
        name: cable.name,
        slug: cable.slug,
        lengthKm: cable.lengthKm,
        status: cable.status,
      },
      simulation: {
        scenario: `Complete failure of ${cable.name}`,
        affectedCountries: affectedCountries.length,
        criticalImpact: criticalCountries.length,
        highImpact: highCountries.length,
        countryImpacts,
        averageLatencyIncrease: Math.round(
          countryImpacts.reduce((s, c) => s + c.addedLatencyMs, 0) / countryImpacts.length
        ),
      },
      summary: criticalCountries.length > 0
        ? `CRITICAL: ${criticalCountries.map(c => c.countryName).join(', ')} would face potential isolation`
        : highCountries.length > 0
          ? `HIGH IMPACT: ${highCountries.map(c => c.countryName).join(', ')} would experience severe degradation`
          : `MODERATE: Traffic would be redistributed across ${affectedCountries.length} countries with some latency increase`,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Simulation error:', error);
    return NextResponse.json({ error: 'Simulation failed' }, { status: 500 });
  }
}

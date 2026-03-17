// src/app/api/risk/route.ts
// 地缘政治风险评分API — 为海缆计算7因子加权风险分数
// ?cable=slug 计算单条海缆的风险
// ?top=20 返回风险最高的20条海缆
// 无参数 返回全局风险统计

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateRiskScore, type RiskScoreResult } from '@/lib/risk-engine';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cableSlug = searchParams.get('cable');
  const topN = parseInt(searchParams.get('top') || '20');

  try {
    // 单条海缆查询
    if (cableSlug) {
      let cable = await prisma.cable.findUnique({
        where: { slug: cableSlug },
        select: {
          id: true, name: true, slug: true, status: true,
          routeGeojson: true,
          owners: { select: { company: { select: { name: true } } } },
          landingStations: {
            select: { landingStation: { select: { countryCode: true } } },
          },
        },
      });

      // 如果slug找不到，尝试用id
      if (!cable) {
        cable = await prisma.cable.findUnique({
          where: { id: cableSlug },
          select: {
            id: true, name: true, slug: true, status: true,
            routeGeojson: true,
            owners: { select: { company: { select: { name: true } } } },
            landingStations: {
              select: { landingStation: { select: { countryCode: true } } },
            },
          },
        });
      }

      if (!cable) {
        return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
      }

      const countryCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];
      const ownerCount = cable.owners.length;
      const risk = calculateRiskScore(cable.routeGeojson, countryCodes, ownerCount);

      return NextResponse.json({
        cable: { id: cable.id, name: cable.name, slug: cable.slug, status: cable.status },
        risk,
        owners: cable.owners.map(o => o.company.name),
        countries: countryCodes,
        countryCount: countryCodes.length,
        timestamp: new Date().toISOString(),
      });
    }

    // 批量计算所有在役海缆的风险分数
    const cables = await prisma.cable.findMany({
      where: {
        status: { in: ['IN_SERVICE', 'UNDER_CONSTRUCTION'] },
        routeGeojson: { not: null as any },
      },
      select: {
        id: true, name: true, slug: true, status: true,
        routeGeojson: true,
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: { landingStation: { select: { countryCode: true } } },
        },
      },
    });

    // 计算每条海缆的风险分数
    const scored = cables.map(cable => {
      const countryCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];
      const risk = calculateRiskScore(cable.routeGeojson, countryCodes, cable.owners.length);
      return {
        id: cable.id,
        name: cable.name,
        slug: cable.slug,
        status: cable.status,
        riskScore: risk.scoreOverall,
        riskLevel: risk.riskLevel,
        conflictZones: risk.conflictZones,
        topFactor: getTopFactor(risk),
      };
    });

    // 按风险分数降序排列
    scored.sort((a, b) => b.riskScore - a.riskScore);

    // 风险等级分布统计
    const distribution = {
      critical: scored.filter(s => s.riskLevel === 'CRITICAL').length,
      high: scored.filter(s => s.riskLevel === 'HIGH').length,
      elevated: scored.filter(s => s.riskLevel === 'ELEVATED').length,
      moderate: scored.filter(s => s.riskLevel === 'MODERATE').length,
      low: scored.filter(s => s.riskLevel === 'LOW').length,
    };

    return NextResponse.json({
      totalCables: scored.length,
      distribution,
      averageScore: Math.round(scored.reduce((sum, s) => sum + s.riskScore, 0) / scored.length),
      topRisk: scored.slice(0, topN),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Risk API error:', error);
    return NextResponse.json({ error: 'Risk calculation failed' }, { status: 500 });
  }
}

// 找出最大的风险因子
function getTopFactor(risk: RiskScoreResult): string {
  const factors = [
    { name: 'Conflict waters', score: risk.scoreConflict * 0.25 },
    { name: 'Sanctions risk', score: risk.scoreSanctions * 0.20 },
    { name: 'Military activity', score: risk.scoreMilitary * 0.15 },
    { name: 'Ownership concentration', score: risk.scoreOwnership * 0.15 },
    { name: 'Legal complexity', score: risk.scoreLegal * 0.10 },
    { name: 'Historical damage', score: risk.scoreHistorical * 0.10 },
    { name: 'Recent events', score: risk.scoreEvents * 0.05 },
  ];
  factors.sort((a, b) => b.score - a.score);
  return factors[0].name;
}

/**
 * GET /api/brics/overview
 *
 * 返回 BRICS 核心统计数据
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  BRICS_MEMBERS,
  BRICS_ALL,
  isBRICSCountry,
  isBRICSInternalCable,
} from '@/lib/brics-constants';

export const revalidate = 3600;

// v8: 排除已合并 + 已移除 + 待审核
const ACTIVE_FILTER = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED'] as string[] },
};

interface CableWithCountries {
  id: string;
  slug: string;
  name: string;
  status: string;
  countryCodes: string[];
}

export async function GET() {
  try {
    // ── 1. 全局统计 ────────────────────────────────────
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count({ where: ACTIVE_FILTER }),
      prisma.landingStation.count(),
    ]);

    // ── 2. 所有海缆及其登陆站国家 ─────────────────────
    //    Cable → CableLandingStation → LandingStation.countryCode
    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        landingStations: {
          select: {
            landingStation: {
              select: { countryCode: true },
            },
          },
        },
      },
    });

    // 为每条海缆提取去重后的国家代码列表
    const cables: CableWithCountries[] = cablesRaw.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      status: c.status,
      countryCodes: [
        ...new Set(
          c.landingStations
            .map((cls) => cls.landingStation.countryCode?.toUpperCase())
            .filter(Boolean) as string[]
        ),
      ],
    }));

    // ── 3. BRICS 相关海缆（至少一个登陆站在 BRICS 国家）──
    const bricsRelatedCables = cables.filter((c) =>
      c.countryCodes.some((code) => isBRICSCountry(code))
    );

    // ── 4. BRICS 内部海缆（所有登陆站均在 BRICS 国家）──
    const bricsInternalCables = cables.filter((c) =>
      isBRICSInternalCable(c.countryCodes)
    );

    // ── 5. BRICS 仅成员国内部海缆 ─────────────────────
    const memberSet = new Set<string>(BRICS_MEMBERS);
    const memberInternalCables = cables.filter(
      (c) =>
        c.countryCodes.length >= 2 &&
        c.countryCodes.every((code) => memberSet.has(code))
    );

    // ── 6. BRICS 登陆站数 ──────────────────────────────
    const bricsAllSet = new Set<string>(BRICS_ALL.map((c) => c));
    const bricsStations = await prisma.landingStation.count({
      where: {
        countryCode: { in: [...bricsAllSet] },
      },
    });

    // ── 7. 各成员国海缆数 ──────────────────────────────
    const memberCableCounts: Record<string, number> = {};
    for (const code of BRICS_MEMBERS) {
      memberCableCounts[code] = cables.filter((c) =>
        c.countryCodes.includes(code)
      ).length;
    }

    // ── 8. 简化版数字主权指数 ──────────────────────────
    const sovereigntyIndex =
      bricsRelatedCables.length > 0
        ? Math.round(
            (bricsInternalCables.length / bricsRelatedCables.length) * 100
          )
        : 0;

    // ── 9. 按状态分类的 BRICS 海缆 ────────────────────
    const statusBreakdown = {
      active: bricsRelatedCables.filter(
        (c) => c.status === 'IN_SERVICE'
      ).length,
      underConstruction: bricsRelatedCables.filter(
        (c) => c.status === 'UNDER_CONSTRUCTION'
      ).length,
      planned: bricsRelatedCables.filter(
        (c) => c.status === 'PLANNED'
      ).length,
      other: bricsRelatedCables.filter(
        (c) =>
          !['IN_SERVICE', 'UNDER_CONSTRUCTION', 'PLANNED'].includes(c.status)
      ).length,
    };

    return NextResponse.json({
      global: {
        totalCables,
        totalStations,
      },
      brics: {
        relatedCables: bricsRelatedCables.length,
        internalCables: bricsInternalCables.length,
        memberInternalCables: memberInternalCables.length,
        stations: bricsStations,
        sovereigntyIndex,
        statusBreakdown,
        memberCableCounts,
      },
      internalCableList: bricsInternalCables.map((c) => ({
        slug: c.slug,
        name: c.name,
        status: c.status,
        countries: c.countryCodes,
      })),
    });
  } catch (error) {
    console.error('[BRICS Overview API]', error);
    return NextResponse.json(
      { error: 'Failed to compute BRICS overview' },
      { status: 500 }
    );
  }
}

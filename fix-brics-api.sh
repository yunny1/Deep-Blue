#!/bin/bash
# BRICS API 修复脚本 — 修正 Prisma 查询模式
# 直接在腾讯云执行: bash fix-brics-api.sh
set -e
PROJECT="/home/ubuntu/deep-blue"

echo "🔧 修复 BRICS API 文件..."
echo ""

# ─────────────────────────────────────────────────────
# 1/2 修复 overview API
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/app/api/brics/overview/route.ts" << 'OVERVIEW_EOF'
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
OVERVIEW_EOF
echo "  ✅ overview/route.ts"

# ─────────────────────────────────────────────────────
# 2/2 修复 sovereignty API
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/app/api/brics/sovereignty/route.ts" << 'SOVEREIGNTY_EOF'
/**
 * GET /api/brics/sovereignty
 *
 * 计算 BRICS 成员国 11×11 数字主权矩阵
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  BRICS_MEMBERS,
  BRICS_COUNTRY_META,
  isBRICSCountry,
} from '@/lib/brics-constants';

export const revalidate = 3600;

type ConnStatus = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';

interface MatrixCell {
  from: string;
  to: string;
  status: ConnStatus;
  directCableCount: number;
  directCables: string[];
}

// 内陆国：BRICS 成员中无海岸线的国家
const LANDLOCKED_MEMBERS = new Set(['ET']);

// v8: 排除已合并 + 已移除 + 待审核
const ACTIVE_FILTER = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED'] as string[] },
};

export async function GET() {
  try {
    // ── 1. 获取所有海缆及其国家代码 ─────────────────
    //    Cable → CableLandingStation → LandingStation.countryCode
    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: {
        slug: true,
        name: true,
        landingStations: {
          select: {
            landingStation: {
              select: { countryCode: true },
            },
          },
        },
      },
    });

    // 每条海缆的去重国家列表
    const cableCountries = cablesRaw.map((c) => ({
      slug: c.slug,
      name: c.name,
      countries: [
        ...new Set(
          c.landingStations
            .map((cls) => cls.landingStation.countryCode?.toUpperCase())
            .filter(Boolean) as string[]
        ),
      ],
    }));

    // ── 2. 构建国家级别的邻接表（海缆图）──────────
    const adjacency: Record<string, Set<string>> = {};
    const directCablesMap: Record<string, Record<string, string[]>> = {};

    for (const cable of cableCountries) {
      const countries = cable.countries;
      for (let i = 0; i < countries.length; i++) {
        for (let j = i + 1; j < countries.length; j++) {
          const a = countries[i];
          const b = countries[j];

          if (!adjacency[a]) adjacency[a] = new Set();
          if (!adjacency[b]) adjacency[b] = new Set();
          adjacency[a].add(b);
          adjacency[b].add(a);

          if (!directCablesMap[a]) directCablesMap[a] = {};
          if (!directCablesMap[a][b]) directCablesMap[a][b] = [];
          directCablesMap[a][b].push(cable.slug);

          if (!directCablesMap[b]) directCablesMap[b] = {};
          if (!directCablesMap[b][a]) directCablesMap[b][a] = [];
          directCablesMap[b][a].push(cable.slug);
        }
      }
    }

    // ── 3. BFS：仅经过 BRICS 国家的路径
    function canReachViaBRICS(from: string, to: string): boolean {
      if (!adjacency[from]) return false;
      const visited = new Set<string>([from]);
      const queue = [from];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency[current] ?? []) {
          if (neighbor === to) return true;
          if (!visited.has(neighbor) && isBRICSCountry(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return false;
    }

    // ── 4. BFS：任意路径可达
    function canReachViaAny(from: string, to: string): boolean {
      if (!adjacency[from]) return false;
      const visited = new Set<string>([from]);
      const queue = [from];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency[current] ?? []) {
          if (neighbor === to) return true;
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return false;
    }

    // ── 5. 构建 11×11 矩阵 ────────────────────────────
    const matrix: MatrixCell[] = [];
    const members = [...BRICS_MEMBERS];

    for (let i = 0; i < members.length; i++) {
      for (let j = 0; j < members.length; j++) {
        if (i === j) continue;

        const from = members[i];
        const to = members[j];

        if (LANDLOCKED_MEMBERS.has(from) || LANDLOCKED_MEMBERS.has(to)) {
          matrix.push({ from, to, status: 'landlocked', directCableCount: 0, directCables: [] });
          continue;
        }

        const cables = directCablesMap[from]?.[to] ?? [];

        let status: ConnStatus;
        if (cables.length > 0) {
          status = 'direct';
        } else if (canReachViaBRICS(from, to)) {
          status = 'indirect';
        } else if (canReachViaAny(from, to)) {
          status = 'transit';
        } else {
          status = 'none';
        }

        matrix.push({ from, to, status, directCableCount: cables.length, directCables: cables.slice(0, 10) });
      }
    }

    // ── 6. 汇总统计 ────────────────────────────────────
    const pairCount = (members.length * (members.length - 1)) / 2;
    const uniquePairs: Record<ConnStatus, number> = {
      direct: 0, indirect: 0, transit: 0, none: 0, landlocked: 0,
    };

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const cell = matrix.find(
          (m) => m.from === members[i] && m.to === members[j]
        );
        if (cell) uniquePairs[cell.status]++;
      }
    }

    return NextResponse.json({
      members: members.map((code) => ({
        code,
        name: BRICS_COUNTRY_META[code]?.name ?? code,
        nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code,
      })),
      matrix,
      summary: { totalPairs: pairCount, ...uniquePairs },
    });
  } catch (error) {
    console.error('[BRICS Sovereignty API]', error);
    return NextResponse.json(
      { error: 'Failed to compute sovereignty matrix' },
      { status: 500 }
    );
  }
}
SOVEREIGNTY_EOF
echo "  ✅ sovereignty/route.ts"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 修复完成！现在执行: npm run build"
echo "═══════════════════════════════════════════════════════"

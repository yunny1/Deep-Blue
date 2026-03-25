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

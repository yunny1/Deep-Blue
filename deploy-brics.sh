#!/bin/bash
# ═══════════════════════════════════════════════════════
# BRICS 仪表板 Phase 1 — 一键部署脚本
# 在腾讯云服务器上执行: bash deploy-brics.sh
# ═══════════════════════════════════════════════════════

set -e

# 使用方式：
#   cd /你的本地项目目录/deep-blue && bash deploy-brics.sh
#   或: bash deploy-brics.sh /path/to/deep-blue

PROJECT="${1:-.}"

if [ ! -d "$PROJECT/src" ]; then
  echo "❌ 当前目录下找不到 src/，请先 cd 到项目根目录再执行"
  echo "   用法: cd /path/to/deep-blue && bash deploy-brics.sh"
  exit 1
fi

echo "📂 项目目录: $(cd "$PROJECT" && pwd)"

echo "📁 创建目录结构..."
mkdir -p "$PROJECT/src/app/api/brics/overview"
mkdir -p "$PROJECT/src/app/api/brics/sovereignty"
mkdir -p "$PROJECT/src/app/brics"
mkdir -p "$PROJECT/src/components/brics"
# src/components/layout/ 和 src/lib/ 已存在

echo ""
echo "📝 写入文件..."

# ─────────────────────────────────────────────────────
# 1/9 src/lib/brics-constants.ts
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/lib/brics-constants.ts" << 'BRICS_CONSTANTS_EOF'
/**
 * BRICS+ 海缆战略分析 — 常量定义
 *
 * 成员体系截至 2025 年：
 *   - 11 个成员国（Members）
 *   - 10 个伙伴国（Partners）
 */

// ─── 成员国 ─────────────────────────────────────────────
export const BRICS_MEMBERS = [
  'BR', 'RU', 'IN', 'CN', 'ZA',           // 创始 + 2011
  'SA', 'IR', 'EG', 'AE', 'ET',           // 2024 加入
  'ID',                                     // 2025 加入
] as const;

// ─── 伙伴国 ─────────────────────────────────────────────
export const BRICS_PARTNERS = [
  'BY', 'BO', 'KZ', 'TH', 'CU', 'UG',    // 2024
  'MY', 'UZ', 'NG', 'VN',                 // 2024-2025
] as const;

export const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;

export type BRICSMemberCode = (typeof BRICS_MEMBERS)[number];
export type BRICSPartnerCode = (typeof BRICS_PARTNERS)[number];
export type BRICSCountryCode = (typeof BRICS_ALL)[number];

// ─── 国家元数据 ─────────────────────────────────────────
export interface BRICSCountryMeta {
  code: string;
  name: string;
  nameZh: string;
  tier: 'member' | 'partner';
  joinYear: number;
  /** 用于地图标注的近似中心坐标 */
  center: [lng: number, lat: number];
}

export const BRICS_COUNTRY_META: Record<string, BRICSCountryMeta> = {
  // ── 成员国 ──
  BR: { code: 'BR', name: 'Brazil',              nameZh: '巴西',       tier: 'member',  joinYear: 2006, center: [-51.9, -14.2] },
  RU: { code: 'RU', name: 'Russia',              nameZh: '俄罗斯',     tier: 'member',  joinYear: 2006, center: [105.3, 61.5] },
  IN: { code: 'IN', name: 'India',               nameZh: '印度',       tier: 'member',  joinYear: 2006, center: [78.9, 20.6] },
  CN: { code: 'CN', name: 'China',               nameZh: '中国',       tier: 'member',  joinYear: 2006, center: [104.2, 35.9] },
  ZA: { code: 'ZA', name: 'South Africa',        nameZh: '南非',       tier: 'member',  joinYear: 2011, center: [22.9, -30.6] },
  SA: { code: 'SA', name: 'Saudi Arabia',         nameZh: '沙特阿拉伯', tier: 'member',  joinYear: 2024, center: [45.1, 23.9] },
  IR: { code: 'IR', name: 'Iran',                nameZh: '伊朗',       tier: 'member',  joinYear: 2024, center: [53.7, 32.4] },
  EG: { code: 'EG', name: 'Egypt',               nameZh: '埃及',       tier: 'member',  joinYear: 2024, center: [30.8, 26.8] },
  AE: { code: 'AE', name: 'UAE',                 nameZh: '阿联酋',     tier: 'member',  joinYear: 2024, center: [53.8, 23.4] },
  ET: { code: 'ET', name: 'Ethiopia',            nameZh: '埃塞俄比亚', tier: 'member',  joinYear: 2024, center: [40.5, 9.1] },
  ID: { code: 'ID', name: 'Indonesia',           nameZh: '印度尼西亚', tier: 'member',  joinYear: 2025, center: [113.9, -0.8] },

  // ── 伙伴国 ──
  BY: { code: 'BY', name: 'Belarus',             nameZh: '白俄罗斯',   tier: 'partner', joinYear: 2024, center: [27.9, 53.7] },
  BO: { code: 'BO', name: 'Bolivia',             nameZh: '玻利维亚',   tier: 'partner', joinYear: 2024, center: [-63.6, -16.3] },
  KZ: { code: 'KZ', name: 'Kazakhstan',          nameZh: '哈萨克斯坦', tier: 'partner', joinYear: 2024, center: [66.9, 48.0] },
  TH: { code: 'TH', name: 'Thailand',            nameZh: '泰国',       tier: 'partner', joinYear: 2024, center: [100.5, 15.9] },
  CU: { code: 'CU', name: 'Cuba',                nameZh: '古巴',       tier: 'partner', joinYear: 2024, center: [-77.8, 21.5] },
  UG: { code: 'UG', name: 'Uganda',              nameZh: '乌干达',     tier: 'partner', joinYear: 2024, center: [32.3, 1.4] },
  MY: { code: 'MY', name: 'Malaysia',             nameZh: '马来西亚',   tier: 'partner', joinYear: 2024, center: [101.9, 4.2] },
  UZ: { code: 'UZ', name: 'Uzbekistan',          nameZh: '乌兹别克斯坦', tier: 'partner', joinYear: 2024, center: [64.6, 41.4] },
  NG: { code: 'NG', name: 'Nigeria',             nameZh: '尼日利亚',   tier: 'partner', joinYear: 2025, center: [8.7, 9.1] },
  VN: { code: 'VN', name: 'Vietnam',             nameZh: '越南',       tier: 'partner', joinYear: 2025, center: [108.3, 14.1] },
};

// ─── 视觉设计 Token ────────────────────────────────────
export const BRICS_COLORS = {
  /** 金砖金 — 主色 */
  gold:        '#D4AF37',
  goldLight:   '#E8D48B',
  goldDark:    '#A68B2B',
  /** 深海蓝 — 背景 */
  navy:        '#0A1628',
  navyLight:   '#132240',
  navySurface: '#1A2D4A',
  /** BRICS → 非 BRICS 海缆颜色 */
  silver:      '#8B95A5',
  /** 矩阵状态色 */
  directGreen:   '#22C55E',
  indirectAmber: '#F59E0B',
  noneRed:       '#EF4444',
  /** 创始五国标志色（蓝红黄绿橙） */
  flagBlue:    '#0066B3',
  flagRed:     '#D32F2F',
  flagYellow:  '#FFC107',
  flagGreen:   '#388E3C',
  flagOrange:  '#F57C00',
} as const;

// ─── 判断工具函数 ──────────────────────────────────────
const memberSet = new Set<string>(BRICS_MEMBERS);
const partnerSet = new Set<string>(BRICS_PARTNERS);
const allSet = new Set<string>(BRICS_ALL);

export function isBRICSMember(code: string): boolean {
  return memberSet.has(code.toUpperCase());
}

export function isBRICSPartner(code: string): boolean {
  return partnerSet.has(code.toUpperCase());
}

export function isBRICSCountry(code: string): boolean {
  return allSet.has(code.toUpperCase());
}

/**
 * 判断一条海缆是否为"BRICS 内部"海缆
 * 条件：该海缆所有登陆站所在国家全部属于 BRICS（成员 + 伙伴）
 */
export function isBRICSInternalCable(countryCodes: string[]): boolean {
  return countryCodes.length >= 2 && countryCodes.every(c => isBRICSCountry(c));
}

/**
 * 判断一条海缆是否"涉及 BRICS"
 * 条件：至少有一个登陆站在 BRICS 国家
 */
export function isBRICSRelatedCable(countryCodes: string[]): boolean {
  return countryCodes.some(c => isBRICSCountry(c));
}

BRICS_CONSTANTS_EOF
echo "  ✅ src/lib/brics-constants.ts"

# ─────────────────────────────────────────────────────
# 2/9 src/app/api/brics/overview/route.ts
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/app/api/brics/overview/route.ts" << 'OVERVIEW_EOF'
/**
 * GET /api/brics/overview
 *
 * 返回 BRICS 核心统计数据：
 *   - BRICS 相关海缆总数 / 全球总数
 *   - BRICS 登陆站总数 / 全球总数
 *   - BRICS 内部互联海缆数（所有登陆站均在 BRICS 国家）
 *   - 数字主权指数（Phase 1 简化版：内部互联比例）
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  BRICS_MEMBERS,
  BRICS_ALL,
  isBRICSCountry,
  isBRICSInternalCable,
} from '@/lib/brics-constants';

export const revalidate = 3600; // ISR: 1 小时

interface CableWithCountries {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  countryCodes: string[];
}

export async function GET() {
  try {
    // ── 1. 全局统计 ────────────────────────────────────
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count(),
      prisma.landingStation.count(),
    ]);

    // ── 2. 所有海缆及其登陆站国家 ─────────────────────
    //    通过 landing_stations 的 country 字段聚合每条海缆涉及的国家
    const cablesRaw = await prisma.cable.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        landingStations: {
          select: { countryCode: true },
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
            .map((s) => s.countryCode?.toUpperCase())
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
    //    公式：(BRICS 内部互联海缆数 / BRICS 相关海缆数) × 100
    //    越高说明 BRICS 内部互联越密集
    const sovereigntyIndex =
      bricsRelatedCables.length > 0
        ? Math.round(
            (bricsInternalCables.length / bricsRelatedCables.length) * 100
          )
        : 0;

    // ── 9. 按状态分类的 BRICS 海缆 ────────────────────
    const statusBreakdown = {
      active: bricsRelatedCables.filter(
        (c) => c.status?.toLowerCase() === 'active'
      ).length,
      underConstruction: bricsRelatedCables.filter(
        (c) => c.status?.toLowerCase() === 'under construction'
      ).length,
      planned: bricsRelatedCables.filter(
        (c) => c.status?.toLowerCase() === 'planned'
      ).length,
      other: bricsRelatedCables.filter(
        (c) =>
          !['active', 'under construction', 'planned'].includes(
            c.status?.toLowerCase() ?? ''
          )
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
      /** 用于前端列表/地图的 BRICS 内部海缆简要信息 */
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
echo "  ✅ src/app/api/brics/overview/route.ts"

# ─────────────────────────────────────────────────────
# 3/9 src/app/api/brics/sovereignty/route.ts
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/app/api/brics/sovereignty/route.ts" << 'SOVEREIGNTY_EOF'
/**
 * GET /api/brics/sovereignty
 *
 * 计算 BRICS 成员国 11×11 数字主权矩阵。
 *
 * 对每对成员国 (A, B)，判断连接状态：
 *   - "direct"   : 存在至少一条海缆同时经过 A 和 B
 *   - "indirect"  : 不直连，但可以通过其他 BRICS 国家中转到达
 *   - "transit"   : 只能通过非 BRICS 国家中转
 *   - "none"      : 无已知海缆连接路径
 *   - "landlocked" : 其中一方为内陆国（无海缆登陆站）
 *
 * 注意：这是基于海缆登陆站国家级别的简化分析，
 * 不考虑陆地光纤互联（如中国-俄罗斯陆缆）。
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
  /** 直连海缆数量 */
  directCableCount: number;
  /** 直连海缆 slug 列表（最多 10 条） */
  directCables: string[];
}

/** 内陆国：BRICS 成员中无海岸线的国家（埃塞俄比亚） */
const LANDLOCKED_MEMBERS = new Set(['ET']);

export async function GET() {
  try {
    // ── 1. 获取所有海缆及其国家代码 ─────────────────
    const cablesRaw = await prisma.cable.findMany({
      select: {
        slug: true,
        name: true,
        landingStations: {
          select: { countryCode: true },
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
            .map((s) => s.countryCode?.toUpperCase())
            .filter(Boolean) as string[]
        ),
      ],
    }));

    // ── 2. 构建国家级别的邻接表（海缆图）──────────
    //    adjacency[A] = Set of countries directly connected to A via any cable
    const adjacency: Record<string, Set<string>> = {};
    //    directCables[A][B] = cables connecting A and B
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

    // ── 3. BFS：判断两点之间是否存在仅经过 BRICS 国家的路径
    function canReachViaBRICS(from: string, to: string): boolean {
      if (!adjacency[from]) return false;
      const visited = new Set<string>([from]);
      const queue = [from];

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency[current] ?? []) {
          if (neighbor === to) return true;
          // 中转节点必须是 BRICS 国家
          if (!visited.has(neighbor) && isBRICSCountry(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return false;
    }

    // ── 4. BFS：判断是否通过任意路径可达（含非 BRICS 中转）
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

        // 内陆国特殊处理
        if (LANDLOCKED_MEMBERS.has(from) || LANDLOCKED_MEMBERS.has(to)) {
          matrix.push({
            from,
            to,
            status: 'landlocked',
            directCableCount: 0,
            directCables: [],
          });
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

        matrix.push({
          from,
          to,
          status,
          directCableCount: cables.length,
          directCables: cables.slice(0, 10),
        });
      }
    }

    // ── 6. 汇总统计 ────────────────────────────────────
    //    成员国之间的有向对数 = 11*10 = 110，无向对数 = 55
    const pairCount = (members.length * (members.length - 1)) / 2;
    // 去重（只算上三角）
    const uniquePairs: Record<ConnStatus, number> = {
      direct: 0,
      indirect: 0,
      transit: 0,
      none: 0,
      landlocked: 0,
    };

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const cell = matrix.find(
          (m) => m.from === members[i] && m.to === members[j]
        );
        if (cell) {
          uniquePairs[cell.status]++;
        }
      }
    }

    return NextResponse.json({
      members: members.map((code) => ({
        code,
        name: BRICS_COUNTRY_META[code]?.name ?? code,
        nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code,
      })),
      matrix,
      summary: {
        totalPairs: pairCount,
        ...uniquePairs,
      },
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
echo "  ✅ src/app/api/brics/sovereignty/route.ts"

# ─────────────────────────────────────────────────────
# 4/9 src/app/brics/page.tsx
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/app/brics/page.tsx" << 'BRICS_PAGE_EOF'
/**
 * /brics — BRICS+ 海缆战略仪表板
 *
 * Phase 1 内容：
 *   - Hero 标题区 + BRICS 五色条纹装饰
 *   - 核心统计卡片（BRICSStatsCards）
 *   - BRICS 专属地图（BRICSMap）— 金色高亮内部海缆
 *   - 数字主权矩阵（SovereigntyMatrix）— 11×11 直连分析
 */

import type { Metadata } from 'next';
import BRICSStatsCards from '@/components/brics/BRICSStatsCards';
import SovereigntyMatrix from '@/components/brics/SovereigntyMatrix';
import BRICSMap from '@/components/brics/BRICSMap';

export const metadata: Metadata = {
  title: 'BRICS+ Strategic Dashboard — Deep Blue',
  description:
    'Analyzing submarine cable infrastructure across BRICS+ nations: digital sovereignty, connectivity gaps, and investment opportunities.',
};

export default function BRICSPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        color: '#E8E0D0',
      }}
    >
      {/* ────────────────────────────────────────────────
       *  Hero 标题区
       * ──────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '48px 32px 36px',
          overflow: 'hidden',
        }}
      >
        {/* 五色条纹装饰（蓝红黄绿橙 — BRICS 创始五国标志色） */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            display: 'flex',
          }}
        >
          {['#0066B3', '#D32F2F', '#FFC107', '#388E3C', '#F57C00'].map(
            (color) => (
              <div
                key={color}
                style={{ flex: 1, background: color }}
              />
            )
          )}
        </div>

        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* 标签 */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: 'rgba(212, 175, 55, 0.08)',
              border: '1px solid rgba(212, 175, 55, 0.2)',
              borderRadius: '20px',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#D4AF37',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: '#D4AF37',
                textTransform: 'uppercase',
              }}
            >
              Strategic Analysis
            </span>
          </div>

          {/* 标题 */}
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 800,
              lineHeight: 1.15,
              margin: '0 0 12px',
              color: '#F0E6C8',
              letterSpacing: '-0.02em',
            }}
          >
            BRICS+{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #D4AF37, #E8D48B)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              海缆战略
            </span>
            仪表板
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'rgba(255,255,255,0.45)',
              maxWidth: '700px',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            可视化金砖国家数字互联互通现状 — 覆盖 11 个成员国和 10 个伙伴国的海缆基础设施、
            数字主权评估和战略缺口分析。
          </p>
        </div>
      </section>

      {/* ────────────────────────────────────────────────
       *  主内容区
       * ──────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 32px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
        }}
      >
        {/* ── 核心统计卡片 ── */}
        <section>
          <SectionHeader
            title="核心指标"
            subtitle="BRICS+ 海缆基础设施概览"
          />
          <BRICSStatsCards />
        </section>

        {/* ── BRICS 地图 ── */}
        <section>
          <SectionHeader
            title="BRICS 海缆网络"
            subtitle="金色 = BRICS 内部互联 | 银色 = BRICS ↔ 外部 | 灰色 = 非 BRICS"
          />
          <BRICSMap height="550px" initialCenter={[60, 15]} initialZoom={2.2} />
        </section>

        {/* ── 数字主权矩阵 ── */}
        <section>
          <SectionHeader
            title="数字主权矩阵"
            subtitle="成员国间海缆直连分析 — 绿色直连 / 黄色 BRICS 中转 / 红色经非 BRICS / 灰色无连接"
          />
          <SovereigntyMatrix />
        </section>
      </div>
    </main>
  );
}

// ─── 区块标题组件 ────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#F0E6C8',
          margin: '0 0 4px',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.35)',
          margin: 0,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

BRICS_PAGE_EOF
echo "  ✅ src/app/brics/page.tsx"

# ─────────────────────────────────────────────────────
# 5/9 src/components/brics/BRICSStatsCards.tsx
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/components/brics/BRICSStatsCards.tsx" << 'STATS_EOF'
'use client';

import { useEffect, useState } from 'react';

// ─── 类型定义 ────────────────────────────────────────────

interface BRICSOverview {
  global: {
    totalCables: number;
    totalStations: number;
  };
  brics: {
    relatedCables: number;
    internalCables: number;
    memberInternalCables: number;
    stations: number;
    sovereigntyIndex: number;
    statusBreakdown: {
      active: number;
      underConstruction: number;
      planned: number;
      other: number;
    };
  };
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  /** 0-100 进度值（可选，显示小进度条） */
  progress?: number;
  accentColor?: string;
}

// ─── 单个统计卡片 ────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  progress,
  accentColor = '#D4AF37',
}: StatCardProps) {
  return (
    <div
      style={{
        background: 'rgba(26, 45, 74, 0.6)',
        border: '1px solid rgba(212, 175, 55, 0.15)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backdropFilter: 'blur(12px)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)';
        e.currentTarget.style.boxShadow =
          '0 0 20px rgba(212, 175, 55, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.15)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(212, 175, 55, 0.7)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '36px',
          fontWeight: 700,
          color: '#F0E6C8',
          lineHeight: 1.1,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>
          {subtitle}
        </span>
      )}
      {progress !== undefined && (
        <div
          style={{
            marginTop: '4px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              borderRadius: '2px',
              background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
              transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export default function BRICSStatsCards() {
  const [data, setData] = useState<BRICSOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/overview')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(26, 45, 74, 0.4)',
              borderRadius: '12px',
              height: '140px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#EF4444',
          fontSize: '14px',
        }}
      >
        统计数据加载失败：{error ?? '未知错误'}
      </div>
    );
  }

  const { global, brics } = data;

  // 计算占比
  const cableShare =
    global.totalCables > 0
      ? ((brics.relatedCables / global.totalCables) * 100).toFixed(1)
      : '0';
  const stationShare =
    global.totalStations > 0
      ? ((brics.stations / global.totalStations) * 100).toFixed(1)
      : '0';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}
    >
      <StatCard
        label="BRICS 相关海缆"
        value={brics.relatedCables}
        subtitle={`占全球 ${cableShare}%（共 ${global.totalCables} 条）`}
        progress={parseFloat(cableShare)}
      />
      <StatCard
        label="BRICS 登陆站"
        value={brics.stations}
        subtitle={`占全球 ${stationShare}%（共 ${global.totalStations} 个）`}
        progress={parseFloat(stationShare)}
      />
      <StatCard
        label="内部互联海缆"
        value={brics.internalCables}
        subtitle={`两端均在 BRICS 国家（成员国间 ${brics.memberInternalCables} 条）`}
      />
      <StatCard
        label="数字主权指数"
        value={brics.sovereigntyIndex}
        subtitle="BRICS 内部互联 / BRICS 相关海缆比值"
        progress={brics.sovereigntyIndex}
        accentColor={
          brics.sovereigntyIndex >= 50
            ? '#22C55E'
            : brics.sovereigntyIndex >= 25
            ? '#F59E0B'
            : '#EF4444'
        }
      />
      <StatCard
        label="在役"
        value={brics.statusBreakdown.active}
        subtitle="Active"
        accentColor="#22C55E"
      />
      <StatCard
        label="建设中"
        value={brics.statusBreakdown.underConstruction}
        subtitle="Under Construction"
        accentColor="#3B82F6"
      />
    </div>
  );
}

STATS_EOF
echo "  ✅ src/components/brics/BRICSStatsCards.tsx"

# ─────────────────────────────────────────────────────
# 6/9 src/components/brics/SovereigntyMatrix.tsx
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/components/brics/SovereigntyMatrix.tsx" << 'MATRIX_EOF'
'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── 类型 ────────────────────────────────────────────────

type ConnStatus = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';

interface MemberInfo {
  code: string;
  name: string;
  nameZh: string;
}

interface MatrixCell {
  from: string;
  to: string;
  status: ConnStatus;
  directCableCount: number;
  directCables: string[];
}

interface SovereigntyData {
  members: MemberInfo[];
  matrix: MatrixCell[];
  summary: {
    totalPairs: number;
    direct: number;
    indirect: number;
    transit: number;
    none: number;
    landlocked: number;
  };
}

// ─── 颜色映射 ────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ConnStatus,
  { bg: string; label: string; labelZh: string; emoji: string }
> = {
  direct:     { bg: '#22C55E', label: 'Direct',     labelZh: '直连',        emoji: '●' },
  indirect:   { bg: '#F59E0B', label: 'Via BRICS',   labelZh: 'BRICS 中转', emoji: '◐' },
  transit:    { bg: '#EF4444', label: 'Via Non-BRICS', labelZh: '非 BRICS 中转', emoji: '○' },
  none:       { bg: '#6B7280', label: 'No Route',    labelZh: '无连接',      emoji: '✕' },
  landlocked: { bg: '#374151', label: 'Landlocked',  labelZh: '内陆国',      emoji: '▬' },
};

// ─── 单元格 Tooltip ──────────────────────────────────────

interface TooltipData {
  x: number;
  y: number;
  cell: MatrixCell;
  fromName: string;
  toName: string;
}

function Tooltip({ data }: { data: TooltipData }) {
  const config = STATUS_CONFIG[data.cell.status];
  return (
    <div
      style={{
        position: 'fixed',
        left: data.x + 12,
        top: data.y - 8,
        background: '#0F1D32',
        border: '1px solid rgba(212, 175, 55, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        zIndex: 9999,
        pointerEvents: 'none',
        minWidth: '220px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0E6C8',
          marginBottom: '6px',
        }}
      >
        {data.fromName} → {data.toName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: config.bg,
          }}
        />
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          {config.labelZh}（{config.label}）
        </span>
      </div>
      {data.cell.directCableCount > 0 && (
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
          直连海缆 {data.cell.directCableCount} 条
          {data.cell.directCables.length > 0 && (
            <span>：{data.cell.directCables.slice(0, 3).join(', ')}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 图例 ────────────────────────────────────────────────

function Legend({ summary }: { summary: SovereigntyData['summary'] }) {
  const items: { status: ConnStatus; count: number }[] = [
    { status: 'direct', count: summary.direct },
    { status: 'indirect', count: summary.indirect },
    { status: 'transit', count: summary.transit },
    { status: 'none', count: summary.none },
    { status: 'landlocked', count: summary.landlocked },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '16px' }}>
      {items.map(({ status, count }) => {
        const cfg = STATUS_CONFIG[status];
        return (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: cfg.bg,
                opacity: 0.85,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {cfg.labelZh} — {count} 对
            </span>
          </div>
        );
      })}
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px' }}>
        共 {summary.totalPairs} 对
      </span>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export default function SovereigntyMatrix() {
  const [data, setData] = useState<SovereigntyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [highlightRow, setHighlightRow] = useState<string | null>(null);
  const [highlightCol, setHighlightCol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/sovereignty')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 快速查找
  const getCell = useCallback(
    (from: string, to: string): MatrixCell | undefined => {
      return data?.matrix.find((m) => m.from === from && m.to === to);
    },
    [data]
  );

  const getMemberName = useCallback(
    (code: string): string => {
      return data?.members.find((m) => m.code === code)?.nameZh ?? code;
    },
    [data]
  );

  if (loading) {
    return (
      <div
        style={{
          background: 'rgba(26, 45, 74, 0.4)',
          borderRadius: '12px',
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '14px',
        }}
      >
        正在计算数字主权矩阵…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#EF4444',
          fontSize: '14px',
        }}
      >
        矩阵数据加载失败：{error ?? '未知错误'}
      </div>
    );
  }

  const members = data.members;
  const cellSize = 52;
  const headerWidth = 80;

  return (
    <div>
      {/* ── 矩阵容器 ── */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '12px',
          border: '1px solid rgba(212, 175, 55, 0.12)',
          background: 'rgba(15, 29, 50, 0.5)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'inline-block', minWidth: 'fit-content' }}>
          {/* ── 列头 ── */}
          <div style={{ display: 'flex', marginLeft: headerWidth }}>
            {members.map((m) => (
              <div
                key={`col-${m.code}`}
                style={{
                  width: cellSize,
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  color:
                    highlightCol === m.code
                      ? '#D4AF37'
                      : 'rgba(255,255,255,0.5)',
                  paddingBottom: '8px',
                  transition: 'color 0.15s',
                  cursor: 'default',
                }}
              >
                {m.code}
              </div>
            ))}
          </div>

          {/* ── 矩阵行 ── */}
          {members.map((rowMember) => (
            <div
              key={`row-${rowMember.code}`}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              {/* 行标签 */}
              <div
                style={{
                  width: headerWidth,
                  fontSize: '11px',
                  fontWeight: 600,
                  color:
                    highlightRow === rowMember.code
                      ? '#D4AF37'
                      : 'rgba(255,255,255,0.5)',
                  textAlign: 'right',
                  paddingRight: '12px',
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'default',
                }}
                title={rowMember.nameZh}
              >
                {rowMember.nameZh}
              </div>

              {/* 单元格 */}
              {members.map((colMember) => {
                const isSelf = rowMember.code === colMember.code;
                const cell = isSelf
                  ? null
                  : getCell(rowMember.code, colMember.code);
                const config = cell ? STATUS_CONFIG[cell.status] : null;
                const isHighlighted =
                  highlightRow === rowMember.code ||
                  highlightCol === colMember.code;

                return (
                  <div
                    key={`${rowMember.code}-${colMember.code}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isSelf ? 'default' : 'pointer',
                      borderRadius: '4px',
                      margin: '1px',
                      background: isSelf
                        ? 'rgba(212, 175, 55, 0.06)'
                        : config
                        ? `${config.bg}${isHighlighted ? '40' : '25'}`
                        : 'transparent',
                      transition: 'background 0.15s',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (isSelf || !cell) return;
                      setHighlightRow(rowMember.code);
                      setHighlightCol(colMember.code);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.right,
                        y: rect.top,
                        cell,
                        fromName: getMemberName(rowMember.code),
                        toName: getMemberName(colMember.code),
                      });
                    }}
                    onMouseLeave={() => {
                      setHighlightRow(null);
                      setHighlightCol(null);
                      setTooltip(null);
                    }}
                  >
                    {isSelf ? (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'rgba(212, 175, 55, 0.3)',
                        }}
                      >
                        {rowMember.code}
                      </span>
                    ) : config ? (
                      <>
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: config.bg,
                            opacity: 0.85,
                          }}
                        />
                        {cell && cell.directCableCount > 0 && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              right: '6px',
                              fontSize: '9px',
                              color: 'rgba(255,255,255,0.4)',
                              fontFeatureSettings: '"tnum"',
                            }}
                          >
                            {cell.directCableCount}
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── 图例 + 摘要 ── */}
      <Legend summary={data.summary} />

      {/* ── Tooltip ── */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}

MATRIX_EOF
echo "  ✅ src/components/brics/SovereigntyMatrix.tsx"

# ─────────────────────────────────────────────────────
# 7/9 src/components/brics/BRICSMap.tsx
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/components/brics/BRICSMap.tsx" << 'MAP_EOF'
'use client';

/**
 * BRICSMap — BRICS 专属地图图层
 *
 * 设计思路：
 *   不重新创建 MapLibre 实例，而是作为 overlay 层叠加在已有地图上。
 *   如果在独立的 /brics 页面使用，则自行初始化 MapLibre。
 *
 * 功能：
 *   1. 加载所有海缆 GeoJSON，按 BRICS 分类着色
 *   2. BRICS 内部海缆 → 金色发光
 *   3. BRICS → 非 BRICS 海缆 → 银色
 *   4. 非 BRICS 海缆 → 暗灰，降低透明度
 *   5. BRICS 成员国领土金色半透明填充（使用 Natural Earth GeoJSON）
 *
 * 依赖：maplibre-gl（项目已有）
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS,
  BRICS_ALL,
  BRICS_COUNTRY_META,
  BRICS_COLORS,
} from '@/lib/brics-constants';

// ─── 类型 ────────────────────────────────────────────────

interface CableGeoFeature {
  slug: string;
  name: string;
  countries: string[];
  /** 路由坐标 */
  coordinates: [number, number][];
  /** 是否 BRICS 内部 */
  bricsInternal: boolean;
  /** 是否 BRICS 相关 */
  bricsRelated: boolean;
}

interface BRICSMapProps {
  /** 地图容器高度 */
  height?: string;
  /** 初始缩放 */
  initialZoom?: number;
  /** 初始中心 */
  initialCenter?: [number, number];
  /** 地图底图样式 URL（默认使用深色底图） */
  mapStyle?: string;
}

// ─── BRICS 国家 ISO alpha-2 → Natural Earth 属性名映射 ──
//    Natural Earth GeoJSON 通常用 ISO_A2 或 ISO_A2_EH 字段

const BRICS_ALL_SET = new Set<string>(BRICS_ALL);
const BRICS_MEMBER_SET = new Set<string>(BRICS_MEMBERS);

// ─── 主组件 ──────────────────────────────────────────────

export default function BRICSMap({
  height = '600px',
  initialZoom = 2,
  initialCenter = [60, 20],
  mapStyle,
}: BRICSMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    internal: number;
    related: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── 初始化地图 ──────────────────────────────────
    const map = new maplibregl.Map({
      container: containerRef.current,
      // 深色底图。如果项目有自定义样式则替换此 URL
      style: mapStyle || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      fadeDuration: 0,
    });

    mapRef.current = map;

    map.on('load', async () => {
      try {
        // ── 1. 加载海缆数据 ────────────────────────
        const res = await fetch('/api/cables?includeRoutes=true');
        if (!res.ok) throw new Error(`Cables API: ${res.status}`);
        const cables = await res.json();

        // 分类海缆
        let internalCount = 0;
        let relatedCount = 0;

        const internalFeatures: GeoJSON.Feature[] = [];
        const relatedFeatures: GeoJSON.Feature[] = [];
        const otherFeatures: GeoJSON.Feature[] = [];

        for (const cable of cables) {
          // 国家代码：从 landing stations 的 countryCode 聚合
          const countries: string[] = (cable.countries || cable.countryCodes || []).map(
            (c: string) => c.toUpperCase()
          );

          // routeGeojson 是 GeoJSON geometry: { type: 'LineString'|'MultiLineString', coordinates }
          const geom = cable.routeGeojson;
          if (!geom?.coordinates || !geom.type) continue;

          // 统一为 GeoJSON geometry，支持 LineString 和 MultiLineString
          const geometry: GeoJSON.Geometry =
            geom.type === 'MultiLineString'
              ? { type: 'MultiLineString', coordinates: geom.coordinates }
              : { type: 'LineString', coordinates: geom.coordinates };

          // 基本有效性检查
          const coordsFlat =
            geom.type === 'MultiLineString'
              ? (geom.coordinates as number[][][]).flat()
              : (geom.coordinates as number[][]);
          if (coordsFlat.length < 2) continue;

          const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: {
              slug: cable.slug,
              name: cable.name,
              status: cable.status,
            },
            geometry,
          };

          const allBRICS = countries.length >= 2 && countries.every((c: string) => BRICS_ALL_SET.has(c));
          const anyBRICS = countries.some((c: string) => BRICS_ALL_SET.has(c));

          if (allBRICS) {
            internalFeatures.push(feature);
            internalCount++;
          } else if (anyBRICS) {
            relatedFeatures.push(feature);
            relatedCount++;
          } else {
            otherFeatures.push(feature);
          }
        }

        setStats({
          internal: internalCount,
          related: relatedCount,
          total: cables.length,
        });

        // ── 2. 添加海缆图层 ────────────────────────

        // 非 BRICS 海缆 — 暗灰
        map.addSource('cables-other', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: otherFeatures },
        });
        map.addLayer({
          id: 'cables-other-line',
          type: 'line',
          source: 'cables-other',
          paint: {
            'line-color': '#3A3F4A',
            'line-width': 0.8,
            'line-opacity': 0.25,
          },
        });

        // BRICS → 非 BRICS 海缆 — 银色
        map.addSource('cables-related', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: relatedFeatures },
        });
        map.addLayer({
          id: 'cables-related-line',
          type: 'line',
          source: 'cables-related',
          paint: {
            'line-color': BRICS_COLORS.silver,
            'line-width': 1.2,
            'line-opacity': 0.5,
          },
        });

        // BRICS 内部海缆 — 金色发光（双层：外层模糊 + 内层清晰）
        map.addSource('cables-internal', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: internalFeatures },
        });
        // 外层发光
        map.addLayer({
          id: 'cables-internal-glow',
          type: 'line',
          source: 'cables-internal',
          paint: {
            'line-color': BRICS_COLORS.gold,
            'line-width': 6,
            'line-opacity': 0.15,
            'line-blur': 4,
          },
        });
        // 内层线条
        map.addLayer({
          id: 'cables-internal-line',
          type: 'line',
          source: 'cables-internal',
          paint: {
            'line-color': BRICS_COLORS.gold,
            'line-width': 1.8,
            'line-opacity': 0.85,
          },
        });

        // ── 3. BRICS 成员国标注点 ───────────────────
        const labelFeatures: GeoJSON.Feature[] = BRICS_MEMBERS.map((code) => {
          const meta = BRICS_COUNTRY_META[code];
          return {
            type: 'Feature',
            properties: {
              code,
              name: meta?.nameZh ?? code,
            },
            geometry: {
              type: 'Point',
              coordinates: meta?.center ?? [0, 0],
            },
          };
        });

        map.addSource('brics-labels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: labelFeatures },
        });

        // 标注圆点
        map.addLayer({
          id: 'brics-label-dot',
          type: 'circle',
          source: 'brics-labels',
          paint: {
            'circle-radius': 5,
            'circle-color': BRICS_COLORS.gold,
            'circle-opacity': 0.7,
            'circle-stroke-color': BRICS_COLORS.goldDark,
            'circle-stroke-width': 1,
          },
        });

        // 国家名称
        map.addLayer({
          id: 'brics-label-text',
          type: 'symbol',
          source: 'brics-labels',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': BRICS_COLORS.goldLight,
            'text-halo-color': BRICS_COLORS.navy,
            'text-halo-width': 1.5,
          },
        });

        // ── 4. 交互：hover 高亮海缆名称 ────────────
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'brics-popup',
        });

        for (const layerId of ['cables-internal-line', 'cables-related-line']) {
          map.on('mouseenter', layerId, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const props = e.features?.[0]?.properties;
            if (props?.name) {
              popup
                .setLngLat(e.lngLat)
                .setHTML(
                  `<div style="font-size:12px;font-weight:600;color:#F0E6C8">${props.name}</div>`
                )
                .addTo(map);
            }
          });
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
          });
        }
      } catch (err) {
        console.error('[BRICSMap] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      {/* 地图容器 */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          borderRadius: '12px',
          border: '1px solid rgba(212, 175, 55, 0.12)',
        }}
      />

      {/* 加载指示器 */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 22, 40, 0.8)',
            borderRadius: '12px',
            zIndex: 10,
          }}
        >
          <span style={{ color: BRICS_COLORS.goldLight, fontSize: '14px' }}>
            正在加载 BRICS 海缆数据…
          </span>
        </div>
      )}

      {/* 右下角图层图例 */}
      {stats && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'rgba(10, 22, 40, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            border: '1px solid rgba(212, 175, 55, 0.12)',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: BRICS_COLORS.gold,
                borderRadius: '1px',
                boxShadow: `0 0 6px ${BRICS_COLORS.gold}44`,
              }}
            />
            BRICS 内部 ({stats.internal})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: BRICS_COLORS.silver,
                borderRadius: '1px',
              }}
            />
            BRICS ↔ 外部 ({stats.related})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: '#3A3F4A',
                borderRadius: '1px',
              }}
            />
            非 BRICS ({stats.total - stats.internal - stats.related})
          </div>
        </div>
      )}

      {/* 全局样式：popup */}
      <style>{`
        .brics-popup .maplibregl-popup-content {
          background: rgba(15, 29, 50, 0.95);
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 6px;
          padding: 6px 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .brics-popup .maplibregl-popup-tip {
          border-top-color: rgba(15, 29, 50, 0.95);
        }
      `}</style>
    </div>
  );
}

MAP_EOF
echo "  ✅ src/components/brics/BRICSMap.tsx"

# ─────────────────────────────────────────────────────
# 8/9 src/components/layout/BRICSNavButton.tsx
# ─────────────────────────────────────────────────────
cat > "$PROJECT/src/components/layout/BRICSNavButton.tsx" << 'NAVBTN_EOF'
// src/components/layout/BRICSNavButton.tsx
// BRICS+ 战略仪表板导航入口按钮
// 样式对齐 AiToggle / AnalysisMenu / InternetHealthIndicator

'use client';

import { useTranslation } from '@/lib/i18n';
import { usePathname } from 'next/navigation';

export default function BRICSNavButton() {
  const { locale } = useTranslation();
  const pathname = usePathname();
  const isActive = pathname?.startsWith('/brics');
  const zh = locale === 'zh';

  return (
    <a
      href="/brics"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${isActive ? 'rgba(212, 175, 55, 0.4)' : 'rgba(255,255,255,0.1)'}`,
        backgroundColor: isActive ? 'rgba(212, 175, 55, 0.12)' : 'rgba(255,255,255,0.04)',
        color: isActive ? '#D4AF37' : '#9CA3AF',
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontSize: 11,
        fontWeight: 500,
        textDecoration: 'none',
        flexShrink: 0,
        whiteSpace: 'nowrap' as const,
      }}
      onMouseEnter={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.3)';
          e.currentTarget.style.backgroundColor = 'rgba(212, 175, 55, 0.08)';
          e.currentTarget.style.color = '#D4AF37';
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
          e.currentTarget.style.color = '#9CA3AF';
        }
      }}
    >
      {/* 五色小条纹：蓝红黄绿橙 — BRICS 创始五国标志色 */}
      <span style={{ display: 'flex', gap: 1, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
        {['#0066B3', '#D32F2F', '#FFC107', '#388E3C', '#F57C00'].map(color => (
          <span
            key={color}
            style={{
              width: 2.5,
              height: 9,
              backgroundColor: color,
              opacity: isActive ? 0.9 : 0.55,
              transition: 'opacity 0.2s',
            }}
          />
        ))}
      </span>
      {zh ? 'BRICS+ 战略' : 'BRICS+'}
    </a>
  );
}

NAVBTN_EOF
echo "  ✅ src/components/layout/BRICSNavButton.tsx"

# ─────────────────────────────────────────────────────
# 9/9 src/app/page.tsx (覆盖原文件，仅新增2行)
# ─────────────────────────────────────────────────────
echo ""
echo "⚠️  备份原 page.tsx..."
cp "$PROJECT/src/app/page.tsx" "$PROJECT/src/app/page.tsx.bak.$(date +%Y%m%d%H%M%S)"
cat > "$PROJECT/src/app/page.tsx" << 'PAGE_EOF'
// src/app/page.tsx
// Deep Blue 首页
// 导航栏：Logo | SearchBox(绝对居中) | AnalysisMenu + 统计数字
// LangSwitcher 移到右下角浮动元素，不再占用导航栏空间
// ColorControlPanel: top:96（组件内部已改）
// FilterPanel: bottom:160，往上移，右侧
// BottomLeftPanel: 左下角，bottom:20

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import HoverCard from '@/components/panels/HoverCard';
import CableDetailPanel from '@/components/panels/CableDetailPanel';
import ColorControlPanel from '@/components/panels/ColorControlPanel';
import FilterPanel from '@/components/panels/FilterPanel';
import BottomLeftPanel from '@/components/panels/BottomLeftPanel';
import AiIntelPanel from '@/components/panels/AiIntelPanel';
import NewsTicker from '@/components/dashboard/NewsTicker';
import SearchBox from '@/components/layout/SearchBox';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import AiToggle from '@/components/layout/AiToggle';
import LangSwitcher from '@/components/layout/LangSwitcher';
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';
import AnalysisMenu from '@/components/layout/AnalysisMenu';
import BRICSNavButton from '@/components/layout/BRICSNavButton';
import MobileUI from '@/components/mobile/MobileUI';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D = dynamic(() => import('@/components/map/MapLibre2D'), { ssr: false });

interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

function HomeContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { viewMode, setSelectedCable } = useMapStore();
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const { t, locale } = useTranslation();

  const [windowWidth, setWindowWidth] = useState(1280);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const handleHover = useCallback((cable: CableHoverInfo | null, pos: { x: number; y: number }) => {
    if (isMobile) return;
    setHoverCable(cable);
    setHoverPos(pos);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
    setHoverCable(null);
    setSelectedCable(slug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 顶部导航栏 ═══
          最简布局：
          左侧  → Logo（固定宽度）
          中间  → SearchBox（absolute居中，只有这一个元素，280px不可能溢出）
          右侧  → AnalysisMenu + 分隔线 + 统计数字
          LangSwitcher 已移出导航栏，放到右下角 */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13,27,42,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 20px',
        zIndex: 50,
      }}>

        {/* 左：Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexShrink: 0 }}>
          <img src="/icons/deep-blue-icon.png" alt="Deep Blue"
            style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            {!isMobile && (
              <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
                {t('nav.subtitle')}
              </div>
            )}
          </div>
        </div>

        {/* 中：SearchBox 单独居中，宽280px，两侧各延伸140px，不会碰到任何东西 */}
        {!isMobile && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 280,
          }}>
            <SearchBox />
          </div>
        )}

        {/* 右：分析工具 + 统计数字（LangSwitcher 已移走） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          {!isMobile && (
            <>
              <AnalysisMenu />
              <BRICSNavButton />
              <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </>
          )}
          {stats && stats.cables ? (
            <>
              <StatBadge number={stats.cables.total || 0}
                label={isMobile ? t('nav.total') : t('nav.cables')} color="#2A9D8F" />
              {!isMobile && <>
                <StatBadge number={stats.cables.inService || 0}   label={t('nav.inService')} color="#06D6A0" />
                <StatBadge number={stats.cables.underConstruction || 0} label={t('nav.building')} color="#E9C46A" />
              </>}
              <StatBadge number={stats.landingStations || 0} label={t('nav.stations')} color="#2A9D8F" />
            </>
          ) : <span style={{ fontSize: 12, color: '#6B7280' }}>{t('nav.loading')}</span>}
        </div>
      </nav>

      {/* 新闻滚动条 */}
      {!isMobile && <NewsTicker />}

      {/* 地图 */}
      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      {/* ═══ 右侧控制栏 top=96 ═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16,
          zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, overflow: 'visible',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ViewModeToggle />
            <AiToggle />
          </div>
          <AiIntelPanel />
        </div>
      )}

      {/* 左侧：着色模式（top在组件内改为96） */}
      {!isMobile && <ColorControlPanel />}

      {/* ═══ 右下角：筛选面板（往上移到bottom:160，展开向上，不遮挡署名）═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: 160,
          right: 16,
          zIndex: 40,
        }}>
          <FilterPanel />
        </div>
      )}

      {/* ═══ 右下角：语言切换（从导航栏移出，独立悬浮）═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: 100,
          right: 16,
          zIndex: 40,
        }}>
          <LangSwitcher />
        </div>
      )}

      {/* 左下角：地震 + 互联网健康 */}
      {!isMobile && <BottomLeftPanel />}

      {/* 悬停卡片 */}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      {/* 海缆详情面板 */}
      <CableDetailPanel />

      {/* 右下角署名 */}
      {!isMobile && (
        <div style={{
          position: 'absolute', bottom: 10, right: 16,
          fontSize: 10, color: '#1E3A5F',
          zIndex: 10, userSelect: 'none', letterSpacing: 0.5,
        }}>
          by Jiang Yun
        </div>
      )}
      <a href="/admin" style={{
        position: 'fixed', bottom: 60, right: 16, zIndex: 100,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', fontSize: 14,
        opacity: 0.4,
      }} title="管理后台">
        🔒
      </a>

      {/* 移动端：底部导航栏 + 所有功能抽屉 */}
      {isMobile && <MobileUI />}
    </div>
  );
}

export default function HomePage() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  );
}

function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

PAGE_EOF
echo "  ✅ src/app/page.tsx (原文件已备份为 page.tsx.bak.*)"


echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ BRICS Phase 1 部署完成！共 9 个新文件 + 1 个修改文件"
echo ""
echo "新增文件："
echo "  src/lib/brics-constants.ts"
echo "  src/app/api/brics/overview/route.ts"
echo "  src/app/api/brics/sovereignty/route.ts"
echo "  src/app/brics/page.tsx"
echo "  src/components/brics/BRICSStatsCards.tsx"
echo "  src/components/brics/SovereigntyMatrix.tsx"
echo "  src/components/brics/BRICSMap.tsx"
echo "  src/components/layout/BRICSNavButton.tsx"
echo ""
echo "修改文件："
echo "  src/app/page.tsx (+2 行: import + JSX)"
echo ""
echo "下一步："
echo "  1. npm run build          # 本地验证编译"
echo "  2. git add -A && git commit -m 'feat: BRICS dashboard Phase 1'"
echo "  3. git push"
echo "  4. 腾讯云: cd /home/ubuntu/deep-blue && git pull && npm run build && pm2 restart deep-blue"
echo "═══════════════════════════════════════════════════════"

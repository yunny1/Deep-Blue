#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# BRICS 仪表盘 V2 — 完整升级部署脚本
# 在腾讯云执行: cd /home/ubuntu/deep-blue && bash upgrade-brics-v2.sh
# ═══════════════════════════════════════════════════════════════
set -e
P="/home/ubuntu/deep-blue"
[ ! -d "$P/src" ] && echo "❌ 找不到 $P/src" && exit 1
echo "🚀 BRICS V2 升级开始..."
mkdir -p "$P/src/app/api/brics/overview" "$P/src/app/api/brics/sovereignty"
mkdir -p "$P/src/app/brics" "$P/src/components/brics"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. BRICS 翻译模块
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/lib/brics-i18n.ts" << 'FILE01_EOF'
import { useTranslation } from '@/lib/i18n';

const T: Record<string, Record<string, string>> = {
  zh: {
    'title': '金砖海缆战略仪表盘',
    'badge': '战略分析',
    'subtitle': '覆盖金砖 11 个成员国和 10 个伙伴国的海缆基础设施、数字主权评估与战略缺口分析',
    'stats.title': '核心指标',
    'stats.cables': '金砖相关海缆',
    'stats.stations': '金砖登陆站',
    'stats.internal': '内部互联海缆',
    'stats.sovereignty': '数字主权指数',
    'stats.active': '在役',
    'stats.building': '建设中',
    'stats.globalPct': '占全球 {pct}%（共 {n} 条）',
    'stats.stationPct': '占全球 {pct}%（共 {n} 个）',
    'stats.internalDesc': '两端均在金砖国家（成员国间 {n} 条）',
    'stats.sovDesc': '金砖内部互联占比',
    'map.title': '金砖海缆网络',
    'map.3d': '3D 地球',
    'map.2d': '2D 地图',
    'map.internal': '金砖内部',
    'map.related': '金砖↔外部',
    'map.other': '非金砖',
    'map.loading': '正在加载金砖海缆数据…',
    'matrix.title': '数字主权矩阵',
    'matrix.subtitle': '成员国间海缆连接分析 — 评估金砖数字自主可控程度',
    'matrix.direct': '直连',
    'matrix.indirect': '金砖中转',
    'matrix.transit': '非金砖中转',
    'matrix.none': '无连接',
    'matrix.landlocked': '内陆国',
    'matrix.pairs': '对',
    'matrix.total': '共 {n} 对',
    'matrix.cables': '直连海缆 {n} 条',
    'matrix.status': '连接状态',
    'matrix.risk': '战略风险',
    'matrix.riskCritical': '极高 — 关键战略缺口',
    'matrix.riskHigh': '高 — 依赖非金砖基础设施',
    'matrix.riskMedium': '中 — 可通过金砖中转',
    'matrix.riskLow': '低 — 已有直连海缆',
    'matrix.riskNa': '不适用',
    'matrix.rec': '建议',
    'matrix.recNone': '纳入金砖海缆优先投资计划',
    'matrix.recTransit': '规划直连海缆，降低对外部依赖',
    'matrix.recIndirect': '增加直连冗余路由提升韧性',
    'matrix.recDirect': '维持并增强现有连接',
    'matrix.recLandlocked': '通过陆地光纤互联方案解决',
    'matrix.transitWarn': '通信必须经过非金砖国家基础设施',
    'matrix.noneWarn': '无已知海缆路径可连通两国',
    'gap.title': '战略缺口分析',
    'gap.subtitle': '需优先建设直连海缆的成员国对 — 按战略紧迫度排序',
    'gap.pair': '国家对',
    'gap.status': '当前状态',
    'gap.priority': '优先级',
    'gap.action': '建议行动',
    'gap.high': '高',
    'gap.medium': '中',
    'gap.buildDirect': '建设直连海缆',
    'gap.addRedundancy': '增加冗余路由',
    'footer.source': '数据来源：Deep Blue 海缆情报平台',
    'footer.update': '数据每小时更新',
  },
  en: {
    'title': 'BRICS Submarine Cable Strategic Dashboard',
    'badge': 'Strategic Analysis',
    'subtitle': 'Digital infrastructure analysis across 11 BRICS member states and 10 partner nations — sovereignty assessment and strategic gap identification',
    'stats.title': 'Key Metrics',
    'stats.cables': 'BRICS-Related Cables',
    'stats.stations': 'BRICS Landing Stations',
    'stats.internal': 'Internal Cables',
    'stats.sovereignty': 'Digital Sovereignty Index',
    'stats.active': 'Active',
    'stats.building': 'Under Construction',
    'stats.globalPct': '{pct}% of global total ({n})',
    'stats.stationPct': '{pct}% of global total ({n})',
    'stats.internalDesc': 'Both ends in BRICS nations ({n} between members)',
    'stats.sovDesc': 'Internal interconnection ratio',
    'map.title': 'BRICS Cable Network',
    'map.3d': '3D Globe',
    'map.2d': '2D Map',
    'map.internal': 'BRICS Internal',
    'map.related': 'BRICS ↔ External',
    'map.other': 'Non-BRICS',
    'map.loading': 'Loading BRICS cable data…',
    'matrix.title': 'Digital Sovereignty Matrix',
    'matrix.subtitle': 'Submarine cable connectivity between member states — assessing digital autonomy',
    'matrix.direct': 'Direct',
    'matrix.indirect': 'Via BRICS',
    'matrix.transit': 'Via Non-BRICS',
    'matrix.none': 'No Connection',
    'matrix.landlocked': 'Landlocked',
    'matrix.pairs': 'pairs',
    'matrix.total': '{n} pairs total',
    'matrix.cables': '{n} direct cable(s)',
    'matrix.status': 'Connection Status',
    'matrix.risk': 'Strategic Risk',
    'matrix.riskCritical': 'Critical — Key strategic gap',
    'matrix.riskHigh': 'High — Dependent on non-BRICS infrastructure',
    'matrix.riskMedium': 'Medium — Reachable via BRICS transit',
    'matrix.riskLow': 'Low — Direct cables exist',
    'matrix.riskNa': 'N/A',
    'matrix.rec': 'Recommendation',
    'matrix.recNone': 'Include in BRICS priority cable investment plan',
    'matrix.recTransit': 'Plan direct cable to reduce external dependency',
    'matrix.recIndirect': 'Add direct redundancy routes for resilience',
    'matrix.recDirect': 'Maintain and strengthen existing connections',
    'matrix.recLandlocked': 'Address via terrestrial fiber connectivity',
    'matrix.transitWarn': 'Traffic must traverse non-BRICS infrastructure',
    'matrix.noneWarn': 'No known submarine cable path between these nations',
    'gap.title': 'Strategic Gap Analysis',
    'gap.subtitle': 'Member state pairs requiring priority direct cable construction — ranked by strategic urgency',
    'gap.pair': 'Country Pair',
    'gap.status': 'Current Status',
    'gap.priority': 'Priority',
    'gap.action': 'Recommended Action',
    'gap.high': 'High',
    'gap.medium': 'Medium',
    'gap.buildDirect': 'Build direct cable',
    'gap.addRedundancy': 'Add redundancy route',
    'footer.source': 'Source: Deep Blue Cable Intelligence Platform',
    'footer.update': 'Data refreshed hourly',
  },
};

export function useBRICS() {
  const { locale } = useTranslation();
  const lang = locale === 'zh' ? 'zh' : 'en';
  function tb(key: string, params?: Record<string, string | number>): string {
    let s = T[lang]?.[key] ?? T['en']?.[key] ?? key;
    if (params) Object.entries(params).forEach(([k, v]) => { s = s.replace(`{${k}}`, String(v)); });
    return s;
  }
  return { tb, locale: lang, isZh: lang === 'zh' };
}
FILE01_EOF
echo "  ✅ 1/10 brics-i18n.ts"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. 常量（去掉 +）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/lib/brics-constants.ts" << 'FILE02_EOF'
export const BRICS_MEMBERS = ['BR','RU','IN','CN','ZA','SA','IR','EG','AE','ET','ID'] as const;
export const BRICS_PARTNERS = ['BY','BO','KZ','TH','CU','UG','MY','UZ','NG','VN'] as const;
export const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;
export type BRICSMemberCode = (typeof BRICS_MEMBERS)[number];

export interface BRICSCountryMeta {
  code: string; name: string; nameZh: string;
  tier: 'member' | 'partner'; joinYear: number;
  center: [number, number];
}

export const BRICS_COUNTRY_META: Record<string, BRICSCountryMeta> = {
  BR: { code:'BR', name:'Brazil', nameZh:'巴西', tier:'member', joinYear:2006, center:[-51.9,-14.2] },
  RU: { code:'RU', name:'Russia', nameZh:'俄罗斯', tier:'member', joinYear:2006, center:[105.3,61.5] },
  IN: { code:'IN', name:'India', nameZh:'印度', tier:'member', joinYear:2006, center:[78.9,20.6] },
  CN: { code:'CN', name:'China', nameZh:'中国', tier:'member', joinYear:2006, center:[104.2,35.9] },
  ZA: { code:'ZA', name:'South Africa', nameZh:'南非', tier:'member', joinYear:2011, center:[22.9,-30.6] },
  SA: { code:'SA', name:'Saudi Arabia', nameZh:'沙特阿拉伯', tier:'member', joinYear:2024, center:[45.1,23.9] },
  IR: { code:'IR', name:'Iran', nameZh:'伊朗', tier:'member', joinYear:2024, center:[53.7,32.4] },
  EG: { code:'EG', name:'Egypt', nameZh:'埃及', tier:'member', joinYear:2024, center:[30.8,26.8] },
  AE: { code:'AE', name:'UAE', nameZh:'阿联酋', tier:'member', joinYear:2024, center:[53.8,23.4] },
  ET: { code:'ET', name:'Ethiopia', nameZh:'埃塞俄比亚', tier:'member', joinYear:2024, center:[40.5,9.1] },
  ID: { code:'ID', name:'Indonesia', nameZh:'印度尼西亚', tier:'member', joinYear:2025, center:[113.9,-0.8] },
  BY: { code:'BY', name:'Belarus', nameZh:'白俄罗斯', tier:'partner', joinYear:2024, center:[27.9,53.7] },
  BO: { code:'BO', name:'Bolivia', nameZh:'玻利维亚', tier:'partner', joinYear:2024, center:[-63.6,-16.3] },
  KZ: { code:'KZ', name:'Kazakhstan', nameZh:'哈萨克斯坦', tier:'partner', joinYear:2024, center:[66.9,48.0] },
  TH: { code:'TH', name:'Thailand', nameZh:'泰国', tier:'partner', joinYear:2024, center:[100.5,15.9] },
  CU: { code:'CU', name:'Cuba', nameZh:'古巴', tier:'partner', joinYear:2024, center:[-77.8,21.5] },
  UG: { code:'UG', name:'Uganda', nameZh:'乌干达', tier:'partner', joinYear:2024, center:[32.3,1.4] },
  MY: { code:'MY', name:'Malaysia', nameZh:'马来西亚', tier:'partner', joinYear:2024, center:[101.9,4.2] },
  UZ: { code:'UZ', name:'Uzbekistan', nameZh:'乌兹别克斯坦', tier:'partner', joinYear:2024, center:[64.6,41.4] },
  NG: { code:'NG', name:'Nigeria', nameZh:'尼日利亚', tier:'partner', joinYear:2025, center:[8.7,9.1] },
  VN: { code:'VN', name:'Vietnam', nameZh:'越南', tier:'partner', joinYear:2025, center:[108.3,14.1] },
};

export const BRICS_COLORS = {
  gold: '#D4AF37', goldLight: '#E8D48B', goldDark: '#A68B2B',
  navy: '#0A1628', navyLight: '#132240', navySurface: '#1A2D4A',
  silver: '#8B95A5',
  directGreen: '#22C55E', indirectAmber: '#F59E0B', noneRed: '#EF4444',
  flagBlue: '#0066B3', flagRed: '#D32F2F', flagYellow: '#FFC107', flagGreen: '#388E3C', flagOrange: '#F57C00',
} as const;

const allSet = new Set<string>(BRICS_ALL);
export function isBRICSCountry(code: string): boolean { return allSet.has(code.toUpperCase()); }
export function isBRICSInternalCable(codes: string[]): boolean { return codes.length >= 2 && codes.every(c => allSet.has(c.toUpperCase())); }
FILE02_EOF
echo "  ✅ 2/10 brics-constants.ts"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. Overview API（增加 relatedCableSlugs）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/app/api/brics/overview/route.ts" << 'FILE03_EOF'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_ALL, isBRICSCountry, isBRICSInternalCable } from '@/lib/brics-constants';

export const revalidate = 3600;
const ACTIVE_FILTER = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count({ where: ACTIVE_FILTER }),
      prisma.landingStation.count(),
    ]);

    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: {
        id: true, slug: true, name: true, status: true,
        landingStations: { select: { landingStation: { select: { countryCode: true } } } },
      },
    });

    const cables = cablesRaw.map(c => ({
      id: c.id, slug: c.slug, name: c.name, status: c.status,
      countryCodes: [...new Set(c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[])],
    }));

    const bricsRelated = cables.filter(c => c.countryCodes.some(cc => isBRICSCountry(cc)));
    const bricsInternal = cables.filter(c => isBRICSInternalCable(c.countryCodes));
    const memberSet = new Set<string>(BRICS_MEMBERS);
    const memberInternal = cables.filter(c => c.countryCodes.length >= 2 && c.countryCodes.every(cc => memberSet.has(cc)));

    const bricsAllSet = new Set<string>(BRICS_ALL.map(c => c));
    const bricsStations = await prisma.landingStation.count({ where: { countryCode: { in: [...bricsAllSet] } } });

    const memberCableCounts: Record<string, number> = {};
    for (const code of BRICS_MEMBERS) memberCableCounts[code] = cables.filter(c => c.countryCodes.includes(code)).length;

    const sovereigntyIndex = bricsRelated.length > 0 ? Math.round((bricsInternal.length / bricsRelated.length) * 100) : 0;

    return NextResponse.json({
      global: { totalCables, totalStations },
      brics: {
        relatedCables: bricsRelated.length,
        internalCables: bricsInternal.length,
        memberInternalCables: memberInternal.length,
        stations: bricsStations,
        sovereigntyIndex,
        statusBreakdown: {
          active: bricsRelated.filter(c => c.status === 'IN_SERVICE').length,
          underConstruction: bricsRelated.filter(c => c.status === 'UNDER_CONSTRUCTION').length,
          planned: bricsRelated.filter(c => c.status === 'PLANNED').length,
        },
        memberCableCounts,
      },
      internalCableSlugs: bricsInternal.map(c => c.slug),
      relatedCableSlugs: bricsRelated.map(c => c.slug),
      internalCableList: bricsInternal.map(c => ({ slug: c.slug, name: c.name, status: c.status, countries: c.countryCodes })),
    });
  } catch (error) {
    console.error('[BRICS Overview]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
FILE03_EOF
echo "  ✅ 3/10 overview/route.ts"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Sovereignty API（不变）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/app/api/brics/sovereignty/route.ts" << 'FILE04_EOF'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type ConnStatus = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';
const LANDLOCKED = new Set(['ET']);
const ACTIVE_FILTER = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: { slug: true, name: true, landingStations: { select: { landingStation: { select: { countryCode: true } } } } },
    });
    const cableCountries = cablesRaw.map(c => ({
      slug: c.slug, name: c.name,
      countries: [...new Set(c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[])],
    }));

    const adj: Record<string, Set<string>> = {};
    const dcMap: Record<string, Record<string, string[]>> = {};
    for (const cable of cableCountries) {
      const cc = cable.countries;
      for (let i = 0; i < cc.length; i++) for (let j = i + 1; j < cc.length; j++) {
        const [a, b] = [cc[i], cc[j]];
        if (!adj[a]) adj[a] = new Set(); if (!adj[b]) adj[b] = new Set();
        adj[a].add(b); adj[b].add(a);
        if (!dcMap[a]) dcMap[a] = {}; if (!dcMap[a][b]) dcMap[a][b] = [];
        dcMap[a][b].push(cable.slug);
        if (!dcMap[b]) dcMap[b] = {}; if (!dcMap[b][a]) dcMap[b][a] = [];
        dcMap[b][a].push(cable.slug);
      }
    }

    function bfs(from: string, to: string, bricsOnly: boolean): boolean {
      if (!adj[from]) return false;
      const vis = new Set([from]); const q = [from];
      while (q.length) { const cur = q.shift()!;
        for (const nb of adj[cur] ?? []) {
          if (nb === to) return true;
          if (!vis.has(nb) && (!bricsOnly || isBRICSCountry(nb))) { vis.add(nb); q.push(nb); }
        }
      }
      return false;
    }

    const members = [...BRICS_MEMBERS];
    const matrix: { from: string; to: string; status: ConnStatus; directCableCount: number; directCables: string[] }[] = [];
    for (let i = 0; i < members.length; i++) for (let j = 0; j < members.length; j++) {
      if (i === j) continue;
      const [f, t] = [members[i], members[j]];
      if (LANDLOCKED.has(f) || LANDLOCKED.has(t)) { matrix.push({ from: f, to: t, status: 'landlocked', directCableCount: 0, directCables: [] }); continue; }
      const cables = dcMap[f]?.[t] ?? [];
      const status: ConnStatus = cables.length > 0 ? 'direct' : bfs(f, t, true) ? 'indirect' : bfs(f, t, false) ? 'transit' : 'none';
      matrix.push({ from: f, to: t, status, directCableCount: cables.length, directCables: cables.slice(0, 10) });
    }

    const up: Record<ConnStatus, number> = { direct: 0, indirect: 0, transit: 0, none: 0, landlocked: 0 };
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const c = matrix.find(m => m.from === members[i] && m.to === members[j]);
      if (c) up[c.status]++;
    }

    return NextResponse.json({
      members: members.map(code => ({ code, name: BRICS_COUNTRY_META[code]?.name ?? code, nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code })),
      matrix,
      summary: { totalPairs: (members.length * (members.length - 1)) / 2, ...up },
    });
  } catch (error) {
    console.error('[BRICS Sovereignty]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
FILE04_EOF
echo "  ✅ 4/10 sovereignty/route.ts"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. /brics 页面入口（Server Component）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/app/brics/page.tsx" << 'FILE05_EOF'
import type { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n';
import BRICSDashboard from '@/components/brics/BRICSDashboard';

export const metadata: Metadata = {
  title: 'BRICS Strategic Dashboard — Deep Blue',
  description: 'Submarine cable infrastructure analysis across BRICS nations: digital sovereignty, connectivity gaps, and investment opportunities.',
};

export default function BRICSPage() {
  return (
    <I18nProvider>
      <BRICSDashboard />
    </I18nProvider>
  );
}
FILE05_EOF
echo "  ✅ 5/10 brics/page.tsx"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. 主仪表盘组件（核心布局 + 统计 + 缺口分析）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/components/brics/BRICSDashboard.tsx" << 'FILE06_EOF'
'use client';
import { useEffect, useState } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSMap from './BRICSMap';

const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

interface Overview {
  global: { totalCables: number; totalStations: number };
  brics: { relatedCables: number; internalCables: number; memberInternalCables: number; stations: number; sovereigntyIndex: number;
    statusBreakdown: { active: number; underConstruction: number; planned: number }; memberCableCounts: Record<string, number> };
}

interface SovData {
  matrix: { from: string; to: string; status: string; directCableCount: number; directCables: string[] }[];
  summary: { direct: number; indirect: number; transit: number; none: number; landlocked: number; totalPairs: number };
}

function AnimNum({ n, suffix }: { n: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { let start = 0; const dur = 1200; const t0 = Date.now();
    const tick = () => { const p = Math.min((Date.now() - t0) / dur, 1); const ease = 1 - Math.pow(1 - p, 3);
      setV(Math.round(start + (n - start) * ease)); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [n]);
  return <>{v.toLocaleString()}{suffix || ''}</>;
}

export default function BRICSDashboard() {
  const { tb, isZh } = useBRICS();
  const [ov, setOv] = useState<Overview | null>(null);
  const [sov, setSov] = useState<SovData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/brics/overview').then(r => r.json()),
      fetch('/api/brics/sovereignty').then(r => r.json()),
    ]).then(([o, s]) => { setOv(o); setSov(s); }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const gapPairs = sov?.matrix
    .filter(m => m.from < m.to && (m.status === 'none' || m.status === 'transit'))
    .sort((a, b) => (a.status === 'none' ? 0 : 1) - (b.status === 'none' ? 0 : 1))
    .slice(0, 12) ?? [];

  const cPct = ov ? ((ov.brics.relatedCables / ov.global.totalCables) * 100).toFixed(1) : '0';
  const sPct = ov ? ((ov.brics.stations / ov.global.totalStations) * 100).toFixed(1) : '0';

  return (
    <div style={{ minHeight: '100vh', background: C.navy, color: '#E8E0D0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .brics-page { font-family: 'DM Sans', system-ui, sans-serif; }
        .brics-page h1, .brics-page h2 { font-family: 'Playfair Display', serif; }
        .brics-page *::-webkit-scrollbar { width: 6px; height: 6px; }
        .brics-page *::-webkit-scrollbar-track { background: ${C.navy}; }
        .brics-page *::-webkit-scrollbar-thumb { background: ${C.gold}30; border-radius: 3px; }
        .brics-page *::-webkit-scrollbar-thumb:hover { background: ${C.gold}60; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 20px ${C.gold}15; } 50% { box-shadow: 0 0 40px ${C.gold}25; } }
        .brics-section { animation: fadeUp 0.6s ease both; }
        .brics-card { background: rgba(26,45,74,0.5); border: 1px solid ${C.gold}15; border-radius: 14px; backdrop-filter: blur(12px); transition: all 0.25s; }
        .brics-card:hover { border-color: ${C.gold}35; box-shadow: 0 0 24px ${C.gold}10; }
      `}</style>

      <div className="brics-page">
        {/* ── 五色条纹 ── */}
        <div style={{ display:'flex', height: 4 }}>
          {FLAGS.map(c => <div key={c} style={{ flex:1, background:c }} />)}
        </div>

        {/* ── Hero ── */}
        <section className="brics-section" style={{ padding:'48px 32px 32px', maxWidth:1400, margin:'0 auto' }}>
          <a href="/" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', background:`${C.gold}10`, border:`1px solid ${C.gold}25`, borderRadius:20, textDecoration:'none', marginBottom:20 }}>
            <span style={{ fontSize:11, color:'#9CA3AF' }}>← {isZh ? '返回首页' : 'Back to Home'}</span>
          </a>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', background:`${C.gold}08`, border:`1px solid ${C.gold}20`, borderRadius:20, marginBottom:16, marginLeft:12 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:C.gold }} />
            <span style={{ fontSize:12, fontWeight:600, letterSpacing:'0.06em', color:C.gold, textTransform:'uppercase' }}>{tb('badge')}</span>
          </div>
          <h1 style={{ fontSize:'clamp(30px,4.5vw,48px)', fontWeight:800, lineHeight:1.12, margin:'0 0 14px', color:'#F0E6C8', letterSpacing:'-0.02em' }}>
            {tb('title').split(' ').map((w, i) => i === 0 ?
              <span key={i} style={{ background:`linear-gradient(135deg,${C.gold},${C.goldLight})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>{w} </span>
              : <span key={i}>{w} </span>
            )}
          </h1>
          <p style={{ fontSize:15, color:'rgba(255,255,255,0.4)', maxWidth:750, lineHeight:1.7, margin:0 }}>{tb('subtitle')}</p>
        </section>

        {/* ── 统计卡片 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.1s' }}>
          <SectionHead title={tb('stats.title')} />
          {ov ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:14 }}>
              <StatCard label={tb('stats.cables')} value={ov.brics.relatedCables} sub={tb('stats.globalPct', { pct: cPct, n: ov.global.totalCables })} progress={parseFloat(cPct)} color={C.gold} />
              <StatCard label={tb('stats.stations')} value={ov.brics.stations} sub={tb('stats.stationPct', { pct: sPct, n: ov.global.totalStations })} progress={parseFloat(sPct)} color={C.gold} />
              <StatCard label={tb('stats.internal')} value={ov.brics.internalCables} sub={tb('stats.internalDesc', { n: ov.brics.memberInternalCables })} color={C.goldLight} />
              <StatCard label={tb('stats.sovereignty')} value={ov.brics.sovereigntyIndex} sub={tb('stats.sovDesc')} progress={ov.brics.sovereigntyIndex}
                color={ov.brics.sovereigntyIndex >= 50 ? '#22C55E' : ov.brics.sovereigntyIndex >= 25 ? '#F59E0B' : '#EF4444'} />
              <StatCard label={tb('stats.active')} value={ov.brics.statusBreakdown.active} color="#22C55E" />
              <StatCard label={tb('stats.building')} value={ov.brics.statusBreakdown.underConstruction} color="#3B82F6" />
            </div>
          ) : <LoadingBlock h={160} />}
        </section>

        {/* ── 地图 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.2s' }}>
          <SectionHead title={tb('map.title')} />
          <BRICSMap height="560px" />
        </section>

        {/* ── 数字主权矩阵 ── */}
        <section className="brics-section" style={{ padding:'0 32px 40px', maxWidth:1400, margin:'0 auto', animationDelay:'0.3s' }}>
          <SectionHead title={tb('matrix.title')} sub={tb('matrix.subtitle')} />
          <SovereigntyMatrix />
        </section>

        {/* ── 战略缺口分析 ── */}
        <section className="brics-section" style={{ padding:'0 32px 48px', maxWidth:1400, margin:'0 auto', animationDelay:'0.4s' }}>
          <SectionHead title={tb('gap.title')} sub={tb('gap.subtitle')} />
          {gapPairs.length > 0 ? (
            <div className="brics-card" style={{ overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:`1px solid ${C.gold}15` }}>
                      {[tb('gap.priority'), tb('gap.pair'), tb('gap.status'), tb('gap.action')].map(h =>
                        <th key={h} style={{ padding:'14px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:`${C.gold}90`, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {gapPairs.map((g, i) => {
                      const isNone = g.status === 'none';
                      const fMeta = BRICS_COUNTRY_META[g.from];
                      const tMeta = BRICS_COUNTRY_META[g.to];
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)', transition:'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = `${C.gold}06`}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4,
                              background: isNone ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              color: isNone ? '#EF4444' : '#F59E0B' }}>
                              {isNone ? tb('gap.high') : tb('gap.medium')}
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', color:'#F0E6C8', fontWeight:500 }}>
                            {isZh ? fMeta?.nameZh : fMeta?.name} → {isZh ? tMeta?.nameZh : tMeta?.name}
                          </td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <span style={{ width:8, height:8, borderRadius:'50%', background: isNone ? '#EF4444' : '#F59E0B' }} />
                              <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>
                                {isNone ? tb('matrix.none') : tb('matrix.transit')}
                              </span>
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', color:'rgba(255,255,255,0.5)', fontSize:12 }}>
                            {isNone ? tb('gap.buildDirect') : tb('gap.addRedundancy')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : loading ? <LoadingBlock h={200} /> : null}
        </section>

        {/* ── 页脚 ── */}
        <footer style={{ padding:'20px 32px', borderTop:`1px solid ${C.gold}10`, maxWidth:1400, margin:'0 auto', display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,0.2)' }}>
          <span>{tb('footer.source')}</span>
          <span>{tb('footer.update')}</span>
        </footer>
      </div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom:20 }}>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#F0E6C8', margin:'0 0 4px' }}>{title}</h2>
      {sub && <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)', margin:0, lineHeight:1.6 }}>{sub}</p>}
    </div>
  );
}

function StatCard({ label, value, sub, progress, color }: { label: string; value: number; sub?: string; progress?: number; color: string }) {
  return (
    <div className="brics-card" style={{ padding:22, display:'flex', flexDirection:'column', gap:6 }}>
      <span style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:`${C.gold}80` }}>{label}</span>
      <span style={{ fontSize:34, fontWeight:700, color:'#F0E6C8', lineHeight:1.1, fontFeatureSettings:'"tnum"' }}><AnimNum n={value} /></span>
      {sub && <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)' }}>{sub}</span>}
      {progress !== undefined && (
        <div style={{ marginTop:4, height:4, borderRadius:2, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
          <div style={{ width:`${Math.min(100, progress)}%`, height:'100%', borderRadius:2, background:`linear-gradient(90deg,${color},${color}88)`, transition:'width 1s cubic-bezier(0.22,1,0.36,1)' }} />
        </div>
      )}
    </div>
  );
}

function LoadingBlock({ h }: { h: number }) {
  return <div style={{ height: h, borderRadius:14, background:'rgba(26,45,74,0.4)', animation:'pulse 1.5s ease-in-out infinite' }} />;
}
FILE06_EOF
echo "  ✅ 6/10 BRICSDashboard.tsx"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. 数字主权矩阵（增强版 tooltip）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/components/brics/SovereigntyMatrix.tsx" << 'FILE07_EOF'
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';
interface Member { code: string; name: string; nameZh: string; }
interface Cell { from: string; to: string; status: CS; directCableCount: number; directCables: string[]; }
interface Data { members: Member[]; matrix: Cell[]; summary: Record<string, number>; }

const SC: Record<CS, { bg: string; key: string }> = {
  direct:     { bg: '#22C55E', key: 'matrix.direct' },
  indirect:   { bg: '#F59E0B', key: 'matrix.indirect' },
  transit:    { bg: '#EF4444', key: 'matrix.transit' },
  none:       { bg: '#6B7280', key: 'matrix.none' },
  landlocked: { bg: '#374151', key: 'matrix.landlocked' },
};

export default function SovereigntyMatrix() {
  const { tb, isZh } = useBRICS();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; cell: Cell; fn: string; tn: string } | null>(null);
  const [hlRow, setHlRow] = useState<string | null>(null);
  const [hlCol, setHlCol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/sovereignty').then(r => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  const getCell = useCallback((f: string, t: string) => data?.matrix.find(m => m.from === f && m.to === t), [data]);
  const getName = useCallback((code: string) => {
    const m = data?.members.find(x => x.code === code);
    return isZh ? (m?.nameZh ?? code) : (m?.name ?? code);
  }, [data, isZh]);

  if (loading || !data) return <div style={{ height:400, borderRadius:14, background:'rgba(26,45,74,0.4)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.3)', fontSize:14 }}>{loading ? (isZh ? '正在计算数字主权矩阵…' : 'Computing sovereignty matrix…') : ''}</div>;

  const { members, summary } = data;
  const cs = 48; const hw = 72;

  return (
    <div>
      <div style={{ overflowX:'auto', borderRadius:14, border:`1px solid ${C.gold}12`, background:'rgba(15,29,50,0.5)', padding:20 }}>
        <div style={{ display:'inline-block', minWidth:'fit-content' }}>
          {/* Col headers */}
          <div style={{ display:'flex', marginLeft:hw }}>
            {members.map(m => <div key={m.code} style={{ width:cs, textAlign:'center', fontSize:10, fontWeight:600, color: hlCol === m.code ? C.gold : 'rgba(255,255,255,0.4)', paddingBottom:8, transition:'color 0.15s' }}>{m.code}</div>)}
          </div>
          {/* Rows */}
          {members.map(rm => (
            <div key={rm.code} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ width:hw, fontSize:10, fontWeight:600, color: hlRow === rm.code ? C.gold : 'rgba(255,255,255,0.4)', textAlign:'right', paddingRight:10, transition:'color 0.15s', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={isZh ? rm.nameZh : rm.name}>
                {isZh ? rm.nameZh : rm.name}
              </div>
              {members.map(cm => {
                const self = rm.code === cm.code;
                const cell = self ? null : getCell(rm.code, cm.code);
                const cfg = cell ? SC[cell.status] : null;
                const hl = hlRow === rm.code || hlCol === cm.code;
                return (
                  <div key={`${rm.code}-${cm.code}`} style={{ width:cs, height:cs, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:4, margin:1, cursor: self ? 'default' : 'pointer', background: self ? `${C.gold}06` : cfg ? `${cfg.bg}${hl ? '35' : '20'}` : 'transparent', transition:'background 0.15s', position:'relative' }}
                    onMouseEnter={e => { if (self || !cell) return; setHlRow(rm.code); setHlCol(cm.code);
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip({ x: r.right, y: r.top, cell, fn: getName(rm.code), tn: getName(cm.code) }); }}
                    onMouseLeave={() => { setHlRow(null); setHlCol(null); setTip(null); }}>
                    {self ? <span style={{ fontSize:9, color:`${C.gold}25` }}>{rm.code}</span>
                     : cfg ? <>
                        <span style={{ width:10, height:10, borderRadius:'50%', background:cfg.bg, opacity:0.85 }} />
                        {cell && cell.directCableCount > 0 && <span style={{ position:'absolute', bottom:3, right:5, fontSize:8, color:'rgba(255,255,255,0.35)', fontFeatureSettings:'"tnum"' }}>{cell.directCableCount}</span>}
                      </> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:16, marginTop:16 }}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s => (
          <div key={s} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:12, height:12, borderRadius:3, background:SC[s].bg, opacity:0.85 }} />
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{tb(SC[s].key)} — {summary[s] ?? 0} {tb('matrix.pairs')}</span>
          </div>
        ))}
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)', marginLeft:8 }}>{tb('matrix.total', { n: summary.totalPairs })}</span>
      </div>

      {/* Enhanced Tooltip */}
      {tip && <EnhancedTooltip tip={tip} tb={tb} />}
    </div>
  );
}

function EnhancedTooltip({ tip, tb }: { tip: { x: number; y: number; cell: Cell; fn: string; tn: string }; tb: (k: string, p?: Record<string, string | number>) => string }) {
  const { cell, fn, tn } = tip;
  const cfg = SC[cell.status];
  const riskMap: Record<CS, string> = { none: 'matrix.riskCritical', transit: 'matrix.riskHigh', indirect: 'matrix.riskMedium', direct: 'matrix.riskLow', landlocked: 'matrix.riskNa' };
  const recMap: Record<CS, string> = { none: 'matrix.recNone', transit: 'matrix.recTransit', indirect: 'matrix.recIndirect', direct: 'matrix.recDirect', landlocked: 'matrix.recLandlocked' };
  const riskColor: Record<CS, string> = { none: '#EF4444', transit: '#F59E0B', indirect: '#3B82F6', direct: '#22C55E', landlocked: '#6B7280' };

  // Position tooltip: prefer right side, fall back to left if near edge
  const left = tip.x + 16;
  const adjustedLeft = left + 300 > window.innerWidth ? tip.x - 316 : left;

  return (
    <div style={{ position:'fixed', left:adjustedLeft, top:Math.max(8, tip.y - 20), width:300, background:'rgba(10,18,36,0.97)', backdropFilter:'blur(16px)', border:`1px solid ${C.gold}30`, borderRadius:12, padding:0, zIndex:9999, pointerEvents:'none', boxShadow:`0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px ${C.gold}10`, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.gold}15`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'#F0E6C8' }}>{fn} → {tn}</span>
        <span style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:4, background:`${cfg.bg}20`, color:cfg.bg }}>{tb(cfg.key)}</span>
      </div>

      {/* Body */}
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {/* Status detail */}
        {cell.status === 'direct' && cell.directCableCount > 0 && (
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>{tb('matrix.cables', { n: cell.directCableCount })}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {cell.directCables.slice(0, 5).map(s => (
                <span key={s} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'rgba(34,197,94,0.1)', color:'#22C55E', border:'1px solid rgba(34,197,94,0.2)' }}>{s}</span>
              ))}
            </div>
          </div>
        )}
        {cell.status === 'transit' && (
          <div style={{ fontSize:11, color:'#F59E0B', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.15)', borderRadius:6, padding:'8px 10px', lineHeight:1.6 }}>
            ⚠ {tb('matrix.transitWarn')}
          </div>
        )}
        {cell.status === 'none' && (
          <div style={{ fontSize:11, color:'#EF4444', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:6, padding:'8px 10px', lineHeight:1.6 }}>
            🔴 {tb('matrix.noneWarn')}
          </div>
        )}

        {/* Risk */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{tb('matrix.risk')}</span>
          <span style={{ fontSize:11, fontWeight:600, color:riskColor[cell.status] }}>{tb(riskMap[cell.status])}</span>
        </div>

        {/* Recommendation */}
        <div style={{ borderTop:`1px solid ${C.gold}10`, paddingTop:10 }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{tb('matrix.rec')}</span>
          <div style={{ fontSize:12, color:'#D1D5DB', marginTop:4, lineHeight:1.5 }}>{tb(recMap[cell.status])}</div>
        </div>
      </div>
    </div>
  );
}
FILE07_EOF
echo "  ✅ 7/10 SovereigntyMatrix.tsx"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. 地图（修复海缆显示 + 2D/Globe 切换）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/components/brics/BRICSMap.tsx" << 'FILE08_EOF'
'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';

interface Props { height?: string; }

export default function BRICSMap({ height = '560px' }: Props) {
  const { tb, isZh } = useBRICS();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ internal: number; related: number; other: number } | null>(null);
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [60, 15], zoom: 2.2,
      attributionControl: false, fadeDuration: 0,
    });
    mapRef.current = map;

    map.on('load', async () => {
      try {
        // Fetch BRICS classification + all cables with geo
        const [ovRes, cablesRes] = await Promise.all([
          fetch('/api/brics/overview'),
          fetch('/api/cables?geo=true'),
        ]);
        const ovData = await ovRes.json();
        const cablesRaw = await cablesRes.json();
        const cables = Array.isArray(cablesRaw) ? cablesRaw : cablesRaw.cables || [];

        const internalSlugs = new Set<string>(ovData.internalCableSlugs || []);
        const relatedSlugs = new Set<string>(ovData.relatedCableSlugs || []);

        const internalF: GeoJSON.Feature[] = [];
        const relatedF: GeoJSON.Feature[] = [];
        const otherF: GeoJSON.Feature[] = [];

        for (const cable of cables) {
          const geom = cable.routeGeojson || cable.route_geojson;
          if (!geom?.coordinates || !geom.type) continue;

          const geometry: GeoJSON.Geometry = geom.type === 'MultiLineString'
            ? { type: 'MultiLineString', coordinates: geom.coordinates }
            : { type: 'LineString', coordinates: geom.coordinates };

          const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: { slug: cable.slug, name: cable.name, status: cable.status },
            geometry,
          };

          if (internalSlugs.has(cable.slug)) internalF.push(feature);
          else if (relatedSlugs.has(cable.slug)) relatedF.push(feature);
          else otherF.push(feature);
        }

        setStats({ internal: internalF.length, related: relatedF.length, other: otherF.length });

        // Non-BRICS cables — dark gray
        map.addSource('c-other', { type: 'geojson', data: { type: 'FeatureCollection', features: otherF } });
        map.addLayer({ id: 'l-other', type: 'line', source: 'c-other', paint: { 'line-color': '#2A2F3A', 'line-width': 0.7, 'line-opacity': 0.2 } });

        // BRICS ↔ External — silver
        map.addSource('c-related', { type: 'geojson', data: { type: 'FeatureCollection', features: relatedF } });
        map.addLayer({ id: 'l-related', type: 'line', source: 'c-related', paint: { 'line-color': C.silver, 'line-width': 1.1, 'line-opacity': 0.45 } });

        // BRICS Internal — gold glow
        map.addSource('c-internal', { type: 'geojson', data: { type: 'FeatureCollection', features: internalF } });
        map.addLayer({ id: 'l-internal-glow', type: 'line', source: 'c-internal', paint: { 'line-color': C.gold, 'line-width': 7, 'line-opacity': 0.12, 'line-blur': 4 } });
        map.addLayer({ id: 'l-internal', type: 'line', source: 'c-internal', paint: { 'line-color': C.gold, 'line-width': 2, 'line-opacity': 0.9 } });

        // BRICS country labels
        const labelFeatures: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return { type: 'Feature', properties: { code, name: isZh ? m?.nameZh : m?.name }, geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] } };
        });
        map.addSource('brics-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: labelFeatures } });
        map.addLayer({ id: 'brics-dots', type: 'circle', source: 'brics-labels', paint: { 'circle-radius': 4, 'circle-color': C.gold, 'circle-opacity': 0.7, 'circle-stroke-color': C.goldDark, 'circle-stroke-width': 1 } });
        map.addLayer({ id: 'brics-text', type: 'symbol', source: 'brics-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': C.goldLight, 'text-halo-color': C.navy, 'text-halo-width': 1.5 } });

        // Hover popup
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'brics-popup' });
        for (const lid of ['l-internal', 'l-related']) {
          map.on('mouseenter', lid, e => { map.getCanvas().style.cursor = 'pointer'; const p = e.features?.[0]?.properties; if (p?.name) popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;font-weight:600;color:#F0E6C8">${p.name}</div>`).addTo(map); });
          map.on('mouseleave', lid, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
        }
      } catch (err) { console.error('[BRICSMap]', err); } finally { setLoading(false); }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [isZh]);

  // 2D/Globe toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    try {
      if (mapMode === '3d') (map as any).setProjection?.('globe');
      else (map as any).setProjection?.('mercator');
    } catch {}
  }, [mapMode]);

  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden' }}>
      <div ref={containerRef} style={{ width:'100%', height, borderRadius:14, border:`1px solid ${C.gold}12` }} />

      {loading && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,22,40,0.8)', borderRadius:14, zIndex:10 }}>
          <span style={{ color:C.goldLight, fontSize:14 }}>{tb('map.loading')}</span>
        </div>
      )}

      {/* 2D/3D Toggle */}
      <div style={{ position:'absolute', top:12, left:12, display:'flex', gap:2, background:'rgba(10,22,40,0.85)', backdropFilter:'blur(8px)', borderRadius:8, padding:3, border:`1px solid ${C.gold}15`, zIndex:5 }}>
        {(['2d', '3d'] as const).map(mode => (
          <button key={mode} onClick={() => setMapMode(mode)} style={{ padding:'5px 14px', fontSize:11, fontWeight:600, borderRadius:6, border:'none', cursor:'pointer', transition:'all 0.2s', background: mapMode === mode ? `${C.gold}25` : 'transparent', color: mapMode === mode ? C.gold : '#6B7280' }}>
            {mode === '3d' ? tb('map.3d') : tb('map.2d')}
          </button>
        ))}
      </div>

      {/* Legend */}
      {stats && (
        <div style={{ position:'absolute', bottom:12, right:12, background:'rgba(10,22,40,0.85)', backdropFilter:'blur(8px)', borderRadius:8, padding:'10px 14px', fontSize:11, color:'rgba(255,255,255,0.5)', display:'flex', flexDirection:'column', gap:4, border:`1px solid ${C.gold}12`, zIndex:5 }}>
          {[
            { color: C.gold, label: tb('map.internal'), n: stats.internal, glow: true },
            { color: C.silver, label: tb('map.related'), n: stats.related },
            { color: '#2A2F3A', label: tb('map.other'), n: stats.other },
          ].map(({ color, label, n, glow }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:18, height:3, background:color, borderRadius:1, boxShadow: glow ? `0 0 6px ${color}44` : 'none' }} />
              {label} ({n})
            </div>
          ))}
        </div>
      )}

      <style>{`
        .brics-popup .maplibregl-popup-content { background:rgba(15,29,50,0.95); border:1px solid ${C.gold}25; border-radius:6px; padding:6px 10px; box-shadow:0 4px 16px rgba(0,0,0,0.4); }
        .brics-popup .maplibregl-popup-tip { border-top-color:rgba(15,29,50,0.95); }
      `}</style>
    </div>
  );
}
FILE08_EOF
echo "  ✅ 8/10 BRICSMap.tsx"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. 导航按钮（去掉 +）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cat > "$P/src/components/layout/BRICSNavButton.tsx" << 'FILE09_EOF'
'use client';
import { useTranslation } from '@/lib/i18n';
import { usePathname } from 'next/navigation';

export default function BRICSNavButton() {
  const { locale } = useTranslation();
  const pathname = usePathname();
  const isActive = pathname?.startsWith('/brics');
  const zh = locale === 'zh';
  return (
    <a href="/brics" style={{
      display:'flex', alignItems:'center', gap:6, padding:'5px 10px', borderRadius:6,
      border:`1px solid ${isActive ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'}`,
      backgroundColor: isActive ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.04)',
      color: isActive ? '#D4AF37' : '#9CA3AF',
      cursor:'pointer', transition:'all 0.2s', fontSize:11, fontWeight:500,
      textDecoration:'none', flexShrink:0, whiteSpace:'nowrap',
    }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor='rgba(212,175,55,0.3)'; e.currentTarget.style.backgroundColor='rgba(212,175,55,0.08)'; e.currentTarget.style.color='#D4AF37'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; e.currentTarget.style.backgroundColor='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#9CA3AF'; } }}>
      <span style={{ display:'flex', gap:1, borderRadius:2, overflow:'hidden', flexShrink:0 }}>
        {['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'].map(c => <span key={c} style={{ width:2.5, height:9, backgroundColor:c, opacity: isActive ? 0.9 : 0.55, transition:'opacity 0.2s' }} />)}
      </span>
      {zh ? '金砖战略' : 'BRICS'}
    </a>
  );
}
FILE09_EOF
echo "  ✅ 9/10 BRICSNavButton.tsx"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 10. 清理旧文件
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
rm -f "$P/src/components/brics/BRICSStatsCards.tsx" 2>/dev/null
rm -f "$P/src/components/brics/BRICSNavButton.tsx" 2>/dev/null
echo "  ✅ 10/10 cleaned up old files"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ BRICS V2 升级完成！"
echo ""
echo "下一步："
echo "  1. npm run build"
echo "  2. pm2 restart deep-blue"
echo "  3. git add -A && git commit -m 'feat: BRICS V2 upgrade'"
echo "  4. git push"
echo "═══════════════════════════════════════════════════════"

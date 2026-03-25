#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
[ ! -d "$P/src" ] && echo "❌ 找不到 $P/src" && exit 1
echo "🚀 BRICS V3 升级..."

# ━━━ 1. 常量：加入大中华区归并 + 国内海缆判定 ━━━
cat > "$P/src/lib/brics-constants.ts" << 'EOF1'
export const BRICS_MEMBERS = ['BR','RU','IN','CN','ZA','SA','IR','EG','AE','ET','ID'] as const;
export const BRICS_PARTNERS = ['BY','BO','KZ','TH','CU','UG','MY','UZ','NG','VN'] as const;
export const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;

// 大中华区：TW/HK/MO 在金砖分析中归为 CN
export const CHINA_GROUP: Record<string, string> = { TW: 'CN', HK: 'CN', MO: 'CN' };
export function normalizeBRICS(code: string): string {
  const up = code.toUpperCase();
  return CHINA_GROUP[up] ?? up;
}

export interface BRICSCountryMeta {
  code: string; name: string; nameZh: string;
  tier: 'member' | 'partner'; joinYear: number;
  center: [number, number];
}

export const BRICS_COUNTRY_META: Record<string, BRICSCountryMeta> = {
  BR:{code:'BR',name:'Brazil',nameZh:'巴西',tier:'member',joinYear:2006,center:[-51.9,-14.2]},
  RU:{code:'RU',name:'Russia',nameZh:'俄罗斯',tier:'member',joinYear:2006,center:[105.3,61.5]},
  IN:{code:'IN',name:'India',nameZh:'印度',tier:'member',joinYear:2006,center:[78.9,20.6]},
  CN:{code:'CN',name:'China',nameZh:'中国',tier:'member',joinYear:2006,center:[104.2,35.9]},
  ZA:{code:'ZA',name:'South Africa',nameZh:'南非',tier:'member',joinYear:2011,center:[22.9,-30.6]},
  SA:{code:'SA',name:'Saudi Arabia',nameZh:'沙特阿拉伯',tier:'member',joinYear:2024,center:[45.1,23.9]},
  IR:{code:'IR',name:'Iran',nameZh:'伊朗',tier:'member',joinYear:2024,center:[53.7,32.4]},
  EG:{code:'EG',name:'Egypt',nameZh:'埃及',tier:'member',joinYear:2024,center:[30.8,26.8]},
  AE:{code:'AE',name:'UAE',nameZh:'阿联酋',tier:'member',joinYear:2024,center:[53.8,23.4]},
  ET:{code:'ET',name:'Ethiopia',nameZh:'埃塞俄比亚',tier:'member',joinYear:2024,center:[40.5,9.1]},
  ID:{code:'ID',name:'Indonesia',nameZh:'印度尼西亚',tier:'member',joinYear:2025,center:[113.9,-0.8]},
  BY:{code:'BY',name:'Belarus',nameZh:'白俄罗斯',tier:'partner',joinYear:2024,center:[27.9,53.7]},
  BO:{code:'BO',name:'Bolivia',nameZh:'玻利维亚',tier:'partner',joinYear:2024,center:[-63.6,-16.3]},
  KZ:{code:'KZ',name:'Kazakhstan',nameZh:'哈萨克斯坦',tier:'partner',joinYear:2024,center:[66.9,48.0]},
  TH:{code:'TH',name:'Thailand',nameZh:'泰国',tier:'partner',joinYear:2024,center:[100.5,15.9]},
  CU:{code:'CU',name:'Cuba',nameZh:'古巴',tier:'partner',joinYear:2024,center:[-77.8,21.5]},
  UG:{code:'UG',name:'Uganda',nameZh:'乌干达',tier:'partner',joinYear:2024,center:[32.3,1.4]},
  MY:{code:'MY',name:'Malaysia',nameZh:'马来西亚',tier:'partner',joinYear:2024,center:[101.9,4.2]},
  UZ:{code:'UZ',name:'Uzbekistan',nameZh:'乌兹别克斯坦',tier:'partner',joinYear:2024,center:[64.6,41.4]},
  NG:{code:'NG',name:'Nigeria',nameZh:'尼日利亚',tier:'partner',joinYear:2025,center:[8.7,9.1]},
  VN:{code:'VN',name:'Vietnam',nameZh:'越南',tier:'partner',joinYear:2025,center:[108.3,14.1]},
};

export const BRICS_COLORS = {
  gold:'#D4AF37',goldLight:'#E8D48B',goldDark:'#A68B2B',
  navy:'#0A1628',navyLight:'#132240',navySurface:'#1A2D4A',
  silver:'#8B95A5',
  directGreen:'#22C55E',indirectAmber:'#F59E0B',noneRed:'#EF4444',
  flagBlue:'#0066B3',flagRed:'#D32F2F',flagYellow:'#FFC107',flagGreen:'#388E3C',flagOrange:'#F57C00',
  domestic:'#06B6D4',
} as const;

const allSet = new Set<string>(BRICS_ALL);
export function isBRICSCountry(code: string): boolean { return allSet.has(normalizeBRICS(code)); }
export function isBRICSInternalCable(rawCodes: string[]): boolean {
  const codes = rawCodes.map(normalizeBRICS);
  return codes.length >= 2 && codes.every(c => allSet.has(c));
}
/** 国内海缆：归并后所有登陆站属于同一个国家 */
export function isDomesticCable(rawCodes: string[]): boolean {
  const codes = [...new Set(rawCodes.map(normalizeBRICS))];
  return codes.length === 1 && allSet.has(codes[0]);
}
EOF1
echo "  ✅ 1/7 brics-constants.ts"

# ━━━ 2. 翻译：新增键 ━━━
cat > "$P/src/lib/brics-i18n.ts" << 'EOF2'
import { useTranslation } from '@/lib/i18n';
const T: Record<string, Record<string, string>> = {
  zh: {
    'title':'金砖海缆战略仪表盘','badge':'战略分析',
    'subtitle':'覆盖金砖 11 个成员国和 10 个伙伴国的海缆基础设施、数字主权评估与战略缺口分析',
    'back':'返回首页',
    'stats.title':'核心指标',
    'stats.cables':'金砖相关海缆','stats.stations':'金砖登陆站',
    'stats.internal':'跨国互联海缆','stats.domestic':'国内海缆',
    'stats.sovereignty':'数字主权指数',
    'stats.active':'在役','stats.building':'建设中','stats.planned':'规划中',
    'stats.globalPct':'占全球 {pct}%（共 {n} 条）',
    'stats.stationPct':'占全球 {pct}%（共 {n} 个）',
    'stats.internalDesc':'两端以上均在金砖国家的跨国海缆（成员国间 {n} 条）',
    'stats.domesticDesc':'登陆站均在同一金砖国家境内',
    'stats.sovDesc':'金砖内部互联占比',
    'chart.title':'海缆状态分布','chart.statusActive':'在役','chart.statusBuilding':'建设中',
    'chart.statusPlanned':'规划中','chart.statusOther':'其他',
    'chart.catInternal':'跨国互联','chart.catDomestic':'国内','chart.catExternal':'涉外',
    'map.title':'金砖海缆网络',
    'map.internal':'金砖跨国互联','map.internalTip':'所有登陆站均在金砖国家（含港澳台归入中国），且涉及两个以上国家的海缆',
    'map.domestic':'金砖国内','map.domesticTip':'登陆站全部在同一个金砖国家境内的国内海缆',
    'map.related':'金砖涉外','map.relatedTip':'至少一个登陆站在金砖国家，但也有登陆站在非金砖国家的海缆',
    'map.other':'非金砖','map.otherTip':'所有登陆站均在非金砖国家的海缆',
    'map.loading':'正在加载海缆数据…',
    'matrix.title':'数字主权矩阵',
    'matrix.subtitle':'成员国间海缆连接分析 — 评估金砖数字自主可控程度',
    'matrix.direct':'直连','matrix.indirect':'金砖中转','matrix.transit':'非金砖中转',
    'matrix.none':'无连接','matrix.landlocked':'内陆国','matrix.pairs':'对',
    'matrix.total':'共 {n} 对','matrix.cables':'直连海缆 {n} 条',
    'matrix.status':'连接状态','matrix.risk':'战略风险',
    'matrix.riskCritical':'极高 — 关键战略缺口','matrix.riskHigh':'高 — 依赖非金砖基础设施',
    'matrix.riskMedium':'中 — 可通过金砖中转','matrix.riskLow':'低 — 已有直连海缆','matrix.riskNa':'不适用',
    'matrix.rec':'建议',
    'matrix.recNone':'纳入金砖海缆优先投资计划','matrix.recTransit':'规划直连海缆，降低对外部依赖',
    'matrix.recIndirect':'增加直连冗余路由提升韧性','matrix.recDirect':'维持并增强现有连接',
    'matrix.recLandlocked':'通过陆地光纤互联方案解决',
    'matrix.transitWarn':'通信必须经过非金砖国家基础设施','matrix.noneWarn':'无已知海缆路径可连通两国',
    'gap.title':'战略缺口分析','gap.subtitle':'需优先建设直连海缆的成员国对 — 按战略紧迫度排序',
    'gap.pair':'国家对','gap.status':'当前状态','gap.priority':'优先级','gap.action':'建议行动',
    'gap.high':'高','gap.medium':'中','gap.buildDirect':'建设直连海缆','gap.addRedundancy':'增加冗余路由',
    'footer.source':'数据来源：Deep Blue 海缆情报平台','footer.update':'数据每小时更新',
    'hover.status':'状态','hover.length':'长度','hover.rfs':'投入使用','hover.fiber':'光纤对数',
    'hover.capacity':'设计容量','hover.vendor':'建造商','hover.stations':'登陆站',
    'hover.IN_SERVICE':'在役','hover.UNDER_CONSTRUCTION':'建设中','hover.PLANNED':'规划中','hover.DECOMMISSIONED':'退役',
    'note.china':'注：台湾、香港、澳门的海缆在金砖分析中归入中国计算',
  },
  en: {
    'title':'BRICS Submarine Cable Strategic Dashboard','badge':'Strategic Analysis',
    'subtitle':'Digital infrastructure analysis across 11 BRICS member states and 10 partner nations — sovereignty assessment and strategic gap identification',
    'back':'Back to Home',
    'stats.title':'Key Metrics',
    'stats.cables':'BRICS-Related Cables','stats.stations':'BRICS Landing Stations',
    'stats.internal':'Cross-Border Cables','stats.domestic':'Domestic Cables',
    'stats.sovereignty':'Digital Sovereignty Index',
    'stats.active':'Active','stats.building':'Under Construction','stats.planned':'Planned',
    'stats.globalPct':'{pct}% of global total ({n})','stats.stationPct':'{pct}% of global ({n})',
    'stats.internalDesc':'Cables with all endpoints in BRICS nations ({n} between members)',
    'stats.domesticDesc':'All landing stations within a single BRICS nation',
    'stats.sovDesc':'Internal interconnection ratio',
    'chart.title':'Cable Status Breakdown','chart.statusActive':'Active','chart.statusBuilding':'Under Construction',
    'chart.statusPlanned':'Planned','chart.statusOther':'Other',
    'chart.catInternal':'Cross-Border','chart.catDomestic':'Domestic','chart.catExternal':'External',
    'map.title':'BRICS Cable Network',
    'map.internal':'BRICS Cross-Border','map.internalTip':'Cables where all landing stations are in BRICS nations (TW/HK/MO counted as China) and span 2+ countries',
    'map.domestic':'BRICS Domestic','map.domesticTip':'Cables with all landing stations within a single BRICS nation',
    'map.related':'BRICS-External','map.relatedTip':'Cables with at least one landing station in a BRICS nation but also in non-BRICS nations',
    'map.other':'Non-BRICS','map.otherTip':'Cables with no landing stations in any BRICS nation',
    'map.loading':'Loading cable data…',
    'matrix.title':'Digital Sovereignty Matrix',
    'matrix.subtitle':'Submarine cable connectivity between member states — assessing digital autonomy',
    'matrix.direct':'Direct','matrix.indirect':'Via BRICS','matrix.transit':'Via Non-BRICS',
    'matrix.none':'No Connection','matrix.landlocked':'Landlocked','matrix.pairs':'pairs',
    'matrix.total':'{n} pairs total','matrix.cables':'{n} direct cable(s)',
    'matrix.status':'Connection Status','matrix.risk':'Strategic Risk',
    'matrix.riskCritical':'Critical — Key strategic gap','matrix.riskHigh':'High — Dependent on non-BRICS infrastructure',
    'matrix.riskMedium':'Medium — Reachable via BRICS transit','matrix.riskLow':'Low — Direct cables exist','matrix.riskNa':'N/A',
    'matrix.rec':'Recommendation',
    'matrix.recNone':'Include in BRICS priority cable investment plan','matrix.recTransit':'Plan direct cable to reduce external dependency',
    'matrix.recIndirect':'Add direct redundancy routes for resilience','matrix.recDirect':'Maintain and strengthen existing connections',
    'matrix.recLandlocked':'Address via terrestrial fiber connectivity',
    'matrix.transitWarn':'Traffic must traverse non-BRICS infrastructure','matrix.noneWarn':'No known submarine cable path between these nations',
    'gap.title':'Strategic Gap Analysis','gap.subtitle':'Member state pairs requiring priority direct cable construction — ranked by strategic urgency',
    'gap.pair':'Country Pair','gap.status':'Current Status','gap.priority':'Priority','gap.action':'Recommended Action',
    'gap.high':'High','gap.medium':'Medium','gap.buildDirect':'Build direct cable','gap.addRedundancy':'Add redundancy route',
    'footer.source':'Source: Deep Blue Cable Intelligence Platform','footer.update':'Data refreshed hourly',
    'hover.status':'Status','hover.length':'Length','hover.rfs':'RFS Date','hover.fiber':'Fiber Pairs',
    'hover.capacity':'Design Capacity','hover.vendor':'Vendor','hover.stations':'Landing Stations',
    'hover.IN_SERVICE':'Active','hover.UNDER_CONSTRUCTION':'Under Construction','hover.PLANNED':'Planned','hover.DECOMMISSIONED':'Decommissioned',
    'note.china':'Note: Taiwan, Hong Kong, and Macao cables are counted under China for BRICS analysis',
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
EOF2
echo "  ✅ 2/7 brics-i18n.ts"

# ━━━ 3. Overview API：用 normalizeBRICS + 加入 domestic + 返回详细数据给地图 ━━━
cat > "$P/src/app/api/brics/overview/route.ts" << 'EOF3'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_ALL, normalizeBRICS, isBRICSCountry, isBRICSInternalCable, isDomesticCable } from '@/lib/brics-constants';

export const revalidate = 3600;
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count({ where: AF }), prisma.landingStation.count(),
    ]);

    const raw = await prisma.cable.findMany({
      where: AF,
      select: {
        id:true, slug:true, name:true, status:true, lengthKm:true,
        rfsDate:true, fiberPairs:true, designCapacityTbps:true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } }, sharePercent: true } },
        landingStations: { select: { landingStation: { select: { name:true, countryCode:true, city:true } } } },
      },
    });

    const cables = raw.map(c => {
      const rawCodes = c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[];
      const normalizedCodes = rawCodes.map(normalizeBRICS);
      const uniqueNorm = [...new Set(normalizedCodes)];
      const stations = c.landingStations.map(cls => ({ name: cls.landingStation.name, country: cls.landingStation.countryCode, city: cls.landingStation.city }));
      const owners = c.owners.map(o => o.company.name);
      return {
        id: c.id, slug: c.slug, name: c.name, status: c.status,
        lengthKm: c.lengthKm, rfsDate: c.rfsDate, fiberPairs: c.fiberPairs,
        capacityTbps: c.designCapacityTbps, vendor: c.vendor?.name ?? null,
        owners, stations, rawCodes, normalizedCodes: uniqueNorm,
      };
    });

    const isInternal = (c: typeof cables[0]) => c.normalizedCodes.length >= 2 && c.normalizedCodes.every(cc => isBRICSCountry(cc));
    const isDom = (c: typeof cables[0]) => c.normalizedCodes.length === 1 && isBRICSCountry(c.normalizedCodes[0]);
    const isRelated = (c: typeof cables[0]) => c.rawCodes.some(cc => isBRICSCountry(cc));

    const internal = cables.filter(isInternal);
    const domestic = cables.filter(c => isDom(c) && !isInternal(c));
    const related = cables.filter(c => isRelated(c) && !isInternal(c) && !isDom(c));
    const allBrics = [...internal, ...domestic, ...related];

    const memberSet = new Set<string>(BRICS_MEMBERS);
    const memberInternal = internal.filter(c => c.normalizedCodes.every(cc => memberSet.has(cc)));

    const bricsAllSet = new Set<string>(BRICS_ALL.map(c => c));
    const bricsStations = await prisma.landingStation.count({ where: { countryCode: { in: [...bricsAllSet, 'TW', 'HK', 'MO'] } } });

    const memberCableCounts: Record<string, number> = {};
    for (const code of BRICS_MEMBERS) memberCableCounts[code] = cables.filter(c => c.normalizedCodes.includes(code)).length;

    const sovereigntyIndex = allBrics.length > 0 ? Math.round(((internal.length + domestic.length) / allBrics.length) * 100) : 0;

    // 供地图使用：每条海缆的分类 + 基本信息
    const cableMap: Record<string, { cat: string; name: string; status: string; lengthKm: number | null; vendor: string | null; owners: string[]; stations: { name: string; country: string | null; city: string | null }[]; fiberPairs: number | null; capacityTbps: number | null; rfsDate: string | null }> = {};
    for (const c of internal) cableMap[c.slug] = { cat:'internal', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };
    for (const c of domestic) cableMap[c.slug] = { cat:'domestic', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };
    for (const c of related) cableMap[c.slug] = { cat:'related', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };

    return NextResponse.json({
      global: { totalCables, totalStations },
      brics: {
        relatedCables: allBrics.length, internalCables: internal.length,
        domesticCables: domestic.length, externalCables: related.length,
        memberInternalCables: memberInternal.length,
        stations: bricsStations, sovereigntyIndex,
        statusBreakdown: {
          active: allBrics.filter(c => c.status === 'IN_SERVICE').length,
          underConstruction: allBrics.filter(c => c.status === 'UNDER_CONSTRUCTION').length,
          planned: allBrics.filter(c => c.status === 'PLANNED').length,
          other: allBrics.filter(c => !['IN_SERVICE','UNDER_CONSTRUCTION','PLANNED'].includes(c.status)).length,
        },
        memberCableCounts,
      },
      cableMap,
    });
  } catch (error) {
    console.error('[BRICS Overview]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
EOF3
echo "  ✅ 3/7 overview/route.ts"

# ━━━ 4. Sovereignty API：用 normalizeBRICS ━━━
cat > "$P/src/app/api/brics/sovereignty/route.ts" << 'EOF4'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
const LL = new Set(['ET']);
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const raw = await prisma.cable.findMany({
      where: AF,
      select: { slug:true, name:true, landingStations: { select: { landingStation: { select: { countryCode:true } } } } },
    });
    const ccs = raw.map(c => ({
      slug: c.slug, name: c.name,
      countries: [...new Set(c.landingStations.map(cls => normalizeBRICS(cls.landingStation.countryCode ?? '')).filter(Boolean))],
    }));

    const adj: Record<string, Set<string>> = {};
    const dc: Record<string, Record<string, string[]>> = {};
    for (const cb of ccs) { const cc = cb.countries;
      for (let i=0;i<cc.length;i++) for (let j=i+1;j<cc.length;j++) {
        const [a,b] = [cc[i],cc[j]];
        (adj[a]??=new Set()).add(b); (adj[b]??=new Set()).add(a);
        ((dc[a]??={})[b]??=[]).push(cb.slug); ((dc[b]??={})[a]??=[]).push(cb.slug);
      }
    }
    function bfs(from:string,to:string,bo:boolean){
      if(!adj[from])return false;const v=new Set([from]),q=[from];
      while(q.length){const c=q.shift()!;for(const n of adj[c]??[]){if(n===to)return true;if(!v.has(n)&&(!bo||isBRICSCountry(n))){v.add(n);q.push(n);}}}return false;
    }
    const m=[...BRICS_MEMBERS];
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[]}[]=[];
    for(let i=0;i<m.length;i++)for(let j=0;j<m.length;j++){
      if(i===j)continue;const[f,t]=[m[i],m[j]];
      if(LL.has(f)||LL.has(t)){mx.push({from:f,to:t,status:'landlocked',directCableCount:0,directCables:[]});continue;}
      const cbl=dc[f]?.[t]??[];
      const s:CS=cbl.length>0?'direct':bfs(f,t,true)?'indirect':bfs(f,t,false)?'transit':'none';
      mx.push({from:f,to:t,status:s,directCableCount:cbl.length,directCables:cbl.slice(0,10)});
    }
    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){const c=mx.find(x=>x.from===m[i]&&x.to===m[j]);if(c)up[c.status]++;}
    return NextResponse.json({
      members:m.map(c=>({code:c,name:BRICS_COUNTRY_META[c]?.name??c,nameZh:BRICS_COUNTRY_META[c]?.nameZh??c})),
      matrix:mx, summary:{totalPairs:(m.length*(m.length-1))/2,...up},
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);return NextResponse.json({error:'Failed'},{status:500});}
}
EOF4
echo "  ✅ 4/7 sovereignty/route.ts"

# ━━━ 5. /brics 页面（不变）━━━
cat > "$P/src/app/brics/page.tsx" << 'EOF5'
import type { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n';
import BRICSDashboard from '@/components/brics/BRICSDashboard';
export const metadata: Metadata = {
  title: 'BRICS Strategic Dashboard — Deep Blue',
  description: 'Submarine cable infrastructure analysis across BRICS nations.',
};
export default function BRICSPage() {
  return <I18nProvider><BRICSDashboard /></I18nProvider>;
}
EOF5
echo "  ✅ 5/7 brics/page.tsx"

# ━━━ 6. 主仪表盘（加入状态分布图 + 国内海缆统计）━━━
cat > "$P/src/components/brics/BRICSDashboard.tsx" << 'EOF6'
'use client';
import { useEffect, useState } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSMap from './BRICSMap';

const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];
interface OV {
  global:{totalCables:number;totalStations:number};
  brics:{relatedCables:number;internalCables:number;domesticCables:number;externalCables:number;memberInternalCables:number;stations:number;sovereigntyIndex:number;
    statusBreakdown:{active:number;underConstruction:number;planned:number;other:number};memberCableCounts:Record<string,number>};
}
interface SovD { matrix:{from:string;to:string;status:string;directCableCount:number;directCables:string[]}[];summary:Record<string,number>; }

function AN({n}:{n:number}){const[v,setV]=useState(0);useEffect(()=>{let t0=Date.now();const tick=()=>{const p=Math.min((Date.now()-t0)/1200,1);setV(Math.round(n*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);},[n]);return<>{v.toLocaleString()}</>;}

export default function BRICSDashboard() {
  const{tb,isZh}=useBRICS();
  const[ov,setOv]=useState<OV|null>(null);
  const[sov,setSov]=useState<SovD|null>(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([fetch('/api/brics/overview').then(r=>r.json()),fetch('/api/brics/sovereignty').then(r=>r.json())])
    .then(([o,s])=>{setOv(o);setSov(s);}).catch(console.error).finally(()=>setLoading(false));
  },[]);

  const gapPairs = sov?.matrix.filter(m=>m.from<m.to&&(m.status==='none'||m.status==='transit')).sort((a,b)=>(a.status==='none'?0:1)-(b.status==='none'?0:1)).slice(0,12)??[];
  const cPct=ov?((ov.brics.relatedCables/ov.global.totalCables)*100).toFixed(1):'0';
  const sPct=ov?((ov.brics.stations/ov.global.totalStations)*100).toFixed(1):'0';

  return (
    <div style={{minHeight:'100vh',background:C.navy,color:'#E8E0D0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .bp{font-family:'DM Sans',system-ui,sans-serif} .bp h1,.bp h2{font-family:'Playfair Display',serif}
        .bp *::-webkit-scrollbar{width:6px;height:6px} .bp *::-webkit-scrollbar-track{background:${C.navy}} .bp *::-webkit-scrollbar-thumb{background:${C.gold}30;border-radius:3px} .bp *::-webkit-scrollbar-thumb:hover{background:${C.gold}60}
        @keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .bs{animation:fu .6s ease both} .bc{background:rgba(26,45,74,.5);border:1px solid ${C.gold}15;border-radius:14px;backdrop-filter:blur(12px);transition:all .25s} .bc:hover{border-color:${C.gold}35;box-shadow:0 0 24px ${C.gold}10}
      `}</style>
      <div className="bp">
        <div style={{display:'flex',height:4}}>{FLAGS.map(c=><div key={c} style={{flex:1,background:c}} />)}</div>

        {/* Hero */}
        <section className="bs" style={{padding:'48px 32px 28px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:20}}>
            <a href="/" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',background:`${C.gold}10`,border:`1px solid ${C.gold}25`,borderRadius:20,textDecoration:'none'}}>
              <span style={{fontSize:11,color:'#9CA3AF'}}>← {tb('back')}</span>
            </a>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',background:`${C.gold}08`,border:`1px solid ${C.gold}20`,borderRadius:20}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:C.gold}} />
              <span style={{fontSize:12,fontWeight:600,letterSpacing:'.06em',color:C.gold,textTransform:'uppercase'}}>{tb('badge')}</span>
            </div>
          </div>
          <h1 style={{fontSize:'clamp(28px,4.5vw,46px)',fontWeight:800,lineHeight:1.12,margin:'0 0 14px',color:'#F0E6C8',letterSpacing:'-.02em'}}>
            <span style={{background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{isZh?'金砖':'BRICS'} </span>
            {isZh?'海缆战略仪表盘':'Submarine Cable Strategic Dashboard'}
          </h1>
          <p style={{fontSize:15,color:'rgba(255,255,255,.4)',maxWidth:750,lineHeight:1.7,margin:0}}>{tb('subtitle')}</p>
          <p style={{fontSize:11,color:'rgba(255,255,255,.25)',marginTop:8,fontStyle:'italic'}}>{tb('note.china')}</p>
        </section>

        {/* Stats */}
        <section className="bs" style={{padding:'0 32px 24px',maxWidth:1400,margin:'0 auto',animationDelay:'.1s'}}>
          <SH t={tb('stats.title')} />
          {ov?(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
            <SC l={tb('stats.cables')} v={ov.brics.relatedCables} s={tb('stats.globalPct',{pct:cPct,n:ov.global.totalCables})} p={parseFloat(cPct)} c={C.gold} />
            <SC l={tb('stats.stations')} v={ov.brics.stations} s={tb('stats.stationPct',{pct:sPct,n:ov.global.totalStations})} p={parseFloat(sPct)} c={C.gold} />
            <SC l={tb('stats.internal')} v={ov.brics.internalCables} s={tb('stats.internalDesc',{n:ov.brics.memberInternalCables})} c={C.goldLight} />
            <SC l={tb('stats.domestic')} v={ov.brics.domesticCables} s={tb('stats.domesticDesc')} c={C.domestic} />
            <SC l={tb('stats.sovereignty')} v={ov.brics.sovereigntyIndex} s={tb('stats.sovDesc')} p={ov.brics.sovereigntyIndex} c={ov.brics.sovereigntyIndex>=50?'#22C55E':ov.brics.sovereigntyIndex>=25?'#F59E0B':'#EF4444'} />
          </div>):<LB h={150} />}
        </section>

        {/* Status chart */}
        {ov && (
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.15s'}}>
            <SH t={tb('chart.title')} />
            <div className="bc" style={{padding:20}}>
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                {/* By status */}
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按状态':'By Status'}</div>
                  {[
                    {l:tb('chart.statusActive'),v:ov.brics.statusBreakdown.active,c:'#22C55E'},
                    {l:tb('chart.statusBuilding'),v:ov.brics.statusBreakdown.underConstruction,c:'#3B82F6'},
                    {l:tb('chart.statusPlanned'),v:ov.brics.statusBreakdown.planned,c:'#F59E0B'},
                    {l:tb('chart.statusOther'),v:ov.brics.statusBreakdown.other,c:'#6B7280'},
                  ].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span>
                        <span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                        <div style={{width:`${ov.brics.relatedCables>0?(b.v/ov.brics.relatedCables)*100:0}%`,height:'100%',borderRadius:4,background:b.c,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* By category */}
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按类别':'By Category'}</div>
                  {[
                    {l:tb('chart.catInternal'),v:ov.brics.internalCables,c:C.gold},
                    {l:tb('chart.catDomestic'),v:ov.brics.domesticCables,c:C.domestic},
                    {l:tb('chart.catExternal'),v:ov.brics.externalCables,c:C.silver},
                  ].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span>
                        <span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                        <div style={{width:`${ov.brics.relatedCables>0?(b.v/ov.brics.relatedCables)*100:0}%`,height:'100%',borderRadius:4,background:b.c,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:8,fontSize:11,color:'rgba(255,255,255,.25)'}}>
                    {isZh?'合计':'Total'}: {ov.brics.relatedCables} = {ov.brics.internalCables} + {ov.brics.domesticCables} + {ov.brics.externalCables}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Map */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.2s'}}>
          <SH t={tb('map.title')} />
          <BRICSMap height="560px" />
        </section>

        {/* Sovereignty */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.3s'}}>
          <SH t={tb('matrix.title')} s={tb('matrix.subtitle')} />
          <SovereigntyMatrix />
        </section>

        {/* Gap */}
        <section className="bs" style={{padding:'0 32px 48px',maxWidth:1400,margin:'0 auto',animationDelay:'.4s'}}>
          <SH t={tb('gap.title')} s={tb('gap.subtitle')} />
          {gapPairs.length>0?(
            <div className="bc" style={{overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:`1px solid ${C.gold}15`}}>
                    {[tb('gap.priority'),tb('gap.pair'),tb('gap.status'),tb('gap.action')].map(h=><th key={h} style={{padding:'14px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{gapPairs.map((g,i)=>{const isN=g.status==='none';const fM=BRICS_COUNTRY_META[g.from];const tM=BRICS_COUNTRY_META[g.to];
                    return(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.03)',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}06`} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'12px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:isN?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)',color:isN?'#EF4444':'#F59E0B'}}>{isN?tb('gap.high'):tb('gap.medium')}</span></td>
                      <td style={{padding:'12px 16px',color:'#F0E6C8',fontWeight:500}}>{isZh?fM?.nameZh:fM?.name} → {isZh?tM?.nameZh:tM?.name}</td>
                      <td style={{padding:'12px 16px'}}><span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:isN?'#EF4444':'#F59E0B'}} /><span style={{color:'rgba(255,255,255,.6)',fontSize:12}}>{isN?tb('matrix.none'):tb('matrix.transit')}</span></span></td>
                      <td style={{padding:'12px 16px',color:'rgba(255,255,255,.5)',fontSize:12}}>{isN?tb('gap.buildDirect'):tb('gap.addRedundancy')}</td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            </div>
          ):loading?<LB h={200} />:null}
        </section>

        <footer style={{padding:'20px 32px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto',display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(255,255,255,.2)'}}>
          <span>{tb('footer.source')}</span><span>{tb('footer.update')}</span>
        </footer>
      </div>
    </div>
  );
}

function SH({t,s}:{t:string;s?:string}){return<div style={{marginBottom:20}}><h2 style={{fontSize:22,fontWeight:700,color:'#F0E6C8',margin:'0 0 4px'}}>{t}</h2>{s&&<p style={{fontSize:13,color:'rgba(255,255,255,.3)',margin:0,lineHeight:1.6}}>{s}</p>}</div>;}
function SC({l,v,s,p,c}:{l:string;v:number;s?:string;p?:number;c:string}){return<div className="bc" style={{padding:20,display:'flex',flexDirection:'column',gap:5}}>
  <span style={{fontSize:11,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',color:`${C.gold}80`}}>{l}</span>
  <span style={{fontSize:32,fontWeight:700,color:'#F0E6C8',lineHeight:1.1,fontFeatureSettings:'"tnum"'}}><AN n={v} /></span>
  {s&&<span style={{fontSize:12,color:'rgba(255,255,255,.35)'}}>{s}</span>}
  {p!==undefined&&<div style={{marginTop:4,height:4,borderRadius:2,background:'rgba(255,255,255,.06)',overflow:'hidden'}}><div style={{width:`${Math.min(100,p)}%`,height:'100%',borderRadius:2,background:`linear-gradient(90deg,${c},${c}88)`,transition:'width 1s cubic-bezier(.22,1,.36,1)'}} /></div>}
</div>;}
function LB({h}:{h:number}){return<div style={{height:h,borderRadius:14,background:'rgba(26,45,74,.4)',animation:'pulse 1.5s ease-in-out infinite'}} />;}
EOF6
echo "  ✅ 6/7 BRICSDashboard.tsx"

# ━━━ 7. 地图（用 cableMap 分类 + hover 详情面板 + 图例 tooltip + 国内海缆层 + 移除 3D）━━━
cat > "$P/src/components/brics/BRICSMap.tsx" << 'EOF7'
'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';

interface CableInfo { cat:string; name:string; status:string; lengthKm:number|null; vendor:string|null; owners:string[]; stations:{name:string;country:string|null;city:string|null}[]; fiberPairs:number|null; capacityTbps:number|null; rfsDate:string|null; }
interface Props { height?:string; }

export default function BRICSMap({ height='560px' }:Props) {
  const{tb,isZh}=useBRICS();
  const cRef=useRef<HTMLDivElement>(null);
  const mRef=useRef<maplibregl.Map|null>(null);
  const cmRef=useRef<Record<string,CableInfo>>({});
  const[loading,setLoading]=useState(true);
  const[stats,setStats]=useState<{internal:number;domestic:number;related:number;other:number}|null>(null);
  const[hover,setHover]=useState<{x:number;y:number;info:CableInfo}|null>(null);
  const[legendTip,setLegendTip]=useState<{x:number;y:number;text:string}|null>(null);

  useEffect(()=>{
    if(!cRef.current) return;
    const map = new maplibregl.Map({ container:cRef.current, style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', center:[60,15], zoom:2.2, attributionControl:false, fadeDuration:0 });
    mRef.current = map;

    map.on('load', async()=>{
      try{
        const[ovRes,cablesRes]=await Promise.all([fetch('/api/brics/overview'),fetch('/api/cables?geo=true')]);
        const ovData=await ovRes.json();
        const cablesRaw=await cablesRes.json();
        const cables=Array.isArray(cablesRaw)?cablesRaw:cablesRaw.cables||[];
        const cableMap:Record<string,CableInfo>=ovData.cableMap||{};
        cmRef.current=cableMap;

        const intF:GeoJSON.Feature[]=[];const domF:GeoJSON.Feature[]=[];const relF:GeoJSON.Feature[]=[];const othF:GeoJSON.Feature[]=[];

        for(const cable of cables){
          const geom=cable.routeGeojson||cable.route_geojson;
          if(!geom?.coordinates||!geom.type)continue;
          const geometry:GeoJSON.Geometry=geom.type==='MultiLineString'?{type:'MultiLineString',coordinates:geom.coordinates}:{type:'LineString',coordinates:geom.coordinates};
          const f:GeoJSON.Feature={type:'Feature',properties:{slug:cable.slug,name:cable.name},geometry};
          const cat=cableMap[cable.slug]?.cat;
          if(cat==='internal')intF.push(f);else if(cat==='domestic')domF.push(f);else if(cat==='related')relF.push(f);else othF.push(f);
        }
        setStats({internal:intF.length,domestic:domF.length,related:relF.length,other:othF.length});

        // Layers: other → related → domestic → internal (top)
        map.addSource('c-oth',{type:'geojson',data:{type:'FeatureCollection',features:othF}});
        map.addLayer({id:'l-oth',type:'line',source:'c-oth',paint:{'line-color':'#2A2F3A','line-width':0.6,'line-opacity':0.15}});

        map.addSource('c-rel',{type:'geojson',data:{type:'FeatureCollection',features:relF}});
        map.addLayer({id:'l-rel',type:'line',source:'c-rel',paint:{'line-color':C.silver,'line-width':1,'line-opacity':0.4}});

        map.addSource('c-dom',{type:'geojson',data:{type:'FeatureCollection',features:domF}});
        map.addLayer({id:'l-dom-glow',type:'line',source:'c-dom',paint:{'line-color':C.domestic,'line-width':5,'line-opacity':0.1,'line-blur':3}});
        map.addLayer({id:'l-dom',type:'line',source:'c-dom',paint:{'line-color':C.domestic,'line-width':1.6,'line-opacity':0.75}});

        map.addSource('c-int',{type:'geojson',data:{type:'FeatureCollection',features:intF}});
        map.addLayer({id:'l-int-glow',type:'line',source:'c-int',paint:{'line-color':C.gold,'line-width':8,'line-opacity':0.15,'line-blur':4}});
        map.addLayer({id:'l-int',type:'line',source:'c-int',paint:{'line-color':C.gold,'line-width':2.2,'line-opacity':0.95}});

        // Labels
        const lf:GeoJSON.Feature[]=BRICS_MEMBERS.map(code=>{const m=BRICS_COUNTRY_META[code];return{type:'Feature',properties:{code,name:isZh?m?.nameZh:m?.name},geometry:{type:'Point',coordinates:m?.center??[0,0]}};});
        map.addSource('brics-labels',{type:'geojson',data:{type:'FeatureCollection',features:lf}});
        map.addLayer({id:'brics-dots',type:'circle',source:'brics-labels',paint:{'circle-radius':4,'circle-color':C.gold,'circle-opacity':0.7,'circle-stroke-color':C.goldDark,'circle-stroke-width':1}});
        map.addLayer({id:'brics-text',type:'symbol',source:'brics-labels',layout:{'text-field':['get','name'],'text-size':11,'text-offset':[0,1.4],'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold']},paint:{'text-color':C.goldLight,'text-halo-color':C.navy,'text-halo-width':1.5}});

        // Hover: highlight + detail panel
        const hoverLayers=['l-int','l-dom','l-rel'];
        for(const lid of hoverLayers){
          map.on('mouseenter',lid,e=>{map.getCanvas().style.cursor='pointer';
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              // Highlight
              const srcId=lid.replace('l-','c-');
              map.setPaintProperty(lid,'line-width',lid.includes('int')?4:lid.includes('dom')?3:2.5);
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
          map.on('mouseleave',lid,()=>{map.getCanvas().style.cursor='';
            map.setPaintProperty(lid,'line-width',lid.includes('int')?2.2:lid.includes('dom')?1.6:1);
            setHover(null);
          });
          map.on('mousemove',lid,e=>{if(hover){setHover(prev=>prev?{...prev,x:e.point.x,y:e.point.y}:null);}
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]) setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
          });
        }
      }catch(err){console.error('[BRICSMap]',err);}finally{setLoading(false);}
    });
    return()=>{map.remove();mRef.current=null;};
  },[isZh]);

  const statusColors:Record<string,string>={IN_SERVICE:'#22C55E',UNDER_CONSTRUCTION:'#3B82F6',PLANNED:'#F59E0B',DECOMMISSIONED:'#6B7280'};

  return(
    <div style={{position:'relative',borderRadius:14,overflow:'hidden'}}>
      <div ref={cRef} style={{width:'100%',height,borderRadius:14,border:`1px solid ${C.gold}12`}} />

      {loading&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(10,22,40,.8)',borderRadius:14,zIndex:10}}><span style={{color:C.goldLight,fontSize:14}}>{tb('map.loading')}</span></div>}

      {/* Legend with tooltips */}
      {stats&&<div style={{position:'absolute',bottom:12,right:12,background:'rgba(10,22,40,.9)',backdropFilter:'blur(8px)',borderRadius:8,padding:'10px 14px',fontSize:11,color:'rgba(255,255,255,.5)',display:'flex',flexDirection:'column',gap:5,border:`1px solid ${C.gold}12`,zIndex:5}}>
        {[
          {color:C.gold,label:tb('map.internal'),n:stats.internal,glow:true,tip:tb('map.internalTip')},
          {color:C.domestic,label:tb('map.domestic'),n:stats.domestic,glow:true,tip:tb('map.domesticTip')},
          {color:C.silver,label:tb('map.related'),n:stats.related,glow:false,tip:tb('map.relatedTip')},
          {color:'#2A2F3A',label:tb('map.other'),n:stats.other,glow:false,tip:tb('map.otherTip')},
        ].map(({color,label,n,glow,tip})=>(
          <div key={label} style={{display:'flex',alignItems:'center',gap:6,cursor:'help',position:'relative'}}
            onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setLegendTip({x:r.left-8,y:r.top,text:tip});}}
            onMouseLeave={()=>setLegendTip(null)}>
            <span style={{width:18,height:3,background:color,borderRadius:1,boxShadow:glow?`0 0 6px ${color}44`:'none'}} />
            {label} ({n})
          </div>
        ))}
      </div>}

      {/* Legend tooltip */}
      {legendTip&&<div style={{position:'fixed',right:window.innerWidth-legendTip.x+8,top:legendTip.y-4,maxWidth:260,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)'}}>{legendTip.text}</div>}

      {/* Hover detail panel */}
      {hover&&<div style={{position:'absolute',left:Math.min(hover.x+16,(cRef.current?.clientWidth??800)-320),top:Math.max(hover.y-120,8),width:300,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}25`,borderRadius:10,padding:0,zIndex:20,pointerEvents:'none',boxShadow:`0 8px 32px rgba(0,0,0,.6)`,overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:`1px solid ${C.gold}12`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:'#F0E6C8',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{hover.info.name}</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:statusColors[hover.info.status]||'#6B7280'}} />
            <span style={{fontSize:10,color:statusColors[hover.info.status]||'#6B7280',fontWeight:600}}>{tb('hover.'+hover.info.status)}</span>
          </span>
        </div>
        <div style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,fontSize:11}}>
          {hover.info.lengthKm&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.length')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.lengthKm.toLocaleString()} km</div></div>}
          {hover.info.rfsDate&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.rfs')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.rfsDate}</div></div>}
          {hover.info.fiberPairs&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.fiber')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.fiberPairs}</div></div>}
          {hover.info.capacityTbps&&<div><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.capacity')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.capacityTbps} Tbps</div></div>}
          {hover.info.vendor&&<div style={{gridColumn:'1/3'}}><div style={{color:'rgba(255,255,255,.4)',fontSize:10}}>{tb('hover.vendor')}</div><div style={{color:'#E2E8F0',fontWeight:500}}>{hover.info.vendor}</div></div>}
          {hover.info.owners.length>0&&<div style={{gridColumn:'1/3'}}><div style={{color:'rgba(255,255,255,.4)',fontSize:10,marginBottom:2}}>Operators</div><div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hover.info.owners.slice(0,5).map(o=><span key={o} style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'rgba(42,157,143,.1)',color:'#2A9D8F',border:'1px solid rgba(42,157,143,.2)'}}>{o}</span>)}</div></div>}
        </div>
        {hover.info.stations.length>0&&<div style={{padding:'8px 14px',borderTop:`1px solid ${C.gold}10`,maxHeight:100,overflowY:'auto'}}>
          <div style={{color:'rgba(255,255,255,.4)',fontSize:10,marginBottom:4}}>{tb('hover.stations')} ({hover.info.stations.length})</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{hover.info.stations.slice(0,8).map((s,i)=><span key={i} style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'rgba(255,255,255,.04)',color:'rgba(255,255,255,.5)'}}>{s.name} <span style={{color:'rgba(255,255,255,.25)'}}>{s.country}</span></span>)}{hover.info.stations.length>8&&<span style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>+{hover.info.stations.length-8}</span>}</div>
        </div>}
      </div>}

      <style>{`.brics-popup .maplibregl-popup-content{background:rgba(15,29,50,.95);border:1px solid ${C.gold}25;border-radius:6px;padding:6px 10px;box-shadow:0 4px 16px rgba(0,0,0,.4)} .brics-popup .maplibregl-popup-tip{border-top-color:rgba(15,29,50,.95)}`}</style>
    </div>
  );
}
EOF7
echo "  ✅ 7/7 BRICSMap.tsx"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ BRICS V3 完成！"
echo "  npm run build && pm2 restart deep-blue  (或你的重启命令)"
echo "  git add -A && git commit -m 'feat: BRICS V3' && git push"
echo "═══════════════════════════════════════════════════════"

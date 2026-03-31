// src/app/api/country/intel-export/route.ts
//
// 综合情报导出 API
//
// 用法：GET /api/country/intel-export?code=CN&locale=zh
//
// 返回两部分数据：
//   Part A：该国所有海缆（含全部登陆站明细）
//   Part B：以该国为端点的金砖国家对，两段中转以内所有路径
//           （如果该国是金砖成员国或伙伴国）
//
// 前端用这个 API 生成综合情报 CSV

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_ALL, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const dynamic = 'force-dynamic';

const CHINA_GROUP = new Set(['CN', 'TW', 'HK', 'MO']);

const ACTIVE_FILTER = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] as string[] },
};

// ── 主权分级（与其他模块保持一致）─────────────────────────────────
const BRICS_COMPANIES = new Set([
  'HMN Technologies', 'Huawei Marine Networks', 'Huawei Marine',
  'China Telecom', 'China Unicom', 'China Mobile', 'China Mobile International',
  'CITIC Telecom', 'ChinaNet', 'PCCW Global',
  'Rostelecom', 'MegaFon', 'VimpelCom', 'MTS',
  'Tata Communications', 'Reliance Jio', 'BSNL', 'Bharti Airtel',
  'VSNL', 'Tata TCS', 'Reliance Communications',
  'Embratel', 'Oi', 'Telemar', 'Claro', 'TIM Brasil', 'GlobeNet',
  'MTN', 'Vodacom', 'Telkom South Africa',
  'Saudi Telecom Company', 'STC', 'Mobily', 'etisalat', 'du',
  'Etisalat', 'Emirates Integrated Telecommunications',
  'Telkom Indonesia', 'Indosat', 'XL Axiata',
  'Telecommunication Infrastructure Company', 'TIC',
  'Telecom Egypt', 'TE',
]);
const WESTERN_COMPANIES = new Set([
  'SubCom', 'TE SubCom', 'Tyco Telecommunications',
  'AT&T', 'Verizon', 'CenturyLink', 'Lumen', 'Google', 'Meta', 'Amazon',
  'Microsoft', 'Facebook', 'Apple',
  'Alcatel Submarine Networks', 'ASN', 'Nokia', 'Orange Marine',
  'Prysmian', 'Nexans',
  'BT', 'Orange', 'Deutsche Telekom', 'Telecom Italia', 'Telefonica',
  'Vodafone', 'KPN', 'Telia',
  'NEC', 'SoftBank', 'KDDI', 'NTT',
]);

type SovLevel = 'sovereign' | 'partial' | 'dependent' | 'unknown';
const SOV_SCORE: Record<SovLevel, number> = { sovereign: 90, partial: 60, dependent: 15, unknown: 50 };

function classifySov(vendor: string | null, operators: string[]): {
  level: SovLevel; score: number; label_zh: string; label_en: string; reason_zh: string; reason_en: string;
} {
  const all = [vendor, ...operators].filter(Boolean) as string[];
  if (!all.length) return { level: 'unknown', score: 50, label_zh: '待分析', label_en: 'Unknown', reason_zh: '无数据', reason_en: 'No data' };
  const bc = all.filter(e => BRICS_COMPANIES.has(e)).length;
  const wc = all.filter(e => WESTERN_COMPANIES.has(e)).length;
  const vb = vendor ? BRICS_COMPANIES.has(vendor) : false;
  const vw = vendor ? WESTERN_COMPANIES.has(vendor) : false;
  if (vb && bc > wc) return { level: 'sovereign', score: 90, label_zh: '主权安全', label_en: 'Sovereign', reason_zh: `建造商${vendor}为金砖企业`, reason_en: `Built by BRICS ${vendor}` };
  if (vb || (bc > 0 && bc >= wc)) return { level: 'partial', score: 60, label_zh: '混合依赖', label_en: 'Partial', reason_zh: '金砖与非金砖共同参与', reason_en: 'Mixed BRICS & non-BRICS' };
  if (vw && wc > bc) return { level: 'dependent', score: 15, label_zh: '西方主导', label_en: 'Dependent', reason_zh: `建造商${vendor}为西方企业`, reason_en: `Built by Western ${vendor}` };
  return { level: 'unknown', score: 50, label_zh: '待分析', label_en: 'Unknown', reason_zh: '需人工核实', reason_en: 'Needs review' };
}

// ── 路径枚举（最多2段中转）────────────────────────────────────────
function enumeratePaths(
  from: string, to: string,
  adj: Map<string, Set<string>>,
  dc: Map<string, string[]>,
  maxTransits = 2, maxPaths = 20,
): { nodes: string[]; segments: { from: string; to: string; cableSlugs: string[] }[] }[] {
  const results: any[] = [];
  const stack: any[] = [{ nodes: [from], segments: [] }];
  while (stack.length > 0 && results.length < maxPaths) {
    const { nodes, segments } = stack.pop();
    const cur = nodes[nodes.length - 1];
    if (cur === to) { results.push({ nodes: [...nodes], segments: [...segments] }); continue; }
    if (nodes.length - 1 >= maxTransits + 1) continue;
    for (const nb of adj.get(cur) ?? []) {
      if (nodes.includes(nb)) continue;
      const key = [cur, nb].sort().join('|');
      stack.push({ nodes: [...nodes, nb], segments: [...segments, { from: cur, to: nb, cableSlugs: dc.get(key) ?? [] }] });
    }
  }
  return results;
}

// ════════════════════════════════════════════════════════════════
// 主处理函数
// ════════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawCode = (searchParams.get('code') || '').toUpperCase();
  const locale  = searchParams.get('locale') === 'zh' ? 'zh' : 'en';

  if (!rawCode) return NextResponse.json({ error: 'code required' }, { status: 400 });

  // CN_WITH_TW / CN_GROUP → CN
  const code = rawCode.replace(/_WITH_TW|_GROUP/, '');
  const matchCodes = code === 'CN' ? new Set(['CN', 'TW', 'HK', 'MO']) : new Set([code]);

  try {
    // ── Part A：该国海缆完整数据 ──────────────────────────────────
    const cables = await prisma.cable.findMany({
      where: {
        ...ACTIVE_FILTER,
        landingStations: {
          some: { landingStation: { countryCode: { in: [...matchCodes] } } },
        },
      },
      select: {
        slug: true, name: true, status: true,
        lengthKm: true, fiberPairs: true, rfsDate: true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: {
            landingStation: {
              select: { id: true, name: true, nameZh: true, countryCode: true, latitude: true, longitude: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // 判断是国际缆/国内缆/支线
    function getCableType(cable: typeof cables[0]): 'international' | 'domestic' | 'branch' {
      const allCodes = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode ?? ''))];
      const normalized = [...new Set(allCodes.map(c => CHINA_GROUP.has(c) ? 'CN' : c))];
      if (normalized.length <= 1) return 'domestic';
      // 支线：本国只有1个登陆站且总站 > 4
      const localCount = cable.landingStations.filter(ls => matchCodes.has(ls.landingStation.countryCode ?? '')).length;
      if (localCount === 1 && cable.landingStations.length > 4) return 'branch';
      return 'international';
    }

    const cableData = cables.map(cable => {
      const vendor = cable.vendor?.name ?? null;
      const operators = cable.owners.map(o => o.company.name);
      const sovereignty = classifySov(vendor, operators);
      const localStations = cable.landingStations
        .filter(ls => matchCodes.has(ls.landingStation.countryCode ?? ''))
        .map(ls => ({ name: ls.landingStation.name, nameZh: ls.landingStation.nameZh ?? null, countryCode: ls.landingStation.countryCode ?? '' }));
      const allStations = cable.landingStations
        .map(ls => ({ name: ls.landingStation.name, nameZh: ls.landingStation.nameZh ?? null, countryCode: ls.landingStation.countryCode ?? '' }));

      return {
        slug: cable.slug,
        name: cable.name,
        status: cable.status,
        type: getCableType(cable),
        lengthKm: cable.lengthKm ?? null,
        fiberPairs: cable.fiberPairs ?? null,
        rfsYear: cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
        vendor,
        operators,
        sovereignty,
        localStations,
        allStations,
        totalStations: cable.landingStations.length,
      };
    });

    // ── Part B：金砖中转路径（仅当目标国家是金砖成员/伙伴国）────────
    const normalizedCode = normalizeBRICS(code);
    const isTargetBRICS = isBRICSCountry(normalizedCode);

    let transitPairs: any[] = [];

    if (isTargetBRICS) {
      // 构建全局连接图（与 transit-analysis 路由逻辑一致）
      const allCables = await prisma.cable.findMany({
        where: ACTIVE_FILTER,
        select: {
          slug: true, name: true, status: true, lengthKm: true, rfsDate: true,
          vendor: { select: { name: true } },
          owners: { select: { company: { select: { name: true } } } },
          landingStations: { select: { landingStation: { select: { countryCode: true, name: true, nameZh: true } } } },
        },
      });

      // 构建 cable info map
      const cableInfoMap = new Map<string, {
        name: string; status: string; lengthKm: number | null; rfsYear: number | null;
        vendor: string | null; operators: string[]; sovereignty: ReturnType<typeof classifySov>;
        stations: { name: string; nameZh: string | null; countryCode: string }[];
      }>();

      const dc = new Map<string, string[]>();
      const adj = new Map<string, Set<string>>();

      for (const cable of allCables) {
        const countries = [...new Set(
          cable.landingStations.map(ls => normalizeBRICS(ls.landingStation.countryCode ?? '')).filter(Boolean)
        )];
        const vendor = cable.vendor?.name ?? null;
        const operators = cable.owners.map(o => o.company.name);
        cableInfoMap.set(cable.slug, {
          name: cable.name, status: cable.status,
          lengthKm: cable.lengthKm ?? null,
          rfsYear: cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
          vendor, operators,
          sovereignty: classifySov(vendor, operators),
          stations: cable.landingStations.map(ls => ({
            name: ls.landingStation.name,
            nameZh: ls.landingStation.nameZh ?? null,
            countryCode: ls.landingStation.countryCode ?? '',
          })),
        });

        for (let i = 0; i < countries.length; i++) {
          for (let j = i + 1; j < countries.length; j++) {
            const [a, b] = [countries[i], countries[j]].sort();
            const key = `${a}|${b}`;
            if (!dc.has(key)) dc.set(key, []);
            dc.get(key)!.push(cable.slug);
            if (!adj.has(a)) adj.set(a, new Set());
            if (!adj.has(b)) adj.set(b, new Set());
            adj.get(a)!.add(b);
            adj.get(b)!.add(a);
          }
        }
      }

      // 获取国家名称
      const dbCountries = await prisma.country.findMany({ select: { code: true, nameEn: true, nameZh: true } });
      const nameMap = new Map<string, { name: string; nameZh: string }>();
      dbCountries.forEach(c => nameMap.set(c.code, { name: c.nameEn, nameZh: c.nameZh || c.nameEn }));
      Object.entries(BRICS_COUNTRY_META).forEach(([code, meta]) => {
        nameMap.set(code, { name: meta.name, nameZh: meta.nameZh });
      });

      // 枚举：以目标国为端点的所有金砖国家对
      const otherBRICS = (BRICS_ALL as string[]).filter(c => c !== normalizedCode);
      const LANDLOCKED = new Set(['ET', 'BY', 'BO', 'KZ', 'UZ', 'UG']);

      for (const other of otherBRICS) {
        if (LANDLOCKED.has(normalizedCode) || LANDLOCKED.has(other)) continue;

        const fromMeta = nameMap.get(normalizedCode);
        const toMeta   = nameMap.get(other);
        const paths    = enumeratePaths(normalizedCode, other, adj, dc, 2, 20);

        // 评估每条路径
        const evaluatedPaths = paths.map(fp => {
          const transitCodes = fp.nodes.slice(1, -1);
          const segments = fp.segments.map(seg => {
            const segCables = (seg.cableSlugs as string[])
              .map(slug => cableInfoMap.get(slug))
              .filter(Boolean) as NonNullable<ReturnType<typeof cableInfoMap.get>>[];
            segCables.sort((a, b) => b.sovereignty.score - a.sovereignty.score);
            return {
              from: seg.from, to: seg.to,
              fromName: nameMap.get(seg.from)?.name ?? seg.from,
              fromNameZh: nameMap.get(seg.from)?.nameZh ?? seg.from,
              toName: nameMap.get(seg.to)?.name ?? seg.to,
              toNameZh: nameMap.get(seg.to)?.nameZh ?? seg.to,
              cables: segCables.slice(0, 5).map(c => ({ ...c })),
              bestSov: segCables[0]?.sovereignty ?? { level: 'unknown' as SovLevel, score: 50, label_zh: '待分析', label_en: 'Unknown', reason_zh: '无数据', reason_en: 'No data' },
            };
          });

          const minScore = segments.reduce((m, s) => Math.min(m, s.bestSov.score), 100);
          const pathLevel: SovLevel = minScore >= 80 ? 'sovereign' : minScore >= 40 ? 'partial' : minScore >= 1 ? 'dependent' : 'unknown';

          return {
            hopCount: fp.nodes.length - 1,
            transitCodes,
            transitNames: transitCodes.map(c => ({ code: c, name: nameMap.get(c)?.name ?? c, nameZh: nameMap.get(c)?.nameZh ?? c, isBRICS: isBRICSCountry(c) })),
            allTransitBRICS: transitCodes.every(c => isBRICSCountry(c)),
            segments,
            pathSov: { level: pathLevel, score: minScore, label_zh: { sovereign:'主权安全',partial:'混合依赖',dependent:'西方主导',unknown:'待分析' }[pathLevel], label_en: { sovereign:'Sovereign',partial:'Partial',dependent:'Dependent',unknown:'Unknown' }[pathLevel] },
          };
        }).sort((a, b) => b.pathSov.score - a.pathSov.score || a.hopCount - b.hopCount);

        transitPairs.push({
          from: normalizedCode, to: other,
          fromName: fromMeta?.name ?? normalizedCode, fromNameZh: fromMeta?.nameZh ?? normalizedCode,
          toName: toMeta?.name ?? other, toNameZh: toMeta?.nameZh ?? other,
          paths: evaluatedPaths,
          directConnected: evaluatedPaths.some(p => p.hopCount === 1),
          hasSovereignPath: evaluatedPaths.some(p => p.pathSov.level === 'sovereign'),
        });
      }
    }

    return NextResponse.json({
      code,
      locale,
      isBRICS: isTargetBRICS,
      cables: cableData,
      transitPairs,
      generatedAt: new Date().toISOString(),
    });

  } catch (e) {
    console.error('[IntelExport]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

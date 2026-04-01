// src/app/api/brics/transit-analysis/route.ts
//
// BRICS 中转路径主权分析 API
//
// 核心逻辑：对每对金砖国家，枚举所有"两段中转以内"的通信路径，
// 评估每条路径的主权安全等级（最弱链条原则）。
//
// 路径结构（最多3跳）：
//   直连：  A ──── B
//   1中转：  A ── X ── B
//   2中转：  A ── X ── Y ── B
//
// 主权评级原则（最弱链条）：
//   - 每段（cable segment）有自己的主权评级（基于建造商和运营商）
//   - 整条路径的主权等级 = 所有段中最低的那个
//   - 中转国是否为 BRICS 国家也是重要指标

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  BRICS_MEMBERS, BRICS_PARTNERS, BRICS_ALL,
  BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry,
} from '@/lib/brics-constants';

export const dynamic = 'force-dynamic';

// ── 主权分级（与 cable-matrix 路由保持一致） ───────────────────────

type SovereigntyLevel = 'sovereign' | 'partial' | 'dependent' | 'unknown';

// 主权分数：数字越高越安全，用于"最弱链条"取最小值
const SOV_SCORE: Record<SovereigntyLevel, number> = {
  sovereign: 90, partial: 60, dependent: 15, unknown: 50,
};

/** 金砖国家企业（建造商/运营商） */
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

/** 西方/非BRICS主导企业 */
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

interface SovereigntyResult {
  level: SovereigntyLevel;
  score: number;
  label_zh: string;
  label_en: string;
  reason_zh: string;
  reason_en: string;
}

function classifySovereignty(vendor: string | null, operators: string[]): SovereigntyResult {
  const allEntities = [vendor, ...operators].filter(Boolean) as string[];

  if (allEntities.length === 0) {
    return { level: 'unknown', score: 50, label_zh: '待分析', label_en: 'Unknown',
      reason_zh: '缺少建造商/运营商数据', reason_en: 'Missing vendor/operator data' };
  }

  const bricsCount   = allEntities.filter(e => BRICS_COMPANIES.has(e)).length;
  const westernCount = allEntities.filter(e => WESTERN_COMPANIES.has(e)).length;
  const vendorBrics  = vendor ? BRICS_COMPANIES.has(vendor) : false;
  const vendorWest   = vendor ? WESTERN_COMPANIES.has(vendor) : false;

  if (vendorBrics && bricsCount > westernCount) {
    return { level: 'sovereign', score: 90, label_zh: '主权安全', label_en: 'Sovereign',
      reason_zh: `建造商 ${vendor} 为金砖国家企业`, reason_en: `Built by BRICS company ${vendor}` };
  }
  if (vendorBrics || (bricsCount > 0 && bricsCount >= westernCount)) {
    return { level: 'partial', score: 60, label_zh: '混合依赖', label_en: 'Partial',
      reason_zh: '金砖与非金砖企业共同参与', reason_en: 'Mixed BRICS & non-BRICS participation' };
  }
  if (vendorWest && westernCount > bricsCount) {
    return { level: 'dependent', score: 15, label_zh: '西方主导', label_en: 'Dependent',
      reason_zh: `建造商 ${vendor} 为西方企业`, reason_en: `Built by Western company ${vendor}` };
  }
  return { level: 'unknown', score: 50, label_zh: '待分析', label_en: 'Unknown',
    reason_zh: '企业背景需人工核实', reason_en: 'Needs manual review' };
}

// ── 路径枚举（DFS，最多 2 段中转 = 3 跳） ───────────────────────────

interface PathSegment {
  from: string;
  to: string;
  cableSlugs: string[]; // 这段可用的海缆 slug 列表
}

interface FoundPath {
  nodes: string[];       // 完整节点序列，如 ['CN','SG','BR']
  segments: PathSegment[];
}

/**
 * 枚举从 from 到 to 的所有路径，中转节点不超过 maxTransits 个。
 * 为避免组合爆炸，对单对国家最多返回 MAX_PATHS 条路径。
 *
 * 注意：中转节点不限于 BRICS 国家，因为现实中很多路由要经过
 * 新加坡、日本、英国等非 BRICS 国家——这正是主权分析要揭示的。
 */
function enumeratePaths(
  from: string,
  to: string,
  adj: Map<string, Set<string>>,
  dc: Map<string, string[]>, // key: 'A|B'（排序后），value: cable slugs
  maxTransits: number = 2,
  maxPaths: number = 20,
): FoundPath[] {
  const results: FoundPath[] = [];

  // 用迭代栈模拟 DFS，避免递归深度问题
  type StackItem = { nodes: string[]; segments: PathSegment[] };
  const stack: StackItem[] = [{ nodes: [from], segments: [] }];

  while (stack.length > 0 && results.length < maxPaths) {
    const { nodes, segments } = stack.shift()!;
    const current = nodes[nodes.length - 1];

    // 到达终点，记录路径
    if (current === to) {
      results.push({ nodes: [...nodes], segments: [...segments] });
      continue;
    }

    // 超过最大中转数，不再延伸（nodes 长度 = 1 + 中转数 + 是否到终点）
    // nodes.length - 1 = 已走的跳数，最多允许 maxTransits + 1 跳
    if (nodes.length - 1 >= maxTransits + 1) continue;

    // 遍历邻居
    const neighbors = adj.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      // 避免环路（已访问的节点不重复，但终点除外）
      if (nodes.includes(neighbor)) continue;

      const edgeKey = [current, neighbor].sort().join('|');
      const cables = dc.get(edgeKey) || [];

      stack.push({
        nodes: [...nodes, neighbor],
        segments: [...segments, { from: current, to: neighbor, cableSlugs: cables }],
      });
    }
  }

  return results;
}

// ── 主处理函数 ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const ACTIVE_FILTER = {
      mergedInto: null,
      status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] as string[] },
    };

    // 1. 查询所有海缆，带建造商、运营商、登陆国信息
    const cables = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: {
        slug: true, name: true, status: true, lengthKm: true, rfsDate: true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: { landingStation: { select: { countryCode: true } } },
        },
      },
    });

    // 2. 构建数据结构
    //    cableInfo: slug → 海缆详情（含主权评级）
    //    dc: 'A|B' → cable slugs（两国之间的直连海缆）
    //    adj: 国家 → 相邻国家集合（有海缆直连）

    const cableInfo = new Map<string, {
      slug: string; name: string; status: string;
      lengthKm: number | null; rfsYear: number | null;
      vendor: string | null; operators: string[];
      sovereignty: SovereigntyResult;
    }>();

    const dc = new Map<string, string[]>();   // 'A|B' sorted → slugs
    const adj = new Map<string, Set<string>>();

    for (const cable of cables) {
      const countries = [...new Set(
        cable.landingStations
          .map(cls => normalizeBRICS(cls.landingStation.countryCode ?? ''))
          .filter(Boolean)
      )];

      const vendor = cable.vendor?.name ?? null;
      const operators = cable.owners.map(o => o.company.name);
      const sovereignty = classifySovereignty(vendor, operators);

      cableInfo.set(cable.slug, {
        slug: cable.slug, name: cable.name, status: cable.status,
        lengthKm: cable.lengthKm ?? null,
        rfsYear: cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
        vendor, operators, sovereignty,
      });

      // 建立国家对之间的连接关系
      for (let i = 0; i < countries.length; i++) {
        for (let j = i + 1; j < countries.length; j++) {
          const [a, b] = [countries[i], countries[j]].sort();
          const key = `${a}|${b}`;

          // 更新 dc 映射
          if (!dc.has(key)) dc.set(key, []);
          dc.get(key)!.push(cable.slug);

          // 更新邻接表
          if (!adj.has(a)) adj.set(a, new Set());
          if (!adj.has(b)) adj.set(b, new Set());
          adj.get(a)!.add(b);
          adj.get(b)!.add(a);
        }
      }
    }

    // 3. 构建国家元数据映射（用于返回名称）
    const bricsAll = [...BRICS_ALL] as string[];
    const nameMap: Record<string, { name: string; nameZh: string; isBRICS: boolean; tier: string }> = {};
    for (const code of bricsAll) {
      const meta = BRICS_COUNTRY_META[code];
      nameMap[code] = {
        name: meta?.name ?? code,
        nameZh: meta?.nameZh ?? code,
        isBRICS: true,
        tier: (BRICS_MEMBERS as readonly string[]).includes(code) ? 'member' : 'partner',
      };
    }
    // 补充非 BRICS 国家的名称（可能作为中转节点出现）
    const dbCountries = await prisma.country.findMany({ select: { code: true, nameEn: true, nameZh: true } });
    for (const c of dbCountries) {
      if (!nameMap[c.code]) {
        nameMap[c.code] = { name: c.nameEn, nameZh: c.nameZh || c.nameEn, isBRICS: false, tier: 'non-brics' };
      }
    }

    // 4. 对每对 BRICS 国家枚举路径并评估主权
    //    只计算成员国之间（21×20/2 = 210 对）以控制计算量
    //    如果前端需要伙伴国，可通过 query param 扩展
    const memberCodes = [...BRICS_ALL] as string[];
    const LANDLOCKED = new Set(['ET', 'BY', 'BO', 'KZ', 'UZ', 'UG']);

    interface PairResult {
      from: string; to: string;
      fromName: string; fromNameZh: string;
      toName: string; toNameZh: string;
      fromTier: string; toTier: string;
      isLandlocked: boolean;
      // 所有路径（含直连 + 中转），每条路径已评估主权
      paths: Array<{
        hopCount: number;               // 跳数（1=直连，2=1中转，3=2中转）
        transitCountries: Array<{       // 中转国信息
          code: string; name: string; nameZh: string; isBRICS: boolean;
        }>;
        allTransitBRICS: boolean;       // 所有中转国均为 BRICS？
        segments: Array<{               // 每段详情
          from: string; to: string;
          fromName: string; fromNameZh: string;
          toName: string; toNameZh: string;
          cables: Array<{               // 这段可用的海缆（取前5条，按主权评分排序）
            slug: string; name: string; status: string;
            lengthKm: number | null; rfsYear: number | null;
            vendor: string | null; operators: string[];
            sovereignty: SovereigntyResult;
          }>;
          // 这段的"最优主权"（取该段最好的海缆）
          bestCableSovereignty: SovereigntyResult;
        }>;
        // 整条路径的主权评级（最弱链条：取各段最优海缆中最低的分）
        pathSovereignty: SovereigntyResult;
        pathSovereigntyScore: number;
      }>;
      // 快速索引：这对国家的最优路径
      bestPath: PairResult['paths'][0] | null;
      hasSovereignPath: boolean;     // 是否存在完全主权安全的路径
      directConnected: boolean;      // 是否有直连海缆
    }

    const pairResults: PairResult[] = [];

    for (let i = 0; i < memberCodes.length; i++) {
      for (let j = i + 1; j < memberCodes.length; j++) {
        const from = memberCodes[i];
        const to   = memberCodes[j];

        const fromMeta = nameMap[from];
        const toMeta   = nameMap[to];

        // 内陆国没有海缆，跳过
        const isLandlocked = LANDLOCKED.has(from) || LANDLOCKED.has(to);

        const baseResult: PairResult = {
          from, to,
          fromName: fromMeta?.name ?? from, fromNameZh: fromMeta?.nameZh ?? from,
          toName: toMeta?.name ?? to, toNameZh: toMeta?.nameZh ?? to,
          fromTier: fromMeta?.tier ?? 'member', toTier: toMeta?.tier ?? 'member',
          isLandlocked,
          paths: [], bestPath: null,
          hasSovereignPath: false, directConnected: false,
        };

        if (isLandlocked) { pairResults.push(baseResult); continue; }

        // 枚举所有路径（最多2段中转）
        const foundPaths = enumeratePaths(from, to, adj, dc, 2, 20);

        // 对每条路径计算详情和主权评级
        const evaluatedPaths: PairResult['paths'] = [];

        for (const fp of foundPaths) {
          const hopCount = fp.nodes.length - 1;
          const transitCodes = fp.nodes.slice(1, -1); // 去掉起点和终点

          const transitCountries = transitCodes.map(code => ({
            code,
            name: nameMap[code]?.name ?? code,
            nameZh: nameMap[code]?.nameZh ?? code,
            isBRICS: isBRICSCountry(code),
          }));

          const allTransitBRICS = transitCountries.every(t => t.isBRICS);

          // 构建每段详情
          const segments: PairResult['paths'][0]['segments'] = [];
          let pathMinScore = 100; // 用于最弱链条计算

          for (const seg of fp.segments) {
            const segCableInfos = seg.cableSlugs
              .map(slug => cableInfo.get(slug))
              .filter(Boolean) as NonNullable<ReturnType<typeof cableInfo.get>>[];

            // 按主权评分降序排列（最安全的排最前）
            segCableInfos.sort((a, b) => b.sovereignty.score - a.sovereignty.score);

            // 这段的最优主权 = 该段最安全的海缆
            const bestCable = segCableInfos[0];
            const bestSov = bestCable?.sovereignty ?? {
              level: 'unknown' as SovereigntyLevel, score: 50,
              label_zh: '待分析', label_en: 'Unknown',
              reason_zh: '无海缆数据', reason_en: 'No cable data',
            };

            // 更新整条路径的最弱链条分数
            pathMinScore = Math.min(pathMinScore, bestSov.score);

            segments.push({
              from: seg.from, to: seg.to,
              fromName: nameMap[seg.from]?.name ?? seg.from,
              fromNameZh: nameMap[seg.from]?.nameZh ?? seg.from,
              toName: nameMap[seg.to]?.name ?? seg.to,
              toNameZh: nameMap[seg.to]?.nameZh ?? seg.to,
              cables: segCableInfos.slice(0, 5), // 最多返回5条候选海缆
              bestCableSovereignty: bestSov,
            });
          }

          // 整条路径的主权评级（基于最弱链条分数）
          const pathSovLevel: SovereigntyLevel =
            pathMinScore >= 80 ? 'sovereign' :
            pathMinScore >= 40 ? 'partial'   :
            pathMinScore >= 1  ? 'dependent' : 'unknown';

          const pathSovereignty: SovereigntyResult = {
            level: pathSovLevel,
            score: pathMinScore,
            label_zh: { sovereign:'主权安全', partial:'混合依赖', dependent:'西方主导', unknown:'待分析' }[pathSovLevel],
            label_en: { sovereign:'Sovereign', partial:'Partial', dependent:'Dependent', unknown:'Unknown' }[pathSovLevel],
            reason_zh: `最弱段评分 ${pathMinScore}，含 ${transitCodes.length} 个中转节点`,
            reason_en: `Weakest segment score ${pathMinScore}, ${transitCodes.length} transit node(s)`,
          };

          evaluatedPaths.push({
            hopCount, transitCountries, allTransitBRICS,
            segments, pathSovereignty, pathSovereigntyScore: pathMinScore,
          });
        }

        // 按主权评分降序排列（最安全的路径排最前），相同分数直连优先
        evaluatedPaths.sort((a, b) => {
          if (b.pathSovereigntyScore !== a.pathSovereigntyScore)
            return b.pathSovereigntyScore - a.pathSovereigntyScore;
          return a.hopCount - b.hopCount; // 同等主权下跳数少的优先
        });

        const directConnected = evaluatedPaths.some(p => p.hopCount === 1);
        const hasSovereignPath = evaluatedPaths.some(p => p.pathSovereignty.level === 'sovereign');
        const bestPath = evaluatedPaths[0] ?? null;

        pairResults.push({
          ...baseResult,
          paths: evaluatedPaths,
          bestPath,
          hasSovereignPath,
          directConnected,
        });
      }
    }

    // 5. 汇总统计（供前端展示热力矩阵使用）
    const summary = {
      totalPairs: pairResults.filter(p => !p.isLandlocked).length,
      directConnected: pairResults.filter(p => p.directConnected).length,
      hasSovereignPath: pairResults.filter(p => p.hasSovereignPath).length,
      noSovereignPath: pairResults.filter(p => !p.isLandlocked && !p.hasSovereignPath).length,
      landlocked: pairResults.filter(p => p.isLandlocked).length,
    };

    return NextResponse.json({
      pairs: pairResults,
      members: memberCodes.map(code => ({
        code,
        name: nameMap[code]?.name ?? code,
        nameZh: nameMap[code]?.nameZh ?? code,
      })),
      summary,
      generatedAt: new Date().toISOString(),
    });

  } catch (e) {
    console.error('[TransitAnalysis]', e);
    return NextResponse.json({ error: 'Failed to build transit analysis' }, { status: 500 });
  }
}

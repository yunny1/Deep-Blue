// src/app/api/brics/cable-matrix/route.ts
// BRICS 海缆主权分析 API
// 返回每对金砖国家之间直连海缆的详情，包含建造商、运营商、主权评级
// 前端用于渲染 BRICSCableMatrix 分析表格

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_ALL, BRICS_COUNTRY_META, normalizeBRICS } from '@/lib/brics-constants';

export const dynamic = 'force-dynamic';

// ── 主权分级逻辑 ────────────────────────────────────────────────────
// 根据建造商（vendor）和运营商（operators）判断主权等级
// 这是产品的核心分析价值，越主权安全越绿色

/** 已知的 BRICS 国家企业（建造商/运营商） */
const BRICS_COMPANIES = new Set([
  // 中国
  'HMN Technologies', 'Huawei Marine Networks', 'Huawei Marine',
  'China Telecom', 'China Unicom', 'China Mobile', 'China Mobile International',
  'CITIC Telecom', 'ChinaNet', 'PCCW Global',
  // 俄罗斯
  'Rostelecom', 'MegaFon', 'VimpelCom', 'MTS',
  // 印度
  'Tata Communications', 'Reliance Jio', 'BSNL', 'Bharti Airtel',
  'VSNL', 'Tata TCS', 'Reliance Communications',
  // 巴西
  'Embratel', 'Oi', 'Telemar', 'Claro', 'TIM Brasil', 'GlobeNet',
  // 南非
  'MTN', 'Vodacom', 'Telkom South Africa',
  // 沙特 / 海湾国家
  'Saudi Telecom Company', 'STC', 'Mobily', 'etisalat', 'du',
  'Etisalat', 'Emirates Integrated Telecommunications',
  // 印尼
  'Telkom Indonesia', 'Indosat', 'XL Axiata',
  // 伊朗
  'Telecommunication Infrastructure Company', 'TIC',
  // 埃及
  'Telecom Egypt', 'TE',
]);

/** 已知的西方/非BRICS主导企业 */
const WESTERN_COMPANIES = new Set([
  // 美国建造商
  'SubCom', 'TE SubCom', 'Tyco Telecommunications',
  // 美国运营商
  'AT&T', 'Verizon', 'CenturyLink', 'Lumen', 'Google', 'Meta', 'Amazon',
  'Microsoft', 'Facebook', 'Apple',
  // 欧洲建造商
  'Alcatel Submarine Networks', 'ASN', 'Nokia', 'Orange Marine',
  'Prysmian', 'Nexans',
  // 欧洲运营商
  'BT', 'Orange', 'Deutsche Telekom', 'Telecom Italia', 'Telefonica',
  'Vodafone', 'KPN', 'Telia',
  // 日本（非BRICS）
  'NEC', 'SoftBank', 'KDDI', 'NTT',
]);

type SovereigntyLevel = 'sovereign' | 'partial' | 'dependent' | 'unknown';

interface SovereigntyResult {
  level: SovereigntyLevel;
  label_zh: string;
  label_en: string;
  score: number; // 0-100，越高越主权安全
  reason_zh: string;
  reason_en: string;
}

function classifySovereignty(vendor: string | null, operators: string[]): SovereigntyResult {
  const allEntities = [vendor, ...operators].filter(Boolean) as string[];

  if (allEntities.length === 0) {
    return { level: 'unknown', label_zh: '待分析', label_en: 'Unknown', score: 50,
      reason_zh: '缺少建造商/运营商数据', reason_en: 'Missing vendor/operator data' };
  }

  const bricsCount  = allEntities.filter(e => BRICS_COMPANIES.has(e)).length;
  const westernCount = allEntities.filter(e => WESTERN_COMPANIES.has(e)).length;
  const vendorBrics  = vendor ? BRICS_COMPANIES.has(vendor) : false;
  const vendorWest   = vendor ? WESTERN_COMPANIES.has(vendor) : false;

  // 主权安全：建造商是BRICS企业，且运营商中BRICS占多数
  if (vendorBrics && bricsCount > westernCount) {
    return { level: 'sovereign', label_zh: '主权安全', label_en: 'Sovereign', score: 90,
      reason_zh: `建造商 ${vendor} 为金砖国家企业`, reason_en: `Built by BRICS company ${vendor}` };
  }

  // 混合依赖：建造商是BRICS但运营商含西方企业，或反之
  if (vendorBrics || (bricsCount > 0 && bricsCount >= westernCount)) {
    return { level: 'partial', label_zh: '混合依赖', label_en: 'Partial', score: 60,
      reason_zh: '金砖与非金砖企业共同参与', reason_en: 'Mixed BRICS and non-BRICS participation' };
  }

  // 西方主导：建造商是西方企业
  if (vendorWest && westernCount > bricsCount) {
    return { level: 'dependent', label_zh: '西方主导', label_en: 'Dependent', score: 15,
      reason_zh: `建造商 ${vendor} 为西方企业，存在战略依赖`, reason_en: `Built by Western company ${vendor}` };
  }

  // 其他未分类
  return { level: 'unknown', label_zh: '待分析', label_en: 'Unknown', score: 50,
    reason_zh: '企业背景需人工核实', reason_en: 'Company background needs manual review' };
}

// ── 主处理函数 ─────────────────────────────────────────────────────
export async function GET() {
  try {
    const ACTIVE_FILTER = {
      mergedInto: null,
      status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] as string[] },
    };

    // 查询所有有金砖国家登陆站的海缆，带完整建造商和运营商信息
    const cables = await prisma.cable.findMany({
      where: {
        ...ACTIVE_FILTER,
        landingStations: {
          some: { landingStation: { countryCode: { in: [...BRICS_ALL] } } },
        },
      },
      select: {
        slug: true,
        name: true,
        status: true,
        lengthKm: true,
        fiberPairs: true,
        rfsDate: true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: { landingStation: { select: { countryCode: true } } },
        },
      },
    });

    // 为每条海缆整理数据
    const cableDetails: Record<string, {
      slug: string; name: string; status: string;
      lengthKm: number | null; rfsYear: number | null;
      vendor: string | null; operators: string[];
      bricsCountries: string[]; // 这条缆连接的BRICS国家列表
      sovereignty: SovereigntyResult;
    }> = {};

    for (const cable of cables) {
      const allCountries = [...new Set(
        cable.landingStations.map(cls => normalizeBRICS(cls.landingStation.countryCode ?? ''))
      )].filter(Boolean);

      const bricsCountries = allCountries.filter(c => BRICS_ALL.includes(c as any));
      if (bricsCountries.length === 0) continue;

      const vendor = cable.vendor?.name ?? null;
      const operators = cable.owners.map(o => o.company.name);

      cableDetails[cable.slug] = {
        slug: cable.slug,
        name: cable.name,
        status: cable.status,
        lengthKm: cable.lengthKm ?? null,
        rfsYear: cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
        vendor,
        operators,
        bricsCountries,
        sovereignty: classifySovereignty(vendor, operators),
      };
    }

    // 构建国家对矩阵：找到每对BRICS国家之间的直连海缆
    const pairMap: Map<string, {
      from: string; to: string;
      fromName: string; fromNameZh: string;
      toName: string; toNameZh: string;
      fromTier: 'member' | 'partner';
      toTier: 'member' | 'partner';
      cables: typeof cableDetails[string][];
      avgSovereigntyScore: number;
      dominantSovereignty: SovereigntyLevel;
    }> = new Map();

    for (const cable of Object.values(cableDetails)) {
      const bc = cable.bricsCountries;
      // 生成所有金砖国家对组合
      for (let i = 0; i < bc.length; i++) {
        for (let j = i + 1; j < bc.length; j++) {
          const [a, b] = [bc[i], bc[j]].sort();
          const key = `${a}-${b}`;

          if (!pairMap.has(key)) {
            const metaA = BRICS_COUNTRY_META[a];
            const metaB = BRICS_COUNTRY_META[b];
            pairMap.set(key, {
              from: a, to: b,
              fromName: metaA?.name ?? a, fromNameZh: metaA?.nameZh ?? a,
              toName: metaB?.name ?? b, toNameZh: metaB?.nameZh ?? b,
              fromTier: (BRICS_MEMBERS as readonly string[]).includes(a) ? 'member' : 'partner',
              toTier: (BRICS_MEMBERS as readonly string[]).includes(b) ? 'member' : 'partner',
              cables: [],
              avgSovereigntyScore: 0,
              dominantSovereignty: 'unknown',
            });
          }

          pairMap.get(key)!.cables.push(cable);
        }
      }
    }

    // 计算每对国家的综合主权评分
    for (const pair of pairMap.values()) {
      const scores = pair.cables.map(c => c.sovereignty.score);
      pair.avgSovereigntyScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

      // 主权等级：取所有海缆中最高等级（最安全的）作为主权代表
      const levels = pair.cables.map(c => c.sovereignty.level);
      if (levels.includes('sovereign'))       pair.dominantSovereignty = 'sovereign';
      else if (levels.includes('partial'))    pair.dominantSovereignty = 'partial';
      else if (levels.includes('dependent'))  pair.dominantSovereignty = 'dependent';
      else                                    pair.dominantSovereignty = 'unknown';

      // 去重：同一条海缆可能被记录多次（多段路由），按 slug 去重
      pair.cables = [...new Map(pair.cables.map(c => [c.slug, c])).values()];
    }

    // 转换为数组并按重要性排序（成员国对优先）
    const pairs = [...pairMap.values()]
      .filter(p => p.cables.length > 0)
      .sort((a, b) => {
        // 成员国-成员国对排最前
        const aScore = (a.fromTier === 'member' ? 1 : 0) + (a.toTier === 'member' ? 1 : 0);
        const bScore = (b.fromTier === 'member' ? 1 : 0) + (b.toTier === 'member' ? 1 : 0);
        if (bScore !== aScore) return bScore - aScore;
        return b.cables.length - a.cables.length; // 海缆多的排前面
      });

    // 汇总统计
    const memberPairs = pairs.filter(p => p.fromTier === 'member' && p.toTier === 'member');
    const sovereignCount  = memberPairs.filter(p => p.dominantSovereignty === 'sovereign').length;
    const partialCount    = memberPairs.filter(p => p.dominantSovereignty === 'partial').length;
    const dependentCount  = memberPairs.filter(p => p.dominantSovereignty === 'dependent').length;
    const unknownCount    = memberPairs.filter(p => p.dominantSovereignty === 'unknown').length;

    return NextResponse.json({
      pairs,
      summary: {
        totalPairs: pairs.length,
        memberPairs: memberPairs.length,
        sovereignty: { sovereign: sovereignCount, partial: partialCount, dependent: dependentCount, unknown: unknownCount },
        totalCables: Object.keys(cableDetails).length,
      },
      generatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[CableMatrix]', error);
    return NextResponse.json({ error: 'Failed to build cable matrix' }, { status: 500 });
  }
}

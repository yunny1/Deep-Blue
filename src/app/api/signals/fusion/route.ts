// src/app/api/signals/fusion/route.ts
// 三源信号融合引擎 — Deep Blue 的核心AI能力
// 融合新闻语义信号 + BGP路由信号 + 流量异常信号
// 输出：每条可能受影响海缆的状态推断 + 置信度

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 海缆状态等级（从正常到确认故障的5级递进）
type CableHealthStatus = 'NORMAL' | 'MONITORING' | 'SUSPECTED' | 'LIKELY' | 'CONFIRMED';

interface SignalEvent {
  source: 'NEWS' | 'BGP' | 'TRAFFIC';
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  timestamp: string;
  relatedCountries?: string[];
}

interface CableStatusInference {
  cableId: string;
  cableName: string;
  cableSlug: string;
  healthStatus: CableHealthStatus;
  confidencePct: number;
  signals: SignalEvent[];
  signalCount: number;
  sourceCount: number; // 有几个独立信号源触发（1-3）
  summary: string;
  lastUpdated: string;
}

// 从国家代码查找经过该国的海缆
async function getCablesByCountry(countryCodes: string[]): Promise<any[]> {
  if (countryCodes.length === 0) return [];

  const cables = await prisma.cable.findMany({
    where: {
      landingStations: {
        some: {
          landingStation: {
            countryCode: { in: countryCodes },
          },
        },
      },
      status: { in: ['IN_SERVICE', 'UNDER_CONSTRUCTION'] },
    },
    select: {
      id: true,
      name: true,
      slug: true,
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

  return cables;
}

// 获取新闻信号
async function getNewsSignals(baseUrl: string): Promise<{ signals: SignalEvent[]; affectedCountries: string[] }> {
  try {
    const res = await fetch(`${baseUrl}/api/news?limit=50`, { next: { revalidate: 1800 } });
    const data = await res.json();

    const signals: SignalEvent[] = [];
    const affectedCountries: string[] = [];

    for (const item of (data.news || [])) {
      // 只关注故障、灾害、安全类新闻
      if (['EQUIPMENT_FAULT', 'NATURAL_DISASTER', 'POLITICAL'].includes(item.eventCategory)) {
        const severity = item.eventCategory === 'EQUIPMENT_FAULT' ? 'critical' : 'warning';
        signals.push({
          source: 'NEWS',
          severity,
          detail: item.title,
          timestamp: item.pubDate,
          relatedCountries: [],
        });
      }
    }

    return { signals, affectedCountries };
  } catch {
    return { signals: [], affectedCountries: [] };
  }
}

// 获取BGP信号
async function getBGPSignals(baseUrl: string): Promise<{ signals: SignalEvent[]; affectedCountries: string[] }> {
  try {
    const res = await fetch(`${baseUrl}/api/signals/bgp`, { next: { revalidate: 600 } });
    const data = await res.json();

    const signals: SignalEvent[] = [];
    const affectedCountries: string[] = [];

    for (const anomaly of (data.anomalies || [])) {
      signals.push({
        source: 'BGP',
        severity: anomaly.severity === 'critical' ? 'critical' : 'warning',
        detail: anomaly.detail,
        timestamp: data.timestamp,
        relatedCountries: anomaly.countryCode ? [anomaly.countryCode] : [],
      });
      if (anomaly.countryCode) affectedCountries.push(anomaly.countryCode);
    }

    return { signals, affectedCountries };
  } catch {
    return { signals: [], affectedCountries: [] };
  }
}

// 获取流量信号
async function getTrafficSignals(baseUrl: string): Promise<{ signals: SignalEvent[]; affectedCountries: string[] }> {
  try {
    const res = await fetch(`${baseUrl}/api/signals/traffic`, { next: { revalidate: 300 } });
    const data = await res.json();

    const signals: SignalEvent[] = [];
    const affectedCountries: string[] = [];

    for (const anomaly of (data.anomalies || [])) {
      signals.push({
        source: 'TRAFFIC',
        severity: anomaly.severity === 'critical' ? 'critical' : 'warning',
        detail: `Traffic anomaly detected in ${anomaly.countryName}`,
        timestamp: data.timestamp,
        relatedCountries: [anomaly.countryCode],
      });
      affectedCountries.push(anomaly.countryCode);
    }

    return { signals, affectedCountries };
  } catch {
    return { signals: [], affectedCountries: [] };
  }
}

// ═══ 核心融合逻辑 ═══
// 根据信号的数量和来源数量，判断海缆的健康状态和置信度
function inferCableStatus(signals: SignalEvent[]): { status: CableHealthStatus; confidence: number; summary: string } {
  if (signals.length === 0) {
    return { status: 'NORMAL', confidence: 95, summary: 'No anomalous signals detected' };
  }

  // 统计独立信号源数量
  const sources = new Set(signals.map(s => s.source));
  const sourceCount = sources.size;

  // 统计严重程度
  const criticalCount = signals.filter(s => s.severity === 'critical').length;
  const warningCount = signals.filter(s => s.severity === 'warning').length;

  // 融合判断逻辑
  // 三源信号同时触发 → CONFIRMED（确认故障）
  if (sourceCount >= 3 && criticalCount >= 2) {
    return {
      status: 'CONFIRMED',
      confidence: 95,
      summary: `All 3 signal sources confirm anomaly (${criticalCount} critical signals)`,
    };
  }

  // 三源信号触发但不全是critical → LIKELY（高度疑似）
  if (sourceCount >= 3) {
    return {
      status: 'LIKELY',
      confidence: 85,
      summary: `3 independent sources detected anomalies`,
    };
  }

  // 两个独立信号源触发 + 至少1个critical → SUSPECTED（疑似故障）
  if (sourceCount >= 2 && criticalCount >= 1) {
    return {
      status: 'SUSPECTED',
      confidence: 70,
      summary: `2 sources corroborate: ${Array.from(sources).join(' + ')}`,
    };
  }

  // 两个信号源触发（都是warning） → SUSPECTED（较低置信度）
  if (sourceCount >= 2) {
    return {
      status: 'SUSPECTED',
      confidence: 55,
      summary: `Warning signals from ${Array.from(sources).join(' and ')}`,
    };
  }

  // 单一信号源但有critical信号 → MONITORING
  if (criticalCount >= 1) {
    return {
      status: 'MONITORING',
      confidence: 35,
      summary: `Single-source critical signal from ${Array.from(sources)[0]}`,
    };
  }

  // 单一信号源warning → MONITORING（低置信度）
  return {
    status: 'MONITORING',
    confidence: 20,
    summary: `Weak signal from ${Array.from(sources)[0]}, monitoring`,
  };
}

export async function GET() {
  try {
    // 确定当前服务器的base URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    // 1. 并行获取三个信号源
    const [newsResult, bgpResult, trafficResult] = await Promise.all([
      getNewsSignals(baseUrl),
      getBGPSignals(baseUrl),
      getTrafficSignals(baseUrl),
    ]);

    // 2. 汇总所有受影响的国家
    const allAffectedCountries = [
      ...new Set([
        ...newsResult.affectedCountries,
        ...bgpResult.affectedCountries,
        ...trafficResult.affectedCountries,
      ]),
    ];

    // 3. 查找经过这些国家的海缆
    const affectedCables = await getCablesByCountry(allAffectedCountries);

    // 4. 为每条可能受影响的海缆进行信号融合推断
    const allSignals = [
      ...newsResult.signals,
      ...bgpResult.signals,
      ...trafficResult.signals,
    ];

    const inferences: CableStatusInference[] = [];

    for (const cable of affectedCables) {
      // 找出与这条海缆相关的信号（通过国家关联）
      const cableCountries = cable.landingStations.map(
        (ls: any) => ls.landingStation.countryCode
      );

      const relatedSignals = allSignals.filter(signal => {
        // 信号如果有关联国家，检查是否和海缆的登陆国家有交集
        if (signal.relatedCountries && signal.relatedCountries.length > 0) {
          return signal.relatedCountries.some((cc: string) => cableCountries.includes(cc));
        }
        // 新闻信号如果没有国家关联，通过名称匹配（在news API中已做过）
        return false;
      });

      if (relatedSignals.length === 0) continue;

      // 执行融合推断
      const { status, confidence, summary } = inferCableStatus(relatedSignals);
      const sources = new Set(relatedSignals.map(s => s.source));

      inferences.push({
        cableId: cable.id,
        cableName: cable.name,
        cableSlug: cable.slug,
        healthStatus: status,
        confidencePct: confidence,
        signals: relatedSignals,
        signalCount: relatedSignals.length,
        sourceCount: sources.size,
        summary,
        lastUpdated: new Date().toISOString(),
      });
    }

    // 5. 按严重程度和置信度排序
    const statusOrder: Record<string, number> = {
      CONFIRMED: 5, LIKELY: 4, SUSPECTED: 3, MONITORING: 2, NORMAL: 1,
    };
    inferences.sort((a, b) =>
      (statusOrder[b.healthStatus] || 0) - (statusOrder[a.healthStatus] || 0) ||
      b.confidencePct - a.confidencePct
    );

    // 6. 全局健康摘要
    const globalHealth = {
      totalCablesMonitored: 690,
      cablesWithSignals: inferences.length,
      confirmed: inferences.filter(i => i.healthStatus === 'CONFIRMED').length,
      likely: inferences.filter(i => i.healthStatus === 'LIKELY').length,
      suspected: inferences.filter(i => i.healthStatus === 'SUSPECTED').length,
      monitoring: inferences.filter(i => i.healthStatus === 'MONITORING').length,
    };

    return NextResponse.json({
      // 全局健康状态
      globalHealth,
      // 受影响海缆的详细推断
      inferences,
      // 原始信号统计
      signalSources: {
        news: { count: newsResult.signals.length, hasAnomaly: newsResult.signals.length > 0 },
        bgp: { count: bgpResult.signals.length, hasAnomaly: bgpResult.signals.length > 0 },
        traffic: { count: trafficResult.signals.length, hasAnomaly: trafficResult.signals.length > 0 },
      },
      // 元数据
      timestamp: new Date().toISOString(),
      // 事实/推断分离标注
      disclaimer: 'All status inferences are AI-generated based on public signal data. Toggle the AI Insights switch to show/hide inferred content.',
    });

  } catch (error) {
    console.error('Fusion engine error:', error);
    return NextResponse.json({ error: 'Signal fusion failed' }, { status: 500 });
  }
}

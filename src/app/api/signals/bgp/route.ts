// src/app/api/signals/bgp/route.ts
// BGP路由异常检测 — 使用RIPE Stat API（完全免费，无需API Key）
// 检测特定国家的BGP路由变化，路由异常可能暗示海缆故障

import { NextRequest, NextResponse } from 'next/server';

// RIPE Stat API — 免费公开接口
// 文档: https://stat.ripe.net/docs/02.data-api/

// 海缆关键登陆国家列表（这些国家高度依赖海缆连接）
const MONITORED_COUNTRIES: Record<string, { name: string; asns: string[] }> = {
  'DJ': { name: 'Djibouti', asns: ['AS37054'] },
  'TG': { name: 'Togo', asns: ['AS24691'] },
  'MZ': { name: 'Mozambique', asns: ['AS37342'] },
  'MG': { name: 'Madagascar', asns: ['AS37054'] },
  'TO': { name: 'Tonga', asns: ['AS131279'] },
  'FJ': { name: 'Fiji', asns: ['AS17974'] },
  'YE': { name: 'Yemen', asns: ['AS30873'] },
  'SO': { name: 'Somalia', asns: ['AS37576'] },
  'SB': { name: 'Solomon Islands', asns: ['AS45891'] },
  'VU': { name: 'Vanuatu', asns: ['AS17995'] },
};

// 获取某个国家的BGP路由可见性状态
async function checkCountryBGP(countryCode: string, info: { name: string; asns: string[] }): Promise<any> {
  try {
    // 使用RIPE Stat的country-routing-stats接口
    const res = await fetch(
      `https://stat.ripe.net/data/country-routing-stats/data.json?resource=${countryCode}&sourceapp=DeepBlue`,
      { next: { revalidate: 600 } } // 缓存10分钟
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.data || !data.data.stats) return null;

    const stats = data.data.stats;
    // 取最新的统计数据
    const latest = stats[stats.length - 1];
    if (!latest) return null;

    return {
      countryCode,
      countryName: info.name,
      // 路由前缀数量（如果突然下降，可能暗示连接中断）
      v4Prefixes: latest.v4_prefixes_ris || 0,
      v6Prefixes: latest.v6_prefixes_ris || 0,
      // AS数量
      asns: latest.asns_ris || 0,
    };
  } catch (e) {
    return null;
  }
}

// 检查特定ASN的BGP路由状态
async function checkASNRouting(asn: string): Promise<any> {
  try {
    const res = await fetch(
      `https://stat.ripe.net/data/routing-status/data.json?resource=${asn}&sourceapp=DeepBlue`,
      { next: { revalidate: 600 } }
    );

    if (!res.ok) return null;
    const data = await res.json();

    if (!data.data) return null;

    return {
      asn,
      status: data.data.visibility?.v4?.total_peers > 0 ? 'VISIBLE' : 'NOT_VISIBLE',
      v4Peers: data.data.visibility?.v4?.total_peers || 0,
      v4Prefixes: data.data.announced_space?.v4?.prefixes || 0,
    };
  } catch (e) {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 并行检查所有监控国家的BGP状态
    const countryResults = await Promise.all(
      Object.entries(MONITORED_COUNTRIES).map(([code, info]) =>
        checkCountryBGP(code, info)
      )
    );

    // 并行检查关键ASN的路由状态
    const allASNs = Object.values(MONITORED_COUNTRIES).flatMap(c => c.asns);
    const asnResults = await Promise.all(
      allASNs.map(asn => checkASNRouting(asn))
    );

    // 筛选出可能有异常的国家
    const anomalies: any[] = [];
    const validCountries = countryResults.filter(Boolean);

    for (const country of validCountries) {
      // 如果v4前缀数量非常少（可能是连接中断的信号）
      if (country.v4Prefixes < 5 && country.v4Prefixes > 0) {
        anomalies.push({
          type: 'LOW_PREFIX_COUNT',
          severity: 'warning',
          countryCode: country.countryCode,
          countryName: country.countryName,
          detail: `Only ${country.v4Prefixes} IPv4 prefixes visible (potential connectivity issue)`,
          v4Prefixes: country.v4Prefixes,
        });
      }
    }

    // 检查ASN不可见的情况
    const validASNs = asnResults.filter(Boolean);
    for (const asn of validASNs) {
      if (asn.status === 'NOT_VISIBLE') {
        anomalies.push({
          type: 'ASN_NOT_VISIBLE',
          severity: 'critical',
          asn: asn.asn,
          detail: `${asn.asn} is not visible in global BGP routing table`,
        });
      }
    }

    return NextResponse.json({
      signal: 'BGP',
      source: 'RIPE Stat',
      timestamp: new Date().toISOString(),
      countries: validCountries,
      asnStatuses: validASNs,
      anomalies,
      anomalyCount: anomalies.length,
      hasAnomaly: anomalies.length > 0,
    });

  } catch (error) {
    console.error('BGP signal error:', error);
    return NextResponse.json({ error: 'BGP check failed' }, { status: 500 });
  }
}

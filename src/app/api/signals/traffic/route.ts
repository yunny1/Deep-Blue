// src/app/api/signals/traffic/route.ts
// 互联网流量异常检测 — 使用IODA API（佐治亚理工，完全免费）
// 检测国家/地区级别的互联网流量异常，可能暗示海缆故障

import { NextRequest, NextResponse } from 'next/server';

// IODA API — Internet Outage Detection and Analysis
// 由佐治亚理工学院运营，完全免费，无需API Key
// 文档: https://api.ioda.inetintel.cc.gatech.edu/v2/

const IODA_BASE = 'https://api.ioda.inetintel.cc.gatech.edu/v2';

// 高度依赖海缆的国家（岛国和半岛国家）
const CABLE_DEPENDENT_COUNTRIES = [
  'DJ', 'TO', 'FJ', 'VU', 'SB', 'WS', 'PG', 'MG', 'MV', 'SC',
  'MU', 'CY', 'MT', 'IS', 'CU', 'JM', 'TT', 'BB', 'GD',
  'YE', 'SO', 'MZ', 'TZ', 'KE', 'EG', 'SA', 'AE', 'OM',
  'SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'TW', 'JP', 'KR',
  'AU', 'NZ', 'BR', 'AR', 'CL', 'IE', 'GB', 'PT', 'ES',
];

// 获取IODA的最近告警（outage alerts）
async function getIODAAlerts(): Promise<any[]> {
  try {
    // 获取最近24小时的告警
    const now = Math.floor(Date.now() / 1000);
    const dayAgo = now - 86400;

    const res = await fetch(
      `${IODA_BASE}/alerts/country?from=${dayAgo}&until=${now}`,
      {
        next: { revalidate: 300 }, // 缓存5分钟
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    console.error('IODA alerts fetch failed:', e);
    return [];
  }
}

// 获取某个国家的流量时序数据（用于检测突降）
async function getCountryTrafficSignal(countryCode: string): Promise<any> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const hoursAgo = now - 3600 * 6; // 最近6小时

    const res = await fetch(
      `${IODA_BASE}/signals/raw/country/${countryCode}?from=${hoursAgo}&until=${now}&sourceParams=merit-nt`,
      {
        next: { revalidate: 600 },
        headers: { 'Accept': 'application/json' },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.data || null;
  } catch (e) {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. 获取IODA的告警数据
    const alerts = await getIODAAlerts();

    // 2. 过滤出与海缆依赖国家相关的告警
    const relevantAlerts = alerts.filter((alert: any) => {
      const cc = alert.entity?.code?.toUpperCase();
      return cc && CABLE_DEPENDENT_COUNTRIES.includes(cc);
    }).map((alert: any) => ({
      countryCode: alert.entity?.code?.toUpperCase() || 'XX',
      countryName: alert.entity?.name || 'Unknown',
      level: alert.level || 'unknown', // 'normal', 'warning', 'critical'
      datasource: alert.datasource || 'unknown',
      startTime: alert.time ? new Date(alert.time * 1000).toISOString() : null,
      condition: alert.condition || 'unknown',
      value: alert.value,
    }));

    // 3. 汇总异常（按国家分组）
    const anomalyMap = new Map<string, any>();
    for (const alert of relevantAlerts) {
      if (alert.level === 'critical' || alert.level === 'warning') {
        const existing = anomalyMap.get(alert.countryCode);
        if (!existing || alert.level === 'critical') {
          anomalyMap.set(alert.countryCode, {
            countryCode: alert.countryCode,
            countryName: alert.countryName,
            severity: alert.level === 'critical' ? 'critical' : 'warning',
            signals: [],
          });
        }
        anomalyMap.get(alert.countryCode).signals.push({
          datasource: alert.datasource,
          condition: alert.condition,
          startTime: alert.startTime,
        });
      }
    }

    const anomalies = Array.from(anomalyMap.values());

    return NextResponse.json({
      signal: 'TRAFFIC',
      source: 'IODA (Georgia Tech)',
      timestamp: new Date().toISOString(),
      alertsTotal: alerts.length,
      relevantAlerts: relevantAlerts.length,
      anomalies,
      anomalyCount: anomalies.length,
      hasAnomaly: anomalies.length > 0,
      monitoredCountries: CABLE_DEPENDENT_COUNTRIES.length,
    });

  } catch (error) {
    console.error('Traffic signal error:', error);
    return NextResponse.json({ error: 'Traffic check failed' }, { status: 500 });
  }
}

// src/app/api/signals/cloudflare/route.ts
// Cloudflare Radar 全球互联网健康信号 API
//
// 数据源：Cloudflare Radar Annotations（实时互联网中断事件）
// 文档：https://developers.cloudflare.com/api/operations/radar-get-annotations-outages
//
// 环境变量：CLOUDFLARE_RADAR_TOKEN
// 获取方式：https://dash.cloudflare.com/profile/api-tokens
//   → Create Token → 选 "Cloudflare Radar:Read" 权限
//   免费账号即可，无需付费套餐

import { NextResponse } from 'next/server';

// 当前活跃中断事件的结构
interface OutageAnnotation {
  id: string;
  eventType: string;          // "OUTAGE" | "BGP_HIJACK" | "BGP_LEAK" 等
  startDate: string;          // ISO 时间戳
  endDate: string | null;     // null 表示还在持续
  description: string;        // 事件描述
  affectedCountries: string[]; // ISO 2字母国家代码
  scope: string;              // "COUNTRY" | "REGION" | "GLOBAL"
}

// 我们向前端返回的简化结构
export interface CloudflareHealthData {
  status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED';
  activeOutages: number;           // 当前活跃中断数量
  affectedCountries: string[];     // 所有受影响国家
  events: {
    id: string;
    description: string;
    affectedCountries: string[];
    startDate: string;
    isOngoing: boolean;
  }[];
  lastChecked: string;             // ISO 时间戳
  source: 'cloudflare_radar' | 'fallback'; // fallback = 无 token 时的模拟数据
}

// Next.js Route Segment Config — 缓存 5 分钟
// Cloudflare 的中断数据更新频率约为 5-10 分钟，缓存不会错过重要变化
export const revalidate = 300;

export async function GET() {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;

  // ── 没有 token 时返回"正常"占位数据 ──────────────────────────
  // 这样前端组件在 token 未配置时也能正常显示（显示 NORMAL 状态）
  // 而不是直接报错或显示空白
  if (!token) {
    const fallback: CloudflareHealthData = {
      status: 'NORMAL',
      activeOutages: 0,
      affectedCountries: [],
      events: [],
      lastChecked: new Date().toISOString(),
      source: 'fallback',
    };
    return NextResponse.json(fallback);
  }

  try {
    // ── 获取最近 24 小时内的中断事件 ─────────────────────────────
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const url = new URL('https://api.cloudflare.com/client/v4/radar/annotations/outages');
    url.searchParams.set('dateStart', yesterday.toISOString());
    url.searchParams.set('dateEnd', now.toISOString());
    url.searchParams.set('limit', '25');   // 最多取 25 条
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // fetch 级别的超时：5 秒
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Token 无效或 API 限流，降级返回 NORMAL
      console.warn(`[Cloudflare Radar] API returned ${response.status}`);
      return NextResponse.json({
        status: 'NORMAL',
        activeOutages: 0,
        affectedCountries: [],
        events: [],
        lastChecked: new Date().toISOString(),
        source: 'fallback',
      } as CloudflareHealthData);
    }

    const data = await response.json();
    const annotations: OutageAnnotation[] = data?.result?.annotations || [];

    // ── 过滤出"仍在持续"的中断（endDate 为 null 或 endDate 在未来）─
    const activeAnnotations = annotations.filter(a => {
      if (!a.endDate) return true; // 没有结束时间 = 仍在持续
      return new Date(a.endDate) > now;
    });

    // ── 收集所有受影响国家（去重）────────────────────────────────
    const allAffectedCountries = [
      ...new Set(activeAnnotations.flatMap(a => a.affectedCountries || [])),
    ];

    // ── 根据活跃中断数量和范围判断整体状态 ──────────────────────
    // DISRUPTED：有全球级别的中断，或同时有 3 个以上活跃事件
    // DEGRADED：有 1-2 个活跃中断
    // NORMAL：没有活跃中断
    let status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED' = 'NORMAL';
    const hasGlobal = activeAnnotations.some(a => a.scope === 'GLOBAL');
    if (hasGlobal || activeAnnotations.length >= 3) {
      status = 'DISRUPTED';
    } else if (activeAnnotations.length >= 1) {
      status = 'DEGRADED';
    }

    const result: CloudflareHealthData = {
      status,
      activeOutages: activeAnnotations.length,
      affectedCountries: allAffectedCountries,
      events: activeAnnotations.slice(0, 5).map(a => ({
        id: a.id,
        description: a.description,
        affectedCountries: a.affectedCountries || [],
        startDate: a.startDate,
        isOngoing: !a.endDate || new Date(a.endDate) > now,
      })),
      lastChecked: new Date().toISOString(),
      source: 'cloudflare_radar',
    };

    return NextResponse.json(result);

  } catch (error) {
    // 网络错误或超时：静默降级，不影响主页面加载
    console.error('[Cloudflare Radar] Fetch failed:', error);
    return NextResponse.json({
      status: 'NORMAL',
      activeOutages: 0,
      affectedCountries: [],
      events: [],
      lastChecked: new Date().toISOString(),
      source: 'fallback',
    } as CloudflareHealthData);
  }
}

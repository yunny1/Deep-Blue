// src/app/api/earthquakes/route.ts
// USGS 实时地震数据 API
// 从美国地质调查局获取最近7天的地震数据（4.5级以上）
// 并计算每次地震对附近海缆的潜在影响

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// USGS GeoJSON API — 完全免费，无需API Key
// 文档: https://earthquake.usgs.gov/fdsnws/event/1/
const USGS_API = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';

// 计算两个经纬度点之间的距离（km）— Haversine公式
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // 地球半径(km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 判断一个点是否在某条线段附近（简化版：检查离线段上每个采样点的最小距离）
function minDistanceToRoute(
  eqLat: number, eqLon: number,
  routeCoords: number[][], // [[lon, lat], [lon, lat], ...]
  sampleInterval: number = 5 // 每隔5个点采样一次（加速计算）
): number {
  let minDist = Infinity;
  for (let i = 0; i < routeCoords.length; i += sampleInterval) {
    const [lon, lat] = routeCoords[i];
    const dist = haversineDistance(eqLat, eqLon, lat, lon);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

// 地震影响半径（km）—— 根据震级计算
// 震级越大，影响范围越大
function getImpactRadius(magnitude: number): number {
  if (magnitude >= 8.0) return 500;
  if (magnitude >= 7.0) return 300;
  if (magnitude >= 6.0) return 150;
  if (magnitude >= 5.0) return 80;
  return 50;
}

// 风险等级
function getRiskLevel(magnitude: number, distanceKm: number): string {
  const radius = getImpactRadius(magnitude);
  const ratio = distanceKm / radius;
  if (ratio < 0.3) return 'HIGH';
  if (ratio < 0.7) return 'MEDIUM';
  if (ratio < 1.0) return 'LOW';
  return 'NONE';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const analyzeCables = searchParams.get('analyze') === 'true';

  try {
    // 1. 从USGS获取地震数据
    const usgsRes = await fetch(USGS_API, {
      next: { revalidate: 300 }, // 缓存5分钟（USGS数据每5分钟更新一次）
    });

    if (!usgsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch USGS data' }, { status: 502 });
    }

    const usgsData = await usgsRes.json();
    const features = usgsData.features || [];

    // 2. 格式化地震数据
    const earthquakes = features.map((f: any) => {
      const props = f.properties;
      const [lon, lat, depth] = f.geometry.coordinates;
      return {
        id: f.id,
        magnitude: props.mag,
        place: props.place,
        time: new Date(props.time).toISOString(),
        tsunami: props.tsunami === 1,
        depth: depth, // km
        latitude: lat,
        longitude: lon,
        url: props.url, // USGS详情页链接
        type: props.type,
        // 根据震级计算显示大小和颜色
        displaySize: Math.max(6, props.mag * 4),
        severity: props.mag >= 7 ? 'critical' : props.mag >= 6 ? 'major' : props.mag >= 5 ? 'moderate' : 'minor',
      };
    });

    // 3. 如果请求了海缆影响分析
    let affectedCables: any[] = [];
    if (analyzeCables && earthquakes.length > 0) {
      // 获取所有有路由数据的海缆
      const cables = await prisma.cable.findMany({
        where: {
          routeGeojson: { not: null as any },
          status: { in: ['IN_SERVICE', 'UNDER_CONSTRUCTION'] },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          routeGeojson: true,
        },
      });

      // 对每次地震，检查哪些海缆在影响范围内
      for (const eq of earthquakes) {
        const radius = getImpactRadius(eq.magnitude);
        const nearCables: any[] = [];

        for (const cable of cables) {
          if (!cable.routeGeojson) continue;

          // 提取路由坐标
          const geo = cable.routeGeojson as any;
          let allCoords: number[][] = [];

          if (geo.type === 'MultiLineString') {
            allCoords = geo.coordinates.flat();
          } else if (geo.type === 'LineString') {
            allCoords = geo.coordinates;
          }

          if (allCoords.length === 0) continue;

          // 快速粗筛：如果海缆路由的经纬度范围和地震点相差太远，直接跳过
          const lats = allCoords.map(c => c[1]);
          const lons = allCoords.map(c => c[0]);
          const minLat = Math.min(...lats), maxLat = Math.max(...lats);
          const minLon = Math.min(...lons), maxLon = Math.max(...lons);

          // 粗筛：经纬度差超过10度（约1000km）的直接跳过
          if (eq.latitude < minLat - 10 || eq.latitude > maxLat + 10 ||
              eq.longitude < minLon - 10 || eq.longitude > maxLon + 10) {
            continue;
          }

          // 精确计算最短距离
          const dist = minDistanceToRoute(eq.latitude, eq.longitude, allCoords);

          if (dist <= radius) {
            nearCables.push({
              cableId: cable.id,
              cableName: cable.name,
              cableSlug: cable.slug,
              distanceKm: Math.round(dist),
              riskLevel: getRiskLevel(eq.magnitude, dist),
            });
          }
        }

        // 按距离排序（最近的在前）
        nearCables.sort((a, b) => a.distanceKm - b.distanceKm);

        if (nearCables.length > 0) {
          affectedCables.push({
            earthquakeId: eq.id,
            magnitude: eq.magnitude,
            place: eq.place,
            time: eq.time,
            affectedCount: nearCables.length,
            cables: nearCables.slice(0, 10), // 最多返回10条最近的
          });
        }
      }
    }

    return NextResponse.json({
      count: earthquakes.length,
      earthquakes,
      // 按震级降序排列的影响分析（只在 analyze=true 时返回）
      ...(analyzeCables ? {
        analysis: {
          totalAffectedCables: affectedCables.reduce((sum, a) => sum + a.affectedCount, 0),
          events: affectedCables.sort((a, b) => b.magnitude - a.magnitude),
        },
      } : {}),
      source: 'USGS Earthquake Hazards Program',
      updated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Earthquake API error:', error);
    return NextResponse.json({ error: 'Failed to process earthquake data' }, { status: 500 });
  }
}

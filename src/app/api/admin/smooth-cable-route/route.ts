// src/app/api/admin/smooth-cable-route/route.ts
//
// 海缆路由平滑接口：自动检测并修正"穿越陆地"的线段，插入海洋绕行点
//
// 工作原理：
//   1. 从数据库读取海缆的 routeGeojson（若无则从登陆站生成初始路由）
//   2. 下载 Natural Earth 50m 陆地多边形数据（首次下载后内存缓存）
//   3. 对每对相邻坐标点，用 Turf.js 检测连线是否穿越陆地
//   4. 穿越则在中间插入绕行点（优先选择与穿越方向垂直的海洋方向）
//   5. 反复迭代最多 8 轮，直到所有线段都位于海洋中
//   6. 将平滑后的坐标写回数据库并清除 Redis 缓存
//
// 局限性：
//   - 使用 1:50m 精度数据，非常窄的海峡（如巽他海峡窄处）可能无法精确表达
//   - 极端复杂区域（印度尼西亚群岛密集区）可能仍需少量手动锚点
//   - 这是近似平滑，不是精确的海事路由

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';
import {
  lineString, point, type Feature,
  type LineString, type Polygon, type MultiPolygon, type FeatureCollection,
} from '@turf/helpers';
import { lineIntersect } from '@turf/line-intersect';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';

export const dynamic   = 'force-dynamic';
export const maxDuration = 60; // 平滑计算可能较慢，设置 60 秒上限

type Coord = [number, number]; // [经度, 纬度]

// ── 陆地数据内存缓存 ──────────────────────────────────────────────────────────
// Vercel Function 在同一个执行实例中复用，避免重复下载（通常同一台机器会保留几分钟）
let landDataCache: FeatureCollection<Polygon | MultiPolygon> | null = null;

async function getLandPolygons(): Promise<FeatureCollection<Polygon | MultiPolygon>> {
  if (landDataCache) return landDataCache;

  // Natural Earth 1:50m 陆地多边形，涵盖所有主要大陆和大型岛屿
  // 50m 精度在识别印度尼西亚、菲律宾等群岛时比 110m 精度好得多
  // 文件约 400KB，第一次请求会有约 1-2 秒的加载时间
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson';
  const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`无法加载陆地多边形数据：HTTP ${res.status}`);

  landDataCache = await res.json() as FeatureCollection<Polygon | MultiPolygon>;
  return landDataCache;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

// 检测一条线段（A→B）是否和任意陆地多边形相交
function segmentCrossesLand(
  a: Coord, b: Coord,
  land: FeatureCollection<Polygon | MultiPolygon>
): boolean {
  const seg = lineString([a, b]);
  for (const feature of land.features) {
    // lineIntersect 能同时处理 Polygon 和 MultiPolygon
    if (lineIntersect(seg, feature as Feature<Polygon>).features.length > 0) {
      return true;
    }
  }
  return false;
}

// 检测一个点是否位于陆地上（用于排除明显的内陆绕行点候选）
function pointOnLand(
  coord: Coord,
  land: FeatureCollection<Polygon | MultiPolygon>
): boolean {
  const pt = point(coord);
  for (const feature of land.features) {
    if (booleanPointInPolygon(pt, feature as Feature<Polygon>)) return true;
  }
  return false;
}

// 在 A→B 线段的中点附近，寻找一个既不在陆地上、又能让 A→P 和 P→B 都不穿越陆地的绕行点 P
function findOceanWaypoint(
  a: Coord, b: Coord,
  land: FeatureCollection<Polygon | MultiPolygon>
): Coord | null {
  const mid: Coord = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // 计算 A→B 方向向量，并求其垂直方向
  // 这样优先沿垂直于穿越方向的角度寻找绕行点，几何上最高效
  const dLng  = b[0] - a[0];
  const dLat  = b[1] - a[1];
  const len   = Math.sqrt(dLng * dLng + dLat * dLat) || 1;
  // 归一化垂直方向（两个垂直方向）
  const perpA: Coord = [-dLat / len, dLng / len]; // 左侧垂直
  const perpB: Coord = [ dLat / len, -dLng / len]; // 右侧垂直

  // 候选偏移量：从近到远，优先垂直方向，然后是更大角度的组合
  // 单位是经纬度（1度≈111km），对于海缆路径这个精度足够
  const distances = [2, 4, 6, 10, 15, 20];
  const directions: Coord[] = [
    perpA, perpB,                           // 垂直两侧（最优先）
    [0, 1], [0, -1], [1, 0], [-1, 0],       // 正四方向
    [1, 1], [-1, 1], [1, -1], [-1, -1],     // 对角方向
  ];

  for (const dist of distances) {
    for (const [dx, dy] of directions) {
      const candidate: Coord = [mid[0] + dx * dist, mid[1] + dy * dist];

      // 经纬度边界保护
      if (candidate[0] < -180 || candidate[0] > 180) continue;
      if (candidate[1] < -85  || candidate[1] > 85)  continue;

      // 候选点不能在陆地上
      if (pointOnLand(candidate, land)) continue;

      // 从 A 到候选点、从候选点到 B 都不能穿越陆地
      if (!segmentCrossesLand(a, candidate, land) &&
          !segmentCrossesLand(candidate, b, land)) {
        return candidate;
      }
    }
  }

  // 所有候选方向都失败：可能是极端复杂的地形，记录警告但不报错
  console.warn(`[smooth-route] 无法为段 [${a}]→[${b}] 找到绕行点，保留原始直线`);
  return null;
}

// 主算法：对整条路由进行多轮平滑迭代
function smoothRoute(
  coords: Coord[],
  land: FeatureCollection<Polygon | MultiPolygon>,
  maxPasses = 8
): { coords: Coord[]; passCount: number; waypointsAdded: number } {
  let current  = [...coords];
  let total    = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const next: Coord[] = [current[0]];
    let   changed       = false;

    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];

      if (segmentCrossesLand(a, b, land)) {
        const waypoint = findOceanWaypoint(a, b, land);
        if (waypoint) {
          next.push(waypoint);
          changed = true;
          total++;
        }
      }
      next.push(b);
    }

    current = next;
    if (!changed) {
      // 本轮没有新增绕行点 → 收敛，提前退出
      return { coords: current, passCount: pass + 1, waypointsAdded: total };
    }
  }

  return { coords: current, passCount: maxPasses, waypointsAdded: total };
}

// ── Redis 缓存清除 ────────────────────────────────────────────────────────────
async function clearMapCache() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/pipeline`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['del', 'cables:geo:details'],
      ['del', 'cables:geo'],
      ['del', 'cables:list'],
    ]),
  }).catch(() => {});
}

// ── POST 处理器 ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await req.json() as { slug: string };
  if (!slug?.trim()) {
    return NextResponse.json({ error: 'slug 为必填项' }, { status: 400 });
  }

  // 读取海缆数据
  const cable = await prisma.cable.findUnique({
    where:  { slug },
    select: {
      id: true, name: true, routeGeojson: true,
      landingStations: {
        select: {
          landingStation: {
            select: { latitude: true, longitude: true, name: true },
          },
        },
      },
    },
  });

  if (!cable) {
    return NextResponse.json({ error: `找不到海缆：${slug}` }, { status: 404 });
  }

  // 提取当前坐标序列
  let coords: Coord[] = [];

  if (cable.routeGeojson) {
    const geo = cable.routeGeojson as { type: string; coordinates: unknown };
    if (geo.type === 'LineString') {
      coords = (geo.coordinates as number[][]).map(c => [c[0], c[1]] as Coord);
    } else if (geo.type === 'MultiLineString') {
      // MultiLineString：把所有段展平，平滑后重新保存为 LineString
      // 注意：支线结构会丢失，建议仅对单段主干使用此功能
      const lines = geo.coordinates as number[][][];
      coords = lines.flatMap(line => line.map(c => [c[0], c[1]] as Coord));
    }
  }

  if (coords.length < 2) {
    // 没有路由或坐标不足 → 从登陆站生成初始路由（西东排序）
    const stations = cable.landingStations
      .map(ls => ls.landingStation)
      .filter(s => s.latitude != null && s.longitude != null)
      .sort((a, b) => (a.longitude ?? 0) - (b.longitude ?? 0));

    if (stations.length < 2) {
      return NextResponse.json({
        error: '该海缆既无路由坐标，登陆站坐标也不足 2 个，无法平滑',
      }, { status: 422 });
    }

    coords = stations.map(s => [s.longitude!, s.latitude!] as Coord);
  }

  // 加载陆地多边形数据
  let land: FeatureCollection<Polygon | MultiPolygon>;
  try {
    land = await getLandPolygons();
  } catch (e: unknown) {
    return NextResponse.json({
      error: `无法加载陆地数据：${e instanceof Error ? e.message : String(e)}`,
    }, { status: 502 });
  }

  // 执行平滑算法
  const { coords: smoothed, passCount, waypointsAdded } = smoothRoute(coords, land);

  // 构建新的 GeoJSON
  const newGeojson = {
    type:        'LineString',
    coordinates: smoothed,
  };

  // 写回数据库
  await prisma.cable.update({
    where: { id: cable.id },
    data:  {
      routeGeojson:       newGeojson,
      isApproximateRoute: true,
    },
  });

  // 清除地图缓存（fire and forget）
  clearMapCache();

  return NextResponse.json({
    message: `平滑完成：${passCount} 轮迭代，新增 ${waypointsAdded} 个绕行点，共 ${smoothed.length} 个坐标点`,
    before:  coords.length,
    after:   smoothed.length,
    waypointsAdded,
    passCount,
  });
}

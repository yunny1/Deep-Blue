// src/app/api/admin/smooth-cable-route/route.ts
//
// 海缆路由平滑接口：自动检测穿越陆地的线段，插入海洋绕行点
//
// 故意不使用任何外部地理计算库（turf 等），所有几何运算自行实现，
// 消除依赖风险，在 Vercel 上零配置即可运行。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

type Coord = [number, number]; // [经度 lng, 纬度 lat]

// ── 几何工具函数（纯原生实现，无外部依赖）────────────────────────────────────

/**
 * 二维向量叉积：用来判断点 P 相对于向量 AB 的方向
 * 返回值 > 0：P 在 AB 左侧；< 0：右侧；= 0：共线
 */
function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * 判断两条线段 (a→b) 和 (c→d) 是否严格相交
 * 算法：如果 a、b 分别在直线 cd 的两侧，且 c、d 分别在直线 ab 的两侧，则相交
 */
function segmentsIntersect(a: Coord, b: Coord, c: Coord, d: Coord): boolean {
  const d1 = cross(c[0], c[1], d[0], d[1], a[0], a[1]);
  const d2 = cross(c[0], c[1], d[0], d[1], b[0], b[1]);
  const d3 = cross(a[0], a[1], b[0], b[1], c[0], c[1]);
  const d4 = cross(a[0], a[1], b[0], b[1], d[0], d[1]);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

/**
 * 点是否在多边形环内（射线法）
 * ring：多边形外轮廓坐标数组（首尾坐标相同或不同均可）
 */
function pointInRing(pt: Coord, ring: Coord[]): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * 判断线段 (a→b) 是否和单个多边形（rings[0] 为外轮廓）相交
 * 相交的两种情况：
 *   1. 线段与多边形的某条边相交
 *   2. 线段的端点落在多边形内部（线段完全在多边形内时线段与边不相交，但端点在内部）
 */
function segmentCrossesPolygonRings(a: Coord, b: Coord, rings: Coord[][]): boolean {
  const outer = rings[0];
  // 检查线段是否穿越多边形的任意一条边
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    if (segmentsIntersect(a, b, outer[i], outer[j])) return true;
  }
  // 检查端点是否在多边形内部
  if (pointInRing(a, outer) || pointInRing(b, outer)) return true;
  return false;
}

/**
 * 判断线段 (a→b) 是否穿越陆地
 * 遍历 Natural Earth GeoJSON 的所有 Polygon/MultiPolygon 特征
 */
function segmentCrossesLand(a: Coord, b: Coord, landFeatures: LandFeature[]): boolean {
  for (const f of landFeatures) {
    const geom = f.geometry;
    if (geom.type === 'Polygon') {
      if (segmentCrossesPolygonRings(a, b, geom.coordinates as Coord[][])) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of (geom.coordinates as Coord[][][])) {
        if (segmentCrossesPolygonRings(a, b, poly)) return true;
      }
    }
  }
  return false;
}

/**
 * 判断单个点是否落在陆地上
 */
function pointOnLand(pt: Coord, landFeatures: LandFeature[]): boolean {
  for (const f of landFeatures) {
    const geom = f.geometry;
    if (geom.type === 'Polygon') {
      if (pointInRing(pt, (geom.coordinates as Coord[][])[0])) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of (geom.coordinates as Coord[][][])) {
        if (pointInRing(pt, poly[0])) return true;
      }
    }
  }
  return false;
}

// ── 陆地数据类型 ──────────────────────────────────────────────────────────────
interface LandFeature {
  geometry: { type: string; coordinates: unknown };
}

// ── 陆地多边形数据内存缓存 ────────────────────────────────────────────────────
let landCache: LandFeature[] | null = null;

async function getLandFeatures(): Promise<LandFeature[]> {
  if (landCache) return landCache;
  // Natural Earth 1:50m 陆地多边形，约 400KB
  // 首次加载约需 1-2 秒，之后在同一 Function 实例中复用
  const res = await fetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`陆地数据加载失败：HTTP ${res.status}`);
  const geojson = await res.json() as { features: LandFeature[] };
  landCache = geojson.features;
  return landCache;
}

// ── 平滑算法核心 ──────────────────────────────────────────────────────────────

/**
 * 在线段 (a→b) 中间寻找一个位于海洋中的绕行点
 * 策略：在中点附近按"垂直于穿越方向优先"的顺序试探候选点
 */
function findOceanWaypoint(a: Coord, b: Coord, land: LandFeature[]): Coord | null {
  const mid: Coord = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // 计算 A→B 的垂直方向（归一化），优先沿垂直方向绕行，路径最短
  const dLng = b[0] - a[0];
  const dLat = b[1] - a[1];
  const len  = Math.sqrt(dLng * dLng + dLat * dLat) || 1;
  const px = -dLat / len; // 左侧垂直分量
  const py =  dLng / len;

  // 候选偏移方向：[经度方向倍数, 纬度方向倍数]
  // 排在前面的方向会被优先尝试
  const dirs: [number, number][] = [
    [ px,  py], [-px, -py],   // 垂直两侧（最优先，绕行距离最短）
    [0, 1],  [0, -1],          // 正南北
    [1, 0],  [-1, 0],          // 正东西
    [px + 0.5, py], [px - 0.5, py],  // 斜向组合
    [1,  1], [-1,  1], [1, -1], [-1, -1],  // 对角
  ];

  // 从近到远依次尝试各个方向和距离
  for (const dist of [2, 4, 6, 10, 15, 22]) {
    for (const [dx, dy] of dirs) {
      const candidate: Coord = [mid[0] + dx * dist, mid[1] + dy * dist];

      // 保证在合法经纬度范围内
      if (candidate[0] < -180 || candidate[0] > 180) continue;
      if (candidate[1] < -85  || candidate[1] > 85)  continue;

      // 候选点自身不能在陆地上
      if (pointOnLand(candidate, land)) continue;

      // A→候选点 和 候选点→B 都不能穿越陆地
      if (!segmentCrossesLand(a, candidate, land) &&
          !segmentCrossesLand(candidate, b, land)) {
        return candidate;
      }
    }
  }

  console.warn(`[smooth-route] 段 [${a}]→[${b}] 无法找到绕行点，保留原直线`);
  return null;
}

/**
 * 对整条路由进行多轮平滑迭代，直到所有线段都不穿越陆地
 */
function smoothRoute(
  coords: Coord[], land: LandFeature[], maxPasses = 8
): { coords: Coord[]; passes: number; added: number } {
  let current = [...coords];
  let totalAdded = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const next: Coord[] = [current[0]];
    let changed = false;

    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i], b = current[i + 1];
      if (segmentCrossesLand(a, b, land)) {
        const wp = findOceanWaypoint(a, b, land);
        if (wp) { next.push(wp); changed = true; totalAdded++; }
      }
      next.push(b);
    }

    current = next;
    if (!changed) return { coords: current, passes: pass + 1, added: totalAdded };
  }

  return { coords: current, passes: maxPasses, added: totalAdded };
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

  const { slug } = await req.json() as { slug?: string };
  if (!slug?.trim())
    return NextResponse.json({ error: 'slug 为必填项' }, { status: 400 });

  const cable = await prisma.cable.findUnique({
    where:  { slug },
    select: {
      id: true, name: true, routeGeojson: true,
      landingStations: {
        select: { landingStation: { select: { latitude: true, longitude: true, name: true } } },
      },
    },
  });

  if (!cable)
    return NextResponse.json({ error: `找不到海缆：${slug}` }, { status: 404 });

  // 提取当前坐标序列（支持 LineString 和 MultiLineString）
  let coords: Coord[] = [];
  if (cable.routeGeojson) {
    const geo = cable.routeGeojson as { type: string; coordinates: unknown };
    if (geo.type === 'LineString') {
      coords = (geo.coordinates as number[][]).map(c => [c[0], c[1]] as Coord);
    } else if (geo.type === 'MultiLineString') {
      // 把多段展平为单条（支线结构会丢失，适合主干路由平滑）
      coords = (geo.coordinates as number[][][]).flatMap(
        line => line.map(c => [c[0], c[1]] as Coord)
      );
    }
  }

  // 没有路由时，从登陆站按经度排序生成初始路由
  if (coords.length < 2) {
    const stations = cable.landingStations
      .map(ls => ls.landingStation)
      .filter(s => s.latitude != null && s.longitude != null)
      .sort((a, b) => (a.longitude ?? 0) - (b.longitude ?? 0));

    if (stations.length < 2)
      return NextResponse.json({ error: '路由坐标不足，登陆站坐标也不足 2 个' }, { status: 422 });

    coords = stations.map(s => [s.longitude!, s.latitude!] as Coord);
  }

  // 加载陆地数据
  let land: LandFeature[];
  try {
    land = await getLandFeatures();
  } catch (e: unknown) {
    return NextResponse.json({
      error: `陆地数据加载失败：${e instanceof Error ? e.message : String(e)}`,
    }, { status: 502 });
  }

  // 执行平滑
  const { coords: smoothed, passes, added } = smoothRoute(coords, land);

  // 写回数据库
  await prisma.cable.update({
    where: { id: cable.id },
    data:  { routeGeojson: { type: 'LineString', coordinates: smoothed }, isApproximateRoute: true },
  });

  clearMapCache(); // fire-and-forget

  return NextResponse.json({
    message: `平滑完成：${passes} 轮迭代，新增 ${added} 个绕行点，共 ${smoothed.length} 个坐标点`,
    before: coords.length, after: smoothed.length, waypointsAdded: added, passCount: passes,
  });
}

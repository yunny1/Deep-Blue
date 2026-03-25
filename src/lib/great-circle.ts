/**
 * great-circle.ts
 * 
 * 大圆弧路由生成器
 * 
 * 功能：给定一组登陆站坐标，生成大圆弧（Great Circle Arc）近似路由 GeoJSON。
 * 用于 SN 独有海缆（有登陆站坐标但无 TG 精确路由）的地图可视化。
 * 
 * 算法：
 * 1. 对登陆站坐标按经度排序（左→右），处理跨日期变更线的情况
 * 2. 用最近邻贪心算法连接各站点（避免交叉线段）
 * 3. 相邻站点之间插值生成大圆弧中间点（每 100km 一个点）
 * 4. 输出 GeoJSON LineString 或 MultiLineString
 * 
 * 路径：src/lib/great-circle.ts
 */

// ============================================================
// 1. 核心数学：球面大圆弧插值
// ============================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

/** 两点间的大圆距离（km） */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * 在两点之间沿大圆弧插值生成中间点
 * 
 * @param lat1, lon1 - 起点（度）
 * @param lat2, lon2 - 终点（度）
 * @param numPoints  - 插值点数（含起终点）
 * @returns [lon, lat][] 坐标数组（GeoJSON 格式：经度在前）
 */
export function interpolateGreatCircle(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  numPoints: number,
): [number, number][] {
  if (numPoints < 2) numPoints = 2;

  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const lam2 = lon2 * DEG2RAD;

  // 球面角距离
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((phi2 - phi1) / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
    )
  );

  // 如果两点几乎重合，直接返回
  if (d < 1e-10) {
    return [[lon1, lat1], [lon2, lat2]];
  }

  const points: [number, number][] = [];

  for (let i = 0; i < numPoints; i++) {
    const f = i / (numPoints - 1);
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD2DEG;
    const lon = Math.atan2(y, x) * RAD2DEG;

    points.push([lon, lat]);
  }

  return points;
}

// ============================================================
// 2. 站点排序：最近邻贪心（避免交叉线段）
// ============================================================

interface StationCoord {
  lat: number;
  lon: number;
  name?: string;
}

/**
 * 用最近邻贪心算法对站点排序
 * 从最西端（或最南端）的站点开始，每次选择距当前点最近的未访问站点
 */
function orderStationsNearestNeighbor(stations: StationCoord[]): StationCoord[] {
  if (stations.length <= 2) return [...stations];

  // 找起点：最西端的站点（经度最小）
  const sorted = [...stations].sort((a, b) => a.lon - b.lon);
  const ordered: StationCoord[] = [sorted[0]];
  const remaining = new Set(stations.filter(s => s !== sorted[0]));

  while (remaining.size > 0) {
    const current = ordered[ordered.length - 1];
    let nearest: StationCoord | null = null;
    let nearestDist = Infinity;

    for (const candidate of remaining) {
      const dist = haversineKm(current.lat, current.lon, candidate.lat, candidate.lon);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = candidate;
      }
    }

    if (nearest) {
      ordered.push(nearest);
      remaining.delete(nearest);
    }
  }

  return ordered;
}

// ============================================================
// 3. 跨日期变更线处理
// ============================================================

/**
 * 检测两点之间是否跨越日期变更线（±180°）
 * 如果经度差 > 180°，说明应该走反方向（跨日期变更线）
 */
function crossesDateline(lon1: number, lon2: number): boolean {
  return Math.abs(lon2 - lon1) > 180;
}

/**
 * 将跨日期变更线的线段拆分为两段
 * 在日期变更线处切断，生成两个独立的线段
 */
function splitAtDateline(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): { segment1: [number, number][]; segment2: [number, number][] } {
  // 计算在日期变更线处的纬度插值
  // 让 lon 走"短路径"：如果 lon1=170, lon2=-170，实际跨越了 20°而非 340°
  const adjustedLon2 = lon2 > lon1 ? lon2 - 360 : lon2 + 360;
  const fraction = (lon1 > 0 ? (180 - lon1) : (-180 - lon1)) / (adjustedLon2 - lon1);
  const midLat = lat1 + fraction * (lat2 - lat1);

  const boundary = lon1 > 0 ? 180 : -180;

  return {
    segment1: [[lon1, lat1], [boundary, midLat]],
    segment2: [[-boundary, midLat], [lon2, lat2]],
  };
}

// ============================================================
// 4. 主函数：生成近似路由 GeoJSON
// ============================================================

/** 每隔多少 km 插一个点 */
const POINTS_PER_KM = 100;

/**
 * 从一组登陆站坐标生成大圆弧近似路由
 * 
 * @param stations - 登陆站坐标数组（必须有 lat/lon）
 * @returns GeoJSON geometry（LineString 或 MultiLineString），或 null（站点不够）
 */
export function generateApproximateRoute(
  stations: StationCoord[],
): { type: string; coordinates: number[][] | number[][][] } | null {
  // 至少需要 2 个有效坐标的站点
  const valid = stations.filter(s =>
    s.lat != null && s.lon != null &&
    !isNaN(s.lat) && !isNaN(s.lon) &&
    Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180
  );

  if (valid.length < 2) return null;

  // 去重：同一位置的站点只保留一个（0.01度 ≈ 1km 以内视为同一点）
  const deduped: StationCoord[] = [];
  for (const s of valid) {
    const isDup = deduped.some(d =>
      Math.abs(d.lat - s.lat) < 0.01 && Math.abs(d.lon - s.lon) < 0.01
    );
    if (!isDup) deduped.push(s);
  }

  if (deduped.length < 2) return null;

  // 排序
  const ordered = orderStationsNearestNeighbor(deduped);

  // 生成大圆弧线段
  const allSegments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const distKm = haversineKm(a.lat, a.lon, b.lat, b.lon);
    const numPoints = Math.max(2, Math.ceil(distKm / POINTS_PER_KM) + 1);

    if (crossesDateline(a.lon, b.lon)) {
      // 跨日期变更线：拆分为两段
      if (currentSegment.length > 0) {
        // 先把当前段到 a 点的弧加入
        currentSegment.push([a.lon, a.lat]);
        allSegments.push(currentSegment);
        currentSegment = [];
      }

      const { segment1, segment2 } = splitAtDateline(a.lat, a.lon, b.lat, b.lon);
      allSegments.push(segment1);
      currentSegment = [...segment2];
    } else {
      // 普通情况：直接插值
      const arcPoints = interpolateGreatCircle(a.lat, a.lon, b.lat, b.lon, numPoints);
      if (currentSegment.length === 0) {
        currentSegment = arcPoints;
      } else {
        // 跳过第一个点（和上一段的最后一个点重复）
        currentSegment.push(...arcPoints.slice(1));
      }
    }
  }

  if (currentSegment.length > 0) {
    allSegments.push(currentSegment);
  }

  // 输出 GeoJSON
  if (allSegments.length === 0) return null;

  if (allSegments.length === 1) {
    return {
      type: 'LineString',
      coordinates: allSegments[0],
    };
  }

  return {
    type: 'MultiLineString',
    coordinates: allSegments,
  };
}

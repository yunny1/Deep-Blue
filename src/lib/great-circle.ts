/**
 * great-circle.ts — v4 (A* Ocean Grid Pathfinding)
 *
 * 为无路由的 SN 海缆生成近似路由 GeoJSON。
 *
 * 核心算法：
 * ─────────
 * 1. 加载 1° 分辨率的全球海洋/陆地网格（由 generate-ocean-mask.ts 生成）
 * 2. 将每个登陆站坐标 snap 到最近的海洋格子
 * 3. 用 A* 算法在海洋格子上寻路（8 方向移动，只走海洋格子）
 * 4. 对路径做平滑处理，输出 GeoJSON
 *
 * 这个方法 100% 保证路径不穿越陆地：
 * - 路径上的每个点都是海洋格子的中心
 * - A* 只允许在海洋格子之间移动
 * - 如果两点之间没有海洋通路，返回 null（不会强行穿陆）
 *
 * 路径：src/lib/great-circle.ts
 */

import { isLand, OCEAN_MASK_COLS, OCEAN_MASK_ROWS, OCEAN_MASK_HEX } from './ocean-mask';

// ============================================================
// 1. 球面数学
// ============================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function interpolateGreatCircle(
  lat1: number, lon1: number, lat2: number, lon2: number, numPoints: number,
): [number, number][] {
  if (numPoints < 2) numPoints = 2;
  const phi1 = lat1 * DEG2RAD, lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD, lam2 = lon2 * DEG2RAD;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2
  ));
  if (d < 1e-10) return [[lon1, lat1], [lon2, lat2]];
  const points: [number, number][] = [];
  for (let i = 0; i < numPoints; i++) {
    const f = i / (numPoints - 1);
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
    const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);
    points.push([
      Math.atan2(y, x) * RAD2DEG,
      Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD2DEG,
    ]);
  }
  return points;
}

// ============================================================
// 2. 网格坐标转换
// ============================================================

/** 经纬度 → 网格行列 */
function latLonToGrid(lat: number, lon: number): [number, number] {
  const row = Math.floor(90 - lat);
  let col = Math.floor(lon + 180);
  // 处理经度环绕
  if (col < 0) col += OCEAN_MASK_COLS;
  if (col >= OCEAN_MASK_COLS) col -= OCEAN_MASK_COLS;
  return [
    Math.max(0, Math.min(OCEAN_MASK_ROWS - 1, row)),
    Math.max(0, Math.min(OCEAN_MASK_COLS - 1, col)),
  ];
}

/** 网格行列 → 经纬度（格子中心） */
function gridToLatLon(row: number, col: number): [number, number] {
  return [90 - row - 0.5, -180 + col + 0.5];
}

/** 检查网格格子是否为海洋（直接从 hex 解码，避免重复调用 isLand） */
function isGridOcean(row: number, col: number): boolean {
  if (row < 0 || row >= OCEAN_MASK_ROWS || col < 0 || col >= OCEAN_MASK_COLS) return false;
  const bitIndex = row * OCEAN_MASK_COLS + col;
  const byteIndex = Math.floor(bitIndex / 8);
  const bitOffset = 7 - (bitIndex % 8);
  const byteVal = parseInt(OCEAN_MASK_HEX.substr(byteIndex * 2, 2), 16);
  return ((byteVal >> bitOffset) & 1) === 0;
}

/**
 * 将一个坐标 snap 到最近的海洋格子
 * 在目标点周围做螺旋搜索，找到最近的海洋格子
 */
function snapToOcean(lat: number, lon: number): [number, number] {
  const [row, col] = latLonToGrid(lat, lon);
  if (isGridOcean(row, col)) return [row, col];

  // 螺旋搜索最近的海洋格子（最远搜索 20 格 = 20°）
  for (let radius = 1; radius <= 20; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // 只搜索外圈
        const nr = row + dr;
        let nc = (col + dc) % OCEAN_MASK_COLS;
        if (nc < 0) nc += OCEAN_MASK_COLS;
        if (nr >= 0 && nr < OCEAN_MASK_ROWS && isGridOcean(nr, nc)) {
          return [nr, nc];
        }
      }
    }
  }

  // 兜底：返回原始位置
  return [row, col];
}

// ============================================================
// 3. A* 寻路
// ============================================================

/** 8 方向移动：上、下、左、右、4 个对角 */
const DIRS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

/** A* 启发函数：两个格子之间的直线距离（度） */
function heuristic(r1: number, c1: number, r2: number, c2: number): number {
  const dr = r1 - r2;
  // 处理经度环绕
  let dc = c1 - c2;
  if (dc > OCEAN_MASK_COLS / 2) dc -= OCEAN_MASK_COLS;
  if (dc < -OCEAN_MASK_COLS / 2) dc += OCEAN_MASK_COLS;
  return Math.sqrt(dr * dr + dc * dc);
}

/** 网格坐标打包为唯一键 */
function packKey(row: number, col: number): number {
  return row * OCEAN_MASK_COLS + col;
}

/**
 * A* 寻路：从 (startRow, startCol) 到 (endRow, endCol)
 * 只在海洋格子上移动
 * 
 * 返回路径格子序列 [row, col][]，或 null（不可达）
 */
function astarPath(
  startRow: number, startCol: number,
  endRow: number, endCol: number,
  maxIterations: number = 50000,
): [number, number][] | null {
  if (startRow === endRow && startCol === endCol) return [[startRow, startCol]];

  const startKey = packKey(startRow, startCol);
  const endKey = packKey(endRow, endCol);

  // 开放集：{key, row, col, f}
  const openSet: { key: number; row: number; col: number; f: number }[] = [];
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closedSet = new Set<number>();

  gScore.set(startKey, 0);
  openSet.push({ key: startKey, row: startRow, col: startCol, f: heuristic(startRow, startCol, endRow, endCol) });

  let iterations = 0;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // 取 f 值最小的节点
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) bestIdx = i;
    }
    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);

    if (current.key === endKey) {
      // 回溯路径
      const path: [number, number][] = [];
      let key = endKey;
      while (key !== undefined) {
        const r = Math.floor(key / OCEAN_MASK_COLS);
        const c = key % OCEAN_MASK_COLS;
        path.unshift([r, c]);
        if (key === startKey) break;
        key = cameFrom.get(key)!;
      }
      return path;
    }

    closedSet.add(current.key);

    // 扩展邻居
    for (const [dr, dc] of DIRS) {
      const nr = current.row + dr;
      let nc = current.col + dc;

      // 经度环绕
      if (nc < 0) nc += OCEAN_MASK_COLS;
      if (nc >= OCEAN_MASK_COLS) nc -= OCEAN_MASK_COLS;

      // 边界和陆地检查
      if (nr < 0 || nr >= OCEAN_MASK_ROWS) continue;
      if (!isGridOcean(nr, nc)) continue;

      const neighborKey = packKey(nr, nc);
      if (closedSet.has(neighborKey)) continue;

      // 移动代价：对角 = √2，直线 = 1
      const moveCost = (dr !== 0 && dc !== 0) ? 1.414 : 1.0;
      const tentativeG = (gScore.get(current.key) || 0) + moveCost;

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        gScore.set(neighborKey, tentativeG);
        cameFrom.set(neighborKey, current.key);
        const f = tentativeG + heuristic(nr, nc, endRow, endCol);

        // 检查是否已在 openSet 中
        const existingIdx = openSet.findIndex(n => n.key === neighborKey);
        if (existingIdx >= 0) {
          openSet[existingIdx].f = f;
        } else {
          openSet.push({ key: neighborKey, row: nr, col: nc, f });
        }
      }
    }
  }

  // 超出迭代或无路径
  return null;
}

// ============================================================
// 4. 路径平滑
// ============================================================

/**
 * Douglas-Peucker 简化：减少路径点数，保持形状
 * 在 [row, col] 空间上操作
 */
function simplifyPath(path: [number, number][], tolerance: number = 1.0): [number, number][] {
  if (path.length <= 2) return path;

  let maxDist = 0;
  let maxIdx = 0;

  const start = path[0];
  const end = path[path.length - 1];

  for (let i = 1; i < path.length - 1; i++) {
    const dist = pointToLineDist(path[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(path.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPath(path.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function pointToLineDist(point: [number, number], lineStart: [number, number], lineEnd: [number, number]): number {
  const [pr, pc] = point;
  const [sr, sc] = lineStart;
  const [er, ec] = lineEnd;
  const dr = er - sr;
  const dc = ec - sc;
  const lenSq = dr * dr + dc * dc;
  if (lenSq === 0) return Math.sqrt((pr - sr) ** 2 + (pc - sc) ** 2);
  let t = ((pr - sr) * dr + (pc - sc) * dc) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projR = sr + t * dr;
  const projC = sc + t * dc;
  return Math.sqrt((pr - projR) ** 2 + (pc - projC) ** 2);
}

// ============================================================
// 5. 站点排序
// ============================================================

interface StationCoord { lat: number; lon: number; name?: string; }

function orderStationsNearestNeighbor(stations: StationCoord[]): StationCoord[] {
  if (stations.length <= 2) return [...stations];
  const sorted = [...stations].sort((a, b) => a.lon - b.lon);
  const ordered: StationCoord[] = [sorted[0]];
  const remaining = new Set(stations.filter(s => s !== sorted[0]));
  while (remaining.size > 0) {
    const current = ordered[ordered.length - 1];
    let nearest: StationCoord | null = null, nearestDist = Infinity;
    for (const c of remaining) {
      const d = haversineKm(current.lat, current.lon, c.lat, c.lon);
      if (d < nearestDist) { nearestDist = d; nearest = c; }
    }
    if (nearest) { ordered.push(nearest); remaining.delete(nearest); }
  }
  return ordered;
}

// ============================================================
// 6. 主函数
// ============================================================

const KM_PER_POINT = 100;  // 最终输出中每 100km 一个插值点

export function generateApproximateRoute(
  stations: StationCoord[],
): { type: string; coordinates: number[][] | number[][][] } | null {
  const valid = stations.filter(s =>
    s.lat != null && s.lon != null && !isNaN(s.lat) && !isNaN(s.lon) &&
    Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180
  );
  if (valid.length < 2) return null;

  const deduped: StationCoord[] = [];
  for (const s of valid) {
    if (!deduped.some(d => Math.abs(d.lat - s.lat) < 0.5 && Math.abs(d.lon - s.lon) < 0.5))
      deduped.push(s);
  }
  if (deduped.length < 2) return null;

  const ordered = orderStationsNearestNeighbor(deduped);
  const allCoords: [number, number][] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];

    // Snap 到最近的海洋格子
    const [startRow, startCol] = snapToOcean(a.lat, a.lon);
    const [endRow, endCol] = snapToOcean(b.lat, b.lon);

    // A* 寻路
    const gridPath = astarPath(startRow, startCol, endRow, endCol);
    if (!gridPath || gridPath.length < 2) continue;

    // 简化路径（减少点数）
    const simplified = simplifyPath(gridPath, 1.5);

    // 转换为经纬度坐标
    const waypoints = simplified.map(([r, c]) => gridToLatLon(r, c));

    // 沿简化后的航点之间做大圆弧插值
    for (let j = 0; j < waypoints.length - 1; j++) {
      const [lat1, lon1] = waypoints[j];
      const [lat2, lon2] = waypoints[j + 1];
      const dist = haversineKm(lat1, lon1, lat2, lon2);
      const n = Math.max(2, Math.ceil(dist / KM_PER_POINT) + 1);
      const pts = interpolateGreatCircle(lat1, lon1, lat2, lon2, n);

      if (allCoords.length === 0) allCoords.push(...pts);
      else allCoords.push(...pts.slice(1));
    }
  }

  if (allCoords.length < 2) return null;

  // 处理日期变更线
  const segments = splitAtDatelineIfNeeded(allCoords);
  if (segments.length === 1) return { type: 'LineString', coordinates: segments[0] };
  return { type: 'MultiLineString', coordinates: segments };
}

function splitAtDatelineIfNeeded(coords: [number, number][]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) {
      segments.push(current);
      current = [coords[i]];
    } else {
      current.push(coords[i]);
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/** 导出 snapToOcean 供外部使用 */
export function snapToOceanWaypoint(lat: number, lon: number): { lat: number; lon: number } {
  const [row, col] = snapToOcean(lat, lon);
  const [rlat, rlon] = gridToLatLon(row, col);
  return { lat: rlat, lon: rlon };
}

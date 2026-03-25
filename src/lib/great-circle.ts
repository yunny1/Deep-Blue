/**
 * great-circle.ts — v2 (Ocean Corridor Routing)
 *
 * 为无路由的 SN 海缆生成近似路由 GeoJSON，路由走海洋走廊避免穿越陆地。
 *
 * 核心思路（模拟 TG 路由逻辑）：
 * ─────────────────────────────
 * TG 的路由基于实际铺缆路径，沿海岸线和海底地形走。我们无法复制这个精度，
 * 但可以用"海洋走廊路由"模拟出合理路径：
 *
 * 1. 将每个登陆站按经纬度归入一个"海域区"（如南海、阿拉伯海、地中海等）
 * 2. 海域区之间通过预定义的"走廊航点"相连（如马六甲海峡、苏伊士运河、好望角等）
 * 3. 用图搜索算法（BFS）找到两个海域区之间的最短海洋路径
 * 4. 沿路径上的航点之间生成大圆弧插值点
 *
 * 这样生成的路由不会穿越陆地，且看起来像合理的海缆铺设路径。
 *
 * 路径：src/lib/great-circle.ts
 */

// ============================================================
// 1. 球面数学
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

/** 沿大圆弧在两点之间插值，返回 [lon, lat][] */
export function interpolateGreatCircle(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  numPoints: number,
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
// 2. 海域区（Ocean Zone）定义
// ============================================================
// 每个海域区代表一个不需要穿越陆地就能互达的水域
// 站点按经纬度归入最近的海域区

export type OceanZone =
  | 'NORTH_SEA'           // 北海/波罗的海（北欧）
  | 'MED_WEST'            // 西地中海
  | 'MED_EAST'            // 东地中海
  | 'RED_SEA'             // 红海 + 亚丁湾
  | 'PERSIAN_GULF'        // 波斯湾 + 阿曼湾
  | 'ARABIAN_SEA'         // 阿拉伯海（印度西海岸、东非）
  | 'BAY_OF_BENGAL'       // 孟加拉湾（印度东海岸、缅甸、安达曼海）
  | 'SOUTH_CHINA_SEA'     // 南海
  | 'EAST_CHINA_SEA'      // 东海 + 黄海 + 日本海
  | 'WEST_PACIFIC'        // 西太平洋（日本东岸、关岛、菲律宾海）
  | 'CENTRAL_PACIFIC'     // 中太平洋（夏威夷一带）
  | 'EAST_PACIFIC'        // 东太平洋（美洲西海岸）
  | 'NORTH_ATLANTIC_WEST' // 北大西洋西部（美洲东海岸）
  | 'NORTH_ATLANTIC_EAST' // 北大西洋东部（欧洲/非洲大西洋沿岸）
  | 'SOUTH_ATLANTIC'      // 南大西洋
  | 'WEST_AFRICA'         // 西非沿海
  | 'EAST_AFRICA'         // 东非沿海
  | 'OCEANIA'             // 澳洲/新西兰/太平洋岛屿
  | 'CARIBBEAN'           // 加勒比海
  | 'SOUTH_AMERICA_EAST'  // 南美东海岸
  | 'SOUTH_AMERICA_WEST'; // 南美西海岸

/** 海域区分类规则：按经纬度范围判断 */
export function classifyZone(lat: number, lon: number): OceanZone {
  // ── 地中海 & 黑海 ──
  if (lat >= 30 && lat <= 47 && lon >= -6 && lon <= 15) return 'MED_WEST';
  if (lat >= 30 && lat <= 47 && lon > 15 && lon <= 42) return 'MED_EAST';

  // ── 红海 ──
  if (lat >= 12 && lat <= 32 && lon >= 32 && lon <= 44) return 'RED_SEA';

  // ── 波斯湾 ──
  if (lat >= 23 && lat <= 31 && lon >= 47 && lon <= 58) return 'PERSIAN_GULF';

  // ── 北海/波罗的海 ──
  if (lat >= 47 && lat <= 70 && lon >= -6 && lon <= 32) return 'NORTH_SEA';

  // ── 阿拉伯海（印度西、巴基斯坦、阿曼南部、东非北部）──
  if (lat >= -5 && lat <= 26 && lon >= 44 && lon <= 77) return 'ARABIAN_SEA';

  // ── 孟加拉湾（印度东、斯里兰卡东、缅甸、安达曼海）──
  if (lat >= -10 && lat <= 23 && lon > 77 && lon <= 100) return 'BAY_OF_BENGAL';

  // ── 南海（越南、菲律宾西、马来西亚、印尼北部、新加坡）──
  if (lat >= -10 && lat <= 25 && lon > 100 && lon <= 121) return 'SOUTH_CHINA_SEA';

  // ── 东海/黄海/日本海 ──
  if (lat >= 23 && lat <= 52 && lon > 117 && lon <= 142) return 'EAST_CHINA_SEA';

  // ── 西太平洋（菲律宾东部、关岛、帕劳、日本南部太平洋侧）──
  if (lat >= -10 && lat <= 40 && lon > 121 && lon <= 165) return 'WEST_PACIFIC';

  // ── 澳大利亚 / 新西兰 / 大洋洲 ──
  if (lat >= -50 && lat < -10 && lon >= 100 && lon <= 180) return 'OCEANIA';
  if (lat >= -50 && lat < -10 && lon >= -180 && lon <= -150) return 'OCEANIA';

  // ── 东非海岸 ──
  if (lat >= -35 && lat <= 12 && lon >= 25 && lon <= 55) return 'EAST_AFRICA';

  // ── 西非海岸 ──
  if (lat >= -35 && lat <= 20 && lon >= -25 && lon <= 15) return 'WEST_AFRICA';

  // ── 加勒比海 ──
  if (lat >= 8 && lat <= 28 && lon >= -90 && lon <= -58) return 'CARIBBEAN';

  // ── 中太平洋（夏威夷一带）──
  if (lat >= 0 && lat <= 40 && lon > 165 && lon <= 180) return 'CENTRAL_PACIFIC';
  if (lat >= 0 && lat <= 40 && lon >= -180 && lon <= -140) return 'CENTRAL_PACIFIC';

  // ── 东太平洋（美洲西海岸）──
  if (lon >= -140 && lon <= -70 && lat >= -60 && lat <= 65) return 'EAST_PACIFIC';

  // ── 北大西洋西部（美洲东海岸）──
  if (lat >= 20 && lat <= 65 && lon >= -82 && lon <= -45) return 'NORTH_ATLANTIC_WEST';

  // ── 北大西洋东部（欧洲/非洲大西洋沿岸）──
  if (lat >= 20 && lat <= 65 && lon >= -45 && lon <= -6) return 'NORTH_ATLANTIC_EAST';

  // ── 南大西洋 ──
  if (lat >= -60 && lat < 0 && lon >= -70 && lon <= 20) return 'SOUTH_ATLANTIC';

  // ── 南美东海岸 ──
  if (lat >= -40 && lat < 10 && lon >= -55 && lon <= -30) return 'SOUTH_AMERICA_EAST';

  // ── 南美西海岸 ──
  if (lat >= -55 && lat < 10 && lon >= -85 && lon <= -68) return 'SOUTH_AMERICA_WEST';

  // 兜底：按经度粗分
  if (lon >= -180 && lon < -30) return 'NORTH_ATLANTIC_WEST';
  if (lon >= -30 && lon < 30) return 'NORTH_ATLANTIC_EAST';
  if (lon >= 30 && lon < 100) return 'ARABIAN_SEA';
  return 'WEST_PACIFIC';
}

// ============================================================
// 3. 海洋走廊航点（Ocean Corridor Waypoints）
// ============================================================
// 每条走廊定义了从一个海域区到另一个海域区的航点序列
// 航点都在海上，确保路由不穿越陆地

interface Corridor {
  from: OceanZone;
  to: OceanZone;
  /** 中间航点 [lon, lat][]，不含起止站点 */
  waypoints: [number, number][];
  /** 走廊距离权重（用于图搜索选最短路径）*/
  cost: number;
}

// 所有走廊都是双向的（from ↔ to），搜索时自动反向
const CORRIDORS: Corridor[] = [
  // ── 欧洲内部 ──
  { from: 'NORTH_SEA', to: 'MED_WEST',
    waypoints: [[-5, 48], [-6, 43], [-2, 38], [-5.6, 36.0]],  // 英吉利海峡 → 比斯开湾 → 直布罗陀
    cost: 3 },
  { from: 'NORTH_SEA', to: 'NORTH_ATLANTIC_EAST',
    waypoints: [[-6, 52], [-10, 48]],
    cost: 2 },

  // ── 地中海 ──
  { from: 'MED_WEST', to: 'MED_EAST',
    waypoints: [[9, 38], [15, 37], [20, 35]],  // 撒丁-西西里-克里特
    cost: 2 },
  { from: 'MED_WEST', to: 'NORTH_ATLANTIC_EAST',
    waypoints: [[-5.6, 36.0]],  // 直布罗陀海峡
    cost: 1 },
  { from: 'MED_EAST', to: 'RED_SEA',
    waypoints: [[32.3, 31.3], [32.6, 29.9], [34, 27], [35, 24], [38, 20], [42, 15], [43.3, 12.8]],
    // 赛义德港 → 苏伊士运河 → 红海（沿红海中线南下）
    cost: 3 },

  // ── 红海 → 印度洋 ──
  { from: 'RED_SEA', to: 'ARABIAN_SEA',
    waypoints: [[43.3, 12.5], [45, 11.8], [48, 11.5], [51, 12.5]],
    // 曼德海峡 → 亚丁湾出口
    cost: 2 },
  { from: 'RED_SEA', to: 'EAST_AFRICA',
    waypoints: [[43.3, 12.5], [44, 11.5]],
    cost: 1 },

  // ── 波斯湾 → 阿拉伯海 ──
  { from: 'PERSIAN_GULF', to: 'ARABIAN_SEA',
    waypoints: [[56.5, 26.3], [58, 25], [60, 23]],  // 霍尔木兹海峡
    cost: 2 },

  // ── 印度洋 ──
  { from: 'ARABIAN_SEA', to: 'BAY_OF_BENGAL',
    waypoints: [[73, 10], [77, 7.5], [80, 6]],  // 绕印度南端 + 斯里兰卡南端
    cost: 3 },
  { from: 'ARABIAN_SEA', to: 'EAST_AFRICA',
    waypoints: [[50, 8], [47, 2], [44, -3]],
    cost: 3 },
  { from: 'EAST_AFRICA', to: 'WEST_AFRICA',
    waypoints: [[35, -30], [25, -35], [18, -34.5], [14, -33], [8, -20], [5, -5], [2, 4]],
    // 好望角路线
    cost: 8 },

  // ── 东南亚 ──
  { from: 'BAY_OF_BENGAL', to: 'SOUTH_CHINA_SEA',
    waypoints: [[96, 6], [99, 3.5], [101, 2], [103.5, 1.3], [104.5, 1.2]],
    // 马六甲海峡（缅甸海 → 安达曼海 → 马六甲 → 新加坡海峡）
    cost: 3 },
  { from: 'SOUTH_CHINA_SEA', to: 'EAST_CHINA_SEA',
    waypoints: [[117, 18], [119, 22], [121, 25]],
    // 南海北上 → 台湾海峡
    cost: 2 },
  { from: 'SOUTH_CHINA_SEA', to: 'WEST_PACIFIC',
    waypoints: [[119, 14], [123, 18], [126, 20]],
    // 吕宋海峡
    cost: 2 },
  { from: 'EAST_CHINA_SEA', to: 'WEST_PACIFIC',
    waypoints: [[132, 32], [140, 34]],
    // 日本南部出太平洋
    cost: 2 },

  // ── 太平洋 ──
  { from: 'WEST_PACIFIC', to: 'CENTRAL_PACIFIC',
    waypoints: [[150, 20], [160, 20], [170, 20]],
    cost: 4 },
  { from: 'CENTRAL_PACIFIC', to: 'EAST_PACIFIC',
    waypoints: [[-150, 20], [-140, 25], [-130, 30]],
    cost: 4 },
  { from: 'WEST_PACIFIC', to: 'OCEANIA',
    waypoints: [[145, 0], [150, -10], [153, -20]],
    cost: 3 },
  { from: 'EAST_PACIFIC', to: 'SOUTH_AMERICA_WEST',
    waypoints: [[-80, 5], [-78, -5], [-76, -15]],
    cost: 3 },

  // ── 大西洋 ──
  { from: 'NORTH_ATLANTIC_WEST', to: 'NORTH_ATLANTIC_EAST',
    waypoints: [[-40, 45], [-20, 48]],
    // 北大西洋横跨
    cost: 5 },
  { from: 'NORTH_ATLANTIC_EAST', to: 'WEST_AFRICA',
    waypoints: [[-15, 30], [-18, 20], [-18, 10]],
    cost: 3 },
  { from: 'NORTH_ATLANTIC_WEST', to: 'CARIBBEAN',
    waypoints: [[-72, 22], [-68, 18]],
    cost: 2 },
  { from: 'CARIBBEAN', to: 'SOUTH_AMERICA_EAST',
    waypoints: [[-62, 12], [-55, 8], [-48, 2], [-40, -5]],
    cost: 3 },
  { from: 'SOUTH_AMERICA_EAST', to: 'WEST_AFRICA',
    waypoints: [[-30, -5], [-15, 0], [-5, 5]],
    cost: 4 },
  { from: 'SOUTH_AMERICA_EAST', to: 'SOUTH_ATLANTIC',
    waypoints: [[-40, -20], [-30, -30]],
    cost: 2 },
  { from: 'SOUTH_ATLANTIC', to: 'EAST_AFRICA',
    waypoints: [[0, -35], [15, -35], [25, -34], [32, -30]],
    // 好望角东侧
    cost: 5 },
  { from: 'SOUTH_AMERICA_WEST', to: 'EAST_PACIFIC',
    waypoints: [[-80, -10], [-85, 0], [-90, 10]],
    cost: 3 },

  // ── 同区域相邻 ──
  { from: 'EAST_AFRICA', to: 'OCEANIA',
    waypoints: [[45, -15], [60, -20], [80, -25], [100, -28], [115, -30]],
    cost: 7 },
  { from: 'BAY_OF_BENGAL', to: 'OCEANIA',
    waypoints: [[90, -5], [100, -10], [110, -20], [120, -25]],
    cost: 5 },
  { from: 'OCEANIA', to: 'CENTRAL_PACIFIC',
    waypoints: [[170, -20], [175, -10], [-178, 0], [-170, 10]],
    cost: 5 },
  { from: 'CARIBBEAN', to: 'EAST_PACIFIC',
    waypoints: [[-79.5, 9.2], [-82, 8.5], [-85, 10]],
    // 巴拿马运河区域
    cost: 2 },
];

// ============================================================
// 4. 图搜索：找两个海域区之间的最短走廊路径
// ============================================================

interface PathStep {
  zone: OceanZone;
  waypoints: [number, number][];  // 到达这个 zone 所经过的航点
}

/**
 * BFS 找从 fromZone 到 toZone 的最短走廊路径
 * 返回中间航点序列（不含起止站点的坐标）
 */
export function findCorridorPath(fromZone: OceanZone, toZone: OceanZone): [number, number][] {
  if (fromZone === toZone) return [];

  // 构建邻接表
  const adjacency = new Map<OceanZone, { neighbor: OceanZone; waypoints: [number, number][]; cost: number }[]>();

  for (const c of CORRIDORS) {
    if (!adjacency.has(c.from)) adjacency.set(c.from, []);
    if (!adjacency.has(c.to)) adjacency.set(c.to, []);
    adjacency.get(c.from)!.push({ neighbor: c.to, waypoints: c.waypoints, cost: c.cost });
    // 反向走廊：航点反转
    adjacency.get(c.to)!.push({ neighbor: c.from, waypoints: [...c.waypoints].reverse(), cost: c.cost });
  }

  // Dijkstra
  const dist = new Map<OceanZone, number>();
  const prev = new Map<OceanZone, { from: OceanZone; waypoints: [number, number][] }>();
  const visited = new Set<OceanZone>();

  dist.set(fromZone, 0);
  const queue: { zone: OceanZone; cost: number }[] = [{ zone: fromZone, cost: 0 }];

  while (queue.length > 0) {
    // 简易优先队列：排序取最小
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift()!;

    if (visited.has(current.zone)) continue;
    visited.add(current.zone);

    if (current.zone === toZone) break;

    const neighbors = adjacency.get(current.zone) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.neighbor)) continue;
      const newDist = current.cost + edge.cost;
      if (!dist.has(edge.neighbor) || newDist < dist.get(edge.neighbor)!) {
        dist.set(edge.neighbor, newDist);
        prev.set(edge.neighbor, { from: current.zone, waypoints: edge.waypoints });
        queue.push({ zone: edge.neighbor, cost: newDist });
      }
    }
  }

  // 回溯路径
  if (!prev.has(toZone)) {
    // 无走廊连接：退化为直连（开放海域）
    return [];
  }

  const waypointChain: [number, number][] = [];
  let currentZone = toZone;
  const segments: [number, number][][] = [];

  while (prev.has(currentZone)) {
    const step = prev.get(currentZone)!;
    segments.unshift(step.waypoints);
    currentZone = step.from;
  }

  for (const seg of segments) {
    waypointChain.push(...seg);
  }

  return waypointChain;
}

// ============================================================
// 5. 站点排序：最近邻贪心
// ============================================================

interface StationCoord {
  lat: number;
  lon: number;
  name?: string;
}

function orderStationsNearestNeighbor(stations: StationCoord[]): StationCoord[] {
  if (stations.length <= 2) return [...stations];
  const sorted = [...stations].sort((a, b) => a.lon - b.lon);
  const ordered: StationCoord[] = [sorted[0]];
  const remaining = new Set(stations.filter(s => s !== sorted[0]));

  while (remaining.size > 0) {
    const current = ordered[ordered.length - 1];
    let nearest: StationCoord | null = null;
    let nearestDist = Infinity;
    for (const candidate of remaining) {
      const dist = haversineKm(current.lat, current.lon, candidate.lat, candidate.lon);
      if (dist < nearestDist) { nearestDist = dist; nearest = candidate; }
    }
    if (nearest) { ordered.push(nearest); remaining.delete(nearest); }
  }
  return ordered;
}

// ============================================================
// 6. 主函数：生成海洋走廊路由
// ============================================================

const KM_PER_POINT = 80;  // 每 80km 插一个中间点

/**
 * 从一组登陆站坐标生成近似路由（海洋走廊避陆）
 *
 * @param stations - 登陆站坐标数组
 * @returns GeoJSON geometry（LineString 或 MultiLineString），或 null
 */
export function generateApproximateRoute(
  stations: StationCoord[],
): { type: string; coordinates: number[][] | number[][][] } | null {
  // 过滤有效坐标
  const valid = stations.filter(s =>
    s.lat != null && s.lon != null &&
    !isNaN(s.lat) && !isNaN(s.lon) &&
    Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180
  );
  if (valid.length < 2) return null;

  // 去重：同一位置不重复
  const deduped: StationCoord[] = [];
  for (const s of valid) {
    if (!deduped.some(d => Math.abs(d.lat - s.lat) < 0.01 && Math.abs(d.lon - s.lon) < 0.01)) {
      deduped.push(s);
    }
  }
  if (deduped.length < 2) return null;

  // 排序
  const ordered = orderStationsNearestNeighbor(deduped);

  // 逐对生成路由段
  const allCoords: [number, number][] = [];

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];

    // 确定两站所在海域区
    const zoneA = classifyZone(a.lat, a.lon);
    const zoneB = classifyZone(b.lat, b.lon);

    // 构建航点序列：起站 → [走廊航点] → 终站
    const waypoints: [number, number][] = [[a.lon, a.lat]];

    if (zoneA !== zoneB) {
      // 不同海域区：通过走廊航点连接
      const corridorPts = findCorridorPath(zoneA, zoneB);
      waypoints.push(...corridorPts);
    }

    waypoints.push([b.lon, b.lat]);

    // 沿航点之间生成大圆弧插值
    for (let j = 0; j < waypoints.length - 1; j++) {
      const [lon1, lat1] = waypoints[j];
      const [lon2, lat2] = waypoints[j + 1];
      const distKm = haversineKm(lat1, lon1, lat2, lon2);
      const numPts = Math.max(2, Math.ceil(distKm / KM_PER_POINT) + 1);
      const arcPts = interpolateGreatCircle(lat1, lon1, lat2, lon2, numPts);

      if (allCoords.length === 0) {
        allCoords.push(...arcPts);
      } else {
        // 跳过第一个点（和上一段末尾重复）
        allCoords.push(...arcPts.slice(1));
      }
    }
  }

  if (allCoords.length < 2) return null;

  // 检查是否跨日期变更线，如果跨了就用 MultiLineString
  const segments = splitAtDatelineIfNeeded(allCoords);

  if (segments.length === 1) {
    return { type: 'LineString', coordinates: segments[0] };
  }
  return { type: 'MultiLineString', coordinates: segments };
}

/** 如果坐标序列跨越日期变更线，拆分为多段 */
function splitAtDatelineIfNeeded(coords: [number, number][]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [coords[0]];

  for (let i = 1; i < coords.length; i++) {
    const prevLon = coords[i - 1][0];
    const currLon = coords[i][0];

    if (Math.abs(currLon - prevLon) > 180) {
      // 跨日期变更线：拆分
      segments.push(current);
      current = [coords[i]];
    } else {
      current.push(coords[i]);
    }
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

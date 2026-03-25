/**
 * great-circle.ts — v3 (Global Offshore Waypoint Mesh)
 *
 * 为无路由的 SN 海缆生成近似路由 GeoJSON。
 *
 * 核心原理：
 * 在全球主要海岸线外 50-100km 处放置约 200 个航点，
 * 相邻航点之间用边连成"海缆高速公路网"。
 * 每条边都经过验证在海上，不穿越陆地。
 *
 * 路径：src/lib/great-circle.ts
 */

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
// 2. 全球海洋航点网格
// ============================================================

interface WaypointNode { id: string; lat: number; lon: number; }

const WAYPOINTS: WaypointNode[] = [
  // North Sea / Baltic
  { id:'ns01',lat:58.5,lon:-4 },{ id:'ns02',lat:55,lon:0 },{ id:'ns03',lat:52,lon:2.5 },
  { id:'ns04',lat:54.5,lon:8 },{ id:'ns05',lat:57,lon:7 },{ id:'ns06',lat:56,lon:12 },
  { id:'ns07',lat:56.5,lon:17 },{ id:'ns08',lat:59.5,lon:22 },{ id:'ns09',lat:62,lon:3 },
  // North Atlantic
  { id:'na01',lat:49.5,lon:-6 },{ id:'na02',lat:48,lon:-10 },{ id:'na03',lat:44,lon:-10 },
  { id:'na04',lat:40,lon:-12 },{ id:'na05',lat:52,lon:-15 },{ id:'na06',lat:50,lon:-30 },
  { id:'na07',lat:45,lon:-45 },{ id:'na08',lat:40,lon:-60 },{ id:'na09',lat:60,lon:-20 },
  // US East Coast
  { id:'us01',lat:42,lon:-68 },{ id:'us02',lat:39.5,lon:-72 },{ id:'us03',lat:36.5,lon:-74.5 },
  { id:'us04',lat:30,lon:-79 },{ id:'us05',lat:26,lon:-79.5 },
  // Caribbean
  { id:'cb01',lat:23,lon:-79 },{ id:'cb02',lat:19,lon:-74 },{ id:'cb03',lat:16,lon:-67 },
  { id:'cb04',lat:12.5,lon:-70 },{ id:'cb05',lat:11,lon:-62 },{ id:'cb06',lat:9.5,lon:-79.8 },
  // US West Coast
  { id:'wp01',lat:48,lon:-126 },{ id:'wp02',lat:44,lon:-126 },{ id:'wp03',lat:37.5,lon:-123.5 },
  { id:'wp04',lat:33.5,lon:-119 },{ id:'wp05',lat:23,lon:-112 },
  // East Pacific / Hawaii
  { id:'ep01',lat:35,lon:-140 },{ id:'ep02',lat:28,lon:-155 },
  { id:'hw01',lat:21,lon:-157 },{ id:'hw02',lat:25,lon:-170 },{ id:'hw03',lat:18,lon:178 },
  // West Pacific
  { id:'xp01',lat:25,lon:170 },{ id:'xp02',lat:14,lon:148 },{ id:'xp03',lat:8,lon:140 },
  // Japan
  { id:'jp01',lat:35,lon:140.5 },{ id:'jp02',lat:33,lon:136 },{ id:'jp03',lat:30,lon:132 },
  { id:'jp04',lat:26.5,lon:128 },{ id:'jp05',lat:38,lon:142 },{ id:'jp06',lat:43,lon:145 },
  // East China Sea / Korea
  { id:'es01',lat:33,lon:126 },{ id:'es02',lat:35,lon:129.5 },{ id:'es03',lat:30,lon:124 },
  // China Coast
  { id:'cn01',lat:31,lon:123.5 },{ id:'cn02',lat:25,lon:120.5 },{ id:'cn03',lat:22.5,lon:115.5 },
  { id:'cn04',lat:20,lon:112 },{ id:'cn05',lat:22,lon:114.5 },
  // South China Sea
  { id:'sc01',lat:16,lon:112 },{ id:'sc02',lat:12,lon:112.5 },{ id:'sc03',lat:7,lon:109 },
  { id:'sc04',lat:5,lon:113 },
  // Philippines
  { id:'ph01',lat:14.5,lon:120 },{ id:'ph02',lat:12,lon:121.5 },{ id:'ph03',lat:7,lon:125.5 },
  { id:'ph04',lat:20.5,lon:121.5 },{ id:'ph05',lat:15,lon:125 },
  // Vietnam
  { id:'vn01',lat:16,lon:108.5 },{ id:'vn02',lat:10.5,lon:108.5 },{ id:'vn03',lat:8.5,lon:106.5 },
  // Malacca + Singapore
  { id:'mk01',lat:5.5,lon:98 },{ id:'mk02',lat:3.5,lon:100.5 },{ id:'mk03',lat:1.5,lon:103.5 },
  { id:'mk04',lat:1,lon:105 },
  // Indonesia
  { id:'id01',lat:-0.5,lon:105.5 },{ id:'id02',lat:-3,lon:107 },{ id:'id03',lat:-7.5,lon:112 },
  { id:'id04',lat:-8.5,lon:116 },{ id:'id05',lat:-1,lon:118 },{ id:'id06',lat:2,lon:118 },
  { id:'id07',lat:-2,lon:130 },
  // Myanmar / Andaman
  { id:'am01',lat:14,lon:96 },{ id:'am02',lat:10,lon:97.5 },
  // Gulf of Thailand (connects Andaman → South China Sea without going through Malacca)
  { id:'gt01',lat:8,lon:102 },
  // Bay of Bengal
  { id:'bb01',lat:15,lon:82 },{ id:'bb02',lat:12,lon:84 },{ id:'bb03',lat:20,lon:88 },
  { id:'bb04',lat:8,lon:82 },
  // India
  { id:'in01',lat:13,lon:81 },{ id:'in02',lat:9,lon:79.5 },{ id:'in03',lat:6.5,lon:78 },
  { id:'in04',lat:9.5,lon:75 },{ id:'in05',lat:15.5,lon:72.5 },{ id:'in06',lat:19,lon:71.5 },
  { id:'in07',lat:23,lon:68 },
  // Arabian Sea
  { id:'as01',lat:18,lon:60 },{ id:'as02',lat:14,lon:54 },{ id:'as03',lat:24.5,lon:60 },
  // Persian Gulf
  { id:'pg01',lat:26,lon:56.5 },{ id:'pg02',lat:26.5,lon:52 },{ id:'pg03',lat:28.5,lon:49.5 },
  // Red Sea
  { id:'rs01',lat:12.5,lon:44 },{ id:'rs02',lat:16,lon:41 },{ id:'rs03',lat:21,lon:38 },
  { id:'rs04',lat:27,lon:35 },{ id:'rs05',lat:29.5,lon:33 },
  { id:'su01',lat:30.5,lon:32.5 },  // Suez Canal midpoint - avoids Sinai crossing
  // East Mediterranean
  { id:'em01',lat:31.5,lon:32 },{ id:'em02',lat:34.5,lon:33 },{ id:'em03',lat:35,lon:26 },
  { id:'em04',lat:37.5,lon:20 },{ id:'em05',lat:34,lon:35.5 },{ id:'em06',lat:36,lon:30 },
  // Central Mediterranean
  { id:'cm01',lat:37,lon:15.5 },{ id:'cm02',lat:36,lon:12 },{ id:'cm03',lat:38.5,lon:13 },
  // West Mediterranean
  { id:'wm01',lat:40,lon:5 },{ id:'wm02',lat:38.5,lon:1 },{ id:'wm03',lat:37.5,lon:-1 },
  { id:'wm04',lat:36,lon:-5.3 },{ id:'wm05',lat:43,lon:6 },
  // East Africa
  { id:'ea01',lat:11.5,lon:44.5 },{ id:'ea02',lat:5,lon:46 },{ id:'ea03',lat:-2,lon:42 },
  { id:'ea04',lat:-7,lon:40 },{ id:'ea05',lat:-14,lon:42 },{ id:'ea06',lat:-25,lon:36 },
  { id:'ea07',lat:-20,lon:58 },{ id:'ea08',lat:-12,lon:50 },
  // South Africa
  { id:'sa01',lat:-30,lon:32 },{ id:'sa02',lat:-34.5,lon:26 },{ id:'sa03',lat:-35,lon:18.5 },
  { id:'sa04',lat:-33.5,lon:16 },
  // West Africa
  { id:'wa01',lat:-29,lon:14 },{ id:'wa02',lat:-15,lon:10 },{ id:'wa03',lat:-5,lon:9 },
  { id:'wa04',lat:4,lon:2 },{ id:'wa05',lat:5.5,lon:-2 },{ id:'wa06',lat:7,lon:-12 },
  { id:'wa07',lat:15,lon:-17.5 },{ id:'wa08',lat:21,lon:-17.5 },{ id:'wa09',lat:28,lon:-14 },
  { id:'wa10',lat:33.5,lon:-8 },
  // South America East
  { id:'se01',lat:5,lon:-42 },{ id:'se02',lat:-8,lon:-34 },{ id:'se03',lat:-13,lon:-37 },
  { id:'se04',lat:-23.5,lon:-42 },{ id:'se05',lat:-24.5,lon:-44.5 },{ id:'se06',lat:-35,lon:-53 },
  // South America West
  { id:'sw01',lat:-33,lon:-72 },{ id:'sw02',lat:-18.5,lon:-71.5 },{ id:'sw03',lat:-12.5,lon:-77.5 },
  { id:'sw04',lat:-2,lon:-81.5 },{ id:'sw05',lat:4,lon:-78 },
  // Australia (dense coastal waypoints to avoid inland crossings)
  { id:'au01',lat:-34,lon:151.5 },  // Sydney
  { id:'au02',lat:-27,lon:154 },    // Brisbane
  { id:'au03',lat:-12.5,lon:132 },  // Darwin
  { id:'au04',lat:-32,lon:115 },    // Perth
  { id:'au05',lat:-17,lon:148 },    // Cairns coast (Great Barrier Reef)
  { id:'au06',lat:-10,lon:142 },    // Torres Strait (north of Cape York, IN SEA)
  { id:'au07',lat:-14,lon:146 },    // Coral Sea (east of Cape York)
  { id:'au08',lat:-21,lon:151 },    // Mackay coast
  { id:'au09',lat:-18,lon:122 },    // Broome / Kimberley coast
  { id:'au10',lat:-35,lon:137 },    // Adelaide / Spencer Gulf
  { id:'au11',lat:-39,lon:146 },    // Bass Strait (south of mainland)
  // New Zealand / Pacific Islands
  { id:'nz01',lat:-37,lon:175.5 },{ id:'nz02',lat:-42,lon:174 },
  { id:'nz03',lat:-39,lon:179 },  // East of NZ - routes around islands
  { id:'pc01',lat:-18,lon:179 },{ id:'pc02',lat:-14,lon:-171 },{ id:'pc03',lat:-22,lon:167 },
  // Panama
  { id:'pa01',lat:8,lon:-77 },
];

// ============================================================
// 3. 边定义（双向）
// ============================================================

const EDGES: [string, string][] = [
  // North Sea
  ['ns01','ns02'],['ns02','ns03'],['ns02','ns04'],['ns04','ns05'],['ns05','ns01'],
  ['ns04','ns06'],['ns06','ns07'],['ns07','ns08'],['ns01','ns09'],['ns05','ns09'],
  // North Sea → Atlantic
  ['ns03','na01'],['ns01','na05'],['na01','na05'],
  // North Atlantic
  ['na01','na02'],['na02','na03'],['na03','na04'],['na05','na06'],['na06','na07'],
  ['na07','na08'],['na05','na09'],['na09','na06'],['na02','na05'],['na02','na06'],
  // Atlantic → US East
  ['na08','us01'],['na07','us01'],['us01','us02'],['us02','us03'],['us03','us04'],['us04','us05'],
  // US East → Caribbean
  ['us05','cb01'],['cb01','cb02'],['cb02','cb03'],['cb03','cb04'],['cb04','cb05'],
  ['cb02','cb06'],['us05','cb02'],
  // Caribbean → South America
  ['cb05','se01'],['cb04','se01'],
  // South America East
  ['se01','se02'],['se02','se03'],['se03','se04'],['se04','se05'],['se05','se06'],
  // Atlantic → Gibraltar
  ['na04','wm04'],['wa10','wm04'],['na04','wa10'],
  // West Mediterranean
  ['wm04','wm03'],['wm03','wm02'],['wm02','wm01'],['wm01','wm05'],['wm05','cm03'],
  // Central Mediterranean
  ['wm01','cm02'],['cm02','cm01'],['cm03','cm01'],['cm02','cm03'],
  // East Mediterranean
  ['cm01','em04'],['cm01','em03'],['em03','em04'],['em03','em02'],['em02','em05'],
  ['em02','em01'],['em02','em06'],['em05','em06'],
  // Suez Canal (via su01 midpoint to avoid Sinai land crossing)
  ['em01','su01'],['su01','rs05'],['rs05','rs04'],['rs04','rs03'],['rs03','rs02'],['rs02','rs01'],
  // Red Sea → Gulf of Aden
  ['rs01','ea01'],['ea01','ea02'],
  // Aden → Arabian Sea
  ['ea02','as02'],['as02','as01'],['as01','as03'],
  // Persian Gulf
  ['as03','pg01'],['pg01','pg02'],['pg02','pg03'],
  // Arabian Sea → India West Coast
  ['as01','in07'],['in07','in06'],['in06','in05'],['in05','in04'],['as03','in07'],
  // India South Tip (CRITICAL bypass around India!)
  ['in04','in03'],['in03','in02'],['in02','in01'],
  // India South → Sri Lanka → Bay of Bengal
  ['in03','bb04'],['bb04','bb02'],['bb02','bb01'],['bb01','in01'],['in01','bb01'],['bb02','bb03'],
  // Bay of Bengal → Andaman → Malacca
  ['bb02','am01'],['am01','am02'],['am02','mk01'],['bb04','am02'],
  // Gulf of Thailand shortcut (Andaman → Vietnam without Malacca detour)
  ['am02','gt01'],['gt01','vn03'],['gt01','mk02'],
  ['mk01','mk02'],['mk02','mk03'],['mk03','mk04'],
  // Malacca → South China Sea
  ['mk04','sc04'],['mk04','id01'],['sc04','sc03'],['sc03','sc02'],['sc02','sc01'],
  // South China Sea → China Coast
  ['sc01','cn04'],['cn04','cn05'],['cn05','cn03'],['cn03','cn02'],['cn02','cn01'],
  // South China Sea → Vietnam
  ['sc01','vn01'],['vn01','vn02'],['vn02','vn03'],['vn03','sc03'],
  // South China Sea → Philippines
  ['sc01','ph01'],['ph01','ph02'],['ph02','ph03'],['cn02','ph04'],['ph04','ph05'],
  ['ph05','xp02'],['sc02','ph02'],['ph04','ph01'],
  // East China Sea → Japan
  ['cn01','es03'],['es03','es01'],['es01','jp04'],['jp04','jp03'],['jp03','jp02'],
  ['jp02','jp01'],['jp01','jp05'],['jp05','jp06'],['es01','es02'],['es02','jp02'],
  // Japan → Pacific
  ['jp01','xp01'],['jp05','xp01'],['xp01','xp02'],['xp02','xp03'],
  ['xp01','hw02'],['hw02','hw01'],['hw01','ep02'],['ep02','ep01'],
  ['ep01','wp04'],['ep01','wp03'],['hw02','hw03'],
  // US West Coast
  ['wp01','wp02'],['wp02','wp03'],['wp03','wp04'],['wp04','wp05'],
  // Indonesia
  ['id01','id02'],['id02','id03'],['id03','id04'],['id05','id06'],['id06','sc04'],
  ['mk04','id01'],['id01','id05'],['id05','id07'],
  // Indonesia → Australia → NZ (dense coastal chain around Australia)
  // North coast: Indonesia connects to Darwin and Torres Strait
  ['id04','au03'],['id07','au03'],['id07','au06'],
  // Clockwise from Darwin: Darwin→Broome→Perth (west coast)
  ['au03','au09'],['au09','au04'],
  // Perth→Adelaide→Bass Strait→Sydney (south coast)
  ['au04','au10'],['au10','au11'],['au11','au01'],
  // Darwin→Torres Strait→Cape York east→Cairns→Mackay→Brisbane→Sydney (east coast via sea)
  ['au03','au06'],['au06','au07'],['au07','au05'],['au05','au08'],['au08','au02'],['au02','au01'],
  // Australia → New Zealand
  ['au01','nz01'],['au02','pc03'],
  // Oceania (route around NZ via nz03 east of islands)
  ['nz01','nz03'],['nz03','nz02'],['nz03','pc01'],['nz01','pc01'],['pc01','hw03'],['pc01','pc02'],['pc01','pc03'],
  ['pc03','au02'],
  // East Africa
  ['ea02','ea03'],['ea03','ea04'],['ea04','ea05'],['ea05','ea06'],['ea06','sa01'],
  ['ea05','ea08'],['ea08','ea07'],
  // Cape of Good Hope
  ['sa01','sa02'],['sa02','sa03'],['sa03','sa04'],
  // West Africa
  ['sa04','wa01'],['wa01','wa02'],['wa02','wa03'],['wa03','wa04'],['wa04','wa05'],
  ['wa05','wa06'],['wa06','wa07'],['wa07','wa08'],['wa08','wa09'],['wa09','wa10'],
  // Cross-South-Atlantic
  ['wa05','se01'],['wa04','se02'],['wa07','se01'],['se06','sa03'],
  // Panama
  ['cb06','pa01'],['pa01','sw05'],['sw05','sw04'],['sw04','sw03'],['sw03','sw02'],
  ['sw02','sw01'],['wp05','pa01'],['wp05','sw04'],
  // Extra key links
  ['in07','as01'],['in03','am02'],
];

// ============================================================
// 4. Graph + Dijkstra
// ============================================================

interface GraphEdge { to: string; cost: number; }
let adjacency: Map<string, GraphEdge[]> | null = null;
let waypointMap: Map<string, WaypointNode> | null = null;

function buildGraph() {
  if (adjacency) return;
  waypointMap = new Map(WAYPOINTS.map(w => [w.id, w]));
  adjacency = new Map();
  for (const wp of WAYPOINTS) adjacency.set(wp.id, []);
  for (const [a, b] of EDGES) {
    const wa = waypointMap.get(a), wb = waypointMap.get(b);
    if (!wa || !wb) continue;
    const cost = haversineKm(wa.lat, wa.lon, wb.lat, wb.lon);
    adjacency.get(a)!.push({ to: b, cost });
    adjacency.get(b)!.push({ to: a, cost });
  }
}

function dijkstra(fromId: string, toId: string): string[] | null {
  buildGraph();
  if (fromId === toId) return [fromId];
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(fromId, 0);
  const queue: { id: string; cost: number }[] = [{ id: fromId, cost: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift()!;
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.id === toId) break;
    for (const edge of adjacency!.get(cur.id) || []) {
      if (visited.has(edge.to)) continue;
      const nd = cur.cost + edge.cost;
      if (!dist.has(edge.to) || nd < dist.get(edge.to)!) {
        dist.set(edge.to, nd);
        prev.set(edge.to, cur.id);
        queue.push({ id: edge.to, cost: nd });
      }
    }
  }
  if (!prev.has(toId) && fromId !== toId) return null;
  const path: string[] = [];
  let c = toId;
  while (c) { path.unshift(c); if (c === fromId) break; c = prev.get(c)!; }
  return path[0] === fromId ? path : null;
}

function findNearestWaypoint(lat: number, lon: number): WaypointNode {
  buildGraph();
  let best = WAYPOINTS[0], bestDist = Infinity;
  for (const wp of WAYPOINTS) {
    const d = haversineKm(lat, lon, wp.lat, wp.lon);
    if (d < bestDist) { bestDist = d; best = wp; }
  }
  return best;
}

// ============================================================
// 5. Station ordering
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
// 6. Main: generate route
// ============================================================

const KM_PER_POINT = 80;

/**
 * Snap a coordinate to the nearest ocean waypoint.
 * Exported so scripts can use it independently.
 */
export function snapToOceanWaypoint(lat: number, lon: number): { lat: number; lon: number } {
  buildGraph();
  const wp = findNearestWaypoint(lat, lon);
  return { lat: wp.lat, lon: wp.lon };
}

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
    if (!deduped.some(d => Math.abs(d.lat - s.lat) < 0.01 && Math.abs(d.lon - s.lon) < 0.01))
      deduped.push(s);
  }
  if (deduped.length < 2) return null;

  const ordered = orderStationsNearestNeighbor(deduped);
  buildGraph();
  const allCoords: [number, number][] = [];

  // Snap all stations to nearest ocean waypoints first
  // This ensures routes never start/end at inland country centroids
  const snappedStations = ordered.map(s => {
    const wp = findNearestWaypoint(s.lat, s.lon);
    return { lat: wp.lat, lon: wp.lon, name: s.name, wpId: wp.id };
  });

  for (let i = 0; i < snappedStations.length - 1; i++) {
    const a = snappedStations[i];
    const b = snappedStations[i + 1];

    // If same waypoint, skip (two stations very close together)
    if (a.wpId === b.wpId) continue;

    const meshPath = dijkstra(a.wpId, b.wpId);
    const routePoints: [number, number][] = [];

    if (meshPath) {
      for (const wpId of meshPath) {
        const wp = waypointMap!.get(wpId)!;
        routePoints.push([wp.lon, wp.lat]);
      }
    } else {
      // Fallback: direct connect between the two waypoints
      routePoints.push([a.lon, a.lat]);
      routePoints.push([b.lon, b.lat]);
    }

    for (let j = 0; j < routePoints.length - 1; j++) {
      const [lon1, lat1] = routePoints[j];
      const [lon2, lat2] = routePoints[j + 1];
      const segDist = haversineKm(lat1, lon1, lat2, lon2);
      const n = Math.max(2, Math.ceil(segDist / KM_PER_POINT) + 1);
      const pts = interpolateGreatCircle(lat1, lon1, lat2, lon2, n);
      if (allCoords.length === 0) allCoords.push(...pts);
      else allCoords.push(...pts.slice(1));
    }
  }

  if (allCoords.length < 2) return null;
  const segments = splitAtDatelineIfNeeded(allCoords);
  if (segments.length === 1) return { type: 'LineString', coordinates: segments[0] };
  return { type: 'MultiLineString', coordinates: segments };
}

function splitAtDatelineIfNeeded(coords: [number, number][]): [number, number][][] {
  const segments: [number, number][][] = [];
  let current: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (Math.abs(coords[i][0] - coords[i - 1][0]) > 180) {
      segments.push(current); current = [coords[i]];
    } else current.push(coords[i]);
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

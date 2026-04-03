// src/app/api/admin/branch-unit-route/route.ts
//
// 基于"分支单元 + 引支线"的海缆路由模型
//
// 真实海底光缆的工程架构：
//   ┌─────────────────────────────────────────────────────────────┐
//   │  端点A ─── BU₂ ─── BU₃ ─── BU₄ ─── 端点B     ← 主干（在海里）│
//   │             │       │       │                              │
//   │          站点₂   站点₃   站点₄                  ← 支缆（从BU到岸）│
//   └─────────────────────────────────────────────────────────────┘
//
//  主干永远在海洋中，只在两个端点登陆；中间所有登陆站通过短支缆连接。
//  这样设计从根本上消除了"主干穿越陆地"的问题。
//
// BU 位置的计算方式：
//   把中间站点投影到"连接其前后邻居的直线"上。
//   例：Jakarta 投影到 BatamBU→BalikPapan 这条线上，落点在爪哇海里——
//   这就是 Jakarta 的 BU 位置。几何上保证 BU 自然落在主干走廊中。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

type Coord = [number, number]; // [经度, 纬度]

// ── 陆地检测（复用之前开发的纯原生几何算法）────────────────────────────────
interface LandFeature { geometry: { type: string; coordinates: unknown } }

function cross2d(ax:number,ay:number,bx:number,by:number,px:number,py:number){
  return (bx-ax)*(py-ay)-(by-ay)*(px-ax);
}
function segsIntersect(a:Coord,b:Coord,c:Coord,d:Coord):boolean{
  const d1=cross2d(c[0],c[1],d[0],d[1],a[0],a[1]),d2=cross2d(c[0],c[1],d[0],d[1],b[0],b[1]);
  const d3=cross2d(a[0],a[1],b[0],b[1],c[0],c[1]),d4=cross2d(a[0],a[1],b[0],b[1],d[0],d[1]);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
}
function ptInRing(pt:Coord,ring:Coord[]):boolean{
  let inside=false;const[x,y]=pt;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const[xi,yi]=ring[i],[xj,yj]=ring[j];
    if((yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi)inside=!inside;
  }
  return inside;
}
function segCrossesRings(a:Coord,b:Coord,rings:Coord[][]):boolean{
  const outer=rings[0];
  for(let i=0,j=outer.length-1;i<outer.length;j=i++)
    if(segsIntersect(a,b,outer[i],outer[j]))return true;
  return ptInRing(a,outer)||ptInRing(b,outer);
}
function ptOnLand(pt:Coord,land:LandFeature[]):boolean{
  for(const f of land){
    const g=f.geometry;
    if(g.type==='Polygon'&&ptInRing(pt,(g.coordinates as Coord[][])[0]))return true;
    if(g.type==='MultiPolygon')
      for(const poly of g.coordinates as Coord[][][])
        if(ptInRing(pt,poly[0]))return true;
  }
  return false;
}
function segCrossesLand(a:Coord,b:Coord,land:LandFeature[]):boolean{
  for(const f of land){
    const g=f.geometry;
    if(g.type==='Polygon'&&segCrossesRings(a,b,g.coordinates as Coord[][]))return true;
    if(g.type==='MultiPolygon')
      for(const poly of g.coordinates as Coord[][][])
        if(segCrossesRings(a,b,poly))return true;
  }
  return false;
}

// ── 核心几何：点在线段上的投影 ──────────────────────────────────────────────
/**
 * 将点 P 投影到线段 A→B 上，返回：
 *   t    - 投影参数（0=A点, 1=B点），已限制在 [0.05, 0.95] 避免贴近端点
 *   proj - 投影点的坐标
 */
function projectOnSegment(P: Coord, A: Coord, B: Coord): { t: number; proj: Coord } {
  const abx = B[0]-A[0], aby = B[1]-A[1];
  const apx = P[0]-A[0], apy = P[1]-A[1];
  const len2 = abx*abx + aby*aby;
  // 避免除以零（两点重合的退化情况）
  if (len2 < 1e-10) return { t: 0.5, proj: [(A[0]+B[0])/2, (A[1]+B[1])/2] };
  // t 限制在 [0.05, 0.95]：让 BU 至少距离两端 5%，避免 BU 和端点重合
  const t = Math.max(0.05, Math.min(0.95, (apx*abx + apy*aby) / len2));
  return { t, proj: [A[0]+t*abx, A[1]+t*aby] };
}

// ── 核心算法：为中间站点寻找分支单元（BU）位置 ─────────────────────────────
/**
 * 分支单元必须满足两个条件：
 *   1. 在海洋中（不在陆地上）
 *   2. 大致位于主干走廊上（位于 prevTrunk 和 nextStation 之间的区域）
 *
 * 算法步骤：
 *   Step1：把 station 投影到 prevTrunk→nextStation 直线，得到"理想 BU"
 *   Step2：如果理想 BU 在海洋里，直接用它（最常见的情况）
 *   Step3：如果理想 BU 在陆地上，从它开始向垂直主干方向移动，直到进入海洋
 *   Step4：如果以上都失败，尝试从 station 出发向 8 个方向寻找最近的海洋点
 */
function findBranchingUnit(
  station: Coord,
  prevTrunk: Coord,   // 主干上的前一个节点（BU 或端点）
  nextStation: Coord, // 主干上的后一个节点（原始站点或端点）
  land: LandFeature[]
): Coord {
  // Step1：投影到主干走廊线
  const { proj } = projectOnSegment(station, prevTrunk, nextStation);

  // Step2：理想情况——投影点在海洋里
  if (!ptOnLand(proj, land)) {
    return proj;
  }

  // Step3：投影在陆地上，沿垂直主干方向移动，直到到达海洋
  // 垂直方向有两个（主干的左侧和右侧），都要尝试
  const dx = nextStation[0]-prevTrunk[0], dy = nextStation[1]-prevTrunk[1];
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const perpL: Coord = [-dy/len,  dx/len];  // 主干左侧垂直方向
  const perpR: Coord = [ dy/len, -dx/len];  // 主干右侧垂直方向

  // 试探性移动距离从小到大（0.1° ≈ 11km，0.5° ≈ 55km，1.5° ≈ 165km）
  for (const dist of [0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 1.5, 2.0]) {
    for (const dir of [perpL, perpR]) {
      const cand: Coord = [proj[0]+dir[0]*dist, proj[1]+dir[1]*dist];
      // 超出合理经纬度范围则跳过
      if (cand[1] < -85 || cand[1] > 85) continue;
      if (!ptOnLand(cand, land)) return cand;
    }
  }

  // Step4：兜底——从 station 本身向 8 个方向寻找最近的海洋点
  // 这处理极端情况（如站点在岛中央，主干垂直方向也被陆地阻挡）
  for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]]) {
    for (const dist of [0.2, 0.5, 1.0, 2.0, 4.0]) {
      const cand: Coord = [station[0]+ddx*dist, station[1]+ddy*dist];
      if (!ptOnLand(cand, land)) return cand;
    }
  }

  // 最终兜底：直接用投影点（至少方向是对的）
  console.warn(`[branch-unit] 无法为 ${JSON.stringify(station)} 找到海洋中的 BU，使用原始投影点`);
  return proj;
}

// ── 反子午线修复 ──────────────────────────────────────────────────────────────
// 从东半球向西半球的太平洋跨越：-124°W → 236° 使路径连续向东
function fixAntiMeridian(coords: Coord[]): Coord[] {
  if (!coords.length) return coords;
  const result: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    let [lng, lat] = coords[i];
    const prev = result[i-1][0];
    if (prev > 100  && lng < -100) lng += 360;
    else if (prev > 260 && lng <    0) lng += 360;
    else if (prev < -100 && lng > 100) lng -= 360;
    result.push([lng, lat]);
  }
  return result;
}

// ── 主干轻量平滑（只处理明显的陆地穿越） ────────────────────────────────────
// 此时主干已由海洋中的 BU 组成，陆地穿越应该非常少，只需少量迭代
function smoothTrunk(coords: Coord[], land: LandFeature[]): Coord[] {
  let current = [...coords];
  for (let pass = 0; pass < 4; pass++) {
    const next: Coord[] = [current[0]];
    let changed = false;
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i], b = current[i+1];
      // 归一化到 -180~180 做陆地检测（land 数据使用标准坐标）
      const aN: Coord = [((a[0]+180)%360+360)%360-180, a[1]];
      const bN: Coord = [((b[0]+180)%360+360)%360-180, b[1]];
      if (segCrossesLand(aN, bN, land)) {
        const mid: Coord = [(aN[0]+bN[0])/2, (aN[1]+bN[1])/2];
        const ddx = -(bN[1]-aN[1]), ddy = bN[0]-aN[0];
        const dlen = Math.sqrt(ddx*ddx+ddy*ddy) || 1;
        let found = false;
        outer: for (const dist of [2,4,6,10]) {
          for (const sign of [1,-1]) {
            const cand: Coord = [mid[0]+ddx/dlen*dist*sign, mid[1]+ddy/dlen*dist*sign];
            if (cand[1]<-85||cand[1]>85) continue;
            if (ptOnLand(cand,land)) continue;
            if (!segCrossesLand(aN,cand,land) && !segCrossesLand(cand,bN,land)) {
              // 转回扩展坐标系
              let lng = cand[0];
              if (a[0] > 180 && lng < 0) lng += 360;
              next.push([lng, cand[1]]);
              changed = true; found = true;
              break outer;
            }
          }
        }
        if (!found) { /* 无法绕行，接受当前线段 */ }
      }
      next.push(b);
    }
    current = next;
    if (!changed) break;
  }
  return current;
}

// ── 陆地数据缓存 ─────────────────────────────────────────────────────────────
let landCache: LandFeature[] | null = null;
async function getLand(): Promise<LandFeature[]> {
  if (landCache) return landCache;
  const res = await fetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`陆地数据加载失败 HTTP ${res.status}`);
  landCache = ((await res.json()) as { features: LandFeature[] }).features;
  return landCache;
}

async function clearCache() {
  const url=process.env.UPSTASH_REDIS_REST_URL, tok=process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url||!tok) return;
  await fetch(`${url}/pipeline`,{
    method:'POST',
    headers:{Authorization:`Bearer ${tok}`,'Content-Type':'application/json'},
    body:JSON.stringify([['del','cables:geo:details'],['del','cables:geo'],['del','cables:list']]),
  }).catch(()=>{});
}

// ── POST 处理器 ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await req.json() as { slug?: string };
  if (!slug?.trim()) return NextResponse.json({ error: 'slug 必填' }, { status: 400 });

  // ① 读取海缆，获取当前 routeGeojson（骨架）和登陆站
  const cable = await prisma.cable.findUnique({
    where: { slug },
    select: {
      id: true, name: true, routeGeojson: true,
      landingStations: {
        select: { landingStation: { select: { latitude: true, longitude: true, name: true } } },
      },
    },
  });
  if (!cable) return NextResponse.json({ error: `找不到：${slug}` }, { status: 404 });

  // ② 从当前 routeGeojson 提取有序骨架坐标
  //    这些坐标代表用户在拓扑编辑器里指定的站点顺序——端到端的有序序列
  let orderedCoords: Coord[] = [];
  if (cable.routeGeojson) {
    const geo = cable.routeGeojson as { type: string; coordinates: unknown };
    if (geo.type === 'LineString') {
      orderedCoords = (geo.coordinates as number[][]).map(c => [c[0], c[1]] as Coord);
    } else if (geo.type === 'MultiLineString') {
      // MultiLineString：取第一段（主干），忽略之前的支线
      orderedCoords = ((geo.coordinates as number[][][])[0]).map(c => [c[0], c[1]] as Coord);
    }
  }

  // 如果没有现有路由，退回到登陆站经度排序
  if (orderedCoords.length < 2) {
    const sorted = cable.landingStations
      .map(ls => ls.landingStation)
      .filter(s => s.latitude != null && s.longitude != null)
      .sort((a, b) => (a.longitude??0) - (b.longitude??0));
    if (sorted.length < 2) return NextResponse.json({ error: '坐标不足' }, { status: 422 });
    orderedCoords = sorted.map(s => [s.longitude!, s.latitude!] as Coord);
  }

  // 反子午线归一化：把 > 180° 的扩展坐标转回标准坐标，方便后续几何计算
  // （最后输出时再把端点附近的坐标转回扩展坐标系）
  const normalized = orderedCoords.map(c => {
    let lng = c[0];
    if (lng > 180) lng -= 360; // e.g. 236 → -124
    return [lng, c[1]] as Coord;
  });

  // ③ 加载陆地多边形数据
  let land: LandFeature[];
  try {
    land = await getLand();
  } catch (e: unknown) {
    return NextResponse.json({ error: `陆地数据加载失败：${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }

  const n = normalized.length;

  // ④ 核心：构建分支单元（BU）序列
  //
  //  规则：
  //  - 第一个和最后一个坐标点是端点，主干直接连接（这些是登陆站本身）
  //  - 中间的每个坐标点是中间登陆站，为它计算 BU 位置
  //
  //  BU 计算是迭代的：每个 BU 依赖于前一个 BU（已确认在海洋中），
  //  这样主干上的每个节点都是已验证的海洋节点。
  const branchingUnits: Coord[] = [normalized[0]]; // 端点1直接加入
  const spurs: Coord[][] = [];                       // 各中间站的引支线

  for (let i = 1; i < n - 1; i++) {
    const station   = normalized[i];
    const prevTrunk = branchingUnits[branchingUnits.length - 1]; // 前一个已确认的BU
    const nextPoint = normalized[i + 1];                          // 后一个站（暂用原始坐标）

    const bu = findBranchingUnit(station, prevTrunk, nextPoint, land);
    branchingUnits.push(bu);

    // 生成从 BU 到登陆站的引支线（短，只需跨越海岸进入港口）
    spurs.push([bu, station]);

    console.log(`[branch-unit] 站点 ${i}/${n-1}: ${JSON.stringify(station)} → BU: ${JSON.stringify(bu)}`);
  }

  branchingUnits.push(normalized[n - 1]); // 端点2直接加入

  // ⑤ 修复反子午线：太平洋跨越段 -124° → 236°
  const trunk = fixAntiMeridian(branchingUnits);

  // ⑥ 对主干做最后一轮陆地平滑（此时应该极少有问题，但做保险）
  const smoothedTrunk = smoothTrunk(trunk, land);

  // ⑦ 组合成 MultiLineString：[主干, 引支线1, 引支线2, ...]
  const newGeojson = {
    type: 'MultiLineString',
    coordinates: [smoothedTrunk, ...spurs],
  };

  await prisma.cable.update({
    where: { id: cable.id },
    data:  { routeGeojson: newGeojson, isApproximateRoute: true },
  });
  await clearCache();

  return NextResponse.json({
    message: `BU路由完成：主干 ${smoothedTrunk.length} 节点 + ${spurs.length} 条引支线`,
    trunkPoints: smoothedTrunk.length,
    spurCount:   spurs.length,
    details:     spurs.map((s, i) => ({
      stationIndex: i + 1,
      bu:      s[0],
      station: s[1],
      spurLengthDeg: Math.hypot(s[0][0]-s[1][0], s[0][1]-s[1][1]).toFixed(3),
    })),
  });
}

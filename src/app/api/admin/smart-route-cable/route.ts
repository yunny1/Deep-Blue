// src/app/api/admin/smart-route-cable/route.ts
//
// 智能路由接口：从数据库中已有的、路由坐标正确的海缆里提取参考航路点，
// 为目标海缆生成更准确的路由路径。同时修复反子午线（太平洋跨越）问题。
//
// 核心思路：
//   SEA-ME-WE、PEACE Cable、Asia Link Cable 等主干缆在数据库里
//   已有精确到几公里级别的真实 routeGeojson，这比任何规则算法都可靠。
//   我们把目标缆的"骨架坐标"（当前 routeGeojson 的各点）两两配对，
//   对每一段在数据库里寻找走过相同走廊的参考缆坐标，
//   将这些坐标插入作为航路点，让路径自然地贴着真实海缆走廊前进。
//
//   反子午线修复：从关岛 144°E 到俄勒冈 -124°W，直接用 -124 地图会画反方向。
//   修复方法：-124 + 360 = 236，地图渲染引擎就会向东跨越太平洋。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';
import { Prisma } from '@prisma/client';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

type Coord = [number, number]; // [经度, 纬度]

// 陆地多边形特征的类型，只关心 geometry 字段
interface LandFeature {
  geometry: { type: string; coordinates: unknown };
}

// ── 几何计算（纯原生，无外部依赖） ───────────────────────────────────────────

/** 计算点 P 在线段 A→B 上的投影参数 t，以及垂直距离 */
function projectToSegment(p: Coord, a: Coord, b: Coord): { t: number; perpDist: number } {
  const abx = b[0]-a[0], aby = b[1]-a[1];
  const len2 = abx*abx + aby*aby;
  if (len2 < 1e-10) return { t: 0, perpDist: Math.hypot(p[0]-a[0], p[1]-a[1]) };
  const t = ((p[0]-a[0])*abx + (p[1]-a[1])*aby) / len2;
  const perpDist = Math.abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / Math.sqrt(len2);
  return { t, perpDist };
}

/** 判断点 P 是否在 A→B 走廊内（垂直距离 <= perpTol，沿方向在两端各允许 8% 延伸） */
function inCorridor(p: Coord, a: Coord, b: Coord, perpTol: number): boolean {
  const { t, perpDist } = projectToSegment(p, a, b);
  return t >= -0.08 && t <= 1.08 && perpDist <= perpTol;
}

/** 按投影值排序并空间去重（距离 < minGap 的相邻点合并） */
function sortAndDedupe(pts: Coord[], a: Coord, b: Coord, minGap = 0.35): Coord[] {
  const withT = pts.map(p => ({ p, t: projectToSegment(p, a, b).t }));
  withT.sort((x, y) => x.t - y.t);
  const out: Coord[] = [];
  for (const { p } of withT) {
    if (!out.length) { out.push(p); continue; }
    const last = out[out.length-1];
    if (Math.hypot(p[0]-last[0], p[1]-last[1]) >= minGap) out.push(p);
  }
  return out;
}

// ── 反子午线修复 ──────────────────────────────────────────────────────────────
/**
 * 太平洋跨越时，把 -124°（俄勒冈）改为 236°（= -124+360），
 * 这样坐标系是连续的，地图渲染引擎就会向东画弧线而不是向西穿越大陆。
 * MapLibre 和 CesiumJS 都支持 > 180° 的扩展经度坐标。
 */
function fixAntiMeridian(coords: Coord[]): Coord[] {
  if (!coords.length) return coords;
  const result: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    let [lng, lat] = coords[i];
    const prev = result[i-1][0];
    // 从东半球（>100°）到西半球负经度（<-100°）→ 加 360 使坐标连续
    if (prev > 100 && lng < -100) lng += 360;
    // 已经在扩展坐标系（>260°），继续加 360
    else if (prev > 260 && lng < 0) lng += 360;
    // 反向（从扩展坐标回到正常，极少见）
    else if (prev < -100 && lng > 100) lng -= 360;
    result.push([lng, lat]);
  }
  return result;
}

// ── 陆地检测（纯原生几何） ────────────────────────────────────────────────────
function cross2d(ax:number,ay:number,bx:number,by:number,px:number,py:number) {
  return (bx-ax)*(py-ay)-(by-ay)*(px-ax);
}
function segsIntersect(a:Coord,b:Coord,c:Coord,d:Coord): boolean {
  const d1=cross2d(c[0],c[1],d[0],d[1],a[0],a[1]);
  const d2=cross2d(c[0],c[1],d[0],d[1],b[0],b[1]);
  const d3=cross2d(a[0],a[1],b[0],b[1],c[0],c[1]);
  const d4=cross2d(a[0],a[1],b[0],b[1],d[0],d[1]);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
}
function ptInRing(pt:Coord,ring:Coord[]): boolean {
  let inside=false; const [x,y]=pt;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i],[xj,yj]=ring[j];
    if ((yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function segCrossesRings(a:Coord,b:Coord,rings:Coord[][]): boolean {
  const outer=rings[0];
  for (let i=0,j=outer.length-1;i<outer.length;j=i++)
    if (segsIntersect(a,b,outer[i],outer[j])) return true;
  return ptInRing(a,outer)||ptInRing(b,outer);
}
function segCrossesLand(a:Coord,b:Coord,land:LandFeature[]): boolean {
  for (const f of land) {
    const g=f.geometry;
    if (g.type==='Polygon' && segCrossesRings(a,b,g.coordinates as Coord[][])) return true;
    if (g.type==='MultiPolygon')
      for (const poly of g.coordinates as Coord[][][])
        if (segCrossesRings(a,b,poly)) return true;
  }
  return false;
}
function ptOnLand(pt:Coord,land:LandFeature[]): boolean {
  for (const f of land) {
    const g=f.geometry;
    if (g.type==='Polygon' && ptInRing(pt,(g.coordinates as Coord[][])[0])) return true;
    if (g.type==='MultiPolygon')
      for (const poly of g.coordinates as Coord[][][])
        if (ptInRing(pt,poly[0])) return true;
  }
  return false;
}

// ── 陆地数据内存缓存 ──────────────────────────────────────────────────────────
let landCache: LandFeature[] | null = null;
async function getLand(): Promise<LandFeature[]> {
  if (landCache) return landCache;
  const res = await fetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`陆地数据加载失败 HTTP ${res.status}`);
  const j = await res.json() as { features: LandFeature[] };
  landCache = j.features;
  return landCache;
}

// ── Redis 缓存清除 ────────────────────────────────────────────────────────────
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

  // ① 读取目标海缆
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

  // ② 提取骨架坐标（当前 routeGeojson 的主干，或退回登陆站经度排序）
  let skeleton: Coord[] = [];
  if (cable.routeGeojson) {
    const geo = cable.routeGeojson as { type: string; coordinates: unknown };
    if (geo.type === 'LineString')
      skeleton = (geo.coordinates as number[][]).map(c => [c[0],c[1]] as Coord);
    else if (geo.type === 'MultiLineString')
      skeleton = ((geo.coordinates as number[][][])[0]).map(c => [c[0],c[1]] as Coord);
  }
  if (skeleton.length < 2) {
    const sorted = cable.landingStations
      .map(ls => ls.landingStation)
      .filter(s => s.latitude != null && s.longitude != null)
      .sort((a,b) => (a.longitude??0)-(b.longitude??0));
    if (sorted.length < 2) return NextResponse.json({ error: '坐标不足' }, { status: 422 });
    skeleton = sorted.map(s => [s.longitude!, s.latitude!] as Coord);
  }

  // ③ 从数据库加载参考海缆（限 150 条，跳过无路由的和自身）
  const refCables = await prisma.cable.findMany({
    where: { slug: { not: slug }, routeGeojson: { not: Prisma.DbNull }, status: { not: 'REMOVED' } },
    select: { name: true, routeGeojson: true },
    take: 150,
  });

  // 提取参考坐标池（每隔 3 个采样一次，控制内存和计算量）
  const refPool: Coord[] = [];
  for (const rc of refCables) {
    if (!rc.routeGeojson) continue;
    const geo = rc.routeGeojson as { type: string; coordinates: unknown };
    try {
      if (geo.type === 'LineString') {
        const cs = geo.coordinates as number[][];
        for (let i = 0; i < cs.length; i += 3) refPool.push([cs[i][0], cs[i][1]]);
      } else if (geo.type === 'MultiLineString') {
        for (const line of geo.coordinates as number[][][])
          for (let i = 0; i < line.length; i += 3) refPool.push([line[i][0], line[i][1]]);
      }
    } catch { /* 跳过解析失败的缆 */ }
  }

  // ④ 核心：对每段骨架，在走廊内寻找参考航路点并插入
  //
  //  走廊宽度策略：
  //   - 骨架段 < 10°（东南亚短段）→ ±3.5°，精确贴合狭窄海峡走廊
  //   - 骨架段 10–30°（中程段）  → ±5°，平衡精度和覆盖
  //   - 骨架段 > 30°（跨洋长段）→ ±9°，跨洋区域需要宽走廊才能收到参考点
  const refined: Coord[] = [skeleton[0]];
  for (let i = 0; i < skeleton.length - 1; i++) {
    const a = skeleton[i], b = skeleton[i+1];
    const segLen = Math.hypot(b[0]-a[0], b[1]-a[1]);
    const perpTol = segLen > 30 ? 9 : segLen > 10 ? 5 : 3.5;

    const hits = refPool.filter(p => inCorridor(p, a, b, perpTol));
    if (hits.length > 0) {
      const sorted = sortAndDedupe(hits, a, b);
      refined.push(...sorted);
    }
    refined.push(b);
  }

  // ⑤ 修复反子午线（太平洋段 -124° → 236°）
  const amFixed = fixAntiMeridian(refined);

  // ⑥ 最后一轮陆地检测和修复（此时路径已大幅改善，修复量应很小）
  let final = amFixed;
  try {
    const land = await getLand();
    for (let pass = 0; pass < 5; pass++) {
      const next: Coord[] = [final[0]];
      let changed = false;
      for (let i = 0; i < final.length - 1; i++) {
        const a = final[i], b = final[i+1];
        // 归一化到 -180~180 再做陆地检测（因为扩展坐标 land 数据无法直接处理）
        const aN: Coord = [((a[0]+180)%360+360)%360-180, a[1]];
        const bN: Coord = [((b[0]+180)%360+360)%360-180, b[1]];
        if (segCrossesLand(aN, bN, land)) {
          const mid: Coord = [(aN[0]+bN[0])/2, (aN[1]+bN[1])/2];
          const dx = -(bN[1]-aN[1]), dy = bN[0]-aN[0];
          const len = Math.sqrt(dx*dx+dy*dy)||1;
          let found = false;
          outer: for (const dist of [2,4,6,10]) {
            for (const sign of [1,-1]) {
              const cand: Coord = [mid[0]+dx/len*dist*sign, mid[1]+dy/len*dist*sign];
              if (cand[1]<-85||cand[1]>85) continue;
              if (ptOnLand(cand,land)) continue;
              if (!segCrossesLand(aN,cand,land) && !segCrossesLand(cand,bN,land)) {
                let lng = cand[0];
                if (a[0] > 180 && lng < 0) lng += 360;
                next.push([lng, cand[1]]);
                changed = true; found = true;
                break outer;
              }
            }
          }
          if (!found) { /* 无法找到绕行点，保留原始直线 */ }
        }
        next.push(b);
      }
      final = next;
      if (!changed) break;
    }
  } catch (e) {
    console.warn('[smart-route] 陆地数据加载失败，跳过陆地检测：', e);
  }

  // ⑦ 写回数据库并清除缓存
  await prisma.cable.update({
    where: { id: cable.id },
    data:  { routeGeojson: { type: 'LineString', coordinates: final }, isApproximateRoute: true },
  });
  await clearCache();

  return NextResponse.json({
    message: `智能路由完成：参考 ${refCables.length} 条海缆，${skeleton.length} → ${final.length} 个坐标点`,
    refCablesUsed: refCables.length,
    skeletonPoints: skeleton.length,
    finalPoints: final.length,
  });
}

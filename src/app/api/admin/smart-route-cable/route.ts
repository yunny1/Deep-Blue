// src/app/api/admin/smart-route-cable/route.ts
//
// 智能路由 v2 — 修复参考坐标过多导致蜘蛛网的问题
//
// 核心改动：
//   - 走廊宽度从 ±9° 压缩到 ±3°（东南亚短段）/ ±4°（跨洋长段）
//   - 每段最多保留 5 个最接近中心线的参考点（不再收集所有在走廊内的点）
//   - 去重间距从 0.35° 提高到 1.5°（相邻参考点之间保持足够间隔）
//   - 这三个变化共同保证参考点"精而不滥"

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';
import { Prisma } from '@prisma/client';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

type Coord = [number, number];

interface LandFeature {
  geometry: { type: string; coordinates: unknown };
}

// ── 几何工具 ──────────────────────────────────────────────────────────────────

function projectToSegment(p: Coord, a: Coord, b: Coord): { t: number; perpDist: number } {
  const abx = b[0]-a[0], aby = b[1]-a[1];
  const len2 = abx*abx + aby*aby;
  if (len2 < 1e-10) return { t: 0, perpDist: Math.hypot(p[0]-a[0], p[1]-a[1]) };
  const t = ((p[0]-a[0])*abx + (p[1]-a[1])*aby) / len2;
  const perpDist = Math.abs((b[0]-a[0])*(a[1]-p[1]) - (a[0]-p[0])*(b[1]-a[1])) / Math.sqrt(len2);
  return { t, perpDist };
}

// 判断点是否在走廊内（关键参数：perpTol 越小，走廊越窄，收到的参考点越精准）
function inCorridor(p: Coord, a: Coord, b: Coord, perpTol: number): boolean {
  const { t, perpDist } = projectToSegment(p, a, b);
  return t >= -0.05 && t <= 1.05 && perpDist <= perpTol;
}

// 按投影值排序 + 去重（minGap 较大，保证参考点稀疏分布，不产生密集锯齿）
function sortAndDedupe(pts: Coord[], a: Coord, b: Coord, minGap: number): Coord[] {
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
// 从关岛 144°E 到俄勒冈 -124°W：把 -124 改成 236（= -124+360）
// 这样坐标连续递增，地图渲染引擎向东画弧线穿越太平洋，而不是向西穿越大陆
function fixAntiMeridian(coords: Coord[]): Coord[] {
  if (!coords.length) return coords;
  const result: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    let [lng, lat] = coords[i];
    const prev = result[i-1][0];
    if (prev > 100  && lng < -100) lng += 360;  // 东→西半球（太平洋跨越）
    else if (prev > 260 && lng < 0) lng += 360;  // 已在扩展坐标系，继续延伸
    else if (prev < -100 && lng > 100) lng -= 360; // 反向（罕见）
    result.push([lng, lat]);
  }
  return result;
}

// ── 陆地检测（纯原生，无外部依赖） ────────────────────────────────────────────
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

  // ① 提取骨架坐标（当前路由的主干，作为方向指引）
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

  // ② 加载参考海缆（排除自身，限 150 条）
  const refCables = await prisma.cable.findMany({
    where: { slug: { not: slug }, routeGeojson: { not: Prisma.DbNull }, status: { not: 'REMOVED' } },
    select: { name: true, routeGeojson: true },
    take: 150,
  });

  // 提取参考坐标（每隔 5 个采样一次，比之前的每隔 3 个更稀疏，减少噪音）
  const refPool: Coord[] = [];
  for (const rc of refCables) {
    if (!rc.routeGeojson) continue;
    const geo = rc.routeGeojson as { type: string; coordinates: unknown };
    try {
      if (geo.type === 'LineString') {
        const cs = geo.coordinates as number[][];
        for (let i = 0; i < cs.length; i += 5) refPool.push([cs[i][0], cs[i][1]]);
      } else if (geo.type === 'MultiLineString') {
        for (const line of geo.coordinates as number[][][])
          for (let i = 0; i < line.length; i += 5) refPool.push([line[i][0], line[i][1]]);
      }
    } catch { /* 跳过解析失败的缆 */ }
  }

  // ③ 核心改进：严格的走廊过滤 + 数量限制
  //
  //  关键参数说明（这三个数字决定路由质量）：
  //  ┌─────────────────────────────────────────────────────────────────────┐
  //  │ perpTol（走廊宽度）：垂直走廊半宽，越小越严格，越不容易引入旁路噪音    │
  //  │   短段 <10°: ±2°   （东南亚精细走廊，只取非常贴近的参考点）            │
  //  │   中段10-30°: ±3°  （中程段，适度宽松）                               │
  //  │   长段 >30°: ±4°   （跨洋段，宽但可控）                               │
  //  │                                                                       │
  //  │ MAX_PER_SEG = 5    ：每段最多插入 5 个参考点（防止爆炸性增长）          │
  //  │                                                                       │
  //  │ minGap = 1.5°      ：相邻参考点最小间距（保证分布稀疏均匀）            │
  //  └─────────────────────────────────────────────────────────────────────┘
  const MAX_PER_SEG = 5;
  const MIN_GAP     = 1.5;

  const refined: Coord[] = [skeleton[0]];
  for (let i = 0; i < skeleton.length - 1; i++) {
    const a = skeleton[i], b = skeleton[i+1];
    const segLen = Math.hypot(b[0]-a[0], b[1]-a[1]);

    // 走廊宽度根据段长度动态调整
    const perpTol = segLen > 30 ? 4 : segLen > 10 ? 3 : 2;

    // 筛选走廊内的参考点
    const hits = refPool.filter(p => inCorridor(p, a, b, perpTol));

    if (hits.length > 0) {
      // 【关键改进】按垂直距离排序，优先选择最接近中心线的点
      // 这样选出的参考点是最"代表性"的，而不是随机的走廊内点
      const byPerp = hits
        .map(p => ({ p, perp: projectToSegment(p, a, b).perpDist }))
        .sort((x, y) => x.perp - y.perp)
        .slice(0, MAX_PER_SEG * 8)  // 先取最近的一批候选
        .map(({ p }) => p);

      // 按方向排序、去重（间距 1.5°），最终保留不超过 MAX_PER_SEG 个
      const sorted = sortAndDedupe(byPerp, a, b, MIN_GAP).slice(0, MAX_PER_SEG);
      if (sorted.length > 0) {
        refined.push(...sorted);
      }
    }

    refined.push(b);
  }

  // ④ 修复反子午线（-124°W → 236°，使太平洋段连续向东）
  const amFixed = fixAntiMeridian(refined);

  // ⑤ 最后陆地穿越修复（此时路径已经相当合理，只需处理边缘情况）
  let final = amFixed;
  try {
    const land = await getLand();
    for (let pass = 0; pass < 5; pass++) {
      const next: Coord[] = [final[0]];
      let changed = false;
      for (let i = 0; i < final.length - 1; i++) {
        const a = final[i], b = final[i+1];
        // 归一化到 -180~180 做陆地检测（land 数据不含扩展坐标）
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
          if (!found) { /* 无法绕行，保留原始线段 */ }
        }
        next.push(b);
      }
      final = next;
      if (!changed) break;
    }
  } catch (e) {
    console.warn('[smart-route] 陆地数据加载失败，跳过陆地检测：', e);
  }

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

/**
 * fix-cable-routes.ts
 * 
 * 批量补全海缆路由数据。
 * 使用 A* 海洋网格寻路，保证路径不穿越陆地。
 * 
 * 用法：cd /home/ubuntu/deep-blue && npx tsx scripts/fix-cable-routes.ts
 * 
 * 分两轮处理：
 *   轮1：完全无路由的海缆（257条）→ 用登陆站坐标生成全新路由
 *   轮2：路由不完整的海缆（184条）→ 在现有路由基础上补全缺失段
 */

import { PrismaClient } from '@prisma/client';
import { generateApproximateRoute, haversineKm } from '../src/lib/great-circle';

const prisma = new PrismaClient();

interface StationCoord {
  lat: number;
  lon: number;
  name?: string;
  countryCode?: string;
}

// ============================================================
// 工具函数
// ============================================================

/** 从海缆的登陆站提取有效坐标 */
function extractStations(cable: any): StationCoord[] {
  return cable.landingStations
    .map((cls: any) => cls.landingStation)
    .filter((ls: any) => ls.latitude != null && ls.longitude != null && !isNaN(ls.latitude) && !isNaN(ls.longitude))
    .map((ls: any) => ({
      lat: ls.latitude,
      lon: ls.longitude,
      name: ls.name,
      countryCode: ls.countryCode,
    }));
}

/** 检查路由是否覆盖所有登陆站（经度范围） */
function checkRouteCoverage(geo: any, stations: StationCoord[]): { complete: boolean; missingStations: StationCoord[] } {
  if (!geo || !geo.coordinates) return { complete: false, missingStations: stations };
  
  const coords = geo.type === 'MultiLineString' ? geo.coordinates.flat() : geo.coordinates;
  if (coords.length < 3) return { complete: false, missingStations: stations };
  
  const lons = coords.map((c: number[]) => c[0]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  
  const missing = stations.filter(s => s.lon < minLon - 5 || s.lon > maxLon + 5);
  return { complete: missing.length === 0, missingStations: missing };
}

/** 合并旧路由和补全段 */
function mergeRoutes(existing: any, supplement: any): any {
  if (!existing) return supplement;
  if (!supplement) return existing;
  
  // 将两个 GeoJSON 合并为 MultiLineString
  const getSegments = (geo: any): number[][][] => {
    if (geo.type === 'MultiLineString') return geo.coordinates;
    if (geo.type === 'LineString') return [geo.coordinates];
    return [];
  };
  
  const allSegments = [...getSegments(existing), ...getSegments(supplement)];
  if (allSegments.length === 1) return { type: 'LineString', coordinates: allSegments[0] };
  return { type: 'MultiLineString', coordinates: allSegments };
}

// ============================================================
// 轮1：完全无路由
// ============================================================

async function fixNoRoute() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  轮1：补全无路由海缆                       ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const cables = await prisma.cable.findMany({
    where: {
      routeGeojson: null,
      status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] },
    },
    select: {
      id: true, slug: true, name: true,
      landingStations: { select: { landingStation: { select: { name: true, countryCode: true, latitude: true, longitude: true } } } },
    },
  });

  console.log(`找到 ${cables.length} 条无路由海缆\n`);

  let success = 0, skip = 0, fail = 0;

  for (let i = 0; i < cables.length; i++) {
    const cable = cables[i];
    const stations = extractStations(cable);

    if (stations.length < 2) {
      skip++;
      continue;
    }

    try {
      const route = generateApproximateRoute(stations);
      if (route) {
        const coords = route.type === 'MultiLineString' 
          ? (route.coordinates as number[][][]).flat() 
          : route.coordinates as number[][];
        
        await prisma.cable.update({
          where: { id: cable.id },
          data: { 
            routeGeojson: route as any,
            isApproximateRoute: true,
          },
        });
        success++;
      } else {
        fail++;
      }
    } catch (e) {
      fail++;
    }

    // 进度
    if ((i + 1) % 20 === 0 || i === cables.length - 1) {
      console.log(`  [${i + 1}/${cables.length}] ✅${success} ⏭${skip} ❌${fail} — ${cable.slug}`);
    }
  }

  console.log(`\n轮1 完成: ✅${success} 成功, ⏭${skip} 跳过(登陆站<2), ❌${fail} 失败`);
  return success;
}

// ============================================================
// 轮2：路由不完整
// ============================================================

async function fixIncompleteRoute() {
  console.log('\n╔═══════════════════════════════════════════╗');
  console.log('║  轮2：补全路由不完整海缆                    ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const cables = await prisma.cable.findMany({
    where: {
      routeGeojson: { not: null },
      status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] },
    },
    select: {
      id: true, slug: true, name: true, routeGeojson: true,
      landingStations: { select: { landingStation: { select: { name: true, countryCode: true, latitude: true, longitude: true } } } },
    },
  });

  let checked = 0, patched = 0, skip = 0, fail = 0;

  for (let i = 0; i < cables.length; i++) {
    const cable = cables[i];
    const stations = extractStations(cable);
    if (stations.length < 2) { skip++; continue; }

    const { complete, missingStations } = checkRouteCoverage(cable.routeGeojson, stations);
    if (complete) { skip++; continue; }
    checked++;

    // 找到现有路由的端点
    const geo = cable.routeGeojson as any;
    const coords = geo.type === 'MultiLineString' ? geo.coordinates.flat() : geo.coordinates;
    const routeLons = coords.map((c: number[]) => c[0]);
    const routeMinLon = Math.min(...routeLons);
    const routeMaxLon = Math.max(...routeLons);
    
    // 找到路由的东端和西端坐标
    const eastEnd = coords.reduce((a: number[], b: number[]) => b[0] > a[0] ? b : a);
    const westEnd = coords.reduce((a: number[], b: number[]) => b[0] < a[0] ? b : a);

    // 对每个缺失的登陆站，从最近的路由端点补一段
    const supplementStations: StationCoord[] = [];
    
    for (const ms of missingStations) {
      // 判断缺失站在路由的哪一侧
      if (ms.lon > routeMaxLon) {
        // 在东侧，从东端补
        supplementStations.push({ lat: eastEnd[1], lon: eastEnd[0], name: 'route-east-end' });
        supplementStations.push(ms);
      } else if (ms.lon < routeMinLon) {
        // 在西侧，从西端补
        supplementStations.push({ lat: westEnd[1], lon: westEnd[0], name: 'route-west-end' });
        supplementStations.push(ms);
      }
    }

    if (supplementStations.length < 2) { skip++; continue; }

    try {
      // 按经度排序后生成补全路由
      const ordered = supplementStations.sort((a, b) => a.lon - b.lon);
      // 去重
      const deduped: StationCoord[] = [];
      for (const s of ordered) {
        if (!deduped.some(d => Math.abs(d.lat - s.lat) < 0.3 && Math.abs(d.lon - s.lon) < 0.3)) {
          deduped.push(s);
        }
      }

      if (deduped.length < 2) { skip++; continue; }

      const supplement = generateApproximateRoute(deduped);
      if (supplement) {
        const merged = mergeRoutes(cable.routeGeojson, supplement);
        await prisma.cable.update({
          where: { id: cable.id },
          data: { routeGeojson: merged as any },
        });
        patched++;
      } else {
        fail++;
      }
    } catch (e) {
      fail++;
    }

    if ((checked) % 15 === 0 || i === cables.length - 1) {
      console.log(`  [${i + 1}/${cables.length}] 检查${checked} ✅${patched} ⏭${skip} ❌${fail} — ${cable.slug}`);
    }
  }

  console.log(`\n轮2 完成: 检查${checked}条, ✅${patched} 补全, ⏭${skip} 已完整/跳过, ❌${fail} 失败`);
  return patched;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🔧 海缆路由批量补全');
  console.log('═══════════════════════════════════════════');
  
  const t0 = Date.now();
  
  const r1 = await fixNoRoute();
  const r2 = await fixIncompleteRoute();
  
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  
  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ 全部完成 (${elapsed}s)`);
  console.log(`   轮1 无路由补全: ${r1} 条`);
  console.log(`   轮2 不完整补全: ${r2} 条`);
  console.log('═══════════════════════════════════════════');
  console.log('\n后续步骤:');
  console.log('  rm -rf .next/cache');
  console.log('  npm run build');
  console.log('  kill -9 $(lsof -t -i:3000) 2>/dev/null; sleep 1');
  console.log('  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});

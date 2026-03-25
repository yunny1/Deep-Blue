/**
 * generate-approximate-routes.ts
 * 
 * 一次性脚本：为有登陆站坐标但无 routeGeojson 的 SN 海缆生成大圆弧近似路由
 * 
 * 工作流程：
 * 1. 查询所有 routeGeojson 为 NULL 且 mergedInto 为 NULL 的活跃海缆
 * 2. 对每条海缆，获取其登陆站中有坐标的站点
 * 3. 用大圆弧算法生成近似路由 GeoJSON
 * 4. 写入 routeGeojson + 标记 isApproximateRoute = true
 * 
 * 安全机制：
 * - 默认 DRY_RUN，只打印会生成的路由信息
 * - EXECUTE=true 时才写入数据库
 * - 只处理 routeGeojson 为 NULL 的记录，绝不覆盖已有路由
 * 
 * 用法：
 *   DRY_RUN:  npx tsx scripts/generate-approximate-routes.ts
 *   EXECUTE:  EXECUTE=true npx tsx scripts/generate-approximate-routes.ts
 * 
 * 路径：scripts/generate-approximate-routes.ts
 */

import { PrismaClient } from '@prisma/client';
import { generateApproximateRoute, haversineKm } from '../src/lib/great-circle';

const EXECUTE = process.env.EXECUTE === 'true';

async function main() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[近似路由生成] ${EXECUTE ? '🔥 EXECUTE MODE' : '👀 DRY RUN MODE'}`);
  console.log(`${'='.repeat(60)}\n`);

  const prisma = new PrismaClient();

  try {
    // Step 0: 确保 DB 字段存在（幂等）
    await prisma.$executeRawUnsafe(
      `ALTER TABLE cables ADD COLUMN IF NOT EXISTS is_approximate_route BOOLEAN DEFAULT FALSE`
    ).catch(() => {});

    // Step 1: 查询所有无路由的活跃海缆（排除已合并和已移除的）
    // routeGeojson 是 Json 类型，Prisma 不支持直接用 null 查询，用 raw SQL
    const cablesNoRoute: any[] = await prisma.$queryRawUnsafe(`
      SELECT c.id, c.name, c.slug, c.status, c.data_source
      FROM cables c
      WHERE c.route_geojson IS NULL
        AND c.merged_into IS NULL
        AND (c.status != 'REMOVED' OR c.status IS NULL)
      ORDER BY c.name
    `);

    console.log(`[Step 1] 找到 ${cablesNoRoute.length} 条无路由的活跃海缆\n`);

    if (cablesNoRoute.length === 0) {
      console.log('所有海缆都已有路由，无需处理。');
      return;
    }

    // Step 2: 逐条处理
    const stats = {
      total: cablesNoRoute.length,
      generated: 0,
      tooFewStations: 0,
      noCoordinates: 0,
      skipped: 0,
    };

    for (const cable of cablesNoRoute) {
      // 获取该海缆的登陆站（含坐标）
      const stations: any[] = await prisma.$queryRawUnsafe(`
        SELECT ls.name, ls.latitude, ls.longitude, ls.country_code
        FROM cable_landing_stations cls
        JOIN landing_stations ls ON cls.landing_station_id = ls.id
        WHERE cls.cable_id = $1
          AND ls.latitude IS NOT NULL
          AND ls.longitude IS NOT NULL
      `, cable.id);

      if (stations.length === 0) {
        stats.noCoordinates++;
        continue;
      }

      if (stations.length < 2) {
        stats.tooFewStations++;
        continue;
      }

      // 生成大圆弧近似路由
      const stationCoords = stations.map(s => ({
        lat: parseFloat(s.latitude),
        lon: parseFloat(s.longitude),
        name: s.name,
      }));

      const routeGeo = generateApproximateRoute(stationCoords);

      if (!routeGeo) {
        stats.tooFewStations++;
        continue;
      }

      // 计算近似总长度
      let totalKm = 0;
      const coords = routeGeo.type === 'MultiLineString'
        ? (routeGeo.coordinates as number[][][])
        : [routeGeo.coordinates as number[][]];
      for (const line of coords) {
        for (let i = 0; i < line.length - 1; i++) {
          totalKm += haversineKm(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0]);
        }
      }

      console.log(`  [${cable.name}] ${stations.length} 站 → ${routeGeo.type}, ~${Math.round(totalKm)} km`);
      for (const s of stationCoords) {
        console.log(`    • ${s.name || 'unnamed'} (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`);
      }

      if (EXECUTE) {
        // 写入数据库
        await prisma.$executeRawUnsafe(`
          UPDATE cables
          SET route_geojson = $1::jsonb,
              is_approximate_route = TRUE
          WHERE id = $2
        `, JSON.stringify(routeGeo), cable.id);
        console.log(`    ✅ 已写入\n`);
      } else {
        console.log(`    📝 [DRY RUN] 会写入\n`);
      }

      stats.generated++;
    }

    // Step 3: 汇总
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[近似路由生成] 完成`);
    console.log(`  总计无路由海缆: ${stats.total}`);
    console.log(`  已生成近似路由: ${stats.generated}`);
    console.log(`  无坐标站点: ${stats.noCoordinates} (需要先跑 geocode-fill.ts)`);
    console.log(`  站点不足(<2): ${stats.tooFewStations}`);
    console.log(`  耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`  模式: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`${'='.repeat(60)}\n`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('[近似路由生成] Fatal error:', err);
  process.exit(1);
});

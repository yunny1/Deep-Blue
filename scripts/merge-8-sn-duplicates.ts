/**
 * merge-8-sn-duplicates.ts
 * 
 * 将 8 条受保护的 SN 海缆合并到对应的 TG 记录
 * 这些 SN 记录都是 TG 的重复项，TG 有真实路由数据
 * 
 * 用法：npx tsx scripts/merge-8-sn-duplicates.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// SN ID → TG ID 的对应关系（需要确认）
const MERGE_PAIRS: { snId: string; snName: string; tgName: string }[] = [
  { snId: 'sn-icn1', snName: 'ICN1', tgName: 'Interchange Cable Network 1 (ICN1)' },
  { snId: 'sn-mct', snName: 'MCT', tgName: 'MCT' },
  { snId: 'sn-mena', snName: 'MENA', tgName: 'MENA' },
  { snId: 'sn-ncp', snName: 'NCP', tgName: 'New Cross Pacific (NCP) Cable System' },
  { snId: 'sn-pc-1', snName: 'PC-1', tgName: 'PC-1' },
  { snId: 'sn-sjc2', snName: 'SJC2', tgName: 'SJC2' },
  { snId: 'sn-tga', snName: 'TGA', tgName: 'TGA' },
  { snId: 'sn-tw1', snName: 'TW1', tgName: 'TW1' },
];

async function main() {
  console.log('\n=== 合并 8 条重复 SN 海缆到 TG ===\n');

  let merged = 0;
  let notFound = 0;

  for (const pair of MERGE_PAIRS) {
    // 查找 SN 记录
    const sn = await prisma.cable.findUnique({ where: { id: pair.snId } });
    if (!sn || sn.mergedInto) {
      console.log(`⏭ ${pair.snName} (${pair.snId}) — 已合并或不存在，跳过`);
      continue;
    }

    // 查找对应的 TG 记录（先按名称匹配，再按模糊匹配）
    let tg = await prisma.cable.findFirst({
      where: {
        name: pair.tgName,
        mergedInto: null,
        NOT: { id: pair.snId },
      },
    });

    // 如果精确名称没找到，用模糊搜索
    if (!tg) {
      const candidates: any[] = await prisma.$queryRawUnsafe(`
        SELECT id, name, data_source, CASE WHEN route_geojson IS NOT NULL THEN 'YES' ELSE 'NO' END as has_route
        FROM cables
        WHERE lower(name) LIKE '%' || lower($1) || '%'
          AND id != $2
          AND merged_into IS NULL
          AND data_source = 'TELEGEOGRAPHY'
        LIMIT 3
      `, pair.snName, pair.snId);

      if (candidates.length === 1) {
        tg = await prisma.cable.findUnique({ where: { id: candidates[0].id } });
      } else if (candidates.length > 1) {
        console.log(`⚠ ${pair.snName} — 找到 ${candidates.length} 个候选 TG 记录，需要人工确认:`);
        for (const c of candidates) console.log(`    ${c.name} | ${c.id} | route: ${c.has_route}`);
        notFound++;
        continue;
      }
    }

    if (!tg) {
      console.log(`⚠ ${pair.snName} — 未找到对应的 TG 记录`);
      notFound++;
      continue;
    }

    console.log(`✓ ${pair.snName}: "${sn.name}" (${pair.snId}) → "${tg.name}" (${tg.id})`);

    // 转移登陆站
    const tgStations = await prisma.cableLandingStation.findMany({
      where: { cableId: tg.id },
      select: { landingStationId: true },
    });
    const tgStationIds = new Set(tgStations.map(s => s.landingStationId));

    const snStations = await prisma.cableLandingStation.findMany({
      where: { cableId: pair.snId },
    });

    let stationsTransferred = 0;
    for (const s of snStations) {
      if (!tgStationIds.has(s.landingStationId)) {
        try {
          await prisma.cableLandingStation.create({
            data: { cableId: tg.id, landingStationId: s.landingStationId },
          });
          stationsTransferred++;
        } catch (e) {}
      }
    }

    // 补全空字段
    const updates: Record<string, any> = {};
    for (const f of ['lengthKm', 'description', 'notes', 'url', 'designCapacityTbps']) {
      if ((tg as any)[f] == null && (sn as any)[f] != null) updates[f] = (sn as any)[f];
    }
    if (Object.keys(updates).length > 0) {
      await prisma.cable.update({ where: { id: tg.id }, data: updates });
    }

    // 删除 SN 的登陆站关联
    await prisma.cableLandingStation.deleteMany({ where: { cableId: pair.snId } });

    // 软删除 SN
    await prisma.cable.update({
      where: { id: pair.snId },
      data: {
        mergedInto: tg.id,
        mergedAt: new Date(),
        reviewStatus: 'MERGED',
        isApproximateRoute: false,
        routeGeojson: undefined,
      },
    });

    // 清除 SN 的近似路由
    await prisma.$executeRawUnsafe(
      'UPDATE cables SET route_geojson = NULL, is_approximate_route = FALSE WHERE id = $1',
      pair.snId
    );

    // 合并日志
    await prisma.$executeRawUnsafe(
      `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
      tg.id, pair.snId, tg.name, sn.name, 'manual-verified-duplicate', 100
    );

    console.log(`  → 转移 ${stationsTransferred} 站, 补全 ${Object.keys(updates).length} 字段, 已合并`);
    merged++;
  }

  // 清缓存
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await Promise.all([
      redis.del('cables:geo:details'), redis.del('cables:geo'),
      redis.del('cables:list'), redis.del('stats:global'), redis.del('cables:geojson:full'),
    ]);
    console.log('\nRedis 缓存已清除');
  } catch (e: any) {
    console.log('Redis 清除失败:', e.message);
  }

  console.log(`\n=== 完成: ${merged} 条合并, ${notFound} 条未找到 TG 对应 ===\n`);
  await prisma.$disconnect();
}

main().catch(err => { console.error('失败:', err); process.exit(1); });

/**
 * fix-smw4-merge.ts
 * 
 * 一次性修复脚本：SEA-ME-WE-4 合并方向错误
 * 
 * 问题：TG 记录（seamewe-4，有路由）被错误合并到 SN 记录（sn-smw4，无路由）
 * 修复：反转合并方向，让 SN 合并到 TG
 * 
 * 用法：npx tsx scripts/fix-smw4-merge.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const TG_ID = 'seamewe-4';
  const SN_ID = 'sn-smw4';

  console.log('\n=== 修复 SEA-ME-WE-4 合并方向 ===\n');

  // Step 1: 把 SN 独有的登陆站转移到 TG
  const tgStations = await prisma.cableLandingStation.findMany({
    where: { cableId: TG_ID },
    select: { landingStationId: true },
  });
  const tgStationIds = new Set(tgStations.map(s => s.landingStationId));

  const snStations = await prisma.cableLandingStation.findMany({
    where: { cableId: SN_ID },
  });

  let transferred = 0;
  for (const s of snStations) {
    if (!tgStationIds.has(s.landingStationId)) {
      try {
        await prisma.cableLandingStation.create({
          data: { cableId: TG_ID, landingStationId: s.landingStationId },
        });
        transferred++;
      } catch (e) {
        // 唯一约束冲突，跳过
      }
    }
  }
  console.log(`Step 1: 转移了 ${transferred} 个登陆站到 TG`);

  // Step 2: 用 SN 的非空字段补全 TG 的空字段
  const tg = await prisma.cable.findUnique({ where: { id: TG_ID } });
  const sn = await prisma.cable.findUnique({ where: { id: SN_ID } });

  if (tg && sn) {
    const updates: Record<string, any> = {};
    const fields = ['lengthKm', 'description', 'notes', 'url', 'designCapacityTbps'];
    for (const f of fields) {
      if ((tg as any)[f] == null && (sn as any)[f] != null) {
        updates[f] = (sn as any)[f];
      }
    }
    if (Object.keys(updates).length > 0) {
      await prisma.cable.update({ where: { id: TG_ID }, data: updates });
      console.log(`Step 2: 补全了字段: ${Object.keys(updates).join(', ')}`);
    } else {
      console.log('Step 2: TG 字段完整，无需补全');
    }
  }

  // Step 3: 恢复 TG 记录（清除错误的 merged_into）
  await prisma.cable.update({
    where: { id: TG_ID },
    data: { mergedInto: null, mergedAt: null, reviewStatus: null },
  });
  console.log('Step 3: TG 记录已恢复（清除 merged_into）');

  // Step 4: 标记 SN 为合并到 TG（正确方向）
  await prisma.cableLandingStation.deleteMany({ where: { cableId: SN_ID } });
  await prisma.cable.update({
    where: { id: SN_ID },
    data: { mergedInto: TG_ID, mergedAt: new Date(), reviewStatus: 'MERGED' },
  });
  console.log('Step 4: SN 已合并到 TG（正确方向）');

  // Step 5: 写合并日志
  await prisma.$executeRawUnsafe(
    `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
    TG_ID, SN_ID, 'SeaMeWe-4', 'SEA-ME-WE 4', 'manual-direction-fix', 100
  );
  console.log('Step 5: 合并日志已写入');

  // 验证
  const verifyTg = await prisma.cable.findUnique({
    where: { id: TG_ID },
    select: { name: true, mergedInto: true, status: true, dataSource: true },
  });
  const verifySn = await prisma.cable.findUnique({
    where: { id: SN_ID },
    select: { name: true, mergedInto: true, reviewStatus: true },
  });
  console.log('\n=== 验证 ===');
  console.log('TG:', verifyTg?.name, '| merged_into:', verifyTg?.mergedInto, '| status:', verifyTg?.status);
  console.log('SN:', verifySn?.name, '| merged_into:', verifySn?.mergedInto, '| review:', verifySn?.reviewStatus);

  // 清 Redis 缓存
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await Promise.all([
      redis.del('cables:geo:details'),
      redis.del('cables:geo'),
      redis.del('cables:list'),
      redis.del('stats:global'),
      redis.del('cables:geojson:full'),
    ]);
    console.log('\nRedis 缓存已清除');
  } catch (e: any) {
    console.log('Redis 清除失败（非致命）:', e.message);
  }

  console.log('\n✅ 修复完成！刷新 deep-cloud.org 查看效果。\n');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('修复失败:', err);
  process.exit(1);
});

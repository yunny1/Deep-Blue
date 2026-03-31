// scripts/fix-cables-data.ts
//
// 一次性数据库修复脚本
//
// 处理三类问题：
// 1. TGN-IA2：补充登陆站数据（据 Tata Communications 官方图：日本/香港/新加坡），标 ROUTE_FIXED
// 2. FNAL / RNAL：删除（FLAG North Asia Loop / REACH North Asia Loop 是正名，FNAL/RNAL 是缩写重复记录）
// 3. AAE-2（Asia Africa Europe 2）：状态修正为 PLANNED，标 ROUTE_FIXED
//
// 运行方式（腾讯云）：
//   cd /home/ubuntu/deep-blue
//   set -a; source .env; set +a
//   npx tsx scripts/fix-cables-data.ts
//
// 所有修改均会打印 DRY_RUN 预览，设置 EXECUTE=true 后才真正写入数据库

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXECUTE = process.env.EXECUTE === 'true'; // 默认 DRY_RUN，需显式设置才执行

// ── TGN-IA2 登陆站数据（来源：Tata Communications 官方路由图）─────
// 路由：新加坡 → 香港 → 日本（Asia Direct Cable 子系统）
const TGN_IA2_STATIONS = [
  { id: 'sn-equinix-sg5-singapore-sg', name: 'Equinix SG5, Singapore', city: 'Singapore', countryCode: 'SG', lat: 1.3521,  lng: 103.8198 },
  { id: 'sn-global-switch-singapore-sg', name: 'Global Switch, Singapore', city: 'Singapore', countryCode: 'SG', lat: 1.3048,  lng: 103.7052 },
  { id: 'sn-mega-1-hong-kong-hk',       name: 'Mega-1, Hong Kong',         city: 'Hong Kong', countryCode: 'HK', lat: 22.3964, lng: 114.1095 },
  { id: 'sn-mega-plus-hong-kong-hk',    name: 'Mega Plus, Hong Kong',      city: 'Hong Kong', countryCode: 'HK', lat: 22.3964, lng: 114.1095 },
  { id: 'sn-emi-japan-jp',              name: 'EMI, Japan',                 city: 'Tokyo',     countryCode: 'JP', lat: 35.6762, lng: 139.6503 },
  { id: 'sn-toyohashi-av3-japan-jp',    name: 'Toyohashi AV3, Japan',       city: 'Toyohashi', countryCode: 'JP', lat: 34.7692, lng: 137.3922 },
];

// ── 工具函数 ─────────────────────────────────────────────────────
function slugify(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

function log(action: string, detail: string) {
  const prefix = EXECUTE ? '✓ [EXEC]' : '○ [DRY ]';
  console.log(`${prefix} ${action}: ${detail}`);
}

// ════════════════════════════════════════════════════════════════
// 任务一：TGN-IA2 登陆站补全
// ════════════════════════════════════════════════════════════════

async function fixTGNIA2() {
  console.log('\n═══ 任务一：TGN-IA2 登陆站补全 ═══');

  // 搜索方式：名称包含 TGN-IA2 或 TGN IA2
  const cable = await prisma.cable.findFirst({
    where: {
      OR: [
        { name: { contains: 'TGN-IA2', mode: 'insensitive' } },
        { name: { contains: 'TGN IA2', mode: 'insensitive' } },
        { slug: { contains: 'tgn-ia2' } },
      ],
      mergedInto: null,
    },
    include: {
      landingStations: { include: { landingStation: true } },
    },
  });

  if (!cable) {
    console.log('  ✗ 未找到 TGN-IA2，请检查数据库中的实际名称');
    // 列出含 TGN 的海缆供参考
    const similar = await prisma.cable.findMany({
      where: { name: { contains: 'TGN', mode: 'insensitive' }, mergedInto: null },
      select: { id: true, name: true, slug: true, reviewStatus: true },
    });
    console.log('  数据库中含 TGN 的海缆：');
    similar.forEach(c => console.log(`    · ${c.name} (${c.slug}) reviewStatus=${c.reviewStatus ?? 'null'}`));
    return;
  }

  console.log(`  找到：${cable.name} (id=${cable.id}, slug=${cable.slug})`);
  console.log(`  当前登陆站数：${cable.landingStations.length}`);
  cable.landingStations.forEach(ls => {
    console.log(`    · ${ls.landingStation.name} (${ls.landingStation.countryCode})`);
  });

  if (EXECUTE) {
    // 1. 确保相关国家存在
    for (const cc of ['SG', 'HK', 'JP']) {
      await prisma.country.upsert({
        where: { code: cc }, update: {},
        create: { code: cc, nameEn: cc },
      }).catch(() => {});
    }

    // 2. 逐个 upsert 登陆站并关联
    for (const st of TGN_IA2_STATIONS) {
      const station = await prisma.landingStation.upsert({
        where: { id: st.id },
        update: { name: st.name, countryCode: st.countryCode, latitude: st.lat, longitude: st.lng },
        create: { id: st.id, name: st.name, countryCode: st.countryCode, latitude: st.lat, longitude: st.lng },
      });

      await prisma.cableLandingStation.upsert({
        where: { cableId_landingStationId: { cableId: cable.id, landingStationId: station.id } },
        update: {},
        create: { cableId: cable.id, landingStationId: station.id },
      }).catch(() => {});

      log('添加登陆站', `${st.name} → ${cable.name}`);
    }

    // 3. 标记 ROUTE_FIXED（防止夜间同步覆盖登陆站）
    await prisma.cable.update({
      where: { id: cable.id },
      data: { reviewStatus: 'ROUTE_FIXED' },
    });
    log('标记', `${cable.name} → reviewStatus=ROUTE_FIXED`);
  } else {
    console.log('  [DRY] 将添加以下登陆站：');
    TGN_IA2_STATIONS.forEach(st => console.log(`    + ${st.name} (${st.countryCode})`));
    console.log('  [DRY] 将标记 reviewStatus=ROUTE_FIXED');
  }
}

// ════════════════════════════════════════════════════════════════
// 任务二：删除 FNAL / RNAL（FLAG/REACH North Asia Loop 的重复缩写记录）
// ════════════════════════════════════════════════════════════════

async function deleteFNAL_RNAL() {
  console.log('\n═══ 任务二：删除 FNAL / RNAL 重复记录 ═══');

  // 确认正名记录存在
  const canonical = await prisma.cable.findMany({
    where: {
      OR: [
        { name: { contains: 'FLAG North Asia Loop', mode: 'insensitive' } },
        { name: { contains: 'REACH North Asia Loop', mode: 'insensitive' } },
      ],
      mergedInto: null,
    },
    select: { id: true, name: true, slug: true },
  });
  console.log(`  正名记录（保留）：`);
  canonical.forEach(c => console.log(`    ✓ ${c.name} (${c.slug})`));

  // 找出缩写重复记录
  const duplicates = await prisma.cable.findMany({
    where: {
      OR: [
        { name: { in: ['FNAL', 'RNAL', 'FLAG/RNAL', 'RNAL/FNAL'] } },
        { slug: { in: ['fnal', 'rnal', 'flag-rnal', 'rnal-fnal'] } },
        { name: { contains: 'FNAL', mode: 'insensitive' } },
        { name: { contains: 'RNAL', mode: 'insensitive' } },
      ],
      // 排除包含完整名称的记录（防止误删正名）
      NOT: {
        OR: [
          { name: { contains: 'FLAG North Asia Loop', mode: 'insensitive' } },
          { name: { contains: 'REACH North Asia Loop', mode: 'insensitive' } },
        ],
      },
    },
    include: { landingStations: true },
  });

  if (duplicates.length === 0) {
    console.log('  ✓ 未找到需要删除的 FNAL/RNAL 重复记录');
    return;
  }

  console.log(`  找到 ${duplicates.length} 条需要删除的记录：`);
  duplicates.forEach(c => console.log(`    ✗ ${c.name} (${c.slug}, id=${c.id})`));

  if (EXECUTE) {
    for (const dup of duplicates) {
      // 软删除：标记 REMOVED 而不是物理删除，保留审计记录
      await prisma.cable.update({
        where: { id: dup.id },
        data: { status: 'REMOVED', reviewStatus: 'ROUTE_FIXED' },
      });
      log('软删除', `${dup.name} → status=REMOVED`);
    }

    // 同时把正名记录标记 ROUTE_FIXED，防止夜间同步误操作
    for (const c of canonical) {
      await prisma.cable.update({
        where: { id: c.id },
        data: { reviewStatus: 'ROUTE_FIXED' },
      });
      log('保护正名', `${c.name} → reviewStatus=ROUTE_FIXED`);
    }
  } else {
    duplicates.forEach(c => console.log(`  [DRY] 将软删除：${c.name}`));
    canonical.forEach(c => console.log(`  [DRY] 将保护正名：${c.name}`));
  }
}

// ════════════════════════════════════════════════════════════════
// 任务三：AAE-2 状态修正为 PLANNED
// ════════════════════════════════════════════════════════════════

async function fixAAE2() {
  console.log('\n═══ 任务三：AAE-2 状态修正为 PLANNED ═══');

  const cable = await prisma.cable.findFirst({
    where: {
      OR: [
        { name: { contains: 'AAE-2', mode: 'insensitive' } },
        { name: { contains: 'Asia Africa Europe 2', mode: 'insensitive' } },
        { slug: { contains: 'aae-2' } },
        { slug: { contains: 'asia-africa-europe-2' } },
      ],
      mergedInto: null,
    },
    select: { id: true, name: true, slug: true, status: true, reviewStatus: true },
  });

  if (!cable) {
    console.log('  ✗ 未找到 AAE-2，请检查数据库中的实际名称');
    // 列出含 AAE 的海缆供参考
    const similar = await prisma.cable.findMany({
      where: { name: { contains: 'AAE', mode: 'insensitive' }, mergedInto: null },
      select: { id: true, name: true, slug: true, status: true },
    });
    console.log('  数据库中含 AAE 的海缆：');
    similar.forEach(c => console.log(`    · ${c.name} (${c.slug}) status=${c.status}`));
    return;
  }

  console.log(`  找到：${cable.name} (id=${cable.id})`);
  console.log(`  当前状态：${cable.status} | reviewStatus：${cable.reviewStatus ?? 'null'}`);

  if (cable.status === 'PLANNED') {
    console.log('  ✓ 状态已经是 PLANNED，无需修改状态');
  } else {
    log('修改状态', `${cable.name}: ${cable.status} → PLANNED`);
  }
  log('标记', `${cable.name} → reviewStatus=ROUTE_FIXED`);

  if (EXECUTE) {
    await prisma.cable.update({
      where: { id: cable.id },
      data: {
        status: 'PLANNED',
        reviewStatus: 'ROUTE_FIXED',
        previousStatus: cable.status,
        statusChangedAt: new Date(),
      },
    });
  }
}

// ════════════════════════════════════════════════════════════════
// 主函数
// ════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  海缆数据修复脚本  ${EXECUTE ? '【执行模式】' : '【DRY_RUN 预览模式】'}              ║`);
  if (!EXECUTE) {
    console.log('║  提示：设置 EXECUTE=true 后才真正写入数据库                  ║');
    console.log('║  命令：EXECUTE=true npx tsx scripts/fix-cables-data.ts       ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await fixTGNIA2();
  await deleteFNAL_RNAL();
  await fixAAE2();

  // 最终汇报：所有 ROUTE_FIXED 记录
  const allFixed = await prisma.cable.findMany({
    where: { reviewStatus: 'ROUTE_FIXED' },
    select: { name: true, slug: true, status: true },
    orderBy: { name: 'asc' },
  });
  console.log(`\n═══ 当前所有 ROUTE_FIXED 记录（${allFixed.length} 条）═══`);
  allFixed.forEach(c => console.log(`  · ${c.name} (status=${c.status})`));

  console.log('\n═══ 完成 ═══\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('脚本出错：', e);
  await prisma.$disconnect();
  process.exit(1);
});

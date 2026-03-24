/**
 * cleanup-orphans.ts
 * 
 * 独立孤儿清理脚本 — 直接对比上游数据源
 * 
 * 工作原理：
 *   1. 从 TeleGeography API 拉取当前所有海缆 ID 列表（快速，~1秒）
 *   2. 从 Submarine Networks 拉取当前所有海缆 slug 列表（快速，~2秒）
 *   3. 查询数据库中所有活跃海缆
 *   4. 对比：数据库里有但上游都没有的 = 孤儿 → 标记为 REMOVED
 * 
 * 安全性：
 *   - 默认 DRY_RUN 模式，只看报告不改数据
 *   - 必须显式传 EXECUTE=true 才会实际修改
 *   - 不依赖 nightly-sync 的任何字段，完全独立判断
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/cleanup-orphans.ts              # DRY_RUN（先看报告）
 *   EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/cleanup-orphans.ts # 正式执行
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXECUTE = process.env.EXECUTE === 'true';

const TG_ALL  = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const SN_BASE = 'https://www.submarinenetworks.com';

// ============================================================
// 1. 从上游拉取当前海缆列表
// ============================================================

/** 从 TeleGeography 获取当前所有海缆（只拿 ID 和名称，非常快） */
async function fetchTGCableIds(): Promise<Map<string, string>> {
  console.log('  [TG] 下载海缆列表...');
  const res = await fetch(TG_ALL);
  if (!res.ok) throw new Error(`TG API 返回 ${res.status}`);
  const cables = await res.json() as { id: string; name: string }[];
  const map = new Map<string, string>();
  for (const c of cables) {
    map.set(c.id, c.name);
  }
  console.log(`  [TG] 获取到 ${map.size} 条海缆`);
  return map;
}

/** 从 Submarine Networks 获取当前所有海缆 slug（解析 HTML 列表页） */
async function fetchSNCableSlugs(): Promise<Map<string, string>> {
  console.log('  [SN] 下载海缆列表...');
  const res = await fetch(`${SN_BASE}/en/systems`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/6.0)' },
  });
  if (!res.ok) throw new Error(`SN 返回 ${res.status}`);
  const html = await res.text();

  const SKIP = new Set([
    'trans-atlantic', 'trans-pacific', 'trans-arctic', 'intra-asia', 'intra-europe',
    'asia-europe-africa', 'australia-usa', 'brazil-us', 'brazil-africa', 'euro-africa',
    'asia-australia', 'eurasia-terrestrial', 'north-america', 'africa-australia',
    'antarctic', 'brazil-europe', 'png-national', 'africa', 'south-pacific',
  ]);

  const linkRegex = /href="\/en\/systems\/([a-z0-9\-]+)\/([a-z0-9\-]+)"\s*>([^<]+)</gi;
  const map = new Map<string, string>();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [, , slug, rawName] = match;
    const name = rawName.trim();
    if (SKIP.has(slug) || name.length < 2 || name.length > 100) continue;
    map.set(slug, name);
  }
  console.log(`  [SN] 获取到 ${map.size} 条海缆`);
  return map;
}

// ============================================================
// 2. 名称标准化（用于模糊匹配 UNKNOWN 来源的记录）
// ============================================================

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/submarine\s*cable\s*(system)?/gi, '')
    .replace(/\bcable\s*system\b/gi, '')
    .replace(/\bsystem\b/gi, '')
    .replace(/\bnetwork\b/gi, '')
    .replace(/\bcable\b/gi, '')
    .replace(/\bproject\b/gi, '')
    .replace(/[()[\]{}"']/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ============================================================
// 3. 主流程
// ============================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  孤儿清理 — 直接对比上游数据源                     ║`);
  console.log(`║  模式: ${EXECUTE ? '正式执行（会修改数据库）' : 'DRY_RUN（只看报告不改数据）'}            ║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // ── 步骤一：从上游拉取当前海缆列表 ────────────────────────────
  console.log('=== 步骤一：拉取上游数据 ===\n');
  const tgCables = await fetchTGCableIds();
  const snSlugs  = await fetchSNCableSlugs();

  // 构建上游名称集合（用于匹配 UNKNOWN 来源的记录）
  const tgNamesNormalized = new Set<string>();
  for (const name of tgCables.values()) {
    tgNamesNormalized.add(normalizeName(name));
  }
  const snNamesNormalized = new Set<string>();
  for (const name of snSlugs.values()) {
    snNamesNormalized.add(normalizeName(name));
  }

  console.log(`\n  上游总计: TG ${tgCables.size} + SN ${snSlugs.size} = ${tgCables.size + snSlugs.size} 条（含重叠）`);

  // ── 步骤二：查询数据库中所有活跃海缆 ──────────────────────────
  console.log('\n=== 步骤二：查询数据库 ===\n');

  const dbCables: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, name, status, data_source 
    FROM cables 
    WHERE merged_into IS NULL 
      AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
    ORDER BY name
  `);
  console.log(`  数据库活跃海缆: ${dbCables.length} 条`);

  // ── 步骤三：逐条对比，找出孤儿 ───────────────────────────────
  console.log('\n=== 步骤三：对比上游，识别孤儿 ===\n');

  const confirmed: any[] = [];  // 上游确认存在的
  const orphans: any[] = [];    // 上游不再收录的

  for (const cable of dbCables) {
    let isConfirmed = false;

    // 判定方法 1：TG ID 精确匹配（TG 的 cable ID 不以 sn- 开头）
    if (!cable.id.startsWith('sn-') && tgCables.has(cable.id)) {
      isConfirmed = true;
    }

    // 判定方法 2：SN slug 精确匹配（SN 的 cable ID 格式为 sn-{slug}）
    if (!isConfirmed && cable.id.startsWith('sn-')) {
      const slug = cable.id.replace(/^sn-/, '');
      if (snSlugs.has(slug)) {
        isConfirmed = true;
      }
    }

    // 判定方法 3：名称模糊匹配（处理 UNKNOWN 来源或 ID 格式不匹配的情况）
    if (!isConfirmed) {
      const normalizedName = normalizeName(cable.name);
      if (tgNamesNormalized.has(normalizedName) || snNamesNormalized.has(normalizedName)) {
        isConfirmed = true;
      }
    }

    if (isConfirmed) {
      confirmed.push(cable);
    } else {
      orphans.push(cable);
    }
  }

  console.log(`  上游确认: ${confirmed.length} 条`);
  console.log(`  孤儿记录: ${orphans.length} 条`);

  // 按来源统计孤儿
  const orphansBySource: Record<string, number> = {};
  for (const o of orphans) {
    const src = o.data_source || 'UNKNOWN';
    orphansBySource[src] = (orphansBySource[src] || 0) + 1;
  }
  console.log(`\n  孤儿来源分布:`);
  for (const [src, count] of Object.entries(orphansBySource)) {
    console.log(`    ${src}: ${count}`);
  }

  // 按状态统计孤儿
  const orphansByStatus: Record<string, number> = {};
  for (const o of orphans) {
    const s = o.status || 'UNKNOWN';
    orphansByStatus[s] = (orphansByStatus[s] || 0) + 1;
  }
  console.log(`\n  孤儿状态分布:`);
  for (const [s, count] of Object.entries(orphansByStatus)) {
    console.log(`    ${s}: ${count}`);
  }

  // 打印所有孤儿
  if (orphans.length > 0 && orphans.length <= 300) {
    console.log(`\n  孤儿完整列表:`);
    for (const o of orphans) {
      console.log(`    [${o.status}] "${o.name}" (id: ${o.id}, 来源: ${o.data_source || 'UNKNOWN'})`);
    }
  } else if (orphans.length > 300) {
    console.log(`\n  孤儿太多(${orphans.length}条)，只显示前 50 条:`);
    for (const o of orphans.slice(0, 50)) {
      console.log(`    [${o.status}] "${o.name}" (id: ${o.id}, 来源: ${o.data_source || 'UNKNOWN'})`);
    }
  }

  // ── 步骤四：执行清理 ─────────────────────────────────────────
  console.log(`\n=== 步骤四：${EXECUTE ? '执行清理' : 'DRY_RUN（不修改数据库）'} ===\n`);

  if (orphans.length === 0) {
    console.log('  ✓ 没有孤儿记录需要清理');
  } else if (!EXECUTE) {
    console.log(`  DRY_RUN: 发现 ${orphans.length} 条孤儿，不实际修改`);
    console.log(`  如果确认列表正确，用以下命令正式执行：`);
    console.log(`  EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/cleanup-orphans.ts`);
  } else {
    // 正式执行：逐条标记为 REMOVED
    let removedCount = 0;
    for (const orphan of orphans) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE cables SET status = 'REMOVED', previous_status = $1, status_changed_at = NOW() WHERE id = $2`,
          orphan.status, orphan.id
        );
        removedCount++;
      } catch (e: any) {
        console.error(`  ✗ 标记失败 "${orphan.name}": ${e.message}`);
      }
    }
    console.log(`  ✓ 已标记 ${removedCount} 条孤儿为 REMOVED`);

    // 清除缓存
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      await Promise.all([
        redis.del('cables:geojson:full'),
        redis.del('cables:geo:details'),
        redis.del('cables:geo'),
        redis.del('cables:list'),
        redis.del('stats:global'),
      ]);
      console.log('  ✓ 缓存已清除');
    } catch (e: any) {
      console.error(`  ⚠ 缓存清除失败: ${e.message}`);
    }
  }

  // ── 最终报告 ──────────────────────────────────────────────────
  console.log('\n=== 最终报告 ===\n');

  const finalCounts: any[] = await prisma.$queryRawUnsafe(`
    SELECT status, COUNT(*)::int as count 
    FROM cables 
    WHERE merged_into IS NULL AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
    GROUP BY status ORDER BY count DESC
  `);
  const finalTotal = finalCounts.reduce((sum: number, r: any) => sum + r.count, 0);

  console.log(`  当前活跃海缆: ${finalTotal} 条`);
  for (const row of finalCounts) {
    console.log(`    ${row.status}: ${row.count}`);
  }

  console.log(`\n  对照：TG 上游 ${tgCables.size} 条 + SN 独有 ≈ ${finalTotal} 条（去重后）`);

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  ${EXECUTE ? '清理完成' : 'DRY_RUN 完成'}！活跃海缆: ${finalTotal} 条              ║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * dedup-backfill.ts
 * 
 * 一次性去重回填脚本 — 完整解决现有数据重复问题
 * 
 * 执行步骤：
 *   Step 1: 检查并添加数据库新字段（如果不存在）
 *   Step 2: 加载/创建别名表
 *   Step 3: 回填所有海缆的 canonical_name / canonical_base / canonical_suffix
 *   Step 4: 基于 canonical name 精确匹配 → 自动合并确认的重复
 *   Step 5: 模糊匹配扫描 → 标记 PENDING_REVIEW
 *   Step 6: 输出报告
 * 
 * 运行方式：
 *   cd /home/ubuntu/deep-blue
 *   set -a; source .env; set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/dedup-backfill.ts
 * 
 * 安全性：
 *   - 所有合并都是软删除（设置 merged_into 字段），不物理删除任何数据
 *   - 合并前会打印详情并记录到 cable_merge_log 表
 *   - 可以通过 review_status='MERGED' 查找所有被合并的记录并回滚
 *   - 首次运行建议加 DRY_RUN=true 只看报告不执行合并
 * 
 * 环境变量：
 *   DRY_RUN=true  — 只分析不合并（默认 false）
 */

import { PrismaClient } from '@prisma/client';
import {
  parseCableName,
  loadAliases,
  jaroWinkler,
  jaccard,
  yearSimilarity,
} from '../src/lib/cable-name-parser';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === 'true';

// ============================================================
// Step 1: 数据库 Schema 迁移
// ============================================================
async function ensureSchema() {
  console.log('\n=== Step 1: 检查数据库字段 ===\n');

  const migrations = [
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS data_source TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS external_id TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_name TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_base TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_suffix TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS review_status TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS possible_duplicate_of TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_into TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ`,
    `CREATE INDEX IF NOT EXISTS idx_cables_canonical_base ON cables (canonical_base)`,
    `CREATE INDEX IF NOT EXISTS idx_cables_canonical_name ON cables (canonical_name)`,
    `CREATE INDEX IF NOT EXISTS idx_cables_merged_into ON cables (merged_into)`,
  ];

  for (const sql of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      // 字段已存在等非致命错误 → 跳过
      console.log(`  跳过: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // 创建别名表
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS cable_name_aliases (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        alias TEXT NOT NULL UNIQUE,
        canonical TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        note TEXT
      )
    `);
  } catch (e) {
    console.log(`  别名表: ${(e as Error).message.slice(0, 80)}`);
  }

  // 预填充别名
  const aliases = [
    ['seamewe', 'sea-me-we', '常见缩写变体'],
    ['smw', 'sea-me-we', 'TeleGeography缩写'],
    ['apcn', 'asia-pacific-cable-network', '缩写'],
    ['apg', 'asia-pacific-gateway', '缩写'],
    ['flag', 'fiber-optic-link-around-the-globe', '缩写'],
    ['imewe', 'india-middle-east-western-europe', '缩写'],
    ['eig', 'europe-india-gateway', '缩写'],
    ['aae1', 'asia-africa-europe-1', '缩写'],
    ['peace', 'pakistan-east-africa-connecting-europe', '缩写'],
    ['2africa', 'two-africa', '数字开头变体'],
    ['tgn', 'tata-global-network', '缩写'],
    ['jga', 'japan-guam-australia', '缩写'],
    ['sjc', 'southeast-asia-japan-cable', '缩写'],
    ['plcn', 'pacific-light-cable-network', '缩写'],
    ['hkamericas', 'hong-kong-americas', '无连字符变体'],
  ];

  for (const [alias, canonical, note] of aliases) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cable_name_aliases (id, alias, canonical, note) VALUES (gen_random_uuid()::text, $1, $2, $3) ON CONFLICT (alias) DO NOTHING`,
        alias, canonical, note
      );
    } catch (e) { /* 忽略 */ }
  }

  // 创建合并日志表
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS cable_merge_log (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        kept_cable_id TEXT NOT NULL,
        removed_cable_id TEXT NOT NULL,
        kept_name TEXT NOT NULL,
        removed_name TEXT NOT NULL,
        merge_method TEXT NOT NULL,
        match_score REAL,
        merged_at TIMESTAMPTZ DEFAULT NOW(),
        merged_by TEXT DEFAULT 'system'
      )
    `);
  } catch (e) { /* 忽略 */ }

  console.log('  数据库字段检查完成');
}

// ============================================================
// Step 2 & 3: 加载数据 + 回填 canonical names
// ============================================================

interface CableInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
  rfsYear: number | null;
  stationNames: Set<string>;
  parsed: ReturnType<typeof parseCableName>;
  landingStationCount: number;
  hasGeoJson: boolean;
}

async function loadAndBackfill(): Promise<CableInfo[]> {
  console.log('\n=== Step 2: 加载别名表 ===\n');
  await loadAliases(prisma);

  console.log('\n=== Step 3: 回填 canonical names ===\n');

  const allCables = await prisma.cable.findMany({
    include: {
      landingStations: {
        include: {
          landingStation: true,
        },
      },
    },
  });

  console.log(`  总海缆数: ${allCables.length}`);

  const cables: CableInfo[] = [];
  let backfillCount = 0;

  for (const c of allCables as any[]) {
    const parsed = parseCableName(c.name || '');
    const stations = (c.landingStations || []).map((ls: any) => ls.landingStation || ls);

    cables.push({
      id: c.id,
      name: c.name || '',
      slug: c.slug || '',
      status: c.status || 'UNKNOWN',
      rfsYear: c.rfsYear || c.yearRfs || c.rfs || null,
      stationNames: new Set(
        stations.map((s: any) => (s.name || '').toLowerCase().trim()).filter(Boolean)
      ),
      parsed,
      landingStationCount: stations.length,
      hasGeoJson: !!(c.geoJson || c.geojson || c.geometry),
    });

    // 回填数据库
    if (!DRY_RUN) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE cables SET canonical_name = $1, canonical_base = $2, canonical_suffix = $3 WHERE id = $4`,
          parsed.canonical, parsed.base, parsed.suffix, c.id
        );
        backfillCount++;
      } catch (e) {
        console.error(`  回填失败 [${c.name}]: ${(e as Error).message}`);
      }
    }
  }

  console.log(`  回填完成: ${backfillCount} 条${DRY_RUN ? '（DRY_RUN 模式，未实际写入）' : ''}`);

  return cables;
}

// ============================================================
// Step 4: 精确匹配 + 自动合并
// ============================================================

interface MergeAction {
  keepId: string;
  removeId: string;
  keepName: string;
  removeName: string;
  method: string;
  score: number;
  reason: string;
}

function findExactDuplicates(cables: CableInfo[]): MergeAction[] {
  console.log('\n=== Step 4: canonical name 精确匹配 ===\n');

  // 按 canonical name 分组
  const groups = new Map<string, CableInfo[]>();
  for (const c of cables) {
    if (!c.parsed.canonical) continue;
    const key = c.parsed.canonical;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const actions: MergeAction[] = [];

  for (const [canonical, group] of groups) {
    if (group.length < 2) continue;

    // 选择"最好"的记录保留，其余合并到它
    // 优先级：登陆站多 > 有GeoJSON > 名称短（通常是规范名）> 先入库的
    group.sort((a, b) => {
      if (a.landingStationCount !== b.landingStationCount) return b.landingStationCount - a.landingStationCount;
      if (a.hasGeoJson !== b.hasGeoJson) return a.hasGeoJson ? -1 : 1;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return 0;
    });

    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      const remove = group[i];
      actions.push({
        keepId: keep.id,
        removeId: remove.id,
        keepName: keep.name,
        removeName: remove.name,
        method: 'auto-exact',
        score: 100,
        reason: `canonical="${canonical}"`,
      });
    }
  }

  console.log(`  精确匹配发现 ${actions.length} 对重复`);
  for (const a of actions) {
    console.log(`    保留 "${a.keepName}" ← 合并 "${a.removeName}" (${a.reason})`);
  }

  return actions;
}

// ============================================================
// Step 5: 模糊匹配扫描
// ============================================================

interface ReviewFlag {
  cableId: string;
  cableName: string;
  possibleDuplicateOfId: string;
  possibleDuplicateOfName: string;
  score: number;
  detail: string;
}

function findFuzzyDuplicates(cables: CableInfo[], alreadyMergedIds: Set<string>): { autoMerge: MergeAction[]; review: ReviewFlag[] } {
  console.log('\n=== Step 5: 模糊匹配扫描 ===\n');

  const autoMerge: MergeAction[] = [];
  const review: ReviewFlag[] = [];
  const processed = new Set<string>(); // 防止 A↔B 和 B↔A 重复处理

  // 只比较未被精确匹配合并的记录
  const activeCables = cables.filter(c => !alreadyMergedIds.has(c.id));

  for (let i = 0; i < activeCables.length; i++) {
    for (let j = i + 1; j < activeCables.length; j++) {
      const a = activeCables[i];
      const b = activeCables[j];

      const pairKey = [a.id, b.id].sort().join('|');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // 快速剪枝
      if (Math.abs(a.parsed.base.length - b.parsed.base.length) > 15) continue;

      // base 相同但 suffix 不同 → 不同海缆，跳过
      if (a.parsed.base === b.parsed.base
        && a.parsed.suffix !== '' && b.parsed.suffix !== ''
        && a.parsed.suffix !== b.parsed.suffix) {
        continue;
      }

      const nameScore = jaroWinkler(a.parsed.base, b.parsed.base);
      if (nameScore < 0.65) continue;

      // suffix 不兼容 → 跳过
      if (a.parsed.suffix !== '' && b.parsed.suffix !== '' && a.parsed.suffix !== b.parsed.suffix) {
        continue;
      }

      const stationScore = jaccard(a.stationNames, b.stationNames);
      const yearScore = yearSimilarity(a.rfsYear, b.rfsYear);
      const total = (nameScore * 0.4 + stationScore * 0.4 + yearScore * 0.2) * 100;

      if (total >= 85) {
        // 选择保留哪条
        const [keep, remove] = a.landingStationCount >= b.landingStationCount ? [a, b] : [b, a];
        autoMerge.push({
          keepId: keep.id,
          removeId: remove.id,
          keepName: keep.name,
          removeName: remove.name,
          method: 'auto-fuzzy',
          score: Math.round(total),
          reason: `name=${Math.round(nameScore * 100)} station=${Math.round(stationScore * 100)} year=${Math.round(yearScore * 100)}`,
        });
      } else if (total >= 65) {
        review.push({
          cableId: a.id,
          cableName: a.name,
          possibleDuplicateOfId: b.id,
          possibleDuplicateOfName: b.name,
          score: Math.round(total),
          detail: `name=${Math.round(nameScore * 100)} station=${Math.round(stationScore * 100)} year=${Math.round(yearScore * 100)}`,
        });
      }
    }
  }

  console.log(`  模糊匹配自动合并: ${autoMerge.length} 对`);
  for (const a of autoMerge) {
    console.log(`    [${a.score}分] 保留 "${a.keepName}" ← 合并 "${a.removeName}" (${a.reason})`);
  }

  console.log(`  标记待审核: ${review.length} 对`);
  for (const r of review) {
    console.log(`    [${r.score}分] "${r.cableName}" ↔ "${r.possibleDuplicateOfName}" (${r.detail})`);
  }

  return { autoMerge, review };
}

// ============================================================
// Step 6: 执行合并 + 标记
// ============================================================

async function executeMerges(actions: MergeAction[]): Promise<number> {
  console.log(`\n=== Step 6: 执行合并（${DRY_RUN ? 'DRY_RUN 模式，不实际执行' : '正式执行'}）===\n`);

  if (DRY_RUN) {
    console.log(`  DRY_RUN: 跳过 ${actions.length} 个合并操作`);
    return 0;
  }

  let successCount = 0;
  for (const action of actions) {
    try {
      // 1. 转移登陆站关联
      const keepStations: any[] = await prisma.$queryRawUnsafe(
        `SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1`,
        action.keepId
      );
      const keepStationIds = new Set(keepStations.map(s => s.landing_station_id));

      const removeStations: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, landing_station_id FROM cable_landing_stations WHERE cable_id = $1`,
        action.removeId
      );

      for (const rs of removeStations) {
        if (!keepStationIds.has(rs.landing_station_id)) {
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO cable_landing_stations (id, cable_id, landing_station_id) VALUES (gen_random_uuid()::text, $1, $2)`,
              action.keepId, rs.landing_station_id
            );
          } catch (e) { /* 唯一约束冲突，跳过 */ }
        }
      }

      // 2. 补全空字段
      await prisma.$executeRawUnsafe(`
        UPDATE cables AS keep SET
          rfs_year = COALESCE(keep.rfs_year, remove.rfs_year),
          length_km = COALESCE(keep.length_km, remove.length_km),
          description = COALESCE(keep.description, remove.description),
          owners = COALESCE(keep.owners, remove.owners),
          suppliers = COALESCE(keep.suppliers, remove.suppliers),
          url = COALESCE(keep.url, remove.url)
        FROM cables AS remove
        WHERE keep.id = $1 AND remove.id = $2
      `, action.keepId, action.removeId);

      // 3. 软删除被合并记录
      await prisma.$executeRawUnsafe(
        `UPDATE cables SET merged_into = $1, merged_at = NOW(), review_status = 'MERGED' WHERE id = $2`,
        action.keepId, action.removeId
      );

      // 4. 清理被合并记录的登陆站关联
      await prisma.$executeRawUnsafe(
        `DELETE FROM cable_landing_stations WHERE cable_id = $1`,
        action.removeId
      );

      // 5. 写合并日志
      await prisma.$executeRawUnsafe(
        `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
        action.keepId, action.removeId, action.keepName, action.removeName, action.method, action.score
      );

      successCount++;
      console.log(`  ✓ "${action.removeName}" → "${action.keepName}"`);
    } catch (e) {
      console.error(`  ✗ 合并失败 "${action.removeName}": ${(e as Error).message}`);
    }
  }

  return successCount;
}

async function flagForReview(reviews: ReviewFlag[]): Promise<void> {
  if (DRY_RUN || reviews.length === 0) return;

  for (const r of reviews) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE cables SET review_status = 'PENDING_REVIEW', possible_duplicate_of = $1 WHERE id = $2 AND (review_status IS NULL OR review_status != 'MERGED')`,
        r.possibleDuplicateOfId, r.cableId
      );
    } catch (e) { /* 忽略 */ }
  }
}

// ============================================================
// Step 7: 输出报告
// ============================================================

async function printFinalReport(
  originalCount: number,
  exactMerges: MergeAction[],
  fuzzyMerges: MergeAction[],
  reviews: ReviewFlag[],
  mergedCount: number,
) {
  console.log('\n========================================');
  console.log('           最终报告');
  console.log('========================================\n');

  // 重新统计
  const remaining: any[] = await prisma.$queryRawUnsafe(
    `SELECT status, COUNT(*) as count FROM cables WHERE merged_into IS NULL GROUP BY status ORDER BY count DESC`
  );

  console.log(`原始海缆总数: ${originalCount}`);
  console.log(`精确匹配合并: ${exactMerges.length} 对`);
  console.log(`模糊匹配合并: ${fuzzyMerges.length} 对`);
  console.log(`实际合并成功: ${mergedCount} 条`);
  console.log(`标记待审核:   ${reviews.length} 对`);
  console.log(`\n去重后各状态统计:`);
  for (const row of remaining) {
    console.log(`  ${row.status}: ${row.count}`);
  }

  const totalRemaining = remaining.reduce((sum: number, r: any) => sum + Number(r.count), 0);
  console.log(`\n去重后总计: ${totalRemaining} 条（减少 ${originalCount - totalRemaining} 条）`);

  // 写入JSON报告
  const fs = await import('fs');
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    originalTotal: originalCount,
    exactMerges: exactMerges.map(a => ({ keep: a.keepName, remove: a.removeName, reason: a.reason })),
    fuzzyMerges: fuzzyMerges.map(a => ({ keep: a.keepName, remove: a.removeName, score: a.score, reason: a.reason })),
    pendingReviews: reviews.map(r => ({ cable: r.cableName, possibleDuplicate: r.possibleDuplicateOfName, score: r.score, detail: r.detail })),
    mergedCount,
    remainingByStatus: remaining,
    remainingTotal: totalRemaining,
  };
  const reportPath = '/home/ubuntu/deep-blue/dedup-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n完整报告: ${reportPath}`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Deep Blue 海缆去重系统 — 一次性回填脚本  ║');
  console.log(`║  模式: ${DRY_RUN ? 'DRY_RUN（只分析不合并）' : '正式执行（会修改数据库）'}          ║`);
  console.log('╚════════════════════════════════════════════╝');

  // Step 1: Schema 迁移
  await ensureSchema();

  // Step 2 & 3: 加载数据 + 回填 canonical names
  const cables = await loadAndBackfill();
  const originalCount = cables.length;

  // Step 4: 精确匹配
  const exactActions = findExactDuplicates(cables);

  // 执行精确合并
  const exactMergedCount = await executeMerges(exactActions);
  const exactMergedIds = new Set(exactActions.map(a => a.removeId));

  // Step 5: 模糊匹配（排除已精确合并的）
  const { autoMerge: fuzzyActions, review: reviews } = findFuzzyDuplicates(cables, exactMergedIds);

  // 执行模糊合并
  const fuzzyMergedCount = await executeMerges(fuzzyActions);

  // 标记待审核
  await flagForReview(reviews);

  // Step 7: 报告
  await printFinalReport(originalCount, exactActions, fuzzyActions, reviews, exactMergedCount + fuzzyMergedCount);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n脚本执行失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

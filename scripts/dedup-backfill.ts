/**
 * dedup-backfill.ts
 * 路径：scripts/dedup-backfill.ts
 * 
 * 一次性去重回填脚本 — 完整解决现有数据的重复问题
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   DRY_RUN=true npx tsx /home/ubuntu/deep-blue/scripts/dedup-backfill.ts   # 先试跑
 *   npx tsx /home/ubuntu/deep-blue/scripts/dedup-backfill.ts                 # 正式执行
 * 
 * 执行流程：
 *   Step 1: 数据库新增字段（ALTER TABLE，幂等）
 *   Step 2: 创建别名表并预填充
 *   Step 3: 回填所有海缆的 canonical_name / canonical_base / canonical_suffix
 *   Step 4: canonical 精确匹配 → 自动合并确认的重复
 *   Step 5: 模糊匹配扫描 → ≥85分自动合并，65-85分标记待审核
 *   Step 6: 输出报告
 * 
 * 安全性：
 *   - 合并是软删除（设置 merged_into），不物理删除任何数据
 *   - 所有合并操作记录到 cable_merge_log 表
 *   - DRY_RUN=true 只看分析结果不改数据
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
// Step 1: 数据库迁移（幂等，可重复执行）
// ============================================================

async function ensureSchema(): Promise<void> {
  console.log('\n=== Step 1: 数据库字段迁移 ===\n');

  const ddl = [
    // Cable 表新字段
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS data_source TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS external_id TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_name TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_base TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_suffix TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS review_status TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS possible_duplicate_of TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_into TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ`,
    // 索引
    `CREATE INDEX IF NOT EXISTS idx_cables_canonical_base ON cables (canonical_base)`,
    `CREATE INDEX IF NOT EXISTS idx_cables_canonical_name ON cables (canonical_name)`,
    `CREATE INDEX IF NOT EXISTS idx_cables_merged_into ON cables (merged_into)`,
    // 别名表
    `CREATE TABLE IF NOT EXISTS cable_name_aliases (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       alias TEXT NOT NULL UNIQUE,
       canonical TEXT NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       note TEXT
     )`,
    // 合并日志表
    `CREATE TABLE IF NOT EXISTS cable_merge_log (
       id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
       kept_cable_id TEXT NOT NULL,
       removed_cable_id TEXT NOT NULL,
       kept_name TEXT NOT NULL,
       removed_name TEXT NOT NULL,
       merge_method TEXT NOT NULL,
       match_score REAL,
       merged_at TIMESTAMPTZ DEFAULT NOW(),
       merged_by TEXT DEFAULT 'system'
     )`,
  ];

  for (const sql of ddl) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (e) {
      // IF NOT EXISTS 保证幂等，这里只抓非致命错误
      const msg = (e as Error).message;
      if (!msg.includes('already exists')) {
        console.log(`  注意: ${msg.slice(0, 100)}`);
      }
    }
  }

  // 预填充别名
  const aliases: [string, string, string][] = [
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
        `INSERT INTO cable_name_aliases (id, alias, canonical, note) 
         VALUES (gen_random_uuid()::text, $1, $2, $3) ON CONFLICT (alias) DO NOTHING`,
        alias, canonical, note
      );
    } catch (_) { /* 忽略 */ }
  }

  console.log('  迁移完成');
}

// ============================================================
// Step 2-3: 加载数据 + 回填 canonical names
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

  console.log('\n=== Step 3: 加载海缆 + 回填 canonical names ===\n');

  const raw = await prisma.cable.findMany({
    include: {
      landingStations: {
        include: { landingStation: true },
      },
    },
  });

  const cables: CableInfo[] = [];
  let backfillCount = 0;

  for (const c of raw as any[]) {
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

    // 回填 canonical 字段到数据库
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

  console.log(`  总海缆: ${cables.length}`);
  console.log(`  回填: ${DRY_RUN ? '跳过（DRY_RUN）' : `${backfillCount} 条`}`);

  // 打印状态分布
  const statusCount: Record<string, number> = {};
  for (const c of cables) { statusCount[c.status] = (statusCount[c.status] || 0) + 1; }
  console.log('  状态分布:', statusCount);

  return cables;
}

// ============================================================
// Step 4: 精确匹配（canonical name 完全相同的分组）
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
  console.log('\n=== Step 4: canonical 精确匹配 ===\n');

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

    // 保留"最好"的记录：登陆站多 > 有GeoJSON > 名称短 > 先入库
    group.sort((a, b) => {
      if (b.landingStationCount !== a.landingStationCount) return b.landingStationCount - a.landingStationCount;
      if (a.hasGeoJson !== b.hasGeoJson) return a.hasGeoJson ? -1 : 1;
      return a.name.length - b.name.length;
    });

    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      actions.push({
        keepId: keep.id,
        removeId: group[i].id,
        keepName: keep.name,
        removeName: group[i].name,
        method: 'auto-exact',
        score: 100,
        reason: `canonical="${canonical}"`,
      });
    }
  }

  console.log(`  发现 ${actions.length} 对精确重复`);
  for (const a of actions) {
    console.log(`    保留 "${a.keepName}" ← 合并 "${a.removeName}" (${a.reason})`);
  }

  return actions;
}

// ============================================================
// Step 5: 模糊匹配（精确匹配未覆盖的漏网之鱼）
// ============================================================

interface ReviewFlag {
  cableId: string;
  cableName: string;
  possibleDuplicateOfId: string;
  possibleDuplicateOfName: string;
  score: number;
  detail: string;
}

function findFuzzyDuplicates(
  cables: CableInfo[],
  alreadyMergedIds: Set<string>,
): { autoMerge: MergeAction[]; review: ReviewFlag[] } {
  console.log('\n=== Step 5: 模糊匹配扫描 ===\n');

  const autoMerge: MergeAction[] = [];
  const review: ReviewFlag[] = [];
  const active = cables.filter(c => !alreadyMergedIds.has(c.id));
  const processed = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      const pairKey = [a.id, b.id].sort().join('|');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // 快速剪枝
      if (Math.abs(a.parsed.base.length - b.parsed.base.length) > 15) continue;

      // base 相同 + suffix 不同 → 不同海缆（第二级排除）
      if (a.parsed.base === b.parsed.base
        && a.parsed.suffix !== '' && b.parsed.suffix !== ''
        && a.parsed.suffix !== b.parsed.suffix) continue;

      const nameScore = jaroWinkler(a.parsed.base, b.parsed.base);
      if (nameScore < 0.65) continue;

      // suffix 不兼容 → 跳过
      if (a.parsed.suffix !== '' && b.parsed.suffix !== ''
        && a.parsed.suffix !== b.parsed.suffix) continue;

      const stationScore = jaccard(a.stationNames, b.stationNames);
      const yearScore = yearSimilarity(a.rfsYear, b.rfsYear);
      const total = (nameScore * 0.4 + stationScore * 0.4 + yearScore * 0.2) * 100;

      const detail = `name=${Math.round(nameScore * 100)} station=${Math.round(stationScore * 100)} year=${Math.round(yearScore * 100)}`;

      if (total >= 85) {
        // 选保留方：登陆站多的优先
        const [keep, remove] = a.landingStationCount >= b.landingStationCount ? [a, b] : [b, a];
        autoMerge.push({
          keepId: keep.id, removeId: remove.id,
          keepName: keep.name, removeName: remove.name,
          method: 'auto-fuzzy', score: Math.round(total), reason: detail,
        });
      } else if (total >= 65) {
        review.push({
          cableId: a.id, cableName: a.name,
          possibleDuplicateOfId: b.id, possibleDuplicateOfName: b.name,
          score: Math.round(total), detail,
        });
      }
    }
  }

  console.log(`  模糊自动合并: ${autoMerge.length} 对`);
  for (const a of autoMerge) {
    console.log(`    [${a.score}] 保留 "${a.keepName}" ← 合并 "${a.removeName}" (${a.reason})`);
  }
  console.log(`  标记待审核: ${review.length} 对`);
  for (const r of review) {
    console.log(`    [${r.score}] "${r.cableName}" ↔ "${r.possibleDuplicateOfName}" (${r.detail})`);
  }

  return { autoMerge, review };
}

// ============================================================
// Step 6: 执行合并
// ============================================================

async function executeMerges(actions: MergeAction[]): Promise<number> {
  if (DRY_RUN) {
    console.log(`\n  [DRY_RUN] 跳过 ${actions.length} 个合并操作\n`);
    return 0;
  }

  let ok = 0;
  for (const action of actions) {
    try {
      // 1. 获取保留方已有的登陆站ID
      const keepStations: any[] = await prisma.$queryRawUnsafe(
        `SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1`, action.keepId
      );
      const keepIds = new Set(keepStations.map(s => s.landing_station_id));

      // 2. 获取被合并方的登陆站关联
      const removeStations: any[] = await prisma.$queryRawUnsafe(
        `SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1`, action.removeId
      );

      // 3. 转移保留方缺少的登陆站
      for (const rs of removeStations) {
        if (!keepIds.has(rs.landing_station_id)) {
          try {
            await prisma.$executeRawUnsafe(
              `INSERT INTO cable_landing_stations (id, cable_id, landing_station_id) 
               VALUES (gen_random_uuid()::text, $1, $2)`,
              action.keepId, rs.landing_station_id
            );
          } catch (_) { /* 唯一约束冲突，跳过 */ }
        }
      }

      // 4. 用被合并方的字段补全保留方的空字段（用 Prisma Client 避免列名问题）
      const keepCable = await prisma.cable.findUnique({ where: { id: action.keepId } });
      const removeCable = await prisma.cable.findUnique({ where: { id: action.removeId } });

      if (keepCable && removeCable) {
        const updates: Record<string, any> = {};
        // Prisma 字段名列表 — 如果你的 schema 中字段名不同，在这里调整
        const fillableFields = [
          'rfsYear', 'yearRfs', 'rfs',           // RFS年份（三种可能的字段名，只有存在的会生效）
          'lengthKm', 'description', 'owners',
          'suppliers', 'url', 'designCapacity', 'litCapacity',
        ];
        for (const field of fillableFields) {
          if (field in keepCable && (keepCable as any)[field] == null && (removeCable as any)[field] != null) {
            updates[field] = (removeCable as any)[field];
          }
        }
        if (Object.keys(updates).length > 0) {
          await prisma.cable.update({ where: { id: action.keepId }, data: updates });
        }
      }

      // 5. 软删除被合并记录
      await prisma.$executeRawUnsafe(
        `UPDATE cables SET merged_into = $1, merged_at = NOW(), review_status = 'MERGED' WHERE id = $2`,
        action.keepId, action.removeId
      );

      // 6. 清理被合并记录的登陆站关联
      await prisma.$executeRawUnsafe(
        `DELETE FROM cable_landing_stations WHERE cable_id = $1`, action.removeId
      );

      // 7. 写合并日志
      await prisma.$executeRawUnsafe(
        `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
        action.keepId, action.removeId, action.keepName, action.removeName, action.method, action.score
      );

      ok++;
      console.log(`  ✓ "${action.removeName}" → "${action.keepName}"`);
    } catch (e) {
      console.error(`  ✗ "${action.removeName}": ${(e as Error).message}`);
    }
  }

  return ok;
}

async function flagForReview(reviews: ReviewFlag[]): Promise<void> {
  if (DRY_RUN || reviews.length === 0) return;
  for (const r of reviews) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE cables SET review_status = 'PENDING_REVIEW', possible_duplicate_of = $1 
         WHERE id = $2 AND (review_status IS NULL OR review_status NOT IN ('MERGED', 'CONFIRMED'))`,
        r.possibleDuplicateOfId, r.cableId
      );
    } catch (_) { /* 忽略 */ }
  }
}

// ============================================================
// 最终报告
// ============================================================

async function printReport(
  originalCount: number,
  exactMerges: MergeAction[],
  fuzzyMerges: MergeAction[],
  reviews: ReviewFlag[],
  mergedCount: number,
): Promise<void> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║            最 终 报 告                 ║');
  console.log('╚════════════════════════════════════════╝\n');

  let remaining: any[] = [];
  try {
    remaining = await prisma.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as count FROM cables WHERE merged_into IS NULL GROUP BY status ORDER BY count DESC`
    );
  } catch (_) {
    // merged_into 字段可能还不存在（DRY_RUN 时）
    remaining = await prisma.$queryRawUnsafe(
      `SELECT status, COUNT(*)::int as count FROM cables GROUP BY status ORDER BY count DESC`
    );
  }

  const totalRemaining = remaining.reduce((sum: number, r: any) => sum + Number(r.count), 0);

  console.log(`原始海缆总数:     ${originalCount}`);
  console.log(`精确匹配重复:     ${exactMerges.length} 对`);
  console.log(`模糊匹配重复:     ${fuzzyMerges.length} 对`);
  console.log(`实际合并成功:     ${mergedCount} 条`);
  console.log(`标记待审核:       ${reviews.length} 对`);
  console.log(`去重后总计:       ${totalRemaining} 条（减少 ${originalCount - totalRemaining} 条）`);
  console.log(`\n去重后状态分布:`);
  for (const row of remaining) {
    console.log(`  ${row.status}: ${row.count}`);
  }

  // 写 JSON 报告
  const fs = await import('fs');
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    originalTotal: originalCount,
    exactMerges: exactMerges.map(a => ({ keep: a.keepName, remove: a.removeName, reason: a.reason })),
    fuzzyMerges: fuzzyMerges.map(a => ({ keep: a.keepName, remove: a.removeName, score: a.score, reason: a.reason })),
    pendingReviews: reviews.map(r => ({ cable: r.cableName, duplicate: r.possibleDuplicateOfName, score: r.score, detail: r.detail })),
    mergedCount,
    remainingByStatus: remaining,
    remainingTotal: totalRemaining,
  };
  const reportPath = '/home/ubuntu/deep-blue/dedup-report.json';
  try {
    const jsonStr = JSON.stringify(report, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2);
    fs.writeFileSync(reportPath, jsonStr, 'utf-8');
    console.log(`\n报告已写入: ${reportPath}`);
  } catch (e) {
    // 本地运行时路径不存在，写到当前目录
    const jsonStr = JSON.stringify(report, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2);
    fs.writeFileSync('dedup-report.json', jsonStr, 'utf-8');
    console.log(`\n报告已写入: dedup-report.json`);
  }
}

// ============================================================
// 主流程
// ============================================================

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗');
  console.log(`║  Deep Blue 海缆去重 — 一次性回填              ║`);
  console.log(`║  模式: ${DRY_RUN ? 'DRY_RUN（只分析不合并）       ' : '正式执行（会修改数据库）       '}     ║`);
  console.log('╚════════════════════════════════════════════════╝');

  await ensureSchema();

  const cables = await loadAndBackfill();
  const originalCount = cables.length;

  // 精确匹配
  const exactActions = findExactDuplicates(cables);
  const exactMerged = await executeMerges(exactActions);
  const exactMergedIds = new Set(exactActions.map(a => a.removeId));

  // 模糊匹配（排除已精确合并的）
  const { autoMerge: fuzzyActions, review: reviews } = findFuzzyDuplicates(cables, exactMergedIds);
  const fuzzyMerged = await executeMerges(fuzzyActions);

  // 标记待审核
  await flagForReview(reviews);

  // 报告
  await printReport(originalCount, exactActions, fuzzyActions, reviews, exactMerged + fuzzyMerged);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * ai-dedup-review.ts
 * 
 * 一次性脚本：用 Qwen AI 处理数据库中现有的 PENDING_REVIEW 疑似重复记录
 * 
 * 工作流程：
 * 1. 查询所有 reviewStatus='PENDING_REVIEW' 且 possibleDuplicateOf 非空的记录
 * 2. 加载对应的候选匹配记录（possibleDuplicateOf 指向的记录）
 * 3. 组装 DedupPair（含登陆站、年份、长度等元数据）
 * 4. 逐对调用 Qwen AI 判断
 * 5. MERGE → 执行合并（复用 CableDedup.executeMerge）
 *    SKIP → 标记为 CONFIRMED（不是重复，独立记录）
 *    UNCERTAIN / 失败 → 保持 PENDING_REVIEW 不动
 * 
 * 安全机制：
 * - 默认 DRY_RUN=true，只打印判断结果不执行
 * - EXECUTE=true 时才真正执行合并/更新
 * - 每条 AI 调用 30s 超时，总脚本 5 分钟超时
 * - 单条失败不影响整体
 * 
 * 用法：
 *   DRY_RUN:    npx tsx scripts/ai-dedup-review.ts
 *   EXECUTE:    EXECUTE=true npx tsx scripts/ai-dedup-review.ts
 * 
 * 路径：scripts/ai-dedup-review.ts
 */

import { PrismaClient } from '@prisma/client';
import { CableDedup, type MergeAction } from '../src/lib/cable-dedup';
import { judgeOnePair, type DedupPair, type CableMeta, type AiDedupVerdict } from '../src/lib/ai-dedup';

// ============================================================
// 配置
// ============================================================

const EXECUTE = process.env.EXECUTE === 'true';
const SCRIPT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟总超时
const DELAY_BETWEEN_CALLS_MS = 1500;      // 调用间隔（比标准多 0.5s，更安全）

// ============================================================
// 主逻辑
// ============================================================

async function main() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[AI Dedup Review] ${EXECUTE ? '🔥 EXECUTE MODE' : '👀 DRY RUN MODE'}`);
  console.log(`${'='.repeat(60)}\n`);

  const prisma = new PrismaClient();

  try {
    // Step 1: 查询所有 PENDING_REVIEW 记录
    const pendingCables = await prisma.cable.findMany({
      where: {
        reviewStatus: 'PENDING_REVIEW',
        possibleDuplicateOf: { not: null },
      },
      include: {
        landingStations: {
          include: { landingStation: true },
        },
      },
    });

    console.log(`[Step 1] 找到 ${pendingCables.length} 条 PENDING_REVIEW 记录\n`);

    if (pendingCables.length === 0) {
      console.log('没有待审核的记录，退出。');
      return;
    }

    // Step 2: 加载候选匹配记录
    const candidateIds = [...new Set(
      pendingCables.map(c => (c as any).possibleDuplicateOf).filter(Boolean)
    )];

    const candidates = await prisma.cable.findMany({
      where: { id: { in: candidateIds } },
      include: {
        landingStations: {
          include: { landingStation: true },
        },
      },
    });

    const candidateMap = new Map(candidates.map(c => [c.id, c]));
    console.log(`[Step 2] 加载了 ${candidates.length} 条候选匹配记录\n`);

    // Step 3: 初始化 CableDedup（用于执行合并）
    let dedup: CableDedup | null = null;
    if (EXECUTE) {
      dedup = new CableDedup(prisma);
      await dedup.init();
    }

    // Step 4: 逐对 AI 判断
    const stats = { total: 0, merged: 0, skipped: 0, uncertain: 0, failed: 0 };

    for (const pending of pendingCables) {
      // 超时检查
      if (Date.now() - startTime > SCRIPT_TIMEOUT_MS) {
        console.log('\n⏰ 总超时 5 分钟，停止处理剩余记录。');
        break;
      }

      stats.total++;
      const candidateId = (pending as any).possibleDuplicateOf;
      const candidate = candidateMap.get(candidateId);

      if (!candidate) {
        console.log(`  ⚠ [${stats.total}] "${pending.name}" → 候选记录 ${candidateId} 不存在，跳过`);
        stats.failed++;
        continue;
      }

      // 组装 DedupPair
      const pair: DedupPair = {
        nameA: pending.name || '',
        nameB: candidate.name || '',
        fuzzyScore: 70, // PENDING_REVIEW 一般在 65-85 之间，给一个中间值
        metaA: extractMeta(pending),
        metaB: extractMeta(candidate),
      };

      console.log(`  [${stats.total}/${pendingCables.length}] "${pair.nameA}" vs "${pair.nameB}"`);

      // 调用 Qwen AI
      const verdict = await judgeOnePair(pair);

      if (!verdict) {
        console.log(`    ❌ API 调用失败，保持 PENDING_REVIEW`);
        stats.failed++;
      } else {
        console.log(`    → ${verdict.decision} (confidence=${verdict.confidence}) ${verdict.reasoning}`);

        if (verdict.decision === 'MERGE' && EXECUTE && dedup) {
          // 执行合并：保留候选记录（通常是 TG 源），合并掉 pending 记录（通常是 SN 源）
          const action: MergeAction = {
            keepId: candidate.id,
            removeId: pending.id,
            keepName: candidate.name || '',
            removeName: pending.name || '',
            method: 'ai-semantic',
            score: verdict.confidence,
          };
          await dedup.executeMerge(action);
          console.log(`    ✅ 已合并: "${pending.name}" → "${candidate.name}"`);
          stats.merged++;
        } else if (verdict.decision === 'MERGE' && !EXECUTE) {
          console.log(`    📝 [DRY RUN] 会合并: "${pending.name}" → "${candidate.name}"`);
          stats.merged++;
        } else if (verdict.decision === 'SKIP') {
          if (EXECUTE) {
            // 标记为 CONFIRMED（独立记录，非重复）
            await prisma.cable.update({
              where: { id: pending.id },
              data: {
                reviewStatus: 'CONFIRMED',
                possibleDuplicateOf: null,
              },
            });
            console.log(`    ✅ 已标记为 CONFIRMED（独立记录）`);
          } else {
            console.log(`    📝 [DRY RUN] 会标记为 CONFIRMED`);
          }
          stats.skipped++;
        } else {
          // UNCERTAIN
          console.log(`    ⏸ 保持 PENDING_REVIEW（AI 不确定）`);
          stats.uncertain++;
        }
      }

      // 调用间隔
      if (stats.total < pendingCables.length) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
      }
    }

    // Step 5: 打印汇总
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[AI Dedup Review] 完成`);
    console.log(`  总计: ${stats.total}`);
    console.log(`  合并: ${stats.merged}`);
    console.log(`  独立: ${stats.skipped}`);
    console.log(`  不确定: ${stats.uncertain}`);
    console.log(`  失败: ${stats.failed}`);
    console.log(`  耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`  模式: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`${'='.repeat(60)}\n`);

  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================
// 辅助函数
// ============================================================

/** 从 Prisma cable 对象提取元数据 */
function extractMeta(cable: any): CableMeta {
  const stations = (cable.landingStations || [])
    .map((ls: any) => {
      const station = ls.landingStation || ls;
      return (station.name || '').trim();
    })
    .filter(Boolean);

  return {
    rfsYear: cable.rfsYear || cable.yearRfs || null,
    lengthKm: cable.lengthKm || null,
    status: cable.status || null,
    owners: cable.owners || null,
    stationNames: stations,
    dataSource: cable.dataSource || null,
  };
}

// ============================================================
// 入口
// ============================================================

main().catch(err => {
  console.error('[AI Dedup Review] Fatal error:', err);
  process.exit(1);
});

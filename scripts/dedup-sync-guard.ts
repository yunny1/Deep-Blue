/**
 * dedup-sync-guard.ts — v2（AI 增强版）
 * 
 * 变更说明（相对 v1）：
 * 
 * 1. 新增 `checkWithAI()` 方法：在 check() 返回 REVIEW 时，
 *    可选调用 Qwen AI 做二次判断，把 REVIEW → MERGE 或 REVIEW → CREATE
 * 
 * 2. 新增 `enableAI` 构造参数：默认 false（向后兼容），设为 true 启用 AI 判断
 * 
 * 3. nightly-sync 中的使用方式（改动最小化）：
 * 
 *    改造前（v1）:
 *    ```
 *    const guard = new SyncDedupGuard(prisma);
 *    ```
 *    
 *    改造后（v2）:
 *    ```
 *    const guard = new SyncDedupGuard(prisma, { enableAI: true });
 *    ```
 *    
 *    check() 的返回值和处理逻辑完全不变，AI 判断在内部自动完成。
 *    如果 AI 不可用（API key 缺失、超时、解析失败），自动降级为 REVIEW（和 v1 行为一致）。
 * 
 * 路径：scripts/dedup-sync-guard.ts
 */

import {
  parseCableName,
  loadAliases,
  jaroWinkler,
  jaccard,
  yearSimilarity,
  type ParsedCableName,
} from '../src/lib/cable-name-parser';
import { judgeOnePair, type DedupPair, type CableMeta } from '../src/lib/ai-dedup';

// ============================================================
// 类型
// ============================================================

export type SyncAction = 'MERGE' | 'REVIEW' | 'CREATE';

export interface SyncDecision {
  action: SyncAction;
  existingId: string | null;
  existingName: string | null;
  confidence: string;
  score: number;
  detail: string;
}

interface IndexedCable {
  id: string;
  name: string;
  parsed: ParsedCableName;
  stationNames: Set<string>;
  rfsYear: number | null;
  /** v2: 额外元数据，供 AI 判断使用 */
  lengthKm: number | null;
  status: string | null;
  owners: string | null;
  dataSource: string | null;
}

interface GuardOptions {
  /** 是否启用 Qwen AI 对 REVIEW 级别结果做二次判断，默认 false */
  enableAI?: boolean;
}

// ============================================================
// 守门类（v2）
// ============================================================

export class SyncDedupGuard {
  private prisma: any;
  private index: IndexedCable[] = [];
  private enableAI: boolean;
  private stats = { merged: 0, reviewed: 0, created: 0, checked: 0, aiCalls: 0, aiMerged: 0, aiSkipped: 0, aiFailed: 0 };

  constructor(prisma: any, options?: GuardOptions) {
    this.prisma = prisma;
    this.enableAI = options?.enableAI ?? false;
  }

  /**
   * 初始化：加载别名表 + 构建内存索引
   */
  async init(): Promise<void> {
    await loadAliases(this.prisma);

    const cables = await this.prisma.cable.findMany({
      where: {
        OR: [
          { mergedInto: null },
          { mergedInto: undefined },
        ],
      },
      include: {
        landingStations: {
          include: { landingStation: true },
        },
      },
    });

    this.index = cables.map((c: any) => {
      const stations = (c.landingStations || []).map((ls: any) => ls.landingStation || ls);
      return {
        id: c.id,
        name: c.name || '',
        parsed: parseCableName(c.name || ''),
        stationNames: new Set(
          stations.map((s: any) => (s.name || '').toLowerCase().trim()).filter(Boolean)
        ),
        rfsYear: c.rfsYear || c.yearRfs || null,
        // v2: 额外字段
        lengthKm: c.lengthKm || null,
        status: c.status || null,
        owners: c.owners || null,
        dataSource: c.dataSource || null,
      };
    });

    console.log(`[SyncDedupGuard] 已索引 ${this.index.length} 条海缆, AI=${this.enableAI ? 'ON' : 'OFF'}`);
  }

  /**
   * 检查一条新记录应该如何处理
   * 
   * v2 变更：当 enableAI=true 且模糊匹配结果为 REVIEW 时，
   * 自动调用 Qwen AI 做二次判断。AI 调用失败则降级为 REVIEW（和 v1 一致）。
   */
  async check(
    incomingName: string,
    incomingStations: Set<string>,
    incomingRfsYear: number | null,
    /** v2: 新记录的额外元数据（可选） */
    incomingMeta?: { lengthKm?: number | null; owners?: string | null; status?: string | null; dataSource?: string | null },
  ): Promise<SyncDecision> {
    this.stats.checked++;
    const incoming = parseCableName(incomingName);

    // ---- 第一级：canonical 精确匹配 ----
    const exactMatch = this.index.find(
      c => c.parsed.canonical === incoming.canonical && incoming.canonical !== ''
    );
    if (exactMatch) {
      return {
        action: 'MERGE',
        existingId: exactMatch.id,
        existingName: exactMatch.name,
        confidence: 'EXACT',
        score: 100,
        detail: `canonical="${incoming.canonical}"`,
      };
    }

    // ---- 第二级：同base不同suffix → 新海缆 ----
    if (incoming.suffix !== '') {
      const sameBaseDiffSuffix = this.index.find(
        c => c.parsed.base === incoming.base
          && c.parsed.suffix !== ''
          && c.parsed.suffix !== incoming.suffix
      );
      if (sameBaseDiffSuffix) {
        this.stats.created++;
        return {
          action: 'CREATE',
          existingId: null,
          existingName: null,
          confidence: 'NONE',
          score: 0,
          detail: `同系列新编号: base="${incoming.base}" suffix="${incoming.suffix}"`,
        };
      }
    }

    // ---- 第三级：模糊匹配 ----
    let bestMatch: IndexedCable | null = null;
    let bestScore = 0;

    for (const candidate of this.index) {
      const nameScore = jaroWinkler(incoming.base, candidate.parsed.base);
      if (nameScore < 0.65) continue;

      if (incoming.suffix !== '' && candidate.parsed.suffix !== ''
        && incoming.suffix !== candidate.parsed.suffix) continue;

      const stationScore = jaccard(incomingStations, candidate.stationNames);
      const yearScore = yearSimilarity(incomingRfsYear, candidate.rfsYear);
      const total = (nameScore * 0.4 + stationScore * 0.4 + yearScore * 0.2) * 100;

      if (total > bestScore) {
        bestScore = total;
        bestMatch = candidate;
      }
    }

    if (bestScore >= 85 && bestMatch) {
      this.stats.merged++;
      return {
        action: 'MERGE',
        existingId: bestMatch.id,
        existingName: bestMatch.name,
        confidence: 'HIGH',
        score: Math.round(bestScore),
        detail: `模糊高置信匹配`,
      };
    }

    // ---- v2: REVIEW 区间 (65-85) → 尝试 AI 二次判断 ----
    if (bestScore >= 65 && bestMatch && this.enableAI) {
      const aiDecision = await this.aiJudge(
        incomingName, incomingStations, incomingRfsYear, incomingMeta,
        bestMatch, Math.round(bestScore),
      );

      if (aiDecision) {
        return aiDecision;
      }
      // AI 失败 → 降级为 REVIEW（下面的逻辑）
    }

    if (bestScore >= 65 && bestMatch) {
      this.stats.reviewed++;
      return {
        action: 'REVIEW',
        existingId: bestMatch.id,
        existingName: bestMatch.name,
        confidence: 'REVIEW',
        score: Math.round(bestScore),
        detail: `模糊中置信匹配${this.enableAI ? '（AI 降级）' : ''}`,
      };
    }

    this.stats.created++;
    return {
      action: 'CREATE',
      existingId: null,
      existingName: null,
      confidence: 'NONE',
      score: 0,
      detail: '无匹配',
    };
  }

  /**
   * v2: AI 二次判断
   * 返回 SyncDecision（MERGE 或 CREATE），或 null（AI 失败/不确定 → 降级为 REVIEW）
   */
  private async aiJudge(
    incomingName: string,
    incomingStations: Set<string>,
    incomingRfsYear: number | null,
    incomingMeta: { lengthKm?: number | null; owners?: string | null; status?: string | null; dataSource?: string | null } | undefined,
    candidate: IndexedCable,
    fuzzyScore: number,
  ): Promise<SyncDecision | null> {
    this.stats.aiCalls++;

    const pair: DedupPair = {
      nameA: incomingName,
      nameB: candidate.name,
      fuzzyScore,
      metaA: {
        rfsYear: incomingRfsYear,
        lengthKm: incomingMeta?.lengthKm,
        status: incomingMeta?.status,
        owners: incomingMeta?.owners,
        stationNames: [...incomingStations],
        dataSource: incomingMeta?.dataSource,
      },
      metaB: {
        rfsYear: candidate.rfsYear,
        lengthKm: candidate.lengthKm,
        status: candidate.status,
        owners: candidate.owners,
        stationNames: [...candidate.stationNames],
        dataSource: candidate.dataSource,
      },
    };

    try {
      const verdict = await judgeOnePair(pair);

      if (!verdict) {
        this.stats.aiFailed++;
        console.log(`    [AI] 调用失败, 降级为 REVIEW`);
        return null;
      }

      console.log(`    [AI] ${verdict.decision} (confidence=${verdict.confidence}): ${verdict.reasoning}`);

      if (verdict.decision === 'MERGE') {
        this.stats.aiMerged++;
        this.stats.merged++;
        return {
          action: 'MERGE',
          existingId: candidate.id,
          existingName: candidate.name,
          confidence: 'AI_CONFIRMED',
          score: verdict.confidence,
          detail: `AI确认合并: ${verdict.reasoning}`,
        };
      }

      if (verdict.decision === 'SKIP') {
        this.stats.aiSkipped++;
        this.stats.created++;
        return {
          action: 'CREATE',
          existingId: null,
          existingName: null,
          confidence: 'AI_REJECTED',
          score: 0,
          detail: `AI确认独立: ${verdict.reasoning}`,
        };
      }

      // UNCERTAIN → 降级为 REVIEW
      this.stats.aiFailed++;
      return null;

    } catch (e: any) {
      this.stats.aiFailed++;
      console.error(`    [AI] Error: ${e.message}`);
      return null;
    }
  }

  /**
   * 执行合并（和 v1 完全一致）
   */
  async merge(existingId: string, incomingData: any): Promise<void> {
    const existing = await this.prisma.cable.findUnique({ where: { id: existingId } });
    if (!existing) return;

    const updates: Record<string, any> = {};
    const fillableFields = ['rfsYear', 'lengthKm', 'description', 'owners', 'suppliers', 'url', 'designCapacity'];
    for (const field of fillableFields) {
      if ((existing as any)[field] == null && incomingData[field] != null) {
        updates[field] = incomingData[field];
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.cable.update({ where: { id: existingId }, data: updates });
    }

    this.stats.merged++;
  }

  /**
   * 新记录入库后同步更新内存索引
   */
  addToIndex(id: string, name: string, stationNames: Set<string>, rfsYear: number | null): void {
    this.index.push({
      id,
      name,
      parsed: parseCableName(name),
      stationNames,
      rfsYear,
      lengthKm: null,
      status: null,
      owners: null,
      dataSource: null,
    });
  }

  /** v2: 打印统计（包含 AI 相关指标） */
  printStats(): void {
    console.log(`[SyncDedupGuard] 统计:`);
    console.log(`  检查=${this.stats.checked} 合并=${this.stats.merged} 待审核=${this.stats.reviewed} 新建=${this.stats.created}`);
    if (this.enableAI) {
      console.log(`  AI调用=${this.stats.aiCalls} AI合并=${this.stats.aiMerged} AI排除=${this.stats.aiSkipped} AI失败=${this.stats.aiFailed}`);
    }
  }
}

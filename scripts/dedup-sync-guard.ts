/**
 * dedup-sync-guard.ts
 * 
 * nightly-sync 去重守门模块
 * 
 * 用法：在 nightly-sync.ts 中导入并集成到入库循环中
 * 
 * 改造前（nightly-sync.ts 中的入库逻辑）：
 * ```
 * for (const incoming of newRecords) {
 *   await prisma.cable.create({ data: incoming });
 * }
 * ```
 * 
 * 改造后：
 * ```
 * import { SyncDedupGuard } from './dedup-sync-guard';
 * 
 * const guard = new SyncDedupGuard(prisma);
 * await guard.init();
 * 
 * for (const incoming of newRecords) {
 *   const decision = await guard.check(incoming.name, incoming.stationNames, incoming.rfsYear);
 *   
 *   switch (decision.action) {
 *     case 'MERGE':
 *       await guard.merge(decision.existingId!, incoming);
 *       break;
 *     case 'REVIEW':
 *       await prisma.cable.create({ data: { ...incoming, reviewStatus: 'PENDING_REVIEW', possibleDuplicateOf: decision.existingId } });
 *       break;
 *     case 'CREATE':
 *       await prisma.cable.create({ data: incoming });
 *       break;
 *   }
 * }
 * 
 * guard.printStats();
 * ```
 * 
 * 路径：/home/ubuntu/deep-blue/scripts/dedup-sync-guard.ts
 */

import {
  parseCableName,
  loadAliases,
  jaroWinkler,
  jaccard,
  yearSimilarity,
  type ParsedCableName,
} from '../src/lib/cable-name-parser';

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
}

// ============================================================
// 守门类
// ============================================================

export class SyncDedupGuard {
  private prisma: any;
  private index: IndexedCable[] = [];
  private stats = { merged: 0, reviewed: 0, created: 0, checked: 0 };

  constructor(prisma: any) {
    this.prisma = prisma;
  }

  /**
   * 初始化：加载别名表 + 构建内存索引
   * 在 nightly-sync 开始时调用一次
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
      };
    });

    console.log(`[SyncDedupGuard] 已索引 ${this.index.length} 条海缆`);
  }

  /**
   * 检查一条新记录应该如何处理
   */
  check(
    incomingName: string,
    incomingStations: Set<string>,
    incomingRfsYear: number | null,
  ): SyncDecision {
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

      // suffix 不兼容 → 跳过
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
    if (bestScore >= 65 && bestMatch) {
      this.stats.reviewed++;
      return {
        action: 'REVIEW',
        existingId: bestMatch.id,
        existingName: bestMatch.name,
        confidence: 'REVIEW',
        score: Math.round(bestScore),
        detail: `模糊中置信匹配`,
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
   * 执行合并：将新数据合并到已有记录
   * 补全空字段，不覆盖已有值
   */
  async merge(existingId: string, incomingData: any): Promise<void> {
    // 用 COALESCE 逻辑补全
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
   * 新记录入库后，同步更新内存索引
   * 在 CREATE 操作后调用，确保后续检查能看到新记录
   */
  addToIndex(id: string, name: string, stationNames: Set<string>, rfsYear: number | null): void {
    this.index.push({
      id,
      name,
      parsed: parseCableName(name),
      stationNames,
      rfsYear,
    });
  }

  /** 打印本次同步的去重统计 */
  printStats(): void {
    console.log(`[SyncDedupGuard] 统计: 检查=${this.stats.checked} 合并=${this.stats.merged} 待审核=${this.stats.reviewed} 新建=${this.stats.created}`);
  }
}

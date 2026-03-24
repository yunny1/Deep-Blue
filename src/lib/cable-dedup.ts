/**
 * cable-dedup.ts
 * 
 * 海缆去重匹配管道（三级确定性判断）
 * 
 * 设计原则：
 * - 第一级：canonical name 精确匹配 → 100%确认同一条缆 → 自动合并
 * - 第二级：base相同但suffix不同 → 100%确认是不同的缆 → 明确排除（防止FEC-1合并到FEC-2）
 * - 第三级：模糊匹配兜底 → 高分自动合并，中分标记待审核
 * 
 * 使用方式：
 *   import { CableDedup } from '../src/lib/cable-dedup';
 *   const dedup = new CableDedup(prisma);
 *   await dedup.init();
 *   const result = await dedup.findMatch(incomingCable);
 * 
 * 路径：src/lib/cable-dedup.ts
 */

import {
  parseCableName,
  loadAliases,
  jaroWinkler,
  jaccard,
  yearSimilarity,
  type ParsedCableName,
} from './cable-name-parser';

// ============================================================
// 1. 类型定义
// ============================================================

export interface CableRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  rfsYear: number | null;
  stationNames: Set<string>;
  parsed: ParsedCableName;
}

export type MatchConfidence = 'EXACT' | 'HIGH' | 'REVIEW' | 'NONE';

export interface MatchResult {
  match: CableRecord | null;
  confidence: MatchConfidence;
  score: number;            // 0-100，EXACT=100, NONE=0
  detail: string;           // 人类可读的匹配说明
}

export interface MergeAction {
  keepId: string;            // 保留的cable id
  removeId: string;          // 被合并的cable id
  keepName: string;
  removeName: string;
  method: string;            // 'auto-exact' | 'auto-fuzzy' | 'manual'
  score: number;
}

// ============================================================
// 2. 主类
// ============================================================

export class CableDedup {
  private prisma: any;
  private existingCables: CableRecord[] = [];
  private initialized = false;

  constructor(prisma: any) {
    this.prisma = prisma;
  }

  /**
   * 初始化：加载别名表 + 构建现有海缆的内存索引
   * 必须在 findMatch() 之前调用
   */
  async init(): Promise<void> {
    // 加载别名表
    await loadAliases(this.prisma);

    // 拉取所有未被合并的海缆（merged_into 为 NULL 的）
    const cables = await this.prisma.cable.findMany({
      where: {
        OR: [
          { mergedInto: null },
          { mergedInto: undefined },
        ],
      },
      include: {
        landingStations: {
          include: {
            landingStation: true,
          },
        },
      },
    });

    this.existingCables = cables.map((c: any) => {
      const stations = (c.landingStations || []).map((ls: any) => ls.landingStation || ls);
      return {
        id: c.id,
        name: c.name || '',
        slug: c.slug || '',
        status: c.status || 'UNKNOWN',
        rfsYear: c.rfsYear || c.yearRfs || c.rfs || null,
        stationNames: new Set(
          stations.map((s: any) => (s.name || '').toLowerCase().trim()).filter(Boolean)
        ),
        parsed: parseCableName(c.name || ''),
      };
    });

    this.initialized = true;
    console.log(`[CableDedup] 已索引 ${this.existingCables.length} 条海缆`);
  }

  /**
   * 三级匹配：为一条新海缆寻找现有数据库中的匹配项
   */
  findMatch(
    incomingName: string,
    incomingStations: Set<string>,
    incomingRfsYear: number | null,
  ): MatchResult {
    if (!this.initialized) {
      throw new Error('[CableDedup] 未初始化，请先调用 init()');
    }

    const incoming = parseCableName(incomingName);

    // ---- 第一级：canonical name 精确匹配 ----
    // base + suffix 完全一致 → 确认是同一条缆
    const exactMatch = this.existingCables.find(
      c => c.parsed.canonical === incoming.canonical && incoming.canonical !== ''
    );
    if (exactMatch) {
      return {
        match: exactMatch,
        confidence: 'EXACT',
        score: 100,
        detail: `canonical精确匹配: "${incoming.canonical}" === "${exactMatch.parsed.canonical}"`,
      };
    }

    // ---- 第二级：base 相同 + suffix 不同 → 明确排除 ----
    // 这一步防止 FEC-1 被合并到 FEC-2
    // 条件：双方都有非空suffix，base相同，suffix不同
    if (incoming.suffix !== '') {
      const sameBaseDiffSuffix = this.existingCables.find(
        c => c.parsed.base === incoming.base
          && c.parsed.suffix !== ''
          && c.parsed.suffix !== incoming.suffix
      );
      if (sameBaseDiffSuffix) {
        // 存在同系列的其他编号 → 当前是新的一期，不应合并
        return {
          match: null,
          confidence: 'NONE',
          score: 0,
          detail: `同系列不同编号: base="${incoming.base}", incoming_suffix="${incoming.suffix}", existing_suffix="${sameBaseDiffSuffix.parsed.suffix}" → 独立记录`,
        };
      }
    }

    // ---- 第三级：模糊匹配兜底 ----
    // 处理别名表未覆盖的情况
    let bestMatch: CableRecord | null = null;
    let bestScore = 0;
    let bestDetail = '';

    for (const candidate of this.existingCables) {
      // 比较 base 部分的相似度（不含suffix）
      const nameScore = jaroWinkler(incoming.base, candidate.parsed.base);

      // 快速剪枝：名称相似度低于0.65直接跳过
      if (nameScore < 0.65) continue;

      // suffix 必须兼容：
      // - 双方suffix相同 → OK
      // - 一方为空 → OK（可能是同一条缆，一个源有编号一个没有）
      // - 双方不同且都非空 → 跳过（不同期数）
      if (incoming.suffix !== '' && candidate.parsed.suffix !== '' && incoming.suffix !== candidate.parsed.suffix) {
        continue;
      }

      const stationScore = jaccard(incomingStations, candidate.stationNames);
      const yearScore = yearSimilarity(incomingRfsYear, candidate.rfsYear);

      // 加权评分：名称40% + 站点40% + 年份20%
      const total = (nameScore * 0.4 + stationScore * 0.4 + yearScore * 0.2) * 100;

      if (total > bestScore) {
        bestScore = total;
        bestMatch = candidate;
        bestDetail = `模糊匹配: name=${Math.round(nameScore * 100)}, station=${Math.round(stationScore * 100)}, year=${Math.round(yearScore * 100)}, total=${Math.round(total)}`;
      }
    }

    if (bestScore >= 85) {
      return { match: bestMatch, confidence: 'HIGH', score: Math.round(bestScore), detail: bestDetail };
    }
    if (bestScore >= 65) {
      return { match: bestMatch, confidence: 'REVIEW', score: Math.round(bestScore), detail: bestDetail };
    }
    return { match: null, confidence: 'NONE', score: Math.round(bestScore), detail: bestDetail || '无匹配候选' };
  }

  /**
   * 执行合并：将 removeCable 合并到 keepCable
   * 
   * 合并策略：
   * 1. 将 removeCable 的登陆站关联转移到 keepCable（如果 keepCable 没有的话）
   * 2. 用 removeCable 的字段补全 keepCable 的空字段
   * 3. 软删除 removeCable（设置 merged_into 字段）
   * 4. 写入合并日志
   */
  async executeMerge(action: MergeAction): Promise<void> {
    const { keepId, removeId, keepName, removeName, method, score } = action;

    try {
      // 4.1 转移登陆站关联
      // 获取 keepCable 已有的登陆站ID
      const keepStations = await this.prisma.cableLandingStation.findMany({
        where: { cableId: keepId },
        select: { landingStationId: true },
      });
      const keepStationIds = new Set(keepStations.map((s: any) => s.landingStationId));

      // 获取 removeCable 的登陆站关联
      const removeStations = await this.prisma.cableLandingStation.findMany({
        where: { cableId: removeId },
      });

      // 转移 keepCable 缺少的登陆站
      for (const rs of removeStations) {
        if (!keepStationIds.has(rs.landingStationId)) {
          try {
            await this.prisma.cableLandingStation.create({
              data: {
                cableId: keepId,
                landingStationId: rs.landingStationId,
              },
            });
          } catch (e) {
            // 唯一约束冲突 → 已存在，跳过
          }
        }
      }

      // 4.2 补全空字段（removeCable 有值但 keepCable 没有的字段）
      const keepCable = await this.prisma.cable.findUnique({ where: { id: keepId } });
      const removeCable = await this.prisma.cable.findUnique({ where: { id: removeId } });

      if (keepCable && removeCable) {
        const fieldsToFill: Record<string, any> = {};
        const fillableFields = [
          'rfsYear', 'lengthKm', 'description', 'owners', 'suppliers',
          'designCapacity', 'url', 'litCapacity',
        ];
        for (const field of fillableFields) {
          if ((keepCable as any)[field] == null && (removeCable as any)[field] != null) {
            fieldsToFill[field] = (removeCable as any)[field];
          }
        }
        if (Object.keys(fieldsToFill).length > 0) {
          await this.prisma.cable.update({
            where: { id: keepId },
            data: fieldsToFill,
          });
        }
      }

      // 4.3 软删除 removeCable
      await this.prisma.cable.update({
        where: { id: removeId },
        data: {
          mergedInto: keepId,
          mergedAt: new Date(),
          reviewStatus: 'MERGED',
        },
      });

      // 4.4 删除 removeCable 的登陆站关联（已转移完毕）
      await this.prisma.cableLandingStation.deleteMany({
        where: { cableId: removeId },
      });

      // 4.5 写合并日志
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
        keepId, removeId, keepName, removeName, method, score,
      );

      // 4.6 从内存索引中移除 removeCable
      this.existingCables = this.existingCables.filter(c => c.id !== removeId);

    } catch (e) {
      console.error(`[CableDedup] 合并失败: "${removeName}" → "${keepName}":`, (e as Error).message);
      throw e;
    }
  }

  /** 获取当前内存中的海缆数量 */
  get cableCount(): number {
    return this.existingCables.length;
  }

  /** 获取所有海缆的parsed结果（供外部脚本使用） */
  getAllParsed(): CableRecord[] {
    return this.existingCables;
  }
}

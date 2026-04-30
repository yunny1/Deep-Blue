// src/lib/cable-filters.ts
//
// 海缆过滤策略的"单一事实来源"。
//
// 在这个文件出现之前,Deep Blue 平台上每个 API 文件都各自定义了一份"哪些海缆该排除"
// 的规则。结果是:十几个 API 用了五六种不同的过滤策略,有的写了 mergedInto 过滤,
// 有的没写;有的排除了 RETIRED,有的没排除;有几个甚至完全没过滤。
//
// 直接的用户感受:"我新增/删除一条海缆,有的页面看到、有的页面看不到。"
//
// 这个文件的存在意义,是把"什么叫做该显示的海缆"这个判断,从分散在各处的代码里
// 提取出来,集中在一处定义,所有 API 都从这里 import。以后再要修改"该显示什么",
// 只改这一个文件即可。
//
// ──────────────────────────────────────────────────────────────────────────
//
// 设计思路:三个语义不同的过滤器,对应三种业务场景。
//
// 1. ACTIVE_CABLE_FILTER  — "该出现在公开视图里的海缆"
//    用于:主页地球、海缆列表、自主权网络、对比工具、断缆模拟、单条详情查询
//    包含:在役、在建、规划中、已退役、已停用(历史数据保留语义)
//    排除:待审核(数据未验证)、上游已移除、已合并到其他海缆(重复)
//
// 2. OPERATIONAL_CABLE_FILTER  — "当前真正在运行或即将运行的海缆"
//    用于:网络拓扑分析、金砖战略分析、主权路径计算
//    包含:在役、在建、规划中
//    排除:ACTIVE 的全部排除项 + 已退役、已停用(它们对当下战略分析无意义)
//
// 3. ADMIN_CABLE_FILTER  — "管理员后台搜索/列表"
//    用于:admin 后台的搜索、待审核列表
//    包含:除了软删除之外的全部记录
//    排除:已合并、已上游移除(管理员不需要管理这些)
//    保留:待审核(管理员就是来审核的)
//
// ──────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

/**
 * ACTIVE 过滤器 — 公开视图中"该出现的海缆"。
 *
 * 这是最常用的过滤器,适用于绝大多数面向用户的页面。
 * 它保留了已退役/已停用的海缆,因为这些缆的历史数据具有情报价值
 * (比如断缆模拟用户可能想分析一条已退役缆"如果还在的话"会发生什么)。
 *
 * 适用 API:
 *   - /api/cables                (主页地球、海缆列表)
 *   - /api/cables/[slug]         (单条详情) ← 注意:仅推荐用,详情页通常 OR-id-or-slug 不加过滤
 *   - /api/cables/filter-options (筛选选项面板)
 *   - /api/stats                 (全局统计:总数)
 *   - /api/compare               (对比工具)
 *   - /api/simulate              (断缆模拟:目标缆查询)
 *   - /api/sovereign-network     (自主权网络图谱)
 */
export const ACTIVE_CABLE_FILTER: Prisma.CableWhereInput = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED'] },
};

/**
 * OPERATIONAL 过滤器 — 当前真正运行/即将运行的海缆。
 *
 * 在做"当前可用资源"语义的分析时使用。比如:
 *   - 网络拓扑要展示真实的"现在能传数据"的连接
 *   - 金砖战略分析要评估当下的主权路由能力
 *   - 断缆模拟要计算可用的替代缆数量
 *
 * 这个过滤器在 ACTIVE 的基础上,再排除已退役 / 已停用的缆。
 *
 * 适用 API:
 *   - /api/topology
 *   - /api/simulate              (替代缆查询部分)
 *   - /api/brics/overview
 *   - /api/brics/transit-analysis
 *   - /api/brics/cable-matrix
 *   - /api/brics/sovereignty
 *   - /api/country/intel-export
 */
export const OPERATIONAL_CABLE_FILTER: Prisma.CableWhereInput = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] },
};

/**
 * IN_SERVICE 过滤器 — 仅当前在役的海缆。
 *
 * 当业务语义就是"现在正在传输数据的缆"时使用,通常是单一状态查询的简写。
 *
 * 适用 API:
 *   - /api/stats 中的 inService 计数
 *   - /api/simulate 中"在役替代缆"计数
 */
export const IN_SERVICE_FILTER: Prisma.CableWhereInput = {
  mergedInto: null,
  status: 'IN_SERVICE',
};

/**
 * ADMIN 过滤器 — 管理员后台视图。
 *
 * 管理员需要看到 PENDING_REVIEW 的海缆(他们就是来审核这些的),
 * 但不需要看到已合并 / 上游已移除的记录(那些是已经处理完的)。
 *
 * 适用 API:
 *   - /api/admin/cable-search
 *   - /api/admin/pending-routes(若有过滤需求)
 */
export const ADMIN_CABLE_FILTER: Prisma.CableWhereInput = {
  mergedInto: null,
  status: { notIn: ['REMOVED'] },
};

/**
 * 组合工具:在已有 where 条件上叠加 ACTIVE 过滤。
 *
 * 当 API 需要一个特定语义的查询(比如"某国的海缆"),又要保证基础过滤一致时使用。
 *
 * 用法示例:
 *   const cables = await prisma.cable.findMany({
 *     where: withActive({
 *       landingStations: { some: { landingStation: { countryCode: 'CN' } } }
 *     }),
 *   });
 */
export function withActive<T extends Prisma.CableWhereInput>(extra: T): Prisma.CableWhereInput {
  return { ...ACTIVE_CABLE_FILTER, ...extra };
}

export function withOperational<T extends Prisma.CableWhereInput>(extra: T): Prisma.CableWhereInput {
  return { ...OPERATIONAL_CABLE_FILTER, ...extra };
}

export function withInService<T extends Prisma.CableWhereInput>(extra: T): Prisma.CableWhereInput {
  return { ...IN_SERVICE_FILTER, ...extra };
}

export function withAdmin<T extends Prisma.CableWhereInput>(extra: T): Prisma.CableWhereInput {
  return { ...ADMIN_CABLE_FILTER, ...extra };
}

// src/lib/cache-invalidation.ts
//
// 缓存清除的"单一事实来源"。
//
// 在这个文件出现之前,清除海缆相关缓存的逻辑只存在于 cable-save/route.ts 的
// 私有 clearMapCache() 函数里,而且它只清四个 key:
//   cables:geo:details, cables:geo, cables:list, stats:global
//
// 但系统里还有两个非常重要的缓存它没碰:
//   transit:analysis:v1   (金砖中转路径分析,TTL 6 小时)
//   sovereign-routes:v1   (自主权网络路径,管理员手工上传,TTL 365 天)
//
// 直接的用户感受:"我在 admin 改了海缆,金砖战略页要等 6 小时才更新。"
//
// 这个文件的作用是把所有缓存清除逻辑集中到一处,根据"修改了什么数据"决定
// "应该清哪些缓存",避免漏清。
//
// ──────────────────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Upstash Redis pipeline 调用:批量执行多个命令。
 *
 * 用 pipeline 而不是 N 次单独 fetch,可以把 N 个命令打包成一个 HTTP 请求,
 * 减少网络往返延迟。在 serverless 环境下这很重要。
 *
 * 失败时静默返回(catch 吞掉异常),因为缓存清除是"最佳努力"操作:
 * 即使清除失败,数据本身已经写入数据库了,缓存最坏情况也只是过期前继续显示旧值。
 */
async function pipeline(commands: string[][]): Promise<void> {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  if (commands.length === 0) return;
  try {
    await fetch(`${REDIS_URL}/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(commands),
    });
  } catch {
    // 静默失败:见上方注释
  }
}

// ── 缓存键的分层定义 ─────────────────────────────────────────────────────────

/**
 * "地图层"缓存:与海缆地理数据相关的所有缓存。
 * 添加/修改/删除海缆时必须清除。
 */
const MAP_CACHE_KEYS = [
  'cables:geo:details',  // 主页地球用,带路线坐标
  'cables:geo',          // 简化版地理数据
  'cables:list',         // 海缆列表
];

/**
 * "统计层"缓存:海缆统计数字。
 * 海缆数量变化时必须清除。
 */
const STATS_CACHE_KEYS = [
  'stats:global',
];

/**
 * "战略分析层"缓存:基于海缆数据的衍生分析结果。
 * 海缆数据变化、登陆站变化、所有权变化时都应清除,因为这些都会影响主权评级。
 */
const STRATEGIC_CACHE_KEYS = [
  'transit:analysis:v1', // 金砖中转路径分析(计算密集,TTL 6h)
];

// ── 公开导出的清除函数 ───────────────────────────────────────────────────────

/**
 * 清除海缆数据变更后所有受影响的缓存。
 *
 * 这是"完整清除":一次清完地图、统计、战略分析三层。
 * 几乎所有海缆写入操作都应该用这个函数,而不是只清局部。
 *
 * 调用场景:
 *   - 新增一条海缆            ✓
 *   - 修改海缆字段(名称、状态、路线、容量等)  ✓
 *   - 修改海缆登陆站关联       ✓
 *   - 修改海缆建造商或运营商    ✓
 *   - 软删除海缆(标记 REMOVED 或 mergedInto)  ✓
 *
 * 为什么要 await:
 *   v5 文档 "clearMapCache 必须 await" 这条踩坑笔记的根因是 Vercel serverless
 *   函数返回响应后实例会被立刻回收,fire-and-forget 的 fetch 可能根本没发出去。
 *   所以调用方必须 await 这个函数,确保清除完成后再返回响应。
 *
 * 用法:
 *   import { invalidateCableCaches } from '@/lib/cache-invalidation';
 *
 *   await prisma.cable.update({ ... });
 *   await invalidateCableCaches();
 *   return NextResponse.json({ ok: true });
 */
export async function invalidateCableCaches(): Promise<void> {
  const allKeys = [...MAP_CACHE_KEYS, ...STATS_CACHE_KEYS, ...STRATEGIC_CACHE_KEYS];
  const commands = allKeys.map(key => ['del', key]);
  await pipeline(commands);
}

/**
 * 仅清除地图和统计层(轻量级清除)。
 *
 * 适用于"修改不影响主权评级"的场景。但实际工程中很难严格判断,
 * 建议默认用 invalidateCableCaches,只在确认安全时用这个。
 */
export async function invalidateMapCachesOnly(): Promise<void> {
  const allKeys = [...MAP_CACHE_KEYS, ...STATS_CACHE_KEYS];
  const commands = allKeys.map(key => ['del', key]);
  await pipeline(commands);
}

/**
 * 仅清除战略分析缓存。
 *
 * 适用于:数据底层没变,但分析逻辑或主权分类规则更新时手动触发。
 * 当前的 /api/admin/transit-cache 也清这个。
 */
export async function invalidateStrategicCaches(): Promise<void> {
  const commands = STRATEGIC_CACHE_KEYS.map(key => ['del', key]);
  await pipeline(commands);
}

/**
 * 清除自主权网络上传数据缓存。
 *
 * 仅在管理员通过 SovereignRouteCompare 上传新版自主权路径数据后调用。
 * 默认不在常规海缆变更时清除(因为这个数据是手工维护的,生命周期独立)。
 */
export async function invalidateSovereignRoutesCache(): Promise<void> {
  await pipeline([['del', 'sovereign-routes:v1']]);
}

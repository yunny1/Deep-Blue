/**
 * fix-all.ts
 * 
 * 终极诊断 + 修复脚本 — 一次性解决所有问题
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/fix-all.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  Deep Blue 终极诊断 + 修复                    ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // ============================================================
  // 诊断 1: 数据库海缆状态全景
  // ============================================================
  console.log('=== 诊断 1: 数据库海缆全景 ===\n');

  const allCables: any[] = await prisma.$queryRawUnsafe(`
    SELECT status, merged_into IS NOT NULL as is_merged, COUNT(*)::int as count 
    FROM cables 
    GROUP BY status, merged_into IS NOT NULL 
    ORDER BY count DESC
  `);
  console.log('  全量分布（含已合并/已移除）:');
  for (const row of allCables) {
    console.log(`    ${row.status || 'NULL'} | ${row.is_merged ? '已合并' : '活跃'} | ${row.count} 条`);
  }

  const totalAll: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM cables`);
  console.log(`\n  数据库总行数: ${totalAll[0].count}`);

  // 检查 last_synced_at 字段状态
  let hasSyncColumn = false;
  try {
    const syncCheck: any[] = await prisma.$queryRawUnsafe(`
      SELECT 
        COUNT(*)::int as total,
        COUNT(last_synced_at)::int as has_sync,
        COUNT(*)::int - COUNT(last_synced_at)::int as no_sync
      FROM cables WHERE merged_into IS NULL
    `);
    hasSyncColumn = true;
    console.log(`\n  lastSyncedAt 字段: 已存在`);
    console.log(`    有值: ${syncCheck[0].has_sync} | 无值(NULL): ${syncCheck[0].no_sync}`);
  } catch (e) {
    console.log(`\n  lastSyncedAt 字段: 不存在（${(e as Error).message.slice(0, 50)}）`);
  }

  // 检查数据源分布
  const sourceDist: any[] = await prisma.$queryRawUnsafe(`
    SELECT COALESCE(data_source, 'UNKNOWN') as source, COUNT(*)::int as count 
    FROM cables WHERE merged_into IS NULL
    GROUP BY data_source ORDER BY count DESC
  `);
  console.log('\n  数据源分布（活跃记录）:');
  for (const row of sourceDist) {
    console.log(`    ${row.source}: ${row.count}`);
  }

  // 检查 ID 前缀分布（判断哪些是 TG 的、哪些是 SN 的）
  const idDist: any[] = await prisma.$queryRawUnsafe(`
    SELECT 
      CASE WHEN id LIKE 'sn-%' THEN 'SN-prefix' ELSE 'TG/other' END as id_type,
      COUNT(*)::int as count
    FROM cables WHERE merged_into IS NULL
    GROUP BY CASE WHEN id LIKE 'sn-%' THEN 'SN-prefix' ELSE 'TG/other' END
  `);
  console.log('\n  ID 前缀分布（活跃记录）:');
  for (const row of idDist) {
    console.log(`    ${row.id_type}: ${row.count}`);
  }

  // ============================================================
  // 诊断 2: 识别孤儿记录（上游不再收录的）
  // ============================================================
  console.log('\n=== 诊断 2: 识别孤儿记录 ===\n');

  // 方法：对比本次 nightly-sync 的结果
  // TG 的记录 ID 不以 sn- 开头，SN 独有的以 sn- 开头
  // 如果一个 sn- 记录的 lastSyncedAt 为 NULL 或很旧，说明上游不再收录它
  
  let orphanCount = 0;
  if (hasSyncColumn) {
    const orphans: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, name, status, data_source, last_synced_at
      FROM cables 
      WHERE merged_into IS NULL 
        AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
        AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '2 hours')
      ORDER BY name
      LIMIT 30
    `);
    orphanCount = orphans.length;

    // 获取精确总数
    const orphanTotal: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count
      FROM cables 
      WHERE merged_into IS NULL 
        AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
        AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '2 hours')
    `);
    orphanCount = orphanTotal[0].count;

    console.log(`  孤儿记录总数: ${orphanCount}`);
    if (orphans.length > 0) {
      console.log('  示例（前30条）:');
      for (const o of orphans) {
        console.log(`    [${o.status}] "${o.name}" (${o.data_source || '未知来源'}, lastSync: ${o.last_synced_at || 'NULL'})`);
      }
    }
  } else {
    // 没有 lastSyncedAt 字段，用 ID 前缀 + data_source 判断
    const snOnly: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count FROM cables 
      WHERE id LIKE 'sn-%' AND merged_into IS NULL
    `);
    console.log(`  无法用 lastSyncedAt 判断（字段不存在）`);
    console.log(`  SN-prefix 记录数: ${snOnly[0].count}（这些中有些可能是孤儿）`);
  }

  // ============================================================
  // 诊断 3: AI 情报 Redis 缓存状态
  // ============================================================
  console.log('\n=== 诊断 3: AI 情报 Redis 缓存 ===\n');

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // 检查 latest key
    const latest = await redis.get('ai:analysis:latest');
    if (latest) {
      const data = typeof latest === 'string' ? JSON.parse(latest) : latest;
      console.log(`  ai:analysis:latest: ✓ 存在`);
      console.log(`    时间: ${data.timestamp}`);
      console.log(`    分析条数: ${data.stats?.aiAnalyzed || 0}`);
    } else {
      console.log(`  ai:analysis:latest: ✗ 不存在或已过期`);
    }

    // 检查 backup key
    const backup = await redis.get('ai:analysis:backup');
    if (backup) {
      const data = typeof backup === 'string' ? JSON.parse(backup) : backup;
      console.log(`  ai:analysis:backup: ✓ 存在`);
      console.log(`    时间: ${data.timestamp}`);
    } else {
      console.log(`  ai:analysis:backup: ✗ 不存在`);
    }

    // 检查 stats:global
    const stats = await redis.get('stats:global');
    if (stats) {
      const data = typeof stats === 'string' ? JSON.parse(stats) : stats;
      const actual = Array.isArray(data) ? (typeof data[0] === 'string' ? JSON.parse(data[0]) : data[0]) : data;
      console.log(`  stats:global: ✓ 存在`);
      console.log(`    total: ${actual?.cables?.total}`);
      console.log(`    inService: ${actual?.cables?.inService}`);
    } else {
      console.log(`  stats:global: ✗ 不存在（会在下次请求时自动重建）`);
    }

    // ============================================================
    // 修复 1: 清理孤儿记录
    // ============================================================
    console.log('\n=== 修复 1: 清理孤儿记录 ===\n');

    if (hasSyncColumn && orphanCount > 0) {
      // 用 lastSyncedAt 精确判断
      const result = await prisma.$executeRawUnsafe(`
        UPDATE cables 
        SET status = 'REMOVED', 
            previous_status = status, 
            status_changed_at = NOW()
        WHERE merged_into IS NULL 
          AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
          AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '2 hours')
      `);
      console.log(`  ✓ 标记 ${result} 条孤儿记录为 REMOVED`);
    } else if (!hasSyncColumn) {
      console.log(`  ⚠ lastSyncedAt 字段不存在，跳过孤儿清理`);
      console.log(`  将使用备选方案：直接对比上游数据`);
    } else {
      console.log(`  ✓ 没有孤儿记录需要清理`);
    }

    // ============================================================
    // 修复 2: 修复 AI 情报
    // ============================================================
    console.log('\n=== 修复 2: 修复 AI 情报 ===\n');

    if (!latest && !backup) {
      // 两个 key 都没有，需要重新跑 ai-precompute
      console.log('  latest 和 backup 都不存在，正在重新运行 AI 预计算...');
      try {
        // 动态导入并运行
        const { analyzeNewsWithAI, preFilterRelevance } = await import('../src/lib/ai-analyzer');
        
        const RSS_SOURCES = [
          { name: 'SubTel Forum', url: 'https://subtelforum.com/feed/' },
          { name: 'Submarine Networks', url: 'https://www.submarinenetworks.com/feed' },
        ];

        const allItems: any[] = [];
        for (const source of RSS_SOURCES) {
          try {
            const res = await fetch(source.url, {
              headers: { 'User-Agent': 'DeepBlue/6.0' },
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const xml = await res.text();
              const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
              let match;
              while ((match = itemRegex.exec(xml)) !== null) {
                const block = match[1];
                const getTag = (tag: string): string => {
                  const cdata = block.match(new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'));
                  if (cdata) return cdata[1].trim();
                  const simple = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
                  return simple ? simple[1].trim() : '';
                };
                const title = getTag('title');
                if (!title) continue;
                allItems.push({
                  title, link: getTag('link'),
                  pubDate: getTag('pubDate') ? new Date(getTag('pubDate')).toISOString() : new Date().toISOString(),
                  description: getTag('description').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').slice(0, 1000),
                  source: source.name,
                });
              }
              console.log(`    ${source.name}: ${allItems.length} 条`);
            }
          } catch (e: any) {
            console.warn(`    ${source.name} 失败: ${e.message}`);
          }
        }

        allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        const preFiltered = allItems.filter(item => preFilterRelevance(item.title, item.description));
        const toAnalyze = preFiltered.slice(0, 8);
        const results: any[] = [];

        for (const item of toAnalyze) {
          try {
            const analysis = await Promise.race([
              analyzeNewsWithAI(item.title, item.description, item.source),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
            ]);
            if (analysis) {
              results.push({ title: item.title, source: item.source, pubDate: item.pubDate, link: item.link, analysis });
              console.log(`    ✓ [${analysis.eventType}] ${item.title.slice(0, 50)}`);
            }
            await new Promise(r => setTimeout(r, 1000));
          } catch (e: any) {
            console.warn(`    ✗ ${item.title.slice(0, 40)}: ${e.message}`);
          }
        }

        if (results.length > 0) {
          results.sort((a, b) => (b.analysis?.severity || 0) - (a.analysis?.severity || 0));
          const relevant = results.filter(r => r.analysis?.isRelevant);
          const payload = {
            timestamp: new Date().toISOString(),
            cached: true,
            stats: {
              totalNewsScanned: allItems.length,
              preFiltered: preFiltered.length,
              aiAnalyzed: results.length,
              relevant: relevant.length,
              faults: relevant.filter(r => r.analysis?.eventType === 'FAULT').length,
              disruptions: relevant.filter(r => r.analysis?.serviceDisruption).length,
            },
            results,
            detectedCables: [...new Set(relevant.flatMap(r => r.analysis?.cableNames || []))],
            affectedCountries: [...new Set(relevant.flatMap(r => r.analysis?.affectedCountries || []))],
          };
          const json = JSON.stringify(payload);
          await redis.set('ai:analysis:latest', json, { ex: 2 * 60 * 60 });
          await redis.set('ai:analysis:backup', json, { ex: 7 * 24 * 60 * 60 });
          console.log(`  ✓ AI 分析完成，${results.length} 条已写入 Redis (latest + backup)`);
        } else {
          console.log('  ⚠ AI 分析未产出结果（Qwen API 可能异常）');
        }
      } catch (e: any) {
        console.error(`  ✗ AI 预计算失败: ${e.message}`);
      }
    } else if (!latest && backup) {
      console.log('  latest 已过期但 backup 存在，前端会自动降级读取 backup');
      console.log('  下次 cron 执行 ai-precompute.ts 时会刷新 latest');
    } else {
      console.log('  ✓ AI 情报缓存正常');
    }

    // ============================================================
    // 修复 3: 清除所有前端缓存，强制刷新
    // ============================================================
    console.log('\n=== 修复 3: 清除所有前端缓存 ===\n');

    await Promise.all([
      redis.del('cables:geojson:full'),
      redis.del('cables:geo:details'),
      redis.del('cables:geo'),
      redis.del('cables:list'),
      redis.del('stats:global'),
    ]);
    console.log('  ✓ 已清除所有前端缓存 key');

  } catch (e: any) {
    console.error(`  Redis 操作失败: ${e.message}`);
  }

  // ============================================================
  // 最终验证
  // ============================================================
  console.log('\n=== 最终验证 ===\n');

  const finalCounts: any[] = await prisma.$queryRawUnsafe(`
    SELECT status, COUNT(*)::int as count 
    FROM cables 
    WHERE merged_into IS NULL AND (status IS NULL OR status != 'REMOVED')
    GROUP BY status 
    ORDER BY count DESC
  `);
  const finalTotal = finalCounts.reduce((sum, r) => sum + r.count, 0);

  console.log(`  修复后活跃海缆: ${finalTotal} 条`);
  for (const row of finalCounts) {
    console.log(`    ${row.status}: ${row.count}`);
  }

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log(`║  完成！活跃海缆: ${finalTotal} 条                    ║`);
  console.log('║  刷新网站查看最新数据                         ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

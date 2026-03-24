// scripts/ai-precompute.ts
// AI 新闻预计算脚本 — 使用 Qwen（通义千问）
//
// v2 改进：
//   1. 双 key 机制：latest（2h TTL）+ backup（7天 TTL）
//      即使 cron 连续失败多小时，前端也能从 backup 读到上一次成功的数据
//   2. 部分结果保存：即使中间某条新闻分析崩溃，已完成的结果也会写入 Redis
//   3. 整体超时保护：脚本总时长超过 5 分钟自动终止并保存已有结果
//   4. 每条 Qwen API 调用加 30s 超时，防止单条卡死拖垮整个脚本

import { analyzeNewsWithAI, preFilterRelevance } from '../src/lib/ai-analyzer';
import { Redis } from '@upstash/redis';

const CACHE_KEY        = 'ai:analysis:latest';
const BACKUP_KEY       = 'ai:analysis:backup';
const CACHE_TTL        = 2 * 60 * 60;          // latest: 2 小时
const BACKUP_TTL       = 7 * 24 * 60 * 60;     // backup: 7 天
const SCRIPT_TIMEOUT   = 5 * 60 * 1000;        // 脚本总超时: 5 分钟
const PER_ITEM_TIMEOUT = 30 * 1000;            // 单条分析超时: 30 秒

const RSS_SOURCES = [
  { name: 'SubTel Forum',       url: 'https://subtelforum.com/feed/' },
  { name: 'Submarine Networks', url: 'https://www.submarinenetworks.com/feed' },
];

function parseRSS(xml: string, sourceName: string): any[] {
  const items: any[] = [];
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
    items.push({
      title,
      link:        getTag('link'),
      pubDate:     getTag('pubDate') ? new Date(getTag('pubDate')).toISOString() : new Date().toISOString(),
      description: getTag('description').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').slice(0, 1000),
      source:      sourceName,
    });
  }
  return items;
}

/**
 * 带超时的 AI 分析包装器
 * 如果 Qwen API 在 PER_ITEM_TIMEOUT 内没有返回，直接放弃这条，继续下一条
 */
async function analyzeWithTimeout(title: string, description: string, source: string): Promise<any | null> {
  return Promise.race([
    analyzeNewsWithAI(title, description, source),
    new Promise<null>((resolve) => setTimeout(() => {
      console.warn(`  ⏱ 超时(${PER_ITEM_TIMEOUT / 1000}s): ${title.slice(0, 40)}`);
      resolve(null);
    }, PER_ITEM_TIMEOUT)),
  ]);
}

/**
 * 构建 payload 对象（从已完成的 results 构建）
 */
function buildPayload(allItems: any[], preFiltered: any[], results: any[]): any {
  const relevant = results.filter(r => r.analysis?.isRelevant);
  return {
    timestamp: new Date().toISOString(),
    cached: true,
    stats: {
      totalNewsScanned: allItems.length,
      preFiltered:      preFiltered.length,
      aiAnalyzed:       results.length,
      relevant:         relevant.length,
      faults:           relevant.filter(r => r.analysis?.eventType === 'FAULT').length,
      disruptions:      relevant.filter(r => r.analysis?.serviceDisruption).length,
    },
    results,
    detectedCables:    [...new Set(relevant.flatMap(r => r.analysis?.cableNames || []))],
    affectedCountries: [...new Set(relevant.flatMap(r => r.analysis?.affectedCountries || []))],
  };
}

/**
 * 写入 Redis（双 key）
 * 成功时同时写 latest（2h）和 backup（7天）
 */
async function writeToRedis(payload: any): Promise<void> {
  try {
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    const json = JSON.stringify(payload);

    // 并行写入两个 key
    await Promise.all([
      redis.set(CACHE_KEY, json, { ex: CACHE_TTL }),
      redis.set(BACKUP_KEY, json, { ex: BACKUP_TTL }),
    ]);
    console.log(`  Redis 写入: ✓ latest(${CACHE_TTL / 3600}h) + backup(${BACKUP_TTL / 86400}天)`);
  } catch (e: any) {
    console.error(`  Redis 写入失败: ${e.message}`);
  }
}

async function main() {
  console.log(`\n[AI Precompute] 开始 ${new Date().toISOString()}`);
  const scriptStart = Date.now();

  if (!process.env.QWEN_API_KEY) {
    console.error('[AI Precompute] 未配置 QWEN_API_KEY，退出');
    process.exit(1);
  }

  // ── 1. 抓取 RSS ──────────────────────────────────────────────
  const allItems: any[] = [];
  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'DeepBlue/6.0' },
        signal: AbortSignal.timeout(15000),  // RSS 抓取 15s 超时
      });
      if (res.ok) {
        const parsed = parseRSS(await res.text(), source.name);
        allItems.push(...parsed);
        console.log(`  ${source.name}: ${parsed.length} 条`);
      }
    } catch (e: any) {
      console.warn(`  ${source.name} 失败: ${e.message}`);
    }
  }

  if (allItems.length === 0) {
    console.warn('[AI Precompute] 未获取到任何新闻，退出');
    // 不写 Redis，让 backup 继续生效
    return;
  }

  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // ── 2. 预筛选 ────────────────────────────────────────────────
  const preFiltered = allItems.filter(item => preFilterRelevance(item.title, item.description));
  console.log(`  预筛选: ${allItems.length} → ${preFiltered.length} 条`);

  const toAnalyze = preFiltered.slice(0, 8);
  const results: any[] = [];

  // ── 3. 逐条分析（带超时 + 总时间限制）────────────────────────
  for (const item of toAnalyze) {
    // 检查脚本总时长，超过 5 分钟就停止分析，保存已有结果
    if (Date.now() - scriptStart > SCRIPT_TIMEOUT) {
      console.warn(`  ⏱ 脚本总时长超过 ${SCRIPT_TIMEOUT / 60000} 分钟，停止后续分析`);
      break;
    }

    try {
      const analysis = await analyzeWithTimeout(item.title, item.description, item.source);
      if (analysis) {
        results.push({ title: item.title, source: item.source, pubDate: item.pubDate, link: item.link, analysis });
        console.log(`  ✓ [${analysis.eventType}] S${analysis.severity} ${item.title.slice(0, 50)}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e: any) {
      // 单条失败不影响其他条目，继续
      console.warn(`  ✗ 分析失败: ${item.title.slice(0, 40)} — ${e.message}`);
    }
  }

  // ── 4. 写入 Redis（即使只成功了一部分也写入）────────────────
  // 只要有至少 1 条分析结果，就写入（比"暂无数据"好）
  if (results.length > 0) {
    results.sort((a, b) => (b.analysis?.severity || 0) - (a.analysis?.severity || 0));
    const payload = buildPayload(allItems, preFiltered, results);
    await writeToRedis(payload);
  } else {
    console.warn('  ⚠ 没有成功分析任何新闻，不覆盖 Redis（保留旧数据）');
  }

  console.log(`[AI Precompute] 完成，分析 ${results.length} 条，耗时 ${((Date.now() - scriptStart) / 1000).toFixed(0)}s`);
}

main().catch(e => {
  console.error('[AI Precompute] 崩溃:', e.message || e);
  // 即使崩溃也不 process.exit(1)，让 backup key 继续生效
  // cron 下一小时会重试
});

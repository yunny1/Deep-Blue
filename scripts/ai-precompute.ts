// scripts/ai-precompute.ts
// AI 新闻预计算脚本 — 使用 Qwen（通义千问）

import { analyzeNewsWithAI, preFilterRelevance } from '../src/lib/ai-analyzer';
import { Redis } from '@upstash/redis';

const CACHE_KEY = 'ai:analysis:latest';
const CACHE_TTL = 2 * 60 * 60;

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

async function main() {
  console.log(`\n[AI Precompute] 开始 ${new Date().toISOString()}`);

  if (!process.env.QWEN_API_KEY) {
    console.error('[AI Precompute] 未配置 QWEN_API_KEY，退出');
    process.exit(1);
  }

  const allItems: any[] = [];
  for (const source of RSS_SOURCES) {
    try {
      const res = await fetch(source.url, { headers: { 'User-Agent': 'DeepBlue/6.0' } });
      if (res.ok) {
        const parsed = parseRSS(await res.text(), source.name);
        allItems.push(...parsed);
        console.log(`  ${source.name}: ${parsed.length} 条`);
      }
    } catch (e: any) {
      console.warn(`  ${source.name} 失败: ${e.message}`);
    }
  }

  allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const preFiltered = allItems.filter(item => preFilterRelevance(item.title, item.description));
  console.log(`  预筛选: ${allItems.length} → ${preFiltered.length} 条`);

  const toAnalyze = preFiltered.slice(0, 8);
  const results: any[] = [];

  for (const item of toAnalyze) {
    try {
      const analysis = await analyzeNewsWithAI(item.title, item.description, item.source);
      if (analysis) {
        results.push({ title: item.title, source: item.source, pubDate: item.pubDate, link: item.link, analysis });
        console.log(`  ✓ [${analysis.eventType}] S${analysis.severity} ${item.title.slice(0, 50)}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (e: any) {
      console.warn(`  分析失败: ${e.message}`);
    }
  }

  results.sort((a, b) => (b.analysis?.severity || 0) - (a.analysis?.severity || 0));

  const relevant = results.filter(r => r.analysis?.isRelevant);
  const payload = {
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

  try {
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set(CACHE_KEY, JSON.stringify(payload), { ex: CACHE_TTL });
    console.log(`  Redis 写入: ✓ 成功`);
  } catch (e: any) {
    console.error(`  Redis 写入失败: ${e.message}`);
  }

  console.log(`[AI Precompute] 完成，分析 ${results.length} 条，相关 ${relevant.length} 条`);
}

main().catch(e => { console.error('[AI Precompute] 崩溃:', e); process.exit(1); });

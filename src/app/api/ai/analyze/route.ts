// src/app/api/ai/analyze/route.ts
// AI新闻分析API — 用MiniMax对最新新闻进行深度结构化分析
// 每次调用会：1)获取最新新闻 2)关键词预筛选 3)AI深度分析 4)返回结构化情报
// 设计为低频调用（每30分钟一次），保护API额度

import { NextRequest, NextResponse } from 'next/server';
import { analyzeNewsWithAI, preFilterRelevance, type AiNewsAnalysis } from '@/lib/ai-analyzer';

// 内存缓存（避免重复分析同一篇新闻）
let analysisCache: {
  timestamp: string;
  results: Array<{
    title: string;
    source: string;
    pubDate: string;
    link: string;
    analysis: AiNewsAnalysis;
  }>;
} | null = null;

let lastAnalysisTime = 0;
const MIN_INTERVAL = 15 * 60 * 1000; // 最少15分钟间隔

// RSS解析（和news API共用的逻辑）
function parseRSSItems(xml: string, sourceName: string): any[] {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const getTag = (tag: string): string => {
      const cdataRegex = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
      const cdataMatch = block.match(cdataRegex);
      if (cdataMatch) return cdataMatch[1].trim();
      const simpleRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
      const simpleMatch = block.match(simpleRegex);
      return simpleMatch ? simpleMatch[1].trim() : '';
    };

    const title = getTag('title');
    const link = getTag('link');
    const pubDate = getTag('pubDate');
    const description = getTag('description').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').slice(0, 1000);

    if (title) {
      items.push({ title, link, pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), description, source: sourceName });
    }
  }
  return items;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  // 检查是否有API Key
  if (!process.env.MINIMAX_API_KEY) {
    return NextResponse.json({
      error: 'MINIMAX_API_KEY not configured',
      hint: 'Add your MiniMax API key to .env.local',
    }, { status: 503 });
  }

  // 频率限制保护
  const now = Date.now();
  if (!forceRefresh && analysisCache && (now - lastAnalysisTime) < MIN_INTERVAL) {
    return NextResponse.json({
      ...analysisCache,
      cached: true,
      nextRefreshIn: Math.ceil((MIN_INTERVAL - (now - lastAnalysisTime)) / 1000) + 's',
    });
  }

  try {
    // 1. 获取最新新闻
    const RSS_SOURCES = [
      { name: 'SubTel Forum', url: 'https://subtelforum.com/feed/' },
      { name: 'Submarine Networks', url: 'https://www.submarinenetworks.com/feed' },
    ];

    const allItems: any[] = [];
    for (const source of RSS_SOURCES) {
      try {
        const res = await fetch(source.url, {
          headers: { 'User-Agent': 'DeepBlue/1.0 (Submarine Cable Monitor)' },
        });
        if (res.ok) {
          const xml = await res.text();
          allItems.push(...parseRSSItems(xml, source.name));
        }
      } catch {}
    }

    // 按时间排序
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // 2. 关键词预筛选（不耗AI额度）
    const preFiltered = allItems.filter(item => preFilterRelevance(item.title, item.description));

    console.log(`[AI Analyzer] Total news: ${allItems.length}, Pre-filtered: ${preFiltered.length}`);

    // 3. 只取前8条进行AI深度分析（保护每5小时100次的额度）
    const toAnalyze = preFiltered.slice(0, 8);
    const results: any[] = [];

    for (const item of toAnalyze) {
      // 检查缓存中是否已分析过这篇
      const cached = analysisCache?.results.find(r => r.title === item.title);
      if (cached) {
        results.push(cached);
        continue;
      }

      // 调用MiniMax进行AI分析
      const analysis = await analyzeNewsWithAI(item.title, item.description, item.source);

      if (analysis) {
        results.push({
          title: item.title,
          source: item.source,
          pubDate: item.pubDate,
          link: item.link,
          analysis,
        });
      }

      // 限速：每次分析间隔2秒
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 4. 按严重程度排序
    results.sort((a, b) => (b.analysis?.severity || 0) - (a.analysis?.severity || 0));

    // 5. 更新缓存
    analysisCache = {
      timestamp: new Date().toISOString(),
      results,
    };
    lastAnalysisTime = now;

    // 6. 生成摘要统计
    const relevantResults = results.filter(r => r.analysis?.isRelevant);
    const faults = relevantResults.filter(r => r.analysis?.eventType === 'FAULT');
    const disruptions = relevantResults.filter(r => r.analysis?.serviceDisruption);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      cached: false,
      stats: {
        totalNewsScanned: allItems.length,
        preFiltered: preFiltered.length,
        aiAnalyzed: results.length,
        relevant: relevantResults.length,
        faults: faults.length,
        disruptions: disruptions.length,
      },
      results,
      // 提取所有被AI识别出的海缆名称
      detectedCables: [...new Set(relevantResults.flatMap(r => r.analysis?.cableNames || []))],
      // 提取所有受影响国家
      affectedCountries: [...new Set(relevantResults.flatMap(r => r.analysis?.affectedCountries || []))],
      // AI使用量统计
      apiUsage: {
        callsThisRound: toAnalyze.length - (analysisCache?.results.filter(r => results.includes(r)).length || 0),
        limit: '100 prompts / 5 hours',
        recommendation: 'Call this endpoint at most 4 times per hour',
      },
    });

  } catch (error) {
    console.error('AI analysis API error:', error);
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
  }
}

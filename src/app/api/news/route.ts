// src/app/api/news/route.ts
// 海缆新闻API — 从SubTel Forum RSS和其他来源获取海缆相关新闻
// 自动将新闻与数据库中的海缆进行关键词匹配

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// RSS源列表（都是免费的、无需API Key）
const RSS_SOURCES = [
  {
    name: 'SubTel Forum',
    // SubTel Forum的RSS feed
    url: 'https://subtelforum.com/feed/',
    category: 'industry',
  },
  {
    name: 'Submarine Networks',
    url: 'https://www.submarinenetworks.com/feed',
    category: 'industry',
  },
];

// 简易RSS XML解析器（不依赖第三方库）
function parseRSSItems(xml: string, sourceName: string): any[] {
  const items: any[] = [];
  // 匹配所有<item>...</item>块
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];

    const getTag = (tag: string): string => {
      // 处理CDATA包裹的内容
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
    const description = getTag('description')
      .replace(/<[^>]+>/g, '') // 去除HTML标签
      .replace(/&[^;]+;/g, ' ') // 去除HTML实体
      .slice(0, 500); // 截断到500字符

    if (title) {
      items.push({
        title,
        link,
        pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        description,
        source: sourceName,
      });
    }
  }

  return items;
}

// 将新闻标题/描述中的海缆名称匹配到数据库
async function matchCablesToNews(
  newsItems: any[],
  cableNames: { id: string; name: string; slug: string }[]
): Promise<any[]> {
  return newsItems.map(item => {
    const textToSearch = `${item.title} ${item.description}`.toLowerCase();
    const matchedCables: { id: string; name: string; slug: string }[] = [];

    for (const cable of cableNames) {
      // 精确匹配海缆名称（不区分大小写）
      if (textToSearch.includes(cable.name.toLowerCase())) {
        matchedCables.push(cable);
      }
    }

    // 也检查常见的海缆缩写/别名
    const ALIASES: Record<string, string> = {
      'sea-me-we': 'SEA-ME-WE',
      'seamewe': 'SEA-ME-WE',
      'aae-1': 'AAE-1',
      'flag': 'FLAG',
      'eig': 'EIG',
      'wacs': 'WACS',
      'ace': 'ACE',
      'sat-3': 'SAT-3',
      'safe': 'SAFE',
      'imewe': 'IMEWE',
      'teams': 'TEAMS',
    };

    for (const [alias, fullName] of Object.entries(ALIASES)) {
      if (textToSearch.includes(alias)) {
        const found = cableNames.find(c => c.name.includes(fullName));
        if (found && !matchedCables.find(m => m.id === found.id)) {
          matchedCables.push(found);
        }
      }
    }

    // 分类新闻事件类型
    let eventCategory = 'GENERAL';
    const lowerTitle = item.title.toLowerCase();
    if (lowerTitle.includes('fault') || lowerTitle.includes('break') ||
        lowerTitle.includes('damage') || lowerTitle.includes('cut') ||
        lowerTitle.includes('outage') || lowerTitle.includes('disruption')) {
      eventCategory = 'EQUIPMENT_FAULT';
    } else if (lowerTitle.includes('earthquake') || lowerTitle.includes('tsunami') ||
               lowerTitle.includes('hurricane') || lowerTitle.includes('typhoon') ||
               lowerTitle.includes('storm')) {
      eventCategory = 'NATURAL_DISASTER';
    } else if (lowerTitle.includes('sabotage') || lowerTitle.includes('attack') ||
               lowerTitle.includes('anchor') || lowerTitle.includes('ship')) {
      eventCategory = 'POLITICAL';
    } else if (lowerTitle.includes('launch') || lowerTitle.includes('rfs') ||
               lowerTitle.includes('complete') || lowerTitle.includes('new cable') ||
               lowerTitle.includes('construction')) {
      eventCategory = 'CONSTRUCTION';
    } else if (lowerTitle.includes('repair') || lowerTitle.includes('maintenance') ||
               lowerTitle.includes('restore')) {
      eventCategory = 'REPAIR';
    }

    return {
      ...item,
      matchedCables,
      eventCategory,
      matchCount: matchedCables.length,
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cableSlug = searchParams.get('cable'); // 可选：只返回某条海缆的新闻
  const limit = parseInt(searchParams.get('limit') || '30');

  try {
    // 1. 从数据库获取所有海缆名称（用于匹配）
    const cableNames = await prisma.cable.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });

    // 2. 并行获取所有RSS源
    const allItems: any[] = [];

    for (const source of RSS_SOURCES) {
      try {
        const res = await fetch(source.url, {
          next: { revalidate: 1800 }, // 缓存30分钟
          headers: { 'User-Agent': 'DeepBlue/1.0 (Submarine Cable Monitor)' },
        });

        if (res.ok) {
          const xml = await res.text();
          const items = parseRSSItems(xml, source.name);
          allItems.push(...items);
        }
      } catch (e) {
        // 某个源获取失败不影响其他源
        console.error(`Failed to fetch ${source.name}:`, e);
      }
    }

    // 3. 匹配海缆
    let matchedNews = await matchCablesToNews(allItems, cableNames);

    // 4. 按时间排序（最新的在前）
    matchedNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // 5. 如果指定了某条海缆，只返回相关新闻
    if (cableSlug) {
      matchedNews = matchedNews.filter(item =>
        item.matchedCables.some((c: any) => c.slug === cableSlug)
      );
    }

    // 6. 限制返回数量
    matchedNews = matchedNews.slice(0, limit);

    return NextResponse.json({
      count: matchedNews.length,
      news: matchedNews,
      sources: RSS_SOURCES.map(s => s.name),
      updated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}

// src/app/api/cables/news/route.ts  v2
// 修复：使用 enable_search:true 而非错误的 tools 数组

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function redisGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch { return null; }
}

async function redisSet(key: string, value: string, ttl: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttl]),
  });
}

export interface NewsItem {
  title: string;
  titleZh: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  publishDate: string;
  category: 'cut' | 'repair' | 'deployment' | 'policy' | 'investment' | 'incident' | 'other';
}

async function fetchCableNews(cableName: string): Promise<NewsItem[]> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return [];

  const y = new Date().getFullYear();

  try {
    const res = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          input: {
            messages: [
              {
                role: 'system',
                content: `你是一个专业的海底光缆新闻助手。请利用搜索能力，搜索关于指定海缆的近两年真实新闻。

严格规则：
1. 必须使用搜索获取真实新闻，不能凭记忆编造
2. 每条新闻必须有真实可访问的URL
3. 标题和摘要必须来自真实搜索结果，不得改写或虚构
4. 如果搜索无结果，返回空数组 []
5. 只返回纯 JSON 数组，不要加任何解释或 markdown 代码块

返回格式（JSON 数组）：
[
  {
    "title": "原始英文标题",
    "titleZh": "中文标题（英文标题则翻译，中文则原样）",
    "summary": "来自搜索结果的真实摘要，不超过120字",
    "sourceUrl": "https://完整的新闻URL",
    "sourceName": "媒体名称",
    "publishDate": "YYYY-MM-DD",
    "category": "cut|repair|deployment|policy|investment|incident|other 选其一"
  }
]`,
              },
              {
                role: 'user',
                content: `请搜索"${cableName} submarine cable"在 ${y-1} 年至 ${y} 年的相关新闻，最多返回 8 条，按时间倒序排列。搜索关键词可以是英文。`,
              },
            ],
          },
          parameters: {
            result_format: 'message',
            temperature: 0.1,
            enable_search: true,   // ← 正确的 Qwen 联网搜索开关
          },
        }),
      }
    );

    if (!res.ok) {
      console.error('[cable-news] Qwen API error:', res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const content = data?.output?.choices?.[0]?.message?.content ?? '';
    const text = Array.isArray(content)
      ? content.map((c: { text?: string }) => c.text ?? '').join('')
      : String(content);

    // 找到 JSON 数组
    const startIdx = text.indexOf('[');
    const endIdx   = text.lastIndexOf(']');
    if (startIdx === -1 || endIdx === -1) return [];

    const parsed: NewsItem[] = JSON.parse(text.slice(startIdx, endIdx + 1));

    // 只保留有真实 http URL 的条目
    return parsed
      .filter(item =>
        item.sourceUrl?.startsWith('http') &&
        item.title &&
        item.publishDate
      )
      .slice(0, 8);
  } catch (e) {
    console.error('[cable-news] parse error:', e);
    return [];
  }
}

export async function GET(req: NextRequest) {
  const slug  = req.nextUrl.searchParams.get('slug') ?? '';
  const name  = req.nextUrl.searchParams.get('name') ?? slug;
  const force = req.nextUrl.searchParams.get('force') === '1';

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const cacheKey   = `cable-news:${slug}`;
  const cacheKeyTs = `cable-news-ts:${slug}`;

  if (!force) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      return NextResponse.json({
        news: JSON.parse(cached),
        cachedAt: await redisGet(cacheKeyTs),
        source: 'redis',
      });
    }
  }

  const news = await fetchCableNews(name);
  const now  = new Date().toISOString();

  if (news.length > 0) {
    await redisSet(cacheKey, JSON.stringify(news), 93600);
    await redisSet(cacheKeyTs, now, 93600);
  }

  return NextResponse.json({ news, cachedAt: now, source: 'live' });
}

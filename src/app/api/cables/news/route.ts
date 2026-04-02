// src/app/api/cables/news/route.ts
//
// 海缆新闻接口：优先读 Redis 缓存，缓存不存在时实时调取 Qwen web_search。
// 防假新闻原则：
//   1. 只使用 Qwen web_search 返回的真实 URL 和标题，不让模型自由捏造内容
//   2. 摘要仅从搜索结果的 snippet 中提取（不让模型续写）
//   3. 返回数据包含 sourceUrl，前端可供用户验证

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Redis 工具
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

async function redisSet(key: string, value: string, ttlSeconds: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttlSeconds]),
  });
}

// 从 Qwen web_search 获取海缆相关新闻（防假新闻版）
async function fetchCableNewsFromQwen(cableName: string): Promise<NewsItem[]> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return [];

  const currentYear = new Date().getFullYear();
  const lastYear    = currentYear - 1;

  // 查询策略：英文关键词确保能搜到国际新闻
  const query = `"${cableName}" submarine cable news ${lastYear} OR ${currentYear} -site:wikipedia.org`;

  try {
    const res = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-plus',
          input: {
            messages: [
              {
                role: 'system',
                content: `你是一个新闻提取助手。你的任务是利用 web_search 工具搜索关于特定海缆的最新新闻，
然后从搜索结果中提取真实的新闻条目。

严格规则：
1. 只返回搜索结果中真实存在的新闻，绝对不能虚构任何内容
2. 标题必须来自搜索结果的原始标题，不得修改
3. 摘要必须来自搜索结果的 snippet，不得自行续写
4. 如果搜索结果中没有找到相关新闻，返回空数组，不要编造
5. 只返回纯 JSON，格式如下（不含 markdown 代码块）：
[
  {
    "title": "新闻标题（英文或中文原标题）",
    "titleZh": "中文标题（如原标题是英文，请翻译；如是中文，直接复制）",
    "summary": "来自搜索结果的原始摘要（不超过150字）",
    "sourceUrl": "新闻链接URL",
    "sourceName": "媒体名称",
    "publishDate": "发布日期 YYYY-MM-DD 格式（若只有年月则填 YYYY-MM-01）",
    "category": "cut|repair|deployment|policy|investment|incident|other 之一"
  }
]`,
              },
              {
                role: 'user',
                content: `请搜索并提取关于 "${cableName}" 海缆在 ${lastYear} 年至今的新闻，最多返回 8 条，按时间倒序。`,
              },
            ],
          },
          parameters: {
            result_format: 'message',
            temperature: 0,
            tools: [
              {
                type: 'web_search',
                web_search: {
                  search_query: query,
                  enable: true,
                },
              },
            ],
          },
        }),
      }
    );

    if (!res.ok) throw new Error(`Qwen API ${res.status}`);
    const data = await res.json();

    // 提取模型回复中的文本
    const content = data?.output?.choices?.[0]?.message?.content ?? '';
    const text = Array.isArray(content)
      ? content.map((c: { text?: string }) => c.text ?? '').join('')
      : String(content);

    // 解析 JSON（去除可能的 markdown 包裹）
    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();

    // 找到第一个 '[' 开始的 JSON 数组
    const startIdx = cleaned.indexOf('[');
    if (startIdx === -1) return [];
    const jsonStr = cleaned.slice(startIdx);
    const parsed: NewsItem[] = JSON.parse(jsonStr);

    // 防护：过滤掉没有真实 URL 的条目
    return parsed
      .filter(item => item.sourceUrl && item.sourceUrl.startsWith('http') && item.title)
      .slice(0, 8);
  } catch (e) {
    console.error('[cable-news] Qwen fetch failed:', e);
    return [];
  }
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

export async function GET(req: NextRequest) {
  const slug  = req.nextUrl.searchParams.get('slug') ?? '';
  const name  = req.nextUrl.searchParams.get('name') ?? slug;
  const force = req.nextUrl.searchParams.get('force') === '1'; // 强制刷新

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const cacheKey  = `cable-news:${slug}`;
  const cacheKeyTs = `cable-news-ts:${slug}`;

  // 读缓存（24h TTL）
  if (!force) {
    const cached = await redisGet(cacheKey);
    if (cached) {
      const ts = await redisGet(cacheKeyTs);
      return NextResponse.json({
        news: JSON.parse(cached),
        cachedAt: ts ?? null,
        source: 'redis',
      });
    }
  }

  // 实时调取
  const news = await fetchCableNewsFromQwen(name);
  const now  = new Date().toISOString();

  // 存入 Redis（26小时，确保 Cron 在 24h 内刷新后仍有缓存）
  if (news.length > 0) {
    await redisSet(cacheKey, JSON.stringify(news), 93600);
    await redisSet(cacheKeyTs, now, 93600);
  }

  return NextResponse.json({ news, cachedAt: now, source: 'live' });
}

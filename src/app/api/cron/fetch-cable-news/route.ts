// src/app/api/cron/fetch-cable-news/route.ts
//
// Vercel Cron Job：每天凌晨 2:00 UTC 自动刷新 26 条保留海缆的新闻缓存。
// 在 vercel.json 中配置：
// {
//   "crons": [{ "path": "/api/cron/fetch-cable-news", "schedule": "0 2 * * *" }]
// }

import { NextRequest, NextResponse } from 'next/server';
import { CANONICAL_CABLE_NAMES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Pro 允许最长 300s，26条缆每条约10s

// slug 生成规则（与海缆数据库一致）
function nameToSlug(name: string): string {
  // 提取括号内缩写作为 slug 的基础（更稳定）
  const abbr = name.match(/\(([^)]+)\)/)?.[1];
  if (abbr) return abbr.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

// Redis SET（带 TTL）
async function redisSet(key: string, value: string, ttlSeconds: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis not configured');
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttlSeconds]),
  });
  if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
}

// 调取单条海缆新闻（与 /api/cables/news 共享逻辑，但从 cron 直接调用）
async function fetchNews(cableName: string): Promise<unknown[]> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return [];

  const y = new Date().getFullYear();
  const query = `"${cableName}" submarine cable news ${y-1} OR ${y}`;

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
              content: `你是新闻提取助手，从 web_search 结果中提取真实新闻，只返回 JSON 数组，不得虚构。
格式：[{"title":"","titleZh":"","summary":"","sourceUrl":"","sourceName":"","publishDate":"YYYY-MM-DD","category":""}]`,
            },
            {
              role: 'user',
              content: `搜索 "${cableName}" 海缆近两年新闻，最多8条，倒序。`,
            },
          ],
        },
        parameters: {
          result_format: 'message',
          temperature: 0,
          tools: [{ type: 'web_search', web_search: { search_query: query, enable: true } }],
        },
      }),
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  const text = (() => {
    const c = data?.output?.choices?.[0]?.message?.content ?? '';
    return Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? '').join('') : String(c);
  })();

  try {
    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
    const si = cleaned.indexOf('[');
    if (si === -1) return [];
    const parsed = JSON.parse(cleaned.slice(si));
    // 只保留有真实 URL 的条目
    return parsed.filter((x: { sourceUrl?: string }) => x.sourceUrl?.startsWith('http'));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  // Vercel Cron 会带 Authorization 头，校验防止外部触发
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { name: string; slug: string; count: number; error?: string }[] = [];
  const now = new Date().toISOString();

  for (const cableName of CANONICAL_CABLE_NAMES) {
    const slug = nameToSlug(cableName);
    try {
      // 每条缆间隔 2 秒，避免 API 限流
      await new Promise(r => setTimeout(r, 2000));
      const news = await fetchNews(cableName);

      if (news.length > 0) {
        await redisSet(`cable-news:${slug}`, JSON.stringify(news), 93600);
        await redisSet(`cable-news-ts:${slug}`, now, 93600);
      }

      results.push({ name: cableName, slug, count: news.length });
    } catch (e: unknown) {
      results.push({ name: cableName, slug, count: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 记录最后一次 Cron 执行时间
  await redisSet('cable-news-cron-last-run', JSON.stringify({ runAt: now, results }), 604800);

  return NextResponse.json({
    success: true,
    runAt: now,
    total: CANONICAL_CABLE_NAMES.length,
    fetched: results.filter(r => r.count > 0).length,
    results,
  });
}

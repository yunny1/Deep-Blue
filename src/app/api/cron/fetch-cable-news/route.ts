// src/app/api/cron/fetch-cable-news/route.ts  v2
// 修复：enable_search:true

import { NextRequest, NextResponse } from 'next/server';
import { CANONICAL_CABLE_NAMES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function nameToSlug(name: string): string {
  const abbr = name.match(/\(([^)]+)\)/)?.[1];
  if (abbr) return abbr.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

async function redisSet(key: string, value: string, ttl: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis not configured');
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttl]),
  });
}

async function fetchNews(cableName: string): Promise<unknown[]> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return [];
  const y = new Date().getFullYear();

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
              content: '海底光缆新闻助手。只返回真实搜索结果的JSON数组，禁止虚构。格式：[{"title":"","titleZh":"","summary":"","sourceUrl":"https://...","sourceName":"","publishDate":"YYYY-MM-DD","category":""}]',
            },
            {
              role: 'user',
              content: `搜索 "${cableName} submarine cable" ${y-1}-${y} 年新闻，最多8条，只要有真实URL的。`,
            },
          ],
        },
        parameters: {
          result_format: 'message',
          temperature: 0.1,
          enable_search: true,
        },
      }),
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  const content = data?.output?.choices?.[0]?.message?.content ?? '';
  const text = Array.isArray(content)
    ? content.map((c: { text?: string }) => c.text ?? '').join('')
    : String(content);

  try {
    const si = text.indexOf('['), ei = text.lastIndexOf(']');
    if (si === -1 || ei === -1) return [];
    const parsed = JSON.parse(text.slice(si, ei + 1));
    return parsed.filter((x: { sourceUrl?: string }) => x.sourceUrl?.startsWith('http'));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { name: string; count: number }[] = [];
  const now = new Date().toISOString();

  for (const cableName of CANONICAL_CABLE_NAMES) {
    const slug = nameToSlug(cableName);
    await new Promise(r => setTimeout(r, 2000));
    try {
      const news = await fetchNews(cableName);
      if (news.length > 0) {
        await redisSet(`cable-news:${slug}`, JSON.stringify(news), 93600);
        await redisSet(`cable-news-ts:${slug}`, now, 93600);
      }
      results.push({ name: cableName, count: news.length });
    } catch (e) {
      console.error(`[cron-news] ${cableName}:`, e);
      results.push({ name: cableName, count: 0 });
    }
  }

  await redisSet('cable-news-cron-last-run', JSON.stringify({ runAt: now, results }), 604800);
  return NextResponse.json({ success: true, runAt: now, results });
}

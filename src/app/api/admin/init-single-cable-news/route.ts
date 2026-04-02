// src/app/api/admin/init-single-cable-news/route.ts
//
// 单条海缆新闻初始化——每次只处理一条，前端逐条调用避免 Cloudflare 524 超时。

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 单条缆远低于 30s

async function redisSet(key: string, value: string, ttl: number) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttl]),
  });
}

async function fetchNewsForOne(cableName: string): Promise<unknown[]> {
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
              content: '海底光缆新闻助手。只返回真实搜索结果的JSON数组，禁止虚构。格式：[{"title":"","titleZh":"","summary":"（来自搜索结果的真实摘要，不超过120字）","sourceUrl":"https://...","sourceName":"","publishDate":"YYYY-MM-DD","category":"cut|repair|deployment|policy|investment|incident|other"}]。若无真实结果返回[]。',
            },
            {
              role: 'user',
              content: `请搜索"${cableName} submarine cable"在${y-1}年至${y}年的新闻，返回最多6条，按时间倒序，只保留有真实URL的条目。`,
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

  if (!res.ok) throw new Error(`Qwen API ${res.status}`);

  const data  = await res.json();
  const content = data?.output?.choices?.[0]?.message?.content ?? '';
  const text  = Array.isArray(content)
    ? content.map((c: { text?: string }) => c.text ?? '').join('')
    : String(content);

  const si = text.indexOf('[');
  const ei = text.lastIndexOf(']');
  if (si === -1 || ei === -1) return [];

  const parsed = JSON.parse(text.slice(si, ei + 1));
  return parsed.filter((x: { sourceUrl?: string; title?: string }) =>
    typeof x.sourceUrl === 'string' && x.sourceUrl.startsWith('http') && x.title
  );
}

function nameToSlug(name: string): string {
  const abbr = name.match(/\(([^)]+)\)/)?.[1];
  if (abbr) return abbr.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { cableName } = await req.json() as { cableName?: string };
  if (!cableName) return NextResponse.json({ error: 'cableName required' }, { status: 400 });

  const slug = nameToSlug(cableName);

  try {
    const news = await fetchNewsForOne(cableName);
    const now  = new Date().toISOString();

    if (news.length > 0) {
      await redisSet(`cable-news:${slug}`, JSON.stringify(news), 93600);
      await redisSet(`cable-news-ts:${slug}`, now, 93600);
    }

    return NextResponse.json({ success: true, slug, count: news.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, slug, count: 0, error: msg });
  }
}

// src/app/api/admin/init-cable-news/route.ts  v2
// 修复：使用 enable_search:true 联网搜索

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';
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
  if (!url || !token) return;
  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([value, 'EX', ttl]),
  });
}

async function fetchNewsForCable(cableName: string): Promise<unknown[]> {
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
                content: `你是海底光缆新闻助手。搜索真实新闻，只返回 JSON 数组，禁止虚构。
格式：[{"title":"","titleZh":"","summary":"","sourceUrl":"https://...","sourceName":"","publishDate":"YYYY-MM-DD","category":"cut|repair|deployment|policy|investment|incident|other"}]
如无结果返回 []。不加任何额外文字。`,
              },
              {
                role: 'user',
                content: `搜索 "${cableName} submarine cable" 在 ${y-1} 至 ${y} 年的新闻，最多8条，倒序，只要有真实URL的。`,
              },
            ],
          },
          parameters: {
            result_format: 'message',
            temperature: 0.1,
            enable_search: true,  // ← 关键修复
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

    const si = text.indexOf('[');
    const ei = text.lastIndexOf(']');
    if (si === -1 || ei === -1) return [];

    const parsed = JSON.parse(text.slice(si, ei + 1));
    return parsed.filter((x: { sourceUrl?: string; title?: string }) =>
      x.sourceUrl?.startsWith('http') && x.title
    );
  } catch (e) {
    console.error(`[init-news] ${cableName}:`, e);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { name: string; slug: string; count: number; error?: string }[] = [];
  const now = new Date().toISOString();

  for (const cableName of CANONICAL_CABLE_NAMES) {
    const slug = nameToSlug(cableName);
    try {
      // 每条缆间隔 2 秒防限流
      await new Promise(r => setTimeout(r, 2000));
      const news = await fetchNewsForCable(cableName);

      if (news.length > 0) {
        await redisSet(`cable-news:${slug}`, JSON.stringify(news), 93600);
        await redisSet(`cable-news-ts:${slug}`, now, 93600);
      }
      results.push({ name: cableName, slug, count: news.length });
      console.log(`[init-news] ${cableName}: ${news.length} articles`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ name: cableName, slug, count: 0, error: msg });
    }
  }

  return NextResponse.json({
    success: true,
    initialized: CANONICAL_CABLE_NAMES.length,
    fetched: results.filter(r => r.count > 0).length,
    results,
  });
}

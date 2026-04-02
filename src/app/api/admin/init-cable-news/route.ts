// src/app/api/admin/init-cable-news/route.ts
//
// 管理员接口：手动触发首次初始化 26 条海缆的新闻缓存。
// 在部署后第一次访问 /admin/cable-intake 时可从管理页面触发一次。
// 之后每日 Cron 自动更新，不需要再手动触发。

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
  const url   = process.env.UPSTASH_REDIS_REST_URL;
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
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-plus',
          input: {
            messages: [
              {
                role: 'system',
                content: '你是新闻提取助手，从 web_search 结果中提取真实新闻，只返回 JSON 数组，不得虚构。格式：[{"title":"","titleZh":"","summary":"","sourceUrl":"","sourceName":"","publishDate":"YYYY-MM-DD","category":""}]',
              },
              {
                role: 'user',
                content: `搜索 "${cableName}" 海缆近两年新闻，最多8条，倒序，只返回有真实URL的条目。`,
              },
            ],
          },
          parameters: {
            result_format: 'message', temperature: 0,
            tools: [{ type: 'web_search', web_search: { search_query: `"${cableName}" submarine cable ${y-1} OR ${y}`, enable: true } }],
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
    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
    const si = cleaned.indexOf('[');
    if (si === -1) return [];
    const parsed = JSON.parse(cleaned.slice(si));
    return parsed.filter((x: { sourceUrl?: string }) => x.sourceUrl?.startsWith('http'));
  } catch { return []; }
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: { name: string; count: number }[] = [];
  const now = new Date().toISOString();

  for (const cableName of CANONICAL_CABLE_NAMES) {
    const slug = nameToSlug(cableName);
    await new Promise(r => setTimeout(r, 2500)); // 限流
    const news = await fetchNewsForCable(cableName);
    if (news.length > 0) {
      await redisSet(`cable-news:${slug}`, JSON.stringify(news), 93600);
      await redisSet(`cable-news-ts:${slug}`, now, 93600);
    }
    results.push({ name: cableName, count: news.length });
  }

  return NextResponse.json({ success: true, initialized: CANONICAL_CABLE_NAMES.length, results });
}

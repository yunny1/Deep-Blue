// src/app/api/admin/cable-extract/route.ts  v2
//
// 修复：
// 1. 添加 25s 超时避免 Cloudflare 524
// 2. 对提取结果做 stringify 处理，防止对象字段渲染导致 React #31

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const QWEN_API = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

const SYSTEM_PROMPT = `你是一个海底光缆数据提取助手。
从用户提供的内容中提取海缆信息，以纯 JSON 格式返回，不要有任何前缀或解释文字。
所有字段值必须是字符串、数字或 null，不允许嵌套对象或数组。
JSON 字段如下（缺失的字段用 null）：
{
  "name": "海缆完整名称（字符串）",
  "status": "IN_SERVICE|UNDER_CONSTRUCTION|PLANNED|RETIRED|DECOMMISSIONED 之一",
  "lengthKm": 数字或null,
  "capacityTbps": 数字或null,
  "fiberPairs": 数字或null,
  "rfsDate": "投产年份如2023（字符串）或null",
  "vendor": "建造商名称（字符串，只写名称不要对象）或null",
  "owners": "运营商名称，多个用英文逗号分隔（字符串）或null",
  "url": "官方链接URL或null"
}
只返回 JSON，不要 markdown 代码块。`;

// 带超时的 fetch
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// 把提取结果里所有字段值转为安全的基本类型（防 React #31）
function sanitizeExtracted(data: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'string') result[key] = val;
    else if (typeof val === 'number') result[key] = String(val);
    else if (typeof val === 'boolean') result[key] = String(val);
    else if (typeof val === 'object') {
      // Company 对象：取 .name 字段
      const obj = val as Record<string, unknown>;
      if (obj.name && typeof obj.name === 'string') result[key] = obj.name;
      else result[key] = JSON.stringify(val);
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'QWEN_API_KEY not configured' }, { status: 500 });

  const isImage = file.type.startsWith('image/');

  let messages: object[];
  if (isImage) {
    const buf  = await file.arrayBuffer();
    const b64  = Buffer.from(buf).toString('base64');
    messages = [{
      role: 'user',
      content: [
        { image: `data:${file.type};base64,${b64}` },
        { text: '请从图片中提取海缆信息，按 System 指定的 JSON 格式返回，所有字段值只能是字符串或数字，不能是对象。' },
      ],
    }];
  } else {
    const text = await file.text();
    messages = [{
      role: 'user',
      content: [{ text: `请从以下文本中提取海缆信息：\n\n${text.slice(0, 6000)}` }],
    }];
  }

  try {
    // 图片用 qwen-vl-plus（更快），文本用 qwen-plus
    const model = isImage ? 'qwen-vl-plus' : 'qwen-plus';
    const apiUrl = isImage ? QWEN_API
      : 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

    const response = await fetchWithTimeout(
      apiUrl,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input: {
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              ...messages,
            ],
          },
          parameters: { result_format: 'message' },
        }),
      },
      22000  // 22 秒超时，低于 Cloudflare 的 30s 限制
    );

    if (!response.ok) throw new Error(`Qwen API ${response.status}`);

    const result = await response.json();
    const content = result?.output?.choices?.[0]?.message?.content;
    const rawText = Array.isArray(content)
      ? content.map((c: { text?: string }) => c.text ?? '').join('')
      : String(content ?? '');

    // 解析 JSON，去除 markdown 代码块
    const cleaned = rawText.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    // 关键：将所有字段 sanitize 成安全的基本类型
    const safe = sanitizeExtracted(parsed);

    return NextResponse.json(safe);
  } catch (e: unknown) {
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    const msg = isTimeout
      ? 'AI 提取超时（图片可能太大），请压缩后重试，或手动填写字段'
      : (e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: isTimeout ? 408 : 500 });
  }
}

// src/app/api/admin/cable-extract/route.ts
//
// 接收前端上传的文件（图片 / txt / pdf），
// 调用 Qwen Vision 或文字接口，提取海缆字段并返回 JSON。
// 认证：读取 Cookie 中的 admin JWT（与现有管理后台鉴权保持一致）

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth'; // 假设已有此工具函数

export const dynamic = 'force-dynamic';

// Qwen 接口配置（使用项目已有的 QWEN_API_KEY 环境变量）
const QWEN_API   = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const QWEN_MODEL = 'qwen-vl-max'; // 支持图片和文本

// 提示词：精确指导模型输出 JSON，不输出任何其他内容
const SYSTEM_PROMPT = `你是一个海底光缆数据提取助手。
从用户提供的内容中提取海缆信息，以纯 JSON 格式返回，不要有任何前缀或解释文字。
JSON 字段如下（缺失的字段用 null）：
{
  "name": "海缆完整名称",
  "status": "IN_SERVICE|UNDER_CONSTRUCTION|PLANNED|RETIRED|DECOMMISSIONED 之一",
  "lengthKm": 数字（公里）,
  "capacityTbps": 数字（Tbps）,
  "fiberPairs": 数字,
  "rfsDate": "投产年份字符串如 2023 或 2023-06",
  "vendor": "建造商名称",
  "owners": "运营商名称，多个用英文逗号分隔",
  "url": "官方链接 URL"
}
只返回 JSON，不要 markdown 代码块，不要解释。`;

export async function POST(req: NextRequest) {
  // 鉴权检查
  try {
    await verifyAdminJWT(req);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'QWEN_API_KEY not configured' }, { status: 500 });

  try {
    const isImage = file.type.startsWith('image/');
    let messages: object[];

    if (isImage) {
      // 图片：转 base64 送给 qwen-vl-max
      const buf    = await file.arrayBuffer();
      const b64    = Buffer.from(buf).toString('base64');
      const mime   = file.type;
      messages = [{
        role: 'user',
        content: [
          { image: `data:${mime};base64,${b64}` },
          { text: '请从图片中提取海缆信息，按 System 指定的 JSON 格式返回。' },
        ],
      }];
    } else {
      // 文本文件：直接读取内容
      const text = await file.text();
      messages = [{
        role: 'user',
        content: [{ text: `请从以下文本中提取海缆信息：\n\n${text.slice(0, 6000)}` }],
      }];
    }

    const response = await fetch(QWEN_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: isImage ? QWEN_MODEL : 'qwen-plus',
        input: { messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages] },
        parameters: { result_format: 'message' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Qwen API error: ${err}`);
    }

    const result = await response.json();
    const content = result?.output?.choices?.[0]?.message?.content;
    const text = Array.isArray(content)
      ? content.map((c: { text?: string }) => c.text ?? '').join('')
      : String(content ?? '');

    // 解析 AI 返回的 JSON
    // 去除可能的 markdown 代码块标记
    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// src/app/api/sovereign/normalize-cables/route.ts
//
// AI 语义去重接口：接受一组原始海缆名称，
// 利用 AI 将它们映射到标准名称（26 条保留海缆）。
// AI 只做"认出同一条缆的不同写法"，不参与计数本身。
// 使用 Qwen（与项目已有的 cable-extract 接口一致）。

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 26 条保留海缆的标准名称（直接来自 Excel 原始数据）
const CANONICAL_NAMES = [
  'ALPHA',
  'Asia Connect Cable-1 (ACC-1)',
  'Asia Direct Cable (ADC)',
  'Asia Link Cable (ALC)',
  'Asia Submarine-cable Express (ASE)/Cahaya Malaysia',
  'Batam Dumai Melaka (BDM)',
  'Batam Sarawak Internet Cable System (BaSICS)',
  'Batam Singapore Cable System (BSCS)',
  'Batam-Rengit Cable System (BRCS)',
  'Bridge One',
  'BtoBE',
  'Dumai-Melaka Cable System (DMCS)',
  'Hokkaido-Sakhalin Cable System (HSCS)',
  'INSICA',
  'Indonesia Global Gateway (IGG) System',
  'MIST',
  'MYUS',
  'Nigeria Cameroon Submarine Cable System (NCSCS)',
  'PEACE Cable',
  'Russia-Japan Cable Network (RJCN)',
  'SEA-H2X',
  'SEACOM',
  'South Atlantic Inter Link (SAIL)',
  'TGN-IA2',
  'Thailand-Indonesia-Singapore (TIS)',
  'Vietnam-Singapore Cable System (VTS)',
];

// 精确匹配快速通道（避免不必要的 AI 调用）
// 键是小写，值是标准名称
const FAST_MAP: Record<string, string> = {};
for (const name of CANONICAL_NAMES) {
  FAST_MAP[name.toLowerCase()] = name;
  // 括号内缩写也加进去，例如 (ADC) → Asia Direct Cable (ADC)
  const abbrs = Array.from(name.matchAll(/\(([^)]+)\)/g)).map(m => m[1]);
  for (const abbr of abbrs) {
    FAST_MAP[abbr.toLowerCase()] = name;
  }
}

export async function POST(req: NextRequest) {
  const { names } = await req.json() as { names: string[] };
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json({ mapping: {} });
  }

  // 第一步：精确 / 缩写快速匹配，不需要 AI 的直接处理
  const mapping: Record<string, string> = {};
  const needsAI: string[] = [];

  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    if (FAST_MAP[key]) {
      mapping[raw] = FAST_MAP[key];
    } else {
      // 还没匹配到的，交给 AI
      needsAI.push(raw);
    }
  }

  // 如果全部快速匹配成功，直接返回
  if (needsAI.length === 0) {
    return NextResponse.json({ mapping });
  }

  // 第二步：调用 AI 处理剩余的模糊匹配
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    // 没有 AI key：回退到原始名称，不崩溃
    for (const name of needsAI) mapping[name] = name;
    return NextResponse.json({ mapping, warning: 'QWEN_API_KEY not configured, AI normalization skipped' });
  }

  const PROMPT_SYSTEM = `你是海底光缆数据标准化助手。
你的任务是把用户提供的海缆名称变体，映射到下面的标准名称列表。

标准名称列表（共26条，逐行）：
${CANONICAL_NAMES.map((n, i) => `${i + 1}. ${n}`).join('\n')}

规则：
- 如果输入名称是标准名称的缩写、别名、变体或部分匹配，返回对应的完整标准名称
- 例如：ADC → Asia Direct Cable (ADC)，RJCN → Russia-Japan Cable Network (RJCN)
- 如果找不到任何对应的标准名称，返回原始输入（不要猜测）
- 只返回纯 JSON，格式为 {"原始名称": "标准名称", ...}
- 不要包含任何解释文字、markdown 代码块或前缀`;

  const PROMPT_USER = `请将以下海缆名称映射到标准名称：\n${JSON.stringify(needsAI)}`;

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
              { role: 'system', content: PROMPT_SYSTEM },
              { role: 'user',   content: PROMPT_USER },
            ],
          },
          parameters: { result_format: 'message', temperature: 0 },
        }),
      }
    );

    if (!res.ok) throw new Error(`Qwen API ${res.status}`);
    const data = await res.json();
    const text: string = data?.output?.choices?.[0]?.message?.content ?? '';

    // 解析 AI 返回的 JSON，去除可能的 markdown 包裹
    const cleaned = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
    const aiMapping: Record<string, string> = JSON.parse(cleaned);

    // 合并 AI 结果：同时做二次校验——AI 给出的标准名必须在列表里才接受
    const canonicalSet = new Set(CANONICAL_NAMES);
    for (const [raw, canonical] of Object.entries(aiMapping)) {
      if (canonicalSet.has(canonical)) {
        mapping[raw] = canonical;
      } else {
        // AI 幻觉了一个不存在的名称：保留原始值
        mapping[raw] = raw;
      }
    }

    // 确保所有输入都有映射
    for (const name of needsAI) {
      if (!mapping[name]) mapping[name] = name;
    }
  } catch (e) {
    console.warn('[normalize-cables] AI failed:', e);
    for (const name of needsAI) mapping[name] = name;
  }

  return NextResponse.json({ mapping });
}

/**
 * ai-dedup.ts
 * 
 * Qwen AI 语义去重判断模块（去重系统第三层）
 * 
 * 功能：把模糊匹配 65-85 分的疑似重复对发给 Qwen，
 *       让 AI 判断两条海缆名是否指向同一条物理海缆。
 * 
 * 设计原则：
 * - 复用 ai-analyzer.ts 的 Qwen API 调用模式（30s 超时、JSON 解析）
 * - 每对判断独立，单条失败不影响其他
 * - 返回结构化结果：MERGE / SKIP / UNCERTAIN + 理由
 * - 可被 nightly-sync（实时）和一次性脚本（批量）两种场景调用
 * 
 * 路径：src/lib/ai-dedup.ts
 */

// ============================================================
// 1. 配置
// ============================================================

const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL   = 'qwen-plus';
const TIMEOUT_MS   = 30_000;

// ============================================================
// 2. 类型定义
// ============================================================

/** 送给 AI 判断的一对海缆信息 */
export interface DedupPair {
  /** 候选A的名称 */
  nameA: string;
  /** 候选B的名称 */
  nameB: string;
  /** 模糊匹配得分（0-100） */
  fuzzyScore: number;
  /** 候选A的元数据（可选，越多越好） */
  metaA?: CableMeta;
  /** 候选B的元数据（可选，越多越好） */
  metaB?: CableMeta;
}

export interface CableMeta {
  rfsYear?: number | null;
  lengthKm?: number | null;
  status?: string | null;
  owners?: string | null;
  stationNames?: string[];
  dataSource?: string | null;
}

/** AI 返回的判断结果 */
export interface AiDedupVerdict {
  /** MERGE=同一条缆, SKIP=不同缆, UNCERTAIN=AI也不确定 */
  decision: 'MERGE' | 'SKIP' | 'UNCERTAIN';
  /** AI 给出的置信度 0-100 */
  confidence: number;
  /** AI 的判断理由（英文，用于日志和审计） */
  reasoning: string;
}

/** 批量处理的结果 */
export interface AiDedupResult {
  nameA: string;
  nameB: string;
  fuzzyScore: number;
  verdict: AiDedupVerdict | null;  // null = API 调用失败
  error?: string;
}

// ============================================================
// 3. Prompt 设计
// ============================================================

const SYSTEM_PROMPT = `You are a submarine cable deduplication expert for the Deep Blue platform.

Your task: Given two cable records that might be duplicates, determine whether they refer to the SAME physical submarine cable or are DIFFERENT cables.

Key domain knowledge:
- The same cable often has multiple names across different databases (e.g., TeleGeography vs SubmarineNetworks)
- Common patterns: full name vs abbreviation ("Africa Coast to Europe" = "ACE"), with/without "Cable System" suffix, minor spelling variations
- Different cables in a series have numeric suffixes: "SEA-ME-WE-3" and "SEA-ME-WE-4" are DIFFERENT cables
- "Phase 1" vs "Phase 2" of the same cable are generally DIFFERENT records
- If landing stations overlap significantly, it strongly suggests the same cable
- If RFS years differ by more than 2 years, they are likely different cables (unless one is a planned/actual discrepancy)
- Same owners + same route region = strong signal for same cable

You must respond ONLY with a valid JSON object (no markdown, no backticks):
{
  "decision": "MERGE" | "SKIP" | "UNCERTAIN",
  "confidence": <number 0-100>,
  "reasoning": "<one sentence explanation>"
}

Rules:
- MERGE only if you are quite confident they are the same physical cable (confidence >= 75)
- SKIP if they are clearly different cables
- UNCERTAIN if the evidence is ambiguous — do NOT guess
- Be conservative: when in doubt, prefer UNCERTAIN over MERGE`;

// ============================================================
// 4. 核心 API 调用
// ============================================================

/**
 * 对单个疑似重复对进行 AI 判断
 * 
 * 返回 AiDedupVerdict，或 null（API 失败时）
 */
export async function judgeOnePair(pair: DedupPair): Promise<AiDedupVerdict | null> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    console.warn('[AiDedup] QWEN_API_KEY not set, skipping');
    return null;
  }

  // 组装用户消息：把两条海缆的所有可用信息都给 AI
  const userMessage = buildUserMessage(pair);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.05,  // 极低温度 → 尽量确定性输出
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AiDedup] Qwen API error (${response.status}):`, errText.slice(0, 200));
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[AiDedup] Qwen returned empty content');
      return null;
    }

    return parseVerdict(content);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[AiDedup] Qwen API timeout after 30s');
    } else {
      console.error('[AiDedup] API call failed:', error.message);
    }
    return null;
  }
}

/**
 * 批量判断多对疑似重复
 * 
 * 逐条调用（非并发），每条间隔 1s 避免 rate limit
 * 单条失败不影响整体，失败的对 verdict 为 null
 */
export async function judgeBatch(
  pairs: DedupPair[],
  options?: {
    /** 每条调用间隔（ms），默认 1000 */
    delayMs?: number;
    /** 进度回调 */
    onProgress?: (done: number, total: number, result: AiDedupResult) => void;
  },
): Promise<AiDedupResult[]> {
  const delayMs = options?.delayMs ?? 1000;
  const results: AiDedupResult[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    let verdict: AiDedupVerdict | null = null;
    let error: string | undefined;

    try {
      verdict = await judgeOnePair(pair);
    } catch (e: any) {
      error = e.message;
    }

    const result: AiDedupResult = {
      nameA: pair.nameA,
      nameB: pair.nameB,
      fuzzyScore: pair.fuzzyScore,
      verdict,
      error,
    };

    results.push(result);
    options?.onProgress?.(i + 1, pairs.length, result);

    // 不是最后一条就等待
    if (i < pairs.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

// ============================================================
// 5. 辅助函数
// ============================================================

/** 组装发给 Qwen 的用户消息 */
function buildUserMessage(pair: DedupPair): string {
  const lines: string[] = [
    'Are these two submarine cable records the same physical cable?\n',
    `Cable A: "${pair.nameA}"`,
  ];

  if (pair.metaA) {
    const m = pair.metaA;
    if (m.rfsYear) lines.push(`  RFS Year: ${m.rfsYear}`);
    if (m.lengthKm) lines.push(`  Length: ${m.lengthKm} km`);
    if (m.status) lines.push(`  Status: ${m.status}`);
    if (m.owners) lines.push(`  Owners: ${m.owners}`);
    if (m.dataSource) lines.push(`  Source: ${m.dataSource}`);
    if (m.stationNames?.length) {
      lines.push(`  Landing stations: ${m.stationNames.slice(0, 15).join(', ')}${m.stationNames.length > 15 ? ` (+${m.stationNames.length - 15} more)` : ''}`);
    }
  }

  lines.push('');
  lines.push(`Cable B: "${pair.nameB}"`);

  if (pair.metaB) {
    const m = pair.metaB;
    if (m.rfsYear) lines.push(`  RFS Year: ${m.rfsYear}`);
    if (m.lengthKm) lines.push(`  Length: ${m.lengthKm} km`);
    if (m.status) lines.push(`  Status: ${m.status}`);
    if (m.owners) lines.push(`  Owners: ${m.owners}`);
    if (m.dataSource) lines.push(`  Source: ${m.dataSource}`);
    if (m.stationNames?.length) {
      lines.push(`  Landing stations: ${m.stationNames.slice(0, 15).join(', ')}${m.stationNames.length > 15 ? ` (+${m.stationNames.length - 15} more)` : ''}`);
    }
  }

  lines.push('');
  lines.push(`Fuzzy name similarity score: ${pair.fuzzyScore}/100`);
  lines.push('');
  lines.push('Respond with JSON: { "decision": "MERGE"|"SKIP"|"UNCERTAIN", "confidence": 0-100, "reasoning": "..." }');

  return lines.join('\n');
}

/** 解析 Qwen 的 JSON 响应 */
function parseVerdict(content: string): AiDedupVerdict | null {
  let clean = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error('[AiDedup] No JSON found in response:', content.slice(0, 200));
    return null;
  }

  clean = clean.slice(jsonStart, jsonEnd + 1);

  try {
    const parsed = JSON.parse(clean);

    // 校验字段合法性
    const decision = parsed.decision?.toUpperCase?.();
    if (!['MERGE', 'SKIP', 'UNCERTAIN'].includes(decision)) {
      console.error('[AiDedup] Invalid decision:', parsed.decision);
      return null;
    }

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.confidence)))
      : 50;

    const reasoning = typeof parsed.reasoning === 'string'
      ? parsed.reasoning.slice(0, 500)
      : 'No reasoning provided';

    // 安全约束：如果 AI 说 MERGE 但置信度 < 75，降级为 UNCERTAIN
    if (decision === 'MERGE' && confidence < 75) {
      return {
        decision: 'UNCERTAIN',
        confidence,
        reasoning: `[Downgraded from MERGE: confidence ${confidence} < 75] ${reasoning}`,
      };
    }

    return { decision, confidence, reasoning };
  } catch {
    console.error('[AiDedup] JSON parse failed:', clean.slice(0, 200));
    return null;
  }
}

// src/lib/ai-analyzer.ts
// Qwen AI 新闻分析引擎（原 MiniMax，已迁移至阿里云通义千问）

// Qwen API — OpenAI 兼容格式（DashScope）
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL   = 'qwen-plus';  // 可选: qwen-turbo(快/便宜) | qwen-plus(均衡) | qwen-max(最强)

export interface AiNewsAnalysis {
  isRelevant: boolean;
  relevanceScore: number;
  cableNames: string[];
  eventType: 'FAULT' | 'NATURAL_DISASTER' | 'SABOTAGE' | 'CONSTRUCTION' | 'REPAIR' | 'POLICY' | 'GENERAL';
  severity: number;
  affectedCountries: string[];
  summaryEn: string;
  summaryZh: string;
  estimatedDuration: string | null;
  serviceDisruption: boolean;
  confidence: number;
}

const SYSTEM_PROMPT = `You are an expert submarine cable intelligence analyst for the Deep Blue platform. Your job is to analyze news articles and extract structured intelligence about submarine/undersea cables.

You must respond ONLY with a valid JSON object (no markdown, no explanation, no backticks). The JSON must follow this exact schema:

{
  "isRelevant": boolean,
  "relevanceScore": number,
  "cableNames": string[],
  "eventType": string,
  "severity": number,
  "affectedCountries": string[],
  "summaryEn": string,
  "summaryZh": string,
  "estimatedDuration": string | null,
  "serviceDisruption": boolean,
  "confidence": number
}

Rules:
- eventType must be one of: FAULT, NATURAL_DISASTER, SABOTAGE, CONSTRUCTION, REPAIR, POLICY, GENERAL
- severity 1-5 (1=minor news, 5=major cable break)
- affectedCountries: ISO 2-letter codes
- If not about submarine cables, set isRelevant=false, relevanceScore=0
- Always provide both English and Chinese summaries`;

export async function analyzeNewsWithAI(
  title: string,
  description: string,
  source: string,
): Promise<AiNewsAnalysis | null> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    console.warn('QWEN_API_KEY not set, skipping AI analysis');
    return null;
  }

  try {
    const userMessage = `Analyze this submarine cable news article:

Title: ${title}
Source: ${source}
Content: ${description.slice(0, 2000)}

Extract structured intelligence as JSON.`;

    const response = await fetch(QWEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Qwen API error (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('Qwen returned empty content');
      return null;
    }

    // 清理并解析 JSON
    let clean = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    const jsonStart = clean.indexOf('{');
    const jsonEnd   = clean.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON found in Qwen response');
      return null;
    }
    clean = clean.slice(jsonStart, jsonEnd + 1);

    try {
      return JSON.parse(clean) as AiNewsAnalysis;
    } catch {
      console.error('JSON parse failed:', clean.slice(0, 200));
      return null;
    }
  } catch (error) {
    console.error('AI analysis failed:', error);
    return null;
  }
}

export function preFilterRelevance(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();

  const highRelevanceKeywords = [
    'submarine cable', 'undersea cable', 'subsea cable', 'underwater cable',
    'cable fault', 'cable break', 'cable cut', 'cable repair',
    'cable ship', 'cable lay', 'cable route',
    'landing station', 'cable landing',
    'fiber optic cable', 'fibre optic cable',
    'internet outage', 'connectivity disruption',
    'telegeography', 'subtelforum',
    'sea-me-we', 'seamewe', '2africa', 'peace cable', 'marea',
    'equiano', 'dunant', 'curie', 'grace hopper',
    'subcom', 'nec submarine', 'alcatel submarine', 'hmn tech',
    'cable protection', 'anchor damage',
  ];

  const mediumKeywords = [
    'cable', 'submarine', 'undersea', 'subsea', 'offshore',
    'telecom', 'fiber', 'fibre', 'bandwidth', 'latency',
    'repair', 'fault', 'outage', 'disruption', 'restore',
    'ocean', 'seabed', 'maritime',
  ];

  for (const keyword of highRelevanceKeywords) {
    if (text.includes(keyword)) return true;
  }

  let mediumCount = 0;
  for (const keyword of mediumKeywords) {
    if (text.includes(keyword)) mediumCount++;
  }
  return mediumCount >= 2;
}

export async function batchAnalyzeNews(
  newsItems: Array<{ title: string; description: string; source: string }>,
  maxItems = 10,
): Promise<Map<string, AiNewsAnalysis>> {
  const results = new Map<string, AiNewsAnalysis>();
  const filtered = newsItems.filter(item => preFilterRelevance(item.title, item.description));
  const toAnalyze = filtered.slice(0, maxItems);

  for (const item of toAnalyze) {
    const analysis = await analyzeNewsWithAI(item.title, item.description, item.source);
    if (analysis) results.set(item.title, analysis);
    await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}

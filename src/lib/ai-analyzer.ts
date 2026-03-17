// src/lib/ai-analyzer.ts
// MiniMax AI 新闻分析引擎
// 用大语言模型从新闻文本中提取结构化海缆情报
// 这是 Deep Blue 真正的AI能力核心

// MiniMax API 配置（OpenAI兼容格式）
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const MINIMAX_MODEL = 'MiniMax-M2';

// AI分析结果的结构化类型
export interface AiNewsAnalysis {
  // 是否与海缆相关（AI判断，比关键词匹配准确得多）
  isRelevant: boolean;
  // 相关度评分 0-100
  relevanceScore: number;
  // 提取的海缆名称列表（AI能识别缩写、别名、间接引用）
  cableNames: string[];
  // 事件类型
  eventType: 'FAULT' | 'NATURAL_DISASTER' | 'SABOTAGE' | 'CONSTRUCTION' | 'REPAIR' | 'POLICY' | 'GENERAL';
  // 严重程度 1-5
  severity: number;
  // 受影响的国家/地区
  affectedCountries: string[];
  // AI生成的一句话摘要（中英双语）
  summaryEn: string;
  summaryZh: string;
  // 预计影响持续时间（如果能推断的话）
  estimatedDuration: string | null;
  // 是否涉及服务中断
  serviceDisruption: boolean;
  // 置信度
  confidence: number;
}

// 系统提示词——告诉MiniMax它是一个海缆情报分析师
const SYSTEM_PROMPT = `You are an expert submarine cable intelligence analyst for the Deep Blue platform. Your job is to analyze news articles and extract structured intelligence about submarine/undersea cables.

You must respond ONLY with a valid JSON object (no markdown, no explanation, no backticks). The JSON must follow this exact schema:

{
  "isRelevant": boolean,          // Is this article about submarine/undersea cables?
  "relevanceScore": number,       // 0-100, how relevant to submarine cables
  "cableNames": string[],         // List of specific cable names mentioned (e.g., "2Africa", "PEACE Cable", "MAREA")
  "eventType": string,            // One of: "FAULT", "NATURAL_DISASTER", "SABOTAGE", "CONSTRUCTION", "REPAIR", "POLICY", "GENERAL"
  "severity": number,             // 1-5 (1=minor news, 5=major cable break affecting millions)
  "affectedCountries": string[],  // ISO 2-letter country codes of affected countries
  "summaryEn": string,            // One sentence summary in English
  "summaryZh": string,            // One sentence summary in Chinese
  "estimatedDuration": string,    // Estimated impact duration (e.g., "2-4 weeks") or null
  "serviceDisruption": boolean,   // Does this involve actual service disruption?
  "confidence": number            // 0-100, how confident you are in this analysis
}

Important rules:
- If the article is NOT about submarine cables, set isRelevant to false and relevanceScore to 0
- Recognize cable name variations: "SEA-ME-WE" = "SEAMEWE" = "South East Asia Middle East Western Europe"
- Look for indirect references: "undersea link between X and Y" may refer to a specific cable
- Severity 5 = complete cable break affecting international traffic
- Severity 4 = partial fault or significant repair needed
- Severity 3 = construction delay or moderate issue
- Severity 2 = policy/regulatory news affecting cables
- Severity 1 = general industry news
- For affectedCountries, use ISO 2-letter codes (US, GB, SG, JP, etc.)
- Always provide both English and Chinese summaries`;

// 调用 MiniMax API 分析一篇新闻
export async function analyzeNewsWithAI(
  title: string,
  description: string,
  source: string,
): Promise<AiNewsAnalysis | null> {
  const apiKey = process.env.MINIMAX_API_KEY;

  if (!apiKey) {
    console.warn('MINIMAX_API_KEY not set, skipping AI analysis');
    return null;
  }

  try {
    const userMessage = `Analyze this submarine cable news article:

Title: ${title}
Source: ${source}
Content: ${description.slice(0, 2000)}

Extract structured intelligence as JSON.`;

    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 1500,
        temperature: 0.1, // 低温度=更精确、更一致的输出
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`MiniMax API error (${response.status}):`, errText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('MiniMax returned empty content');
      return null;
    }

    // 解析JSON响应（处理可能的markdown包裹）
    // 解析JSON响应（处理MiniMax的思考标签和markdown包裹）
    let cleanContent = content;
    
    // 去除 <think>...</think> 推理过程（MiniMax M2特有）
    cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // 去除可能的markdown包裹
    cleanContent = cleanContent
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    // 提取JSON对象（找到第一个 { 和最后一个 } 之间的内容）
    const jsonStart = cleanContent.indexOf('{');
    const jsonEnd = cleanContent.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      console.error('No JSON found in MiniMax response');
      return null;
    }
    cleanContent = cleanContent.slice(jsonStart, jsonEnd + 1);

    try {
      const analysis = JSON.parse(cleanContent) as AiNewsAnalysis;
      return analysis;
    } catch (parseError) {
      console.error('JSON parse failed, raw content:', cleanContent.slice(0, 200));
      return null;
    }

  } catch (error) {
    console.error('AI analysis failed:', error);
    return null;
  }
}

// 预筛选：快速判断一篇新闻是否可能与海缆相关（不耗AI额度）
// 只有通过预筛选的新闻才会送给MiniMax分析
export function preFilterRelevance(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();

  // 高相关关键词（出现任何一个就通过筛选）
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

  // 中等相关关键词（需要至少两个同时出现）
  const mediumKeywords = [
    'cable', 'submarine', 'undersea', 'subsea', 'offshore',
    'telecom', 'fiber', 'fibre', 'bandwidth', 'latency',
    'repair', 'fault', 'outage', 'disruption', 'restore',
    'ocean', 'seabed', 'maritime',
  ];

  // 检查高相关关键词
  for (const keyword of highRelevanceKeywords) {
    if (text.includes(keyword)) return true;
  }

  // 检查中等关键词（需要2个以上同时出现）
  let mediumCount = 0;
  for (const keyword of mediumKeywords) {
    if (text.includes(keyword)) mediumCount++;
  }
  if (mediumCount >= 2) return true;

  return false;
}

// 批量分析新闻（带频率限制保护）
export async function batchAnalyzeNews(
  newsItems: Array<{ title: string; description: string; source: string }>,
  maxItems: number = 10, // 每次最多分析10条（保护API额度）
): Promise<Map<string, AiNewsAnalysis>> {
  const results = new Map<string, AiNewsAnalysis>();

  // 先用关键词预筛选
  const filtered = newsItems.filter(item =>
    preFilterRelevance(item.title, item.description)
  );

  // 取前maxItems条进行AI分析
  const toAnalyze = filtered.slice(0, maxItems);

  console.log(`AI Analysis: ${newsItems.length} total → ${filtered.length} pre-filtered → ${toAnalyze.length} to analyze`);

  for (const item of toAnalyze) {
    const analysis = await analyzeNewsWithAI(item.title, item.description, item.source);
    if (analysis) {
      results.set(item.title, analysis);
    }

    // 每次分析之间等待2秒（避免触发速率限制）
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

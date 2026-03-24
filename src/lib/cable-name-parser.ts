/**
 * cable-name-parser.ts
 * 
 * 海缆名称结构化解析引擎
 * 
 * 核心思路：海缆名称不是普通自然语言，而是 "基础名 + 版本/期数后缀" 的结构化格式。
 * 例如：
 *   "SEA-ME-WE 4"      → { base: "sea-me-we", suffix: "4" }
 *   "SeaMeWe-4"        → { base: "sea-me-we", suffix: "4" }     ← 通过别名表匹配
 *   "FEC-1"            → { base: "fec", suffix: "1" }
 *   "FEC-2"            → { base: "fec", suffix: "2" }           ← suffix不同 → 不同海缆
 *   "Cabo Verde ... Phase 2" → { base: "cabo-verde-telecom-domestic-submarine-cable", suffix: "phase-2" }
 * 
 * 路径：src/lib/cable-name-parser.ts
 */

// ============================================================
// 1. 内存别名表（启动时从DB加载，fallback到硬编码）
// ============================================================

// 硬编码兜底：当DB别名表不可用时使用
const BUILTIN_ALIASES: Record<string, string> = {
  'seamewe': 'sea-me-we',
  'smw': 'sea-me-we',
  'apcn': 'asia-pacific-cable-network',
  'apg': 'asia-pacific-gateway',
  'apl': 'asia-pacific-link',
  'flag': 'fiber-optic-link-around-the-globe',
  'imewe': 'india-middle-east-western-europe',
  'eig': 'europe-india-gateway',
  'aae1': 'asia-africa-europe-1',
  'peace': 'pakistan-east-africa-connecting-europe',
  '2africa': 'two-africa',
  'tgn': 'tata-global-network',
  'c2c': 'cross-channel-cable',
  'jga': 'japan-guam-australia',
  'sjc': 'southeast-asia-japan-cable',
  'plcn': 'pacific-light-cable-network',
  'hkamericas': 'hong-kong-americas',
};

// 运行时别名表，由 loadAliases() 从DB填充
let runtimeAliases: Record<string, string> = { ...BUILTIN_ALIASES };

/**
 * 从数据库加载别名表到内存
 * 在脚本启动时调用一次即可
 */
export async function loadAliases(prisma: any): Promise<void> {
  try {
    const rows = await prisma.$queryRaw`SELECT alias, canonical FROM cable_name_aliases`;
    runtimeAliases = { ...BUILTIN_ALIASES };
    for (const row of rows as any[]) {
      runtimeAliases[row.alias] = row.canonical;
    }
    console.log(`[NameParser] 已加载 ${(rows as any[]).length} 条别名（含内置 ${Object.keys(BUILTIN_ALIASES).length} 条）`);
  } catch (e) {
    console.warn('[NameParser] 无法加载DB别名表，使用内置别名:', (e as Error).message);
    runtimeAliases = { ...BUILTIN_ALIASES };
  }
}

// ============================================================
// 2. 噪音词清理
// ============================================================

/** 移除海缆名称中的常见噪音词 */
function removeNoise(name: string): string {
  return name
    .replace(/submarine\s*cable\s*(system)?/gi, '')
    .replace(/\bcable\s*system\b/gi, '')
    .replace(/\bfibre\s*optic\b/gi, 'fiber-optic')  // 统一英美拼写
    .replace(/\bfiber\s*optic\b/gi, 'fiber-optic')
    .replace(/\bsystem\b/gi, '')
    .replace(/\bnetwork\b/gi, '')
    .replace(/\bproject\b/gi, '')
    .replace(/\bcable\b/gi, '')
    .replace(/[()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 3. 核心解析函数
// ============================================================

export interface ParsedCableName {
  /** 原始名称 */
  raw: string;
  /** 标准化基础名（不含编号后缀），用连字符连接 */
  base: string;
  /** 编号/版本/期数后缀，如 "4", "phase-2", ""（无后缀） */
  suffix: string;
  /** base + suffix 完整标准名，用于精确匹配 */
  canonical: string;
  /** base 去除所有分隔符的压缩形式，用于别名查找 */
  compressed: string;
}

/**
 * 将原始海缆名称解析为结构化对象
 * 
 * 关键设计决策：
 * - 先提取后缀再做别名替换，因为别名表只映射base部分
 * - suffix 匹配模式覆盖常见格式：纯数字、Phase N、Section N、Segment N
 * - 空suffix表示该海缆系列只有一条（或名称中没有编号信息）
 */
export function parseCableName(raw: string): ParsedCableName {
  let name = raw.toLowerCase().trim();
  name = removeNoise(name);

  // 提取末尾后缀
  // 匹配模式（优先级从高到低）：
  //   "xxx phase 2", "xxx phase-2"
  //   "xxx segment 1", "xxx section a"  
  //   "xxx-4", "xxx 4"（纯数字）
  //   "xxx 2a", "xxx-2b"（数字+字母变体）
  const suffixPatterns = [
    /[\s-]*(phase[\s-]*\d+[a-z]?)$/i,
    /[\s-]*(segment[\s-]*\d+[a-z]?)$/i,
    /[\s-]*(section[\s-]*[a-z0-9]+)$/i,
    /[\s-]+(\d+[a-z]?)$/,                    // "xxx 4" 或 "xxx 2a"
    /[-](\d+[a-z]?)$/,                       // "xxx-4" 紧贴连字符
  ];

  let suffix = '';
  let base = name;

  for (const pattern of suffixPatterns) {
    const match = name.match(pattern);
    if (match) {
      suffix = match[1].replace(/[\s-]+/g, '-').toLowerCase();
      base = name.slice(0, match.index!).replace(/[\s-]+$/, '');
      break;
    }
  }

  // 压缩base（去除所有非字母数字字符）用于别名查找
  const compressed = base.replace(/[^a-z0-9]/g, '');

  // 查别名表替换base
  if (runtimeAliases[compressed]) {
    base = runtimeAliases[compressed];
  } else {
    // 未命中别名 → 用连字符标准化
    base = base.replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  // 组合canonical name
  const canonical = suffix ? `${base}--${suffix}` : base;

  return { raw, base, suffix, canonical, compressed };
}

// ============================================================
// 4. Jaro-Winkler 相似度
// ============================================================

/** Jaro-Winkler 字符串相似度（0-1），用于模糊匹配兜底 */
export function jaroWinkler(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();

  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ============================================================
// 5. Jaccard 集合相似度
// ============================================================

/** Jaccard 集合相似度（0-1），用于登陆站比较 */
export function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ============================================================
// 6. RFS年份相似度
// ============================================================

/** RFS 年份距离归一化到 0-1 */
export function yearSimilarity(y1: number | null, y2: number | null): number {
  if (y1 == null || y2 == null) return 0.5; // 缺失 → 中性分
  const diff = Math.abs(y1 - y2);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;
  if (diff === 2) return 0.5;
  return 0.0;
}

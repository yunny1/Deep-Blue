/**
 * cable-name-parser.ts
 * 路径：src/lib/cable-name-parser.ts
 * 
 * 海缆名称结构化解析引擎 v2
 * 
 * v2 核心改进：自动提取括号中的缩写并注册为别名
 * 
 * TG 命名惯例：全名 + 括号缩写，如 "Africa Coast to Europe (ACE)"
 * SN 常常只用缩写：如 "ACE"
 * 
 * v1 的问题：先把括号内容删掉再做匹配，导致缩写和全名永远无法对应
 * v2 的修复：在删括号之前先提取缩写，自动注册为全名的别名
 *   "Africa Coast to Europe (ACE)" → 提取 "ACE" → 注册别名 ace → africa-coast-to-europe
 *   之后 SN 的 "ACE" 进来 → 解析为 base="ace" → 查别名 → 得到 "africa-coast-to-europe"
 *   canonical 匹配成功，判定为同一条缆
 */

// ============================================================
// 1. 别名表
// ============================================================

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

let runtimeAliases: Record<string, string> = { ...BUILTIN_ALIASES };

/** 从数据库加载别名表到内存 */
export async function loadAliases(prisma: any): Promise<void> {
  try {
    const rows = await prisma.$queryRaw`SELECT alias, canonical FROM cable_name_aliases`;
    runtimeAliases = { ...BUILTIN_ALIASES };
    for (const row of rows as any[]) {
      runtimeAliases[row.alias] = row.canonical;
    }
    console.log(`[NameParser] 已加载 ${(rows as any[]).length} 条DB别名 + ${Object.keys(BUILTIN_ALIASES).length} 条内置别名`);
  } catch (e) {
    console.warn('[NameParser] 别名表不可用，使用内置别名:', (e as Error).message);
    runtimeAliases = { ...BUILTIN_ALIASES };
  }
}

/** 运行时直接注册别名到内存（不写DB，由调用方决定是否持久化） */
export function registerAliasInMemory(alias: string, canonical: string): void {
  if (alias && canonical && alias !== canonical) {
    runtimeAliases[alias] = canonical;
  }
}

/** 获取当前内存中的别名数量 */
export function getAliasCount(): number {
  return Object.keys(runtimeAliases).length;
}

// ============================================================
// 2. v2 核心：括号缩写提取
// ============================================================

/**
 * 从海缆名称中提取括号里的缩写
 * 
 * 例子：
 *   "Africa Coast to Europe (ACE)"         → { fullPart: "Africa Coast to Europe", abbrev: "ACE" }
 *   "Asia-America Gateway (AAG)"            → { fullPart: "Asia-America Gateway", abbrev: "AAG" }
 *   "Jakarta-Bangka-Bintan-Batam-Singapore (B3JS)" → { fullPart: "...", abbrev: "B3JS" }
 *   "Finland Estonia Connection 1 (FEC-1)"  → { fullPart: "Finland Estonia Connection 1", abbrev: "FEC-1" }
 *   "PEACE Cable"                           → null（无括号缩写）
 *   "a]" (some name with brackets)          → null
 * 
 * 判定规则：括号内容是缩写（而非描述）当且仅当：
 *   - 括号内容长度 <= 20 字符（太长的是描述不是缩写）
 *   - 括号内容比括号外的全名短（缩写应该比全名短）
 *   - 括号在名称末尾，或括号后面只有噪音词（Cable System 等）
 */
export function extractAbbreviation(raw: string): { fullPart: string; abbrev: string } | null {
  // 模式1：括号在末尾 → "Africa Coast to Europe (ACE)"
  // 模式2：括号后跟噪音词 → "Asia-America Gateway (AAG) Cable System"
  const match = raw.match(/^(.+?)\s*\(([^)]{1,20})\)\s*(cable\s*system|system|network|cable|project)?\s*$/i);
  if (!match) return null;

  // fullPart = 括号前的部分 + 括号后的噪音词（如果有）
  let fullPart = match[1].trim();
  if (match[3]) {
    fullPart = fullPart + ' ' + match[3].trim();
  }
  const abbrev = match[2].trim();

  // 验证：缩写应该比全名短
  if (abbrev.length >= fullPart.length) return null;

  // 验证：缩写不应该是纯描述词（如 "formerly known as ..."）
  const descWords = ['formerly', 'previously', 'also', 'phase', 'segment', 'retired'];
  if (descWords.some(w => abbrev.toLowerCase().startsWith(w))) return null;

  return { fullPart, abbrev };
}

/**
 * v2：从一个海缆名称中提取缩写并注册为别名
 * 
 * 返回注册的别名数量（0 或 1）
 * 只注册到内存，不写 DB（由 buildAliasTable 统一写入）
 */
export function extractAndRegisterAlias(raw: string): number {
  const extracted = extractAbbreviation(raw);
  if (!extracted) return 0;

  const { fullPart, abbrev } = extracted;

  // 对全名和缩写分别做基础标准化（不查别名表，纯字符处理）
  const fullNormalized = removeNoise(fullPart.toLowerCase())
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // 提取缩写的 base 部分（可能带后缀如 FEC-1 → base=fec, suffix=1）
  const abbrevLower = abbrev.toLowerCase();
  const abbrevSuffixMatch = abbrevLower.match(/^(.+?)[-\s]*(\d+[a-z]?)$/);

  let abbrevBase: string;
  let fullBase = fullNormalized;

  if (abbrevSuffixMatch) {
    // 缩写带后缀：如 "FEC-1" → abbrevBase="fec"
    abbrevBase = abbrevSuffixMatch[1].replace(/[-\s]/g, '').toLowerCase();

    // 全名也可能带后缀：如 "Finland Estonia Connection 1" → 去掉末尾数字
    fullBase = fullNormalized.replace(/[-\s]*\d+[a-z]?$/, '').replace(/-+$/, '');
  } else {
    // 缩写不带后缀：如 "ACE"
    abbrevBase = abbrevLower.replace(/[-\s]/g, '');
  }

  // 注册别名：缩写的压缩形式 → 全名的标准化形式
  if (abbrevBase && fullBase && abbrevBase !== fullBase) {
    // 避免覆盖已有的更好的别名
    if (!runtimeAliases[abbrevBase]) {
      runtimeAliases[abbrevBase] = fullBase;
      return 1;
    }
  }

  return 0;
}

/**
 * v2：批量扫描海缆名称数组，提取所有括号缩写并注册为别名
 * 返回新注册的别名数量
 */
export function buildAliasesFromNames(names: string[]): number {
  let count = 0;
  for (const name of names) {
    count += extractAndRegisterAlias(name);
  }
  return count;
}

/**
 * v2：将当前内存中的别名写入数据库（持久化）
 * 只写入 DB 中不存在的新别名，不覆盖已有的
 */
export async function persistAliasesToDB(prisma: any): Promise<number> {
  let written = 0;
  for (const [alias, canonical] of Object.entries(runtimeAliases)) {
    // 跳过内置别名（已经在 DB 里了）
    if (BUILTIN_ALIASES[alias]) continue;

    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cable_name_aliases (id, alias, canonical, note) 
         VALUES (gen_random_uuid()::text, $1, $2, $3) ON CONFLICT (alias) DO NOTHING`,
        alias, canonical, 'auto-extracted from parenthetical abbreviation'
      );
      written++;
    } catch (_) {}
  }
  return written;
}

// ============================================================
// 3. 噪音词清理
// ============================================================

function removeNoise(name: string): string {
  return name
    .replace(/submarine\s*cable\s*(system)?/gi, '')
    .replace(/\bcable\s*system\b/gi, '')
    .replace(/\bfibre\s*optic\b/gi, 'fiber-optic')
    .replace(/\bfiber\s*optic\b/gi, 'fiber-optic')
    .replace(/\bsystem\b/gi, '')
    .replace(/\bnetwork\b/gi, '')
    .replace(/\bproject\b/gi, '')
    .replace(/\bcable\b/gi, '')
    .replace(/\s*\([^)]*\)/g, '')   // 删除整个括号及其内容（关键修复：之前只删括号字符不删内容）
    .replace(/[[\]{}"']/g, '')       // 其他类型括号仍然只删字符
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 4. 核心解析（v2：先提取缩写再去括号）
// ============================================================

export interface ParsedCableName {
  raw: string;
  base: string;
  suffix: string;
  canonical: string;
  compressed: string;
  /** v2: 如果名称含括号缩写，这里存缩写的压缩形式 */
  abbreviation: string;
}

export function parseCableName(raw: string): ParsedCableName {
  // v2: 先提取括号中的缩写（在去括号之前）
  const extracted = extractAbbreviation(raw);
  let abbreviation = '';

  if (extracted) {
    abbreviation = extracted.abbrev.toLowerCase().replace(/[-\s]/g, '');
  }

  // 然后正常解析（和 v1 一样）
  let name = raw.toLowerCase().trim();
  name = removeNoise(name);

  const suffixPatterns = [
    /[\s-]*(phase[\s-]*\d+[a-z]?)$/i,
    /[\s-]*(segment[\s-]*\d+[a-z]?)$/i,
    /[\s-]*(section[\s-]*[a-z0-9]+)$/i,
    /[\s-]+(\d+[a-z]?)$/,
    /[-](\d+[a-z]?)$/,
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

  const compressed = base.replace(/[^a-z0-9]/g, '');

  // 查别名表（v2：现在别名表包含了自动提取的缩写映射）
  if (runtimeAliases[compressed]) {
    base = runtimeAliases[compressed];
  } else {
    base = base.replace(/\s+/g, '-').replace(/-+/g, '-');
  }

  const canonical = suffix ? `${base}--${suffix}` : base;

  return { raw, base, suffix, canonical, compressed, abbreviation };
}

// ============================================================
// 5. 字符串相似度算法
// ============================================================

export function jaroWinkler(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0, transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true; bMatches[j] = true; matches++; break;
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
    if (a[i] === b[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

export function yearSimilarity(y1: number | null, y2: number | null): number {
  if (y1 == null || y2 == null) return 0.5;
  const diff = Math.abs(y1 - y2);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;
  if (diff === 2) return 0.5;
  return 0.0;
}

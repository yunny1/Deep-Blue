/**
 * test-sn-parser.ts
 * 
 * 测试脚本 — 抓取真实 SN 页面，对比新旧解析逻辑
 * 纯测试，不改数据库。
 * 
 * 运行方式：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/test-sn-parser.ts
 */

const SN_BASE = 'https://www.submarinenetworks.com';

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 当前的解析器（v1，有 bug）
// ============================================================

function parseV1(html: string): { landingPoints: string[]; lengthKm: number | null } {
  const landingPoints: string[] = [];
  const lenMatch = html.match(/(\d[\d,]{2,})\s*km/i);
  const lengthKm = lenMatch ? parseInt(lenMatch[1].replace(/,/g, '')) : null;

  const section = html.match(/lands at the following[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
  for (const li of section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
    const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\d+\.\s*/, '').trim();
    if (text.length >= 3 && text.length <= 300) {
      landingPoints.push(text);
    }
  }

  return { landingPoints, lengthKm };
}

// ============================================================
// 改进的解析器（v2）
// ============================================================

function parseV2(html: string): { landingPoints: string[]; lengthKm: number | null; lengthSource: string; lpSource: string } {
  const landingPoints: string[] = [];
  let lengthKm: number | null = null;
  let lengthSource = '';
  let lpSource = '';

  // ── 长度解析改进：排除可疑的 16600km ──
  // 策略：找所有 "数字+km" 匹配，排除 16600 和明显来自页面模板的数字
  const allLengthMatches: { value: number; context: string }[] = [];
  const lenRegex = /(\d[\d,]{2,})\s*km/gi;
  let lenMatch;
  while ((lenMatch = lenRegex.exec(html)) !== null) {
    const value = parseInt(lenMatch[1].replace(/,/g, ''));
    // 取匹配位置前后 100 字符作为上下文
    const start = Math.max(0, lenMatch.index - 100);
    const end = Math.min(html.length, lenMatch.index + lenMatch[0].length + 100);
    const context = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    allLengthMatches.push({ value, context });
  }

  // 过滤掉 16600（已知的 SN 模板假值）和明显不合理的值
  const validLengths = allLengthMatches.filter(m => {
    if (m.value === 16600) return false;  // 已知假值
    if (m.value > 50000) return false;    // 超过地球半周（最长海缆约 45000km）
    if (m.value < 10) return false;       // 太短不可能是海缆
    return true;
  });

  if (validLengths.length > 0) {
    // 取第一个合理的值
    lengthKm = validLengths[0].value;
    lengthSource = `从页面提取（上下文: "${validLengths[0].context.slice(0, 60)}..."）`;
  } else if (allLengthMatches.length > 0) {
    lengthSource = `仅找到 ${allLengthMatches.map(m => m.value).join(',')}km（已排除）`;
  } else {
    lengthSource = '页面无长度信息';
  }

  // ── 登陆站解析改进：多种 HTML 模式 ──

  // 模式1（原有）：寻找 "lands at the following" + <ul>/<ol>
  const pattern1 = html.match(/lands at the following[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
  if (pattern1) {
    for (const li of pattern1.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
      const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\d+\.\s*/, '').trim();
      if (text.length >= 3 && text.length <= 300) landingPoints.push(text);
    }
    if (landingPoints.length > 0) lpSource = '模式1: "lands at the following" + <ul>';
  }

  // 模式2：寻找 "landing point" 或 "landing station" 附近的列表
  if (landingPoints.length === 0) {
    const pattern2 = html.match(/landing\s*(?:point|station)s?[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
    if (pattern2) {
      for (const li of pattern2.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
        const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length >= 3 && text.length <= 300) landingPoints.push(text);
      }
      if (landingPoints.length > 0) lpSource = '模式2: "landing point/station" + <ul>';
    }
  }

  // 模式3：寻找 "connects" 或 "connecting" 后面跟国家名的句子
  if (landingPoints.length === 0) {
    const connectMatch = html.match(/connect(?:s|ing)\s+([^<.]{10,300})/i);
    if (connectMatch) {
      const sentence = connectMatch[1].replace(/<[^>]+>/g, '').trim();
      // 尝试按 "and" 或 "," 拆分
      const parts = sentence.split(/,\s*|\s+and\s+/i).map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 100);
      if (parts.length >= 2) {
        landingPoints.push(...parts);
        lpSource = '模式3: "connects/connecting" 句式提取';
      }
    }
  }

  // 模式4：寻找 "cable landing station" 提及
  if (landingPoints.length === 0) {
    const clsMatches = html.match(/([A-Z][a-zA-Z\s]+)\s+cable\s+landing\s+station/gi) || [];
    const unique = new Set<string>();
    for (const m of clsMatches) {
      const name = m.replace(/\s*cable\s+landing\s+station/i, '').trim();
      if (name.length >= 2 && name.length <= 100 && !unique.has(name.toLowerCase())) {
        unique.add(name.toLowerCase());
        landingPoints.push(name);
      }
    }
    if (landingPoints.length > 0) lpSource = '模式4: "XXX cable landing station" 提取';
  }

  // 模式5：从 meta description 或 og:description 提取
  if (landingPoints.length === 0) {
    const descMatch = html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]{10,500})"/i);
    if (descMatch) {
      const desc = descMatch[1];
      const connectMatch2 = desc.match(/connect(?:s|ing)\s+([^.]{10,300})/i);
      if (connectMatch2) {
        const parts = connectMatch2[1].split(/,\s*|\s+and\s+/i).map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 100);
        if (parts.length >= 2) {
          landingPoints.push(...parts);
          lpSource = '模式5: meta description 中 "connects" 句式';
        }
      }
    }
  }

  if (landingPoints.length === 0) {
    lpSource = '所有模式均未匹配';
  }

  return { landingPoints, lengthKm, lengthSource, lpSource };
}

// ============================================================
// 主流程：抓取真实页面测试
// ============================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  SN 页面解析器测试 — 对比 v1 vs v2                    ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // 测试样本：从零登陆站的 SN 独有记录中选取不同类型的海缆
  const testCables = [
    { slug: 'aag', name: 'AAG', category: 'trans-pacific' },
    { slug: 'arcos-1', name: 'ARCOS-1', category: 'trans-atlantic' },
    { slug: 'apcn', name: 'APCN', category: 'intra-asia' },
    { slug: 'cobra', name: 'COBRA', category: 'intra-europe' },
    { slug: 'seacom', name: 'SEACOM', category: 'africa' },
    { slug: 'blue-raman', name: 'Blue-Raman', category: 'asia-europe-africa' },
    { slug: 'arctic-connect', name: 'Arctic Connect', category: 'trans-arctic' },
    { slug: 'palau-guam', name: 'Palau Cable 1', category: 'south-pacific' },
    { slug: 'americas-ii', name: 'Americas-II', category: 'trans-atlantic' },
    { slug: 'celtic-norse', name: 'Celtic Norse', category: 'intra-europe' },
    { slug: 'india-asia-xpress', name: 'IAX', category: 'intra-asia' },
    { slug: 'sjc2', name: 'SJC2', category: 'intra-asia' },
    { slug: 'humboldt', name: 'Humboldt Cable', category: 'trans-pacific' },
    { slug: 'pc-1', name: 'PC-1', category: 'trans-pacific' },
    { slug: 'tat-14', name: 'TAT-14', category: 'trans-atlantic' },
  ];

  let v1LpTotal = 0, v2LpTotal = 0;
  let v1LengthFixed = 0, v2LengthFixed = 0;
  let fetchFailed = 0;

  for (let i = 0; i < testCables.length; i++) {
    const cable = testCables[i];
    const url = `${SN_BASE}/en/systems/${cable.category}/${cable.slug}`;

    console.log(`[${i + 1}/${testCables.length}] "${cable.name}" → ${url}`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/6.0)' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        // 尝试不带 category 的路径（SN 的 URL 结构不固定）
        console.log(`    HTTP ${res.status}，尝试其他路径...`);

        // 尝试几种常见的 category
        const categories = ['trans-pacific', 'trans-atlantic', 'intra-asia', 'intra-europe', 'asia-europe-africa', 'africa', 'south-pacific'];
        let found = false;
        for (const cat of categories) {
          if (cat === cable.category) continue;
          const altUrl = `${SN_BASE}/en/systems/${cat}/${cable.slug}`;
          try {
            const altRes = await fetch(altUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/6.0)' },
              signal: AbortSignal.timeout(10000),
            });
            if (altRes.ok) {
              const html = await altRes.text();
              runComparison(cable.name, html);
              found = true;
              break;
            }
          } catch {}
          await delay(300);
        }
        if (!found) {
          console.log('    ✗ 所有路径都失败\n');
          fetchFailed++;
        }
      } else {
        const html = await res.text();
        const { v1Lp, v2Lp, v1LenOk, v2LenOk } = runComparison(cable.name, html);
        v1LpTotal += v1Lp;
        v2LpTotal += v2Lp;
        if (v1LenOk) v1LengthFixed++;
        if (v2LenOk) v2LengthFixed++;
      }
    } catch (e: any) {
      console.log(`    ✗ 抓取失败: ${e.message}\n`);
      fetchFailed++;
    }

    await delay(1500);
  }

  // 汇总
  console.log('\n══════════════════════════════════════════════════');
  console.log('                    测试汇总');
  console.log('══════════════════════════════════════════════════\n');
  console.log(`测试样本: ${testCables.length} 条`);
  console.log(`成功抓取: ${testCables.length - fetchFailed} 条`);
  console.log(`抓取失败: ${fetchFailed} 条`);
  console.log(`\n登陆站提取:`);
  console.log(`  v1（当前）: 共提取 ${v1LpTotal} 个登陆站`);
  console.log(`  v2（改进）: 共提取 ${v2LpTotal} 个登陆站`);
  console.log(`  改进: +${v2LpTotal - v1LpTotal} 个`);
  console.log(`\n长度解析（排除16600km假值）:`);
  console.log(`  v1（当前）: ${v1LengthFixed} 条有合理长度`);
  console.log(`  v2（改进）: ${v2LengthFixed} 条有合理长度`);
}

function runComparison(name: string, html: string): { v1Lp: number; v2Lp: number; v1LenOk: boolean; v2LenOk: boolean } {
  const v1 = parseV1(html);
  const v2 = parseV2(html);

  const v1LenOk = v1.lengthKm !== null && v1.lengthKm !== 16600;
  const v2LenOk = v2.lengthKm !== null;

  console.log(`    v1: ${v1.landingPoints.length} 站, ${v1.lengthKm || '?'}km${v1.lengthKm === 16600 ? '⚠假值' : ''}`);
  console.log(`    v2: ${v2.landingPoints.length} 站, ${v2.lengthKm || '?'}km`);
  console.log(`        长度来源: ${v2.lengthSource}`);
  console.log(`        站点来源: ${v2.lpSource}`);
  if (v2.landingPoints.length > 0) {
    console.log(`        站点: ${v2.landingPoints.slice(0, 5).join(' | ')}${v2.landingPoints.length > 5 ? ` ...+${v2.landingPoints.length - 5}` : ''}`);
  }
  console.log('');

  return { v1Lp: v1.landingPoints.length, v2Lp: v2.landingPoints.length, v1LenOk, v2LenOk };
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });

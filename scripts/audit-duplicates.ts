/**
 * audit-duplicates.ts
 * 
 * 海缆跨源重复检测脚本
 * 用途：找出 TeleGeography (Tier1) 和 Submarine Networks (Tier2) 之间
 *       可能是同一条海缆但被当作两条独立记录入库的条目
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue
 *   set -a; source .env; set +a
 *   npx tsx scripts/audit-duplicates.ts
 * 
 * 输出：
 *   1. 终端打印疑似重复对（按相似度降序）
 *   2. 生成 audit-duplicates-report.json 供后续处理
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================
// 1. Jaro-Winkler 相似度（名称比较核心算法）
// ============================================================
function jaroWinkler(s1: string, s2: string): number {
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

  // Winkler 前缀加成
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// ============================================================
// 2. 名称标准化（去除常见噪音词后再比较）
// ============================================================
function normalizeCableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/submarine\s*cable\s*(system)?/gi, '')
    .replace(/\bcable\s*system\b/gi, '')
    .replace(/\bsystem\b/gi, '')
    .replace(/\bnetwork\b/gi, '')
    .replace(/\bproject\b/gi, '')
    .replace(/[()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 3. Jaccard 相似度（登陆站集合比较）
// ============================================================
function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ============================================================
// 4. RFS 年份距离（归一化到 0-1）
// ============================================================
function yearSimilarity(y1: number | null, y2: number | null): number {
  // 双方都无年份 → 中性分 0.5，不加分也不扣分
  if (y1 == null || y2 == null) return 0.5;
  const diff = Math.abs(y1 - y2);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;   // 同一条缆两个源记录的RFS差1年很常见
  if (diff === 2) return 0.5;
  return 0.0;
}

// ============================================================
// 5. 综合评分（与项目原有权重一致）
// ============================================================
function computeScore(
  nameScore: number,
  stationScore: number,
  yearScore: number,
): number {
  // 权重：名称40% + 登陆站40% + 年份20%
  return nameScore * 0.4 + stationScore * 0.4 + yearScore * 0.2;
}

// ============================================================
// 6. 主流程
// ============================================================
async function main() {
  console.log('=== Deep Blue 海缆跨源重复审计 ===\n');

  // ----------------------------------------------------------
  // 6.1 拉取所有海缆 + 关联的登陆站
  // ----------------------------------------------------------
  // 注意：如果你的 Prisma schema 中 Cable model 名称或字段名不同，需要调整
  // 常见可能的 model 名：Cable, SubmarineCable, cable
  // 常见字段名：dataSource / source / tier / provider
  // 登陆站关系名：landingStations / stations / CableLandingStation
  
  const allCables = await prisma.cable.findMany({
    include: {
      landingStations: {
        include: {
          landingStation: true,
        },
      },
    },
  });

  console.log(`总海缆数: ${allCables.length}`);

  // 统计各状态
  const statusCount: Record<string, number> = {};
  for (const c of allCables) {
    const s = (c as any).status || 'UNKNOWN';
    statusCount[s] = (statusCount[s] || 0) + 1;
  }
  console.log('状态分布:', statusCount);

  // 统计数据源
  const sourceCount: Record<string, number> = {};
  for (const c of allCables) {
    // 尝试多种可能的字段名
    const src = (c as any).dataSource || (c as any).source || (c as any).tier || 'UNKNOWN';
    sourceCount[src] = (sourceCount[src] || 0) + 1;
  }
  console.log('数据源分布:', sourceCount);

  // ----------------------------------------------------------
  // 6.2 构建比较数据结构
  // ----------------------------------------------------------
  interface CableInfo {
    id: string;
    name: string;
    normalizedName: string;
    slug: string;
    status: string;
    source: string;
    rfsYear: number | null;
    stationNames: Set<string>;   // 用标准化小写名做比较
    stationCountry: Set<string>; // 辅助参考
  }

  const cables: CableInfo[] = allCables.map((c: any) => {
    const stations = (c.landingStations || []).map((ls: any) => ls.landingStation || ls);
    return {
      id: c.id,
      name: c.name || '',
      normalizedName: normalizeCableName(c.name || ''),
      slug: c.slug || '',
      status: c.status || 'UNKNOWN',
      source: c.dataSource || c.source || c.tier || 'UNKNOWN',
      rfsYear: c.rfsYear || c.yearRfs || c.rfs || null,
      stationNames: new Set(stations.map((s: any) => (s.name || '').toLowerCase().trim())),
      stationCountry: new Set(stations.map((s: any) => (s.countryCode || s.country || '').toUpperCase()).filter(Boolean)),
    };
  });

  // ----------------------------------------------------------
  // 6.3 两两比较（O(n²)，~900条 ≈ 40万对，几秒内完成）
  // ----------------------------------------------------------
  interface DuplicatePair {
    cableA: { id: string; name: string; slug: string; status: string; source: string };
    cableB: { id: string; name: string; slug: string; status: string; source: string };
    nameScore: number;
    stationScore: number;
    yearScore: number;
    totalScore: number;
    crossSource: boolean; // 是否跨数据源
  }

  const suspects: DuplicatePair[] = [];
  const THRESHOLD = 55; // 报告阈值（百分制），比自动合并的85低很多，宽松扫描

  for (let i = 0; i < cables.length; i++) {
    for (let j = i + 1; j < cables.length; j++) {
      const a = cables[i];
      const b = cables[j];

      // 快速跳过：名称首字母完全不同且长度差距大 → 大概率无关
      if (Math.abs(a.normalizedName.length - b.normalizedName.length) > 20) continue;

      const nameScore = jaroWinkler(a.normalizedName, b.normalizedName);
      
      // 名称相似度太低直接跳过（加速）
      if (nameScore < 0.5) continue;

      const stationScore = jaccard(a.stationNames, b.stationNames);
      const yearScore = yearSimilarity(a.rfsYear, b.rfsYear);
      const totalScore = computeScore(nameScore, stationScore, yearScore) * 100;

      if (totalScore >= THRESHOLD) {
        const crossSource = a.source !== b.source;
        suspects.push({
          cableA: { id: a.id, name: a.name, slug: a.slug, status: a.status, source: a.source },
          cableB: { id: b.id, name: b.name, slug: b.slug, status: b.status, source: b.source },
          nameScore: Math.round(nameScore * 100),
          stationScore: Math.round(stationScore * 100),
          yearScore: Math.round(yearScore * 100),
          totalScore: Math.round(totalScore),
          crossSource,
        });
      }
    }
  }

  // 按总分降序
  suspects.sort((a, b) => b.totalScore - a.totalScore);

  // ----------------------------------------------------------
  // 6.4 输出报告
  // ----------------------------------------------------------
  const crossSourceDups = suspects.filter(s => s.crossSource);
  const sameSourceDups = suspects.filter(s => !s.crossSource);

  console.log(`\n========================================`);
  console.log(`疑似重复对总数: ${suspects.length}`);
  console.log(`  跨源重复（重点关注）: ${crossSourceDups.length}`);
  console.log(`  同源重复: ${sameSourceDups.length}`);
  console.log(`========================================\n`);

  // 先打印跨源重复（重点）
  if (crossSourceDups.length > 0) {
    console.log('>>> 跨源疑似重复（TeleGeography vs Submarine Networks）<<<\n');
    for (const pair of crossSourceDups) {
      console.log(
        `[${pair.totalScore}分] "${pair.cableA.name}" (${pair.cableA.source}, ${pair.cableA.status})` +
        ` ↔ "${pair.cableB.name}" (${pair.cableB.source}, ${pair.cableB.status})` +
        ` | 名称:${pair.nameScore} 站点:${pair.stationScore} 年份:${pair.yearScore}`
      );
    }
  }

  // 再打印同源重复（可能是 fix-duplicates 未覆盖的）
  if (sameSourceDups.length > 0) {
    console.log('\n>>> 同源疑似重复（可能遗漏的同名/缩写变体）<<<\n');
    for (const pair of sameSourceDups.slice(0, 30)) { // 只打印前30
      console.log(
        `[${pair.totalScore}分] "${pair.cableA.name}" (${pair.cableA.slug})` +
        ` ↔ "${pair.cableB.name}" (${pair.cableB.slug})` +
        ` | 名称:${pair.nameScore} 站点:${pair.stationScore} 年份:${pair.yearScore}`
      );
    }
    if (sameSourceDups.length > 30) {
      console.log(`... 还有 ${sameSourceDups.length - 30} 对，见完整报告文件`);
    }
  }

  // ----------------------------------------------------------
  // 6.5 IN_SERVICE 专项统计
  // ----------------------------------------------------------
  const inServiceCables = cables.filter(c => c.status === 'IN_SERVICE');
  const inServiceBySource: Record<string, number> = {};
  for (const c of inServiceCables) {
    inServiceBySource[c.source] = (inServiceBySource[c.source] || 0) + 1;
  }
  
  console.log(`\n========================================`);
  console.log(`IN_SERVICE 专项统计:`);
  console.log(`  总 IN_SERVICE: ${inServiceCables.length}`);
  console.log(`  按数据源:`, inServiceBySource);
  
  // IN_SERVICE 中的跨源疑似重复
  const inServiceDups = crossSourceDups.filter(
    p => p.cableA.status === 'IN_SERVICE' && p.cableB.status === 'IN_SERVICE'
  );
  console.log(`  IN_SERVICE 跨源疑似重复对: ${inServiceDups.length}`);
  console.log(`  如果这些全部是真重复，去重后 IN_SERVICE 约: ${inServiceCables.length - inServiceDups.length}`);
  console.log(`========================================\n`);

  // ----------------------------------------------------------
  // 6.6 写入 JSON 报告
  // ----------------------------------------------------------
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCables: allCables.length,
      statusDistribution: statusCount,
      sourceDistribution: sourceCount,
      inServiceTotal: inServiceCables.length,
      inServiceBySource,
      suspectedDuplicatePairs: suspects.length,
      crossSourcePairs: crossSourceDups.length,
      sameSourcePairs: sameSourceDups.length,
      inServiceCrossSourcePairs: inServiceDups.length,
      estimatedRealInService: inServiceCables.length - inServiceDups.length,
    },
    crossSourceDuplicates: crossSourceDups,
    sameSourceDuplicates: sameSourceDups,
  };

  const fs = await import('fs');
  const reportPath = 'audit-duplicates-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`完整报告已写入: ${reportPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('审计失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});


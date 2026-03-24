/**
 * verify-sn-quality.ts
 * 
 * 自动化数据质量验证 — 用 Wikipedia 验证 SN 独有零登陆站记录的真实性
 * 
 * 判定逻辑：
 *   1. Wikipedia 能找到 + 长度合理（非16600km）→ 真实海缆但数据不完整，保留
 *   2. Wikipedia 能找到 + 长度16600km → 真实海缆但长度数据错误，修正长度为NULL
 *   3. Wikipedia 找不到 + 长度16600km + 0登陆站 → 大概率无效数据 → 标记LOW_QUALITY
 *   4. Wikipedia 找不到 + 长度合理 + 0登陆站 → 不确定，保留但标记UNVERIFIED
 * 
 * 标记为 LOW_QUALITY 的记录不在前端展示，不计入海缆总数。
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/verify-sn-quality.ts              # DRY_RUN
 *   EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/verify-sn-quality.ts # 正式执行
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXECUTE = process.env.EXECUTE === 'true';

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const SUSPICIOUS_LENGTH = 16600;  // SN 解析错误产生的虚假长度值

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// Wikipedia 验证
// ============================================================

interface WikiResult {
  found: boolean;
  isSubmarineCable: boolean;  // Wikipedia 内容是否提到海缆相关词
  extract: string;            // 摘要前200字符
}

async function checkWikipedia(name: string): Promise<WikiResult> {
  // 清理名称用于搜索：去掉括号内容和常见后缀
  const searchName = name
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\bcable\s*system\b/gi, '')
    .replace(/\bsubmarine\b/gi, '')
    .trim();

  try {
    const res = await fetch(
      `${WIKI_API}/${encodeURIComponent(searchName.replace(/\s+/g, '_'))}`,
      { headers: { 'User-Agent': 'DeepBlue/6.0 (contact@deep-cloud.org)' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return { found: false, isSubmarineCable: false, extract: '' };

    const d = await res.json() as any;
    if (!d.extract) return { found: false, isSubmarineCable: false, extract: '' };

    const text = d.extract.toLowerCase();
    const cableKeywords = ['submarine', 'cable', 'undersea', 'fiber', 'fibre', 'optical', 'telecom', 'bandwidth', 'landing'];
    const isCable = cableKeywords.some(k => text.includes(k));

    return {
      found: true,
      isSubmarineCable: isCable,
      extract: d.extract.slice(0, 200),
    };
  } catch {
    return { found: false, isSubmarineCable: false, extract: '' };
  }
}

// 有些缩写名在 Wikipedia 上用全名才能找到，再试一次
async function checkWikipediaWithVariants(name: string): Promise<WikiResult> {
  // 第一次：直接搜名称
  const result1 = await checkWikipedia(name);
  if (result1.found && result1.isSubmarineCable) return result1;

  // 第二次：加 "submarine cable" 后缀搜
  await delay(500);
  const result2 = await checkWikipedia(name + ' submarine cable');
  if (result2.found && result2.isSubmarineCable) return result2;

  // 第三次：如果名字很短（缩写），搜 "NAME cable"
  if (name.length <= 10) {
    await delay(500);
    const result3 = await checkWikipedia(name + ' cable');
    if (result3.found && result3.isSubmarineCable) return result3;
  }

  // 返回最好的结果
  return result1.found ? result1 : result2.found ? result2 : { found: false, isSubmarineCable: false, extract: '' };
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  SN独有数据质量验证 — Wikipedia 自动检查              ║`);
  console.log(`║  模式: ${EXECUTE ? '正式执行' : 'DRY_RUN（只看报告）'}                                 ║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // 拉取所有零登陆站的 SN 独有记录
  const snCables = await prisma.cable.findMany({
    where: {
      mergedInto: null,
      id: { startsWith: 'sn-' },
      status: { notIn: ['REMOVED', 'MERGED'] },
    },
    include: { _count: { select: { landingStations: true } } },
    orderBy: { name: 'asc' },
  });

  const zeroStation = snCables.filter(c => c._count.landingStations === 0);
  const hasStation = snCables.filter(c => c._count.landingStations > 0);

  console.log(`SN独有总数: ${snCables.length}`);
  console.log(`  有登陆站: ${hasStation.length}（保留，不验证）`);
  console.log(`  零登陆站: ${zeroStation.length}（需要验证）\n`);

  // 分类结果
  const categories = {
    wikiConfirmedCable: [] as any[],     // Wikipedia确认是海缆
    wikiFoundNotCable: [] as any[],      // Wikipedia有条目但不是海缆
    wikiNotFound: [] as any[],           // Wikipedia找不到
  };

  // 逐条检查
  console.log('正在逐条验证（每条间隔1秒防止被Wikipedia限流）...\n');

  for (let i = 0; i < zeroStation.length; i++) {
    const cable = zeroStation[i];
    const isSuspiciousLength = cable.lengthKm === SUSPICIOUS_LENGTH;

    const wiki = await checkWikipediaWithVariants(cable.name);
    await delay(1000);

    const label = wiki.found && wiki.isSubmarineCable ? '✓海缆' : wiki.found ? '?非海缆' : '✗未找到';
    const lengthLabel = isSuspiciousLength ? '⚠16600km' : `${cable.lengthKm || '?'}km`;

    console.log(`  [${i + 1}/${zeroStation.length}] ${label} ${lengthLabel} "${cable.name}"`);
    if (wiki.extract) {
      console.log(`    摘要: ${wiki.extract.slice(0, 100)}...`);
    }

    if (wiki.found && wiki.isSubmarineCable) {
      categories.wikiConfirmedCable.push({ ...cable, wiki, isSuspiciousLength });
    } else if (wiki.found) {
      categories.wikiFoundNotCable.push({ ...cable, wiki, isSuspiciousLength });
    } else {
      categories.wikiNotFound.push({ ...cable, wiki, isSuspiciousLength });
    }
  }

  // ── 分类报告 ──────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('                 验证结果汇总');
  console.log('══════════════════════════════════════════════════\n');

  console.log(`A. Wikipedia确认是海缆: ${categories.wikiConfirmedCable.length} 条 → 保留（标记UNVERIFIED，数据不完整）`);
  for (const c of categories.wikiConfirmedCable) {
    const lbl = c.isSuspiciousLength ? '⚠长度可疑' : '长度合理';
    console.log(`    "${c.name}" (${lbl})`);
  }

  console.log(`\nB. Wikipedia有条目但不是海缆: ${categories.wikiFoundNotCable.length} 条 → 标记LOW_QUALITY`);
  for (const c of categories.wikiFoundNotCable) {
    console.log(`    "${c.name}"`);
  }

  console.log(`\nC. Wikipedia找不到: ${categories.wikiNotFound.length} 条`);
  const cSuspicious = categories.wikiNotFound.filter(c => c.isSuspiciousLength);
  const cReasonable = categories.wikiNotFound.filter(c => !c.isSuspiciousLength);
  console.log(`    C1. 长度16600km（可疑）: ${cSuspicious.length} 条 → 标记LOW_QUALITY`);
  for (const c of cSuspicious) {
    console.log(`      "${c.name}"`);
  }
  console.log(`    C2. 长度合理: ${cReasonable.length} 条 → 保留（标记UNVERIFIED）`);
  for (const c of cReasonable) {
    console.log(`      "${c.name}" (${c.lengthKm || '?'}km)`);
  }

  // 汇总
  const toMarkLowQuality = [
    ...categories.wikiFoundNotCable,
    ...cSuspicious,
  ];
  const toMarkUnverified = [
    ...categories.wikiConfirmedCable,
    ...cReasonable,
  ];

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  标记 LOW_QUALITY（不展示，不计数）: ${toMarkLowQuality.length} 条`);
  console.log(`  标记 UNVERIFIED（保留但数据不完整）: ${toMarkUnverified.length} 条`);
  console.log(`  有登陆站的 SN 记录（不受影响）: ${hasStation.length} 条`);
  console.log('══════════════════════════════════════════════════\n');

  // ── 执行 ─────────────────────────────────────────────────────
  if (!EXECUTE) {
    console.log('DRY_RUN: 不修改数据库');
    console.log('确认后执行: EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/verify-sn-quality.ts\n');
  } else {
    // 标记 LOW_QUALITY
    let lowQualityCount = 0;
    for (const cable of toMarkLowQuality) {
      try {
        await prisma.cable.update({
          where: { id: cable.id },
          data: { reviewStatus: 'LOW_QUALITY' },
        });
        lowQualityCount++;
      } catch (e: any) {
        console.error(`  ✗ "${cable.name}": ${e.message}`);
      }
    }
    console.log(`✓ 已标记 ${lowQualityCount} 条为 LOW_QUALITY`);

    // 标记 UNVERIFIED + 修正可疑长度
    let unverifiedCount = 0;
    for (const cable of toMarkUnverified) {
      try {
        const updates: any = { reviewStatus: 'UNVERIFIED' };
        if (cable.isSuspiciousLength) {
          updates.lengthKm = null;  // 清除可疑的16600km
        }
        await prisma.cable.update({
          where: { id: cable.id },
          data: updates,
        });
        unverifiedCount++;
      } catch (e: any) {
        console.error(`  ✗ "${cable.name}": ${e.message}`);
      }
    }
    console.log(`✓ 已标记 ${unverifiedCount} 条为 UNVERIFIED`);

    // 清除缓存
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      await Promise.all([
        redis.del('cables:geo:details'),
        redis.del('cables:geo'),
        redis.del('cables:list'),
        redis.del('stats:global'),
      ]);
      console.log('✓ 缓存已清除');
    } catch {}
  }

  // ── 最终统计 ──────────────────────────────────────────────────
  const finalActive = await prisma.cable.count({
    where: {
      mergedInto: null,
      status: { notIn: ['REMOVED', 'MERGED'] },
      OR: [
        { reviewStatus: null },
        { reviewStatus: { notIn: ['LOW_QUALITY', 'MERGED'] } },
      ],
    },
  });

  console.log(`\n最终前端可见海缆数: ${finalActive} 条`);

  // 写报告
  const fs = await import('fs');
  const report = {
    generatedAt: new Date().toISOString(),
    execute: EXECUTE,
    snTotal: snCables.length,
    zeroStationChecked: zeroStation.length,
    wikiConfirmedCable: categories.wikiConfirmedCable.map(c => ({ name: c.name, length: c.lengthKm })),
    wikiFoundNotCable: categories.wikiFoundNotCable.map(c => ({ name: c.name })),
    wikiNotFoundSuspicious: cSuspicious.map(c => ({ name: c.name })),
    wikiNotFoundReasonable: cReasonable.map(c => ({ name: c.name, length: c.lengthKm })),
    markedLowQuality: toMarkLowQuality.length,
    markedUnverified: toMarkUnverified.length,
    finalActiveCount: finalActive,
  };
  const reportPath = '/home/ubuntu/deep-blue/verify-sn-report.json';
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`报告: ${reportPath}`);
  } catch {
    fs.writeFileSync('verify-sn-report.json', JSON.stringify(report, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

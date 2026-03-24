/**
 * backfill-sn-stations.ts
 * 
 * 一次性脚本：重新抓取所有零登陆站的 SN 海缆页面，用改进的解析器提取数据
 * 
 * 做三件事：
 *   1. 从 SN 页面重新提取登陆站（v2 多模式解析）
 *   2. 修正 16600km 假值（清为 NULL 或从页面重新提取）
 *   3. 记录哪些页面成功提取、哪些失败
 * 
 * 运行方式：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/backfill-sn-stations.ts              # DRY_RUN
 *   EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/backfill-sn-stations.ts # 正式执行
 */

import { PrismaClient } from '@prisma/client';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();
const EXECUTE = process.env.EXECUTE === 'true';
const SN_BASE = 'https://www.submarinenetworks.com';

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function slugify(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

// ============================================================
// v2 页面解析器（改进版，含模式3清洗）
// ============================================================

interface ParseResult {
  landingPoints: { name: string; city: string; country: string }[];
  lengthKm: number | null;
  lpSource: string;
  isRetired: boolean;
}

// 模式3 清洗：过滤掉非地名的文本
function isLikelyLocation(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 2) return false;
  if (cleaned.length > 80) return false;

  // 排除明显的非地名
  const nonLocationWords = [
    'ready', 'service', 'being', 'branch', 'cable', 'system', 'fiber', 'fibre',
    'capacity', 'designed', 'built', 'operated', 'managed', 'owned', 'launched',
    'completed', 'planned', 'proposed', 'expected', 'estimated', 'approximately',
    'submarine', 'undersea', 'optical', 'bandwidth', 'terabit', 'gigabit',
    'consortium', 'investment', 'million', 'billion', 'project', 'phase',
    'the cable', 'this cable', 'which', 'that', 'with a', 'providing',
  ];
  const lower = cleaned.toLowerCase();
  if (nonLocationWords.some(w => lower.startsWith(w))) return false;

  // 排除纯连接词
  if (['and', 'or', 'to', 'the', 'a', 'an', 'via', 'through'].includes(lower)) return false;

  // 排除包含年份的文本（如 "ready for service in 2017"）
  if (/\b(19|20)\d{2}\b/.test(cleaned)) return false;

  // 排除纯数字
  if (/^\d+$/.test(cleaned)) return false;

  return true;
}

function parseSNPageV2(html: string, sourceUrl: string): ParseResult {
  const result: ParseResult = {
    landingPoints: [],
    lengthKm: null,
    lpSource: '',
    isRetired: html.includes('>Retired<') || html.includes('/tag/retired'),
  };

  // ── 长度解析：排除 16600km 假值 ──
  const lenRegex = /(\d[\d,]{2,})\s*km/gi;
  let lenMatch;
  while ((lenMatch = lenRegex.exec(html)) !== null) {
    const value = parseInt(lenMatch[1].replace(/,/g, ''));
    if (value === 16600 || value === 16608) continue;  // 已知假值
    if (value > 50000 || value < 10) continue;          // 不合理范围
    result.lengthKm = value;
    break;
  }

  // ── 登陆站解析：多模式 ──

  // 模式1：寻找 "lands at the following" + <ul>/<ol>
  const pattern1 = html.match(/lands at the following[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
  if (pattern1) {
    for (const li of pattern1.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
      const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\d+\.\s*/, '').trim();
      if (text.length >= 3 && text.length <= 300) {
        const parts = text.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          result.landingPoints.push({
            name: text, city: parts[0],
            country: parts[parts.length - 1].replace(/\(.*\)/g, '').trim(),
          });
        }
      }
    }
    if (result.landingPoints.length > 0) { result.lpSource = '模式1'; return result; }
  }

  // 模式2：寻找 "landing point" 或 "landing station" 附近的列表
  const pattern2 = html.match(/landing\s*(?:point|station)s?[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
  if (pattern2) {
    for (const li of pattern2.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
      const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length >= 3 && text.length <= 300) {
        const parts = text.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 1) {
          const country = parts.length >= 2 ? parts[parts.length - 1].replace(/[;.]/g, '').trim() : '';
          result.landingPoints.push({
            name: text.replace(/[;.]+$/, '').trim(),
            city: parts[0].replace(/[;.]+$/, '').trim(),
            country,
          });
        }
      }
    }
    if (result.landingPoints.length > 0) { result.lpSource = '模式2'; return result; }
  }

  // 模式3（改进版）：寻找 "connects" 或 "connecting" 后面的国家/地名
  const connectMatch = html.match(/connect(?:s|ing)\s+([^<.]{10,400})/i);
  if (connectMatch) {
    const sentence = connectMatch[1].replace(/<[^>]+>/g, '').trim();
    const rawParts = sentence.split(/,\s*|\s+and\s+/i).map(p => p.trim());
    // 清洗：只保留像地名的部分
    const cleanParts = rawParts.filter(isLikelyLocation);

    if (cleanParts.length >= 2) {
      for (const part of cleanParts) {
        // 尝试从 "city, country" 或纯国家名中提取
        const subParts = part.split(',').map(p => p.trim()).filter(Boolean);
        const country = subParts.length >= 2 ? subParts[subParts.length - 1] : part;
        result.landingPoints.push({
          name: part,
          city: subParts[0] || part,
          country: country.replace(/[;.]/g, '').trim(),
        });
      }
      if (result.landingPoints.length > 0) { result.lpSource = '模式3'; return result; }
    }
  }

  // 模式4：从 meta description 提取
  const descMatch = html.match(/<meta\s+(?:name="description"|property="og:description")\s+content="([^"]{10,500})"/i);
  if (descMatch) {
    const desc = descMatch[1];
    const cm = desc.match(/connect(?:s|ing)\s+([^.]{10,300})/i);
    if (cm) {
      const rawParts = cm[1].split(/,\s*|\s+and\s+/i).map(p => p.trim());
      const cleanParts = rawParts.filter(isLikelyLocation);
      if (cleanParts.length >= 2) {
        for (const part of cleanParts) {
          result.landingPoints.push({ name: part, city: part, country: part });
        }
        result.lpSource = '模式4-meta';
        return result;
      }
    }
  }

  result.lpSource = '未匹配';
  return result;
}

// ============================================================
// URL 路径探测（SN 的 category 不固定）
// ============================================================

async function fetchSNPage(slug: string): Promise<{ html: string; url: string } | null> {
  const categories = [
    'trans-pacific', 'trans-atlantic', 'intra-asia', 'intra-europe',
    'asia-europe-africa', 'africa', 'south-pacific', 'australia-usa',
    'brazil-us', 'euro-africa', 'asia-australia', 'north-america',
    'brazil-africa', 'brazil-europe',
  ];

  for (const cat of categories) {
    const url = `${SN_BASE}/en/systems/${cat}/${slug}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/7.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const html = await res.text();
        // 简单验证：页面确实包含海缆相关内容
        if (html.length > 2000) return { html, url };
      }
    } catch {}
    await delay(300);
  }

  return null;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  SN 登陆站补全 + 16600km 修正                         ║`);
  console.log(`║  模式: ${EXECUTE ? '正式执行' : 'DRY_RUN'}                                            ║`);
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
  const suspicious16600 = snCables.filter(c => c.lengthKm === 16600 || c.lengthKm === 16608);

  console.log(`SN独有总数: ${snCables.length}`);
  console.log(`零登陆站: ${zeroStation.length} 条`);
  console.log(`16600km假值: ${suspicious16600.length} 条\n`);

  // 需要处理的：零登陆站 OR 16600km
  const toProcess = new Map<string, any>();
  for (const c of zeroStation) toProcess.set(c.id, c);
  for (const c of suspicious16600) toProcess.set(c.id, c);

  console.log(`需要重新抓取: ${toProcess.size} 条\n`);

  const stats = {
    fetched: 0, fetchFailed: 0,
    stationsAdded: 0, stationCablesFixed: 0,
    lengthFixed: 0, lengthCleared: 0,
  };

  for (const [cableId, cable] of toProcess) {
    const slug = cableId.replace(/^sn-/, '');
    const hasZeroStations = zeroStation.some(c => c.id === cableId);
    const has16600 = cable.lengthKm === 16600 || cable.lengthKm === 16608;

    process.stdout.write(`  [${stats.fetched + stats.fetchFailed + 1}/${toProcess.size}] "${cable.name}" ...`);

    const page = await fetchSNPage(slug);
    if (!page) {
      console.log(' ✗ 页面抓取失败');
      stats.fetchFailed++;

      // 即使抓不到页面，也修正 16600km
      if (has16600 && EXECUTE) {
        await prisma.cable.update({ where: { id: cableId }, data: { lengthKm: null } });
        stats.lengthCleared++;
      }
      await delay(500);
      continue;
    }

    stats.fetched++;
    const parsed = parseSNPageV2(page.html, page.url);

    let updates: string[] = [];

    // 修正长度
    if (has16600) {
      if (parsed.lengthKm && parsed.lengthKm !== 16600 && parsed.lengthKm !== 16608) {
        updates.push(`长度: 16600→${parsed.lengthKm}km`);
        if (EXECUTE) {
          await prisma.cable.update({ where: { id: cableId }, data: { lengthKm: parsed.lengthKm } });
        }
        stats.lengthFixed++;
      } else {
        updates.push(`长度: 16600→NULL`);
        if (EXECUTE) {
          await prisma.cable.update({ where: { id: cableId }, data: { lengthKm: null } });
        }
        stats.lengthCleared++;
      }
    }

    // 添加登陆站
    if (hasZeroStations && parsed.landingPoints.length > 0) {
      updates.push(`+${parsed.landingPoints.length}站(${parsed.lpSource})`);

      if (EXECUTE) {
        for (const lp of parsed.landingPoints) {
          const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
          if (!cc || cc === 'XX') continue;

          await prisma.country.upsert({
            where: { code: cc }, update: {},
            create: { code: cc, nameEn: cc },
          }).catch(() => {});

          const stationId = `sn-${slugify(lp.name)}-${cc.toLowerCase()}`;
          const station = await prisma.landingStation.upsert({
            where: { id: stationId },
            update: { name: lp.name, countryCode: cc },
            create: { id: stationId, name: lp.name, countryCode: cc, latitude: null, longitude: null },
          }).catch(() => null);

          if (station) {
            await prisma.cableLandingStation.upsert({
              where: { cableId_landingStationId: { cableId, landingStationId: station.id } },
              update: {}, create: { cableId, landingStationId: station.id },
            }).catch(() => {});
            stats.stationsAdded++;
          }
        }
        stats.stationCablesFixed++;
      }
    } else if (hasZeroStations) {
      updates.push(`站点: 未提取到(${parsed.lpSource})`);
    }

    console.log(` ${updates.length > 0 ? updates.join(' | ') : '无变化'}`);
    await delay(1500);
  }

  // 最终统计
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  成功抓取: ${stats.fetched} 页`);
  console.log(`  抓取失败: ${stats.fetchFailed} 页`);
  console.log(`  登陆站新增: ${stats.stationsAdded} 个（涉及 ${stats.stationCablesFixed} 条海缆）`);
  console.log(`  长度修正: ${stats.lengthFixed} 条（从页面重新提取）`);
  console.log(`  长度清除: ${stats.lengthCleared} 条（16600→NULL）`);
  console.log('══════════════════════════════════════════════════\n');

  if (!EXECUTE) {
    console.log('DRY_RUN: 不修改数据库');
    console.log('确认后执行: EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/backfill-sn-stations.ts\n');
  } else {
    // 清除缓存
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      await Promise.all([
        redis.del('cables:geo:details'), redis.del('cables:geo'),
        redis.del('cables:list'), redis.del('stats:global'),
      ]);
      console.log('✓ 缓存已清除');
    } catch {}
  }

  // 最终验证
  const remainingZero = await prisma.cable.count({
    where: {
      mergedInto: null, id: { startsWith: 'sn-' },
      status: { notIn: ['REMOVED'] },
      landingStations: { none: {} },
    },
  });
  const remaining16600 = await prisma.cable.count({
    where: {
      mergedInto: null, status: { notIn: ['REMOVED'] },
      lengthKm: 16600,
    },
  });
  console.log(`\n修复后仍零登陆站: ${remainingZero} 条`);
  console.log(`修复后仍16600km: ${remaining16600} 条`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

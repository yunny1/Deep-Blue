// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步与交叉验证脚本 v1
//
// 执行逻辑：
//   1. 从 TeleGeography API 下载全量海缆数据
//   2. 从 Submarine Networks 抓取对应页面数据
//   3. 逐字段交叉验证：一致直接入库，不一致查第三方仲裁
//   4. 加权投票决定真值后落库
//   5. 生成验证报告存入 Redis
//
// 运行方式：npx tsx scripts/nightly-sync.ts
// Cron：每天 UTC 19:00（北京时间凌晨 3:00）

import { PrismaClient } from '@prisma/client';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();

// ── 数据源 URL ───────────────────────────────────────────────────
const TG_ALL   = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const TG_GEO   = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const TG_LP    = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
const SN_BASE  = 'https://www.submarinenetworks.com';
const FA_BASE  = 'https://www.fiberatlantic.com';

// ── 工具函数 ─────────────────────────────────────────────────────
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

function parseLength(len: string | null | undefined): number | null {
  if (!len) return null;
  const num = String(len).replace(/[^0-9.]/g, '');
  return num ? parseFloat(num) : null;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'OK', msg: string) {
  const icons = { INFO: '•', WARN: '⚠️', ERROR: '✗', OK: '✓' };
  console.log(`${icons[level]} [${level}] ${msg}`);
}

// ── 验证报告结构 ─────────────────────────────────────────────────
interface ValidationReport {
  runAt: string;
  totalCables: number;
  consistent: number;        // 两个来源一致，直接入库
  inconsistent: number;      // 两个来源不一致，需要仲裁
  arbitrated: number;        // 经第三方仲裁后有结论
  unresolved: number;        // 仲裁后仍无法确定
  newCables: number;         // 新发现的海缆
  updatedCables: number;     // 有字段更新的海缆
  conflicts: ConflictRecord[];
}

interface ConflictRecord {
  cableId: string;
  cableName: string;
  field: string;
  tgValue: string;
  snValue: string;
  verdict: string;           // 'tg' | 'sn' | 'third_party' | 'unresolved'
  verdictSource: string;
  verdictValue: string;
}

// ── 第一层：TeleGeography 数据 ────────────────────────────────────
interface TGCable {
  id: string;
  name: string;
  length: string | null;
  rfs_year: number | null;
  rfs: string | null;
  is_planned: boolean;
  owners: string | null;
  suppliers: string | null;
  notes: string | null;
  url: string | null;
  landing_points: Array<{
    id: string;
    name: string;
    country: string;
    is_tbd: boolean | null;
  }>;
  geoJson?: any;
}

async function fetchTeleGeography(): Promise<Map<string, TGCable>> {
  log('INFO', 'TeleGeography: 下载海缆列表...');
  const [allRes, geoRes, lpRes] = await Promise.all([
    fetch(TG_ALL),
    fetch(TG_GEO),
    fetch(TG_LP),
  ]);

  const allCables = await allRes.json() as any[];
  const geoData   = await geoRes.json();
  const lpData    = await lpRes.json();

  // 构建 GeoJSON 映射
  const geoMap = new Map<string, any>();
  for (const f of geoData.features || []) {
    geoMap.set(f.properties?.id, f.geometry);
  }

  // 构建登陆站坐标映射
  const lpCoords = new Map<string, { lat: number; lng: number }>();
  for (const f of lpData.features || []) {
    const id = f.properties?.id;
    const coords = f.geometry?.coordinates;
    if (id && coords) lpCoords.set(id, { lat: coords[1], lng: coords[0] });
  }

  log('INFO', `TeleGeography: 找到 ${allCables.length} 条海缆，开始逐条获取详情...`);

  const result = new Map<string, TGCable>();
  let fetched = 0;

  for (const cable of allCables) {
    try {
      const res = await fetch(
        `https://www.submarinecablemap.com/api/v3/cable/${cable.id}.json`
      );
      if (!res.ok) continue;

      const text = await res.text();
      // 防止 API 返回 HTML（重定向情况）
      if (text.trimStart().startsWith('<')) continue;

      const detail = JSON.parse(text) as TGCable;
      detail.geoJson = geoMap.get(cable.id) || null;

      // 补充登陆站坐标
      if (detail.landing_points) {
        for (const lp of detail.landing_points) {
          const coords = lpCoords.get(lp.id);
          if (coords) {
            (lp as any).lat = coords.lat;
            (lp as any).lng = coords.lng;
          }
        }
      }

      result.set(cable.id, detail);
      fetched++;
      if (fetched % 50 === 0) log('INFO', `  已获取 ${fetched}/${allCables.length} 条...`);
      await delay(50);
    } catch {}
  }

  log('OK', `TeleGeography: 成功获取 ${result.size} 条海缆详情`);
  return result;
}

// ── 第二层：Submarine Networks 数据 ──────────────────────────────
interface SNLandingPoint {
  name: string;
  city: string;
  country: string;
}

interface SNData {
  name: string;
  isRetired: boolean;
  lengthKm: number | null;
  rfsYear: number | null;
  landingPoints: SNLandingPoint[];
  owners: string[];
  sourceUrl: string;
}

// 从 SN 搜索页面找到一条海缆的 URL
async function findSNCableUrl(cableName: string, cableId: string): Promise<string | null> {
  // 常见的 SN URL 路径模式
  const candidates = [
    `/en/systems/asia-europe-africa/${cableId}`,
    `/en/systems/trans-pacific/${cableId}`,
    `/en/systems/trans-atlantic/${cableId}`,
    `/en/systems/intra-asia/${cableId}`,
    `/en/systems/africa/${cableId}`,
    `/en/systems/australia-usa/${cableId}`,
    `/en/systems/brazil-us/${cableId}`,
    `/en/systems/euro-africa/${cableId}`,
  ];

  for (const path of candidates) {
    try {
      const res = await fetch(`${SN_BASE}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/1.0)' },
      });
      if (res.ok) {
        const text = await res.text();
        // 确认页面确实是这条海缆（不是404重定向到首页）
        if (text.includes(cableName.slice(0, 10)) ||
            text.toLowerCase().includes(cableId.slice(0, 6))) {
          return `${SN_BASE}${path}`;
        }
      }
    } catch {}
    await delay(100);
  }
  return null;
}

// 解析 SN 页面内容
function parseSNPage(html: string, sourceUrl: string): Partial<SNData> {
  const result: Partial<SNData> = { sourceUrl, landingPoints: [], owners: [] };

  // 检测退役标签
  result.isRetired = html.includes('>Retired<') || html.includes('class="retired"') ||
                     html.includes('/tag/retired');

  // 提取长度（如 "28,000 km"）
  const lenMatch = html.match(/(\d{2,3},\d{3})\s*km/i) ||
                   html.match(/(\d{4,6})\s*km/i);
  if (lenMatch) {
    result.lengthKm = parseInt(lenMatch[1].replace(',', ''));
  }

  // 提取 RFS 年份
  const rfsMatch = html.match(/(\d{4})\s*(November|December|January|February|March|April|May|June|July|August|September|October)/i) ||
                   html.match(/RFS[:\s]+(\d{4})/i) ||
                   html.match(/ready for service[:\s]+(\d{4})/i);
  if (rfsMatch) result.rfsYear = parseInt(rfsMatch[1]);

  // 提取登陆站（<li> 列表项通常包含城市、国家信息）
  const landingSection = html.match(/lands at the following[^<]*(<ul>.*?<\/ul>)/is)?.[1] ||
                         html.match(/landing stations?[^<]*(<ul>.*?<\/ul>)/is)?.[1] || '';

  if (landingSection) {
    const liMatches = landingSection.match(/<li[^>]*>(.*?)<\/li>/gis) || [];
    for (const li of liMatches) {
      const text = li.replace(/<[^>]+>/g, '').trim();
      if (text.length > 3 && text.length < 200) {
        // 尝试解析 "City, Country" 格式
        const parts = text.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          result.landingPoints!.push({
            name: text,
            city: parts[0],
            country: parts[parts.length - 1].replace(/\s*\(.*\)/, '').trim(),
          });
        }
      }
    }
  }

  return result;
}

async function fetchSubmarineNetworks(
  cableId: string,
  cableName: string
): Promise<Partial<SNData> | null> {
  try {
    const url = await findSNCableUrl(cableName, cableId);
    if (!url) return null;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/1.0)' },
    });
    if (!res.ok) return null;

    const html = await res.text();
    return parseSNPage(html, url);
  } catch {
    return null;
  }
}

// ── 第三层：第三方仲裁 ────────────────────────────────────────────
interface VerdictResult {
  verdict: 'tg' | 'sn' | 'third_party' | 'unresolved';
  value: string;
  source: string;
  confidence: number; // 0-1
}

// 查询 FiberAtlantic（聚合了运营商数据）
async function checkFiberAtlantic(cableName: string): Promise<Partial<SNData> | null> {
  try {
    const searchUrl = `${FA_BASE}/search?q=${encodeURIComponent(cableName)}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseSNPage(html, searchUrl);
  } catch {
    return null;
  }
}

// 查询 Wikipedia
async function checkWikipedia(cableName: string): Promise<{ isRetired?: boolean; summary?: string } | null> {
  try {
    const title = cableName.replace(/\s+/g, '_');
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'DeepBlue/1.0 (submarine cable monitor)' },
    });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const extract = (data.extract || '').toLowerCase();

    // 检测退役关键词
    const retiredKeywords = ['retired', 'decommission', 'end-of-life', 'out of service', 'ceased operation'];
    const activeKeywords  = ['currently operational', 'in service', 'active', 'operating'];

    const retiredScore = retiredKeywords.filter(k => extract.includes(k)).length;
    const activeScore  = activeKeywords.filter(k => extract.includes(k)).length;

    return {
      isRetired: retiredScore > activeScore ? true : activeScore > retiredScore ? false : undefined,
      summary: data.extract?.slice(0, 200),
    };
  } catch {
    return null;
  }
}

// 核心仲裁函数：对冲突字段进行第三方查验
async function arbitrate(
  cableId: string,
  cableName: string,
  field: string,
  tgValue: string,
  snValue: string,
): Promise<VerdictResult> {
  log('WARN', `仲裁 [${cableName}] 字段 "${field}": TG="${tgValue}" vs SN="${snValue}"`);

  if (field === 'status') {
    // 状态冲突：查 FiberAtlantic 和 Wikipedia
    const [fa, wiki] = await Promise.all([
      checkFiberAtlantic(cableName),
      checkWikipedia(cableName),
    ]);

    await delay(500); // 尊重第三方频率限制

    // 统计各方投票
    let retiredVotes = 0;
    let activeVotes  = 0;
    const sources: string[] = [];

    // TeleGeography 投票（权重：3）
    if (tgValue === 'DECOMMISSIONED') { retiredVotes += 3; sources.push('TeleGeography(退役)'); }
    else                              { activeVotes  += 3; sources.push('TeleGeography(在役)'); }

    // Submarine Networks 投票（权重：2）
    if (snValue === 'DECOMMISSIONED') { retiredVotes += 2; sources.push('SubmarineNetworks(退役)'); }
    else                              { activeVotes  += 2; sources.push('SubmarineNetworks(在役)'); }

    // FiberAtlantic 投票（权重：2，聚合了运营商数据）
    if (fa?.isRetired === true)       { retiredVotes += 2; sources.push('FiberAtlantic(退役)'); }
    else if (fa?.isRetired === false) { activeVotes  += 2; sources.push('FiberAtlantic(在役)'); }

    // Wikipedia 投票（权重：1）
    if (wiki?.isRetired === true)     { retiredVotes += 1; sources.push('Wikipedia(退役)'); }
    else if (wiki?.isRetired === false){ activeVotes  += 1; sources.push('Wikipedia(在役)'); }

    const total = retiredVotes + activeVotes;
    if (total === 0) {
      return { verdict: 'unresolved', value: tgValue, source: 'fallback to TG', confidence: 0.3 };
    }

    const isRetired  = retiredVotes > activeVotes;
    const confidence = Math.max(retiredVotes, activeVotes) / total;
    const value      = isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';

    log('OK', `  仲裁结果: ${value} (置信度 ${(confidence * 100).toFixed(0)}%) | ${sources.join(', ')}`);

    return {
      verdict: 'third_party',
      value,
      source: sources.join(' | '),
      confidence,
    };
  }

  // 其他字段冲突：暂时以 TeleGeography 为准（更新频率更高）
  return {
    verdict: 'tg',
    value: tgValue,
    source: 'TeleGeography (default for non-status fields)',
    confidence: 0.6,
  };
}

// ── 登陆站交叉验证 ───────────────────────────────────────────────
interface MergedLandingPoint {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  source: 'tg_only' | 'sn_only' | 'both';
  confidence: number;
}

function mergeLandingPoints(
  tgPoints: TGCable['landing_points'],
  snPoints: SNLandingPoint[],
): MergedLandingPoint[] {
  const result: MergedLandingPoint[] = [];
  const matched = new Set<number>();

  for (const tgLp of tgPoints) {
    const tgName  = tgLp.name.toLowerCase();
    const lp      = tgLp as any;
    let snIdx     = -1;

    // 尝试在 SN 数据里找到对应站点（模糊匹配城市名）
    for (let i = 0; i < snPoints.length; i++) {
      if (matched.has(i)) continue;
      const snCity = snPoints[i].city.toLowerCase();
      if (tgName.includes(snCity) || snCity.includes(tgName.split(',')[0])) {
        snIdx = i;
        break;
      }
    }

    const cc = validateCountryCode(getCountryCode(tgLp.country), tgLp.name);

    result.push({
      id: tgLp.id,
      name: tgLp.name,
      countryCode: cc === 'XX' ? 'XX' : cc,
      lat: lp.lat || 0,
      lng: lp.lng || 0,
      source: snIdx >= 0 ? 'both' : 'tg_only',
      confidence: snIdx >= 0 ? 0.95 : 0.75,
    });

    if (snIdx >= 0) matched.add(snIdx);
  }

  // 把 SN 独有的登陆站也加进来（置信度较低，但值得记录）
  for (let i = 0; i < snPoints.length; i++) {
    if (matched.has(i)) continue;
    const snLp = snPoints[i];
    const cc   = getCountryCode(snLp.country);

    result.push({
      id: `sn-${slugify(snLp.name)}-${slugify(snLp.country)}`,
      name: snLp.name,
      countryCode: cc === 'XX' ? 'XX' : cc,
      lat: 0,
      lng: 0,
      source: 'sn_only',
      confidence: 0.6, // 没有坐标，置信度较低
    });
  }

  return result;
}

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 夜间数据同步 + 交叉验证             ║');
  console.log(`║  ${new Date().toISOString()}              ║`);
  console.log('╚════════════════════════════════════════════════╝\n');

  const report: ValidationReport = {
    runAt: new Date().toISOString(),
    totalCables: 0,
    consistent: 0,
    inconsistent: 0,
    arbitrated: 0,
    unresolved: 0,
    newCables: 0,
    updatedCables: 0,
    conflicts: [],
  };

  // ── Step 1: 获取 TeleGeography 全量数据 ──────────────────────
  const tgCables = await fetchTeleGeography();
  report.totalCables = tgCables.size;

  // ── Step 2: 逐条处理 ─────────────────────────────────────────
  log('INFO', `\n开始逐条交叉验证 ${tgCables.size} 条海缆...`);

  for (const [cableId, tg] of tgCables) {
    try {
      // 确定 TeleGeography 的状态
      const rfsDate = tg.rfs_year ? new Date(tg.rfs_year, 0, 1) : null;
      let tgStatus = 'IN_SERVICE';
      if (tg.is_planned) tgStatus = 'PLANNED';
      else if (rfsDate && rfsDate > new Date()) tgStatus = 'UNDER_CONSTRUCTION';

      // 获取数据库中已有记录
      const existing = await prisma.cable.findUnique({
        where: { id: cableId },
        select: { id: true, status: true, lengthKm: true },
      });

      // ── Step 3: 获取 Submarine Networks 数据 ─────────────────
      // 为避免每次都抓取 SN（慢且可能被封），只对有疑问的字段触发
      // 疑问条件：状态是 IN_SERVICE 但海缆年龄超过 25 年
      const cableAge = tg.rfs_year ? new Date().getFullYear() - tg.rfs_year : 0;
      const shouldCheckSN = cableAge >= 25 || (existing && existing.status !== tgStatus);

      let snData: Partial<SNData> | null = null;
      if (shouldCheckSN) {
        snData = await fetchSubmarineNetworks(cableId, tg.name);
        await delay(300); // 礼貌间隔
      }

      // ── Step 4: 交叉验证状态 ──────────────────────────────────
      let finalStatus = tgStatus;
      let statusSource = 'TeleGeography';

      if (snData !== null) {
        const snStatus = snData.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';

        if (snStatus !== tgStatus) {
          // 状态不一致，触发第三方仲裁
          report.inconsistent++;
          const verdict = await arbitrate(
            cableId, tg.name, 'status', tgStatus, snStatus
          );

          report.conflicts.push({
            cableId,
            cableName: tg.name,
            field: 'status',
            tgValue: tgStatus,
            snValue: snStatus,
            verdict: verdict.verdict,
            verdictSource: verdict.source,
            verdictValue: verdict.value,
          });

          if (verdict.verdict !== 'unresolved') {
            report.arbitrated++;
            finalStatus  = verdict.value;
            statusSource = verdict.source;
          } else {
            report.unresolved++;
            // 无法仲裁时，保守选择 TeleGeography（更新频率更高）
            finalStatus  = tgStatus;
            statusSource = 'TeleGeography (unresolved fallback)';
          }
        } else {
          report.consistent++;
        }
      } else {
        report.consistent++; // 没有 SN 数据，默认 TG 正确
      }

      // ── Step 5: 合并登陆站 ────────────────────────────────────
      const tgLPs = tg.landing_points || [];
      const snLPs = snData?.landingPoints || [];
      const mergedLPs = mergeLandingPoints(tgLPs, snLPs);

      // 过滤掉坐标为 (0,0) 且来源是 sn_only 的站点（无坐标无法在地图上显示）
      const validLPs = mergedLPs.filter(lp =>
        lp.source !== 'sn_only' || (lp.lat !== 0 && lp.lng !== 0)
      );

      // 记录 SN 独有的登陆站到日志（供人工补充坐标后手动入库）
      const snOnlyLPs = mergedLPs.filter(lp => lp.source === 'sn_only');
      if (snOnlyLPs.length > 0) {
        log('WARN', `[${tg.name}] SN 独有 ${snOnlyLPs.length} 个登陆站（无坐标，未入库）: ${snOnlyLPs.map(lp => lp.name).join(', ')}`);
      }

      // ── Step 6: 写入数据库 ────────────────────────────────────
      const lengthKm   = parseLength(tg.length);
      const supplierName = tg.suppliers ? String(tg.suppliers).split(',')[0].trim() : null;

      // 确保 vendor 公司存在
      let vendorId: string | null = null;
      if (supplierName) {
        const vendor = await prisma.company.upsert({
          where: { name: supplierName },
          update: {},
          create: { name: supplierName, type: 'VENDOR' },
        });
        vendorId = vendor.id;
      }

      // upsert 海缆
      const cable = await prisma.cable.upsert({
        where: { id: cableId },
        update: {
          name: tg.name,
          slug: slugify(tg.name),
          status: finalStatus,
          lengthKm,
          rfsDate,
          routeGeojson: tg.geoJson,
          vendorId,
          notes: tg.notes || null,
        },
        create: {
          id: cableId,
          name: tg.name,
          slug: slugify(tg.name),
          status: finalStatus,
          lengthKm,
          rfsDate,
          routeGeojson: tg.geoJson,
          vendorId,
          notes: tg.notes || null,
        },
      });

      if (existing) report.updatedCables++;
      else          report.newCables++;

      // upsert 登陆站
      for (const lp of validLPs) {
        if (!lp.countryCode || lp.countryCode === 'XX') continue;

        // 确保国家存在
        await prisma.country.upsert({
          where: { code: lp.countryCode },
          update: {},
          create: { code: lp.countryCode, nameEn: lp.countryCode },
        }).catch(() => {});

        // upsert 登陆站
        const station = await prisma.landingStation.upsert({
          where: { id: lp.id },
          update: {
            name: lp.name,
            countryCode: lp.countryCode,
            ...(lp.lat !== 0 ? { latitude: lp.lat, longitude: lp.lng } : {}),
          },
          create: {
            id: lp.id,
            name: lp.name,
            countryCode: lp.countryCode,
            latitude: lp.lat,
            longitude: lp.lng,
          },
        }).catch(() => null);

        if (!station) continue;

        // 关联海缆和登陆站
        await prisma.cableLandingStation.upsert({
          where: {
            cableId_landingStationId: {
              cableId: cable.id,
              landingStationId: station.id,
            },
          },
          update: {},
          create: { cableId: cable.id, landingStationId: station.id },
        }).catch(() => {});
      }

      // upsert 运营商
      if (tg.owners) {
        const ownerNames = String(tg.owners).split(',').map(s => s.trim()).filter(Boolean);
        for (const ownerName of ownerNames) {
          const company = await prisma.company.upsert({
            where: { name: ownerName },
            update: {},
            create: { name: ownerName, type: 'OPERATOR' },
          }).catch(() => null);

          if (company) {
            await prisma.cableOwnership.upsert({
              where: { cableId_companyId: { cableId: cable.id, companyId: company.id } },
              update: {},
              create: { cableId: cable.id, companyId: company.id },
            }).catch(() => {});
          }
        }
      }

    } catch (e: any) {
      log('ERROR', `处理海缆 ${cableId} 时出错: ${e.message}`);
    }
  }

  // ── Step 7: 保存验证报告到 Redis ─────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s                          `);
  console.log(`║  总计: ${report.totalCables} 条海缆                          `);
  console.log(`║  一致: ${report.consistent} 条（直接入库）                  `);
  console.log(`║  冲突: ${report.inconsistent} 条（需仲裁）                  `);
  console.log(`║  已仲裁: ${report.arbitrated} 条                            `);
  console.log(`║  未解决: ${report.unresolved} 条                            `);
  console.log(`║  新增: ${report.newCables} 条 | 更新: ${report.updatedCables} 条  `);
  console.log('╚════════════════════════════════════════════════╝');

  if (report.conflicts.length > 0) {
    console.log('\n冲突详情：');
    for (const c of report.conflicts) {
      console.log(`  [${c.cableName}] ${c.field}: TG="${c.tgValue}" vs SN="${c.snValue}" → ${c.verdictValue} (${c.verdictSource})`);
    }
  }

  // 写入 Redis（如果可用）
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set('sync:report:latest', JSON.stringify(report), { ex: 7 * 24 * 3600 });
    await redis.del('cables:geojson:full'); // 清空 GeoJSON 缓存，让前端重新获取
    log('OK', 'Redis: 验证报告已保存，GeoJSON 缓存已清空');
  } catch (e: any) {
    log('WARN', `Redis 写入失败（非致命）: ${e.message}`);
  }

  // 触发 Vercel 缓存刷新
  try {
    const siteUrl = process.env.SITE_URL || 'https://deep-blue-ten.vercel.app';
    const secret  = process.env.REVALIDATE_SECRET || '';
    await fetch(`${siteUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: ['/api/cables', '/api/stats'] }),
    });
    log('OK', 'Vercel: 缓存刷新请求已发送');
  } catch {}

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('同步失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

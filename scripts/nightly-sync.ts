// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步与交叉验证脚本 v5
//
// v5 改进（来自产品经理技术规范）：
//   1. 多维特征实体对齐：Jaro-Winkler(40%) + Jaccard登陆站(40%) + RFS年份(20%)
//      替代原有粗暴的 token 差集，彻底解决 SEA-ME-WE 3 vs 4 等误判问题
//   2. 地理编码 DLQ：解析失败不再用 XX 兜底，写入 unresolved_locations 表
//   3. 地理编码字典：成功解析的坐标沉淀到 location_dictionary 表，下次直接命中缓存
//   4. 自动清理上次遗留的重复 sn- 记录（使用新的对齐算法）

import { PrismaClient } from '@prisma/client';
import jaroWinkler from 'jaro-winkler';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();

const TG_ALL     = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const TG_GEO     = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const TG_LP      = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
const SN_BASE    = 'https://www.submarinenetworks.com';
const SN_SYSTEMS = `${SN_BASE}/en/systems`;
const NOMINATIM  = 'https://nominatim.openstreetmap.org/search';
const WIKI_API   = 'https://en.wikipedia.org/api/rest_v1/page/summary';

// ── 工具函数 ─────────────────────────────────────────────────────
function slugify(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}
function parseLength(len: string | null | undefined): number | null {
  if (!len) return null;
  const n = String(len).replace(/[^0-9.]/g, '');
  return n ? parseFloat(n) : null;
}
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function log(level: 'INFO' | 'WARN' | 'OK' | 'ERROR', msg: string) {
  const icons = { INFO: '•', WARN: '⚠', OK: '✓', ERROR: '✗' };
  console.log(`${icons[level]} [${level}] ${msg}`);
}

// ── 类型定义 ─────────────────────────────────────────────────────
interface TGLandingPoint {
  id: string; name: string; country: string;
  is_tbd: boolean | null; lat?: number; lng?: number;
}
interface TGCable {
  id: string; name: string; length: string | null;
  rfs_year: number | null; is_planned: boolean;
  owners: string | null; suppliers: string | null;
  notes: string | null; landing_points: TGLandingPoint[];
  geoJson?: any;
}
interface SNCableRef {
  name: string; url: string; slug: string; category: string;
}
interface SNDetail {
  isRetired: boolean; lengthKm: number | null; rfsYear: number | null;
  landingPoints: { name: string; city: string; country: string }[];
  owners: string[]; sourceUrl: string;
}
interface MergedLP {
  id: string; name: string; countryCode: string;
  lat: number; lng: number;
  source: 'tg_only' | 'sn_only' | 'both'; confidence: number;
}

// ════════════════════════════════════════════════════════════════
// 第一部分：多维特征实体对齐算法
// ════════════════════════════════════════════════════════════════

/**
 * 预处理海缆名称：转小写，去除停用词和特殊符号
 * 例：'SEA-ME-WE 3 Cable System' → 'seamewe3'
 */
function normalizeCableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(cable|system|network|submarine|fibre|fiber|optic)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * 计算两个集合的 Jaccard 相似度
 * J(A,B) = |A∩B| / |A∪B|
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

interface AlignmentResult {
  isMatch: boolean;       // 总分 >= 85：自动合并（同一条缆）
  needsReview: boolean;   // 总分 60-85：疑似同源，人工确认
  score: number;
  details: { nameScore: number; landingScore: number; rfsScore: number };
}

/**
 * 核心：多维特征相似度判定
 * 名称 Jaro-Winkler (40%) + 登陆站 Jaccard (40%) + RFS年份 (20%)
 */
function alignCableEntity(
  nameA: string, landingsA: string[], rfsA: number | null,
  nameB: string, landingsB: string[], rfsB: number | null,
): AlignmentResult {
  // 1. 名称相似度（权重 40%）
  const normA = normalizeCableName(nameA);
  const normB = normalizeCableName(nameB);
  const nameScore = jaroWinkler(normA, normB) * 100;

  // 2. 登陆站 Jaccard（权重 40%）
  const setA = new Set(landingsA.map(s => s.toLowerCase().split(',')[0].trim()));
  const setB = new Set(landingsB.map(s => s.toLowerCase().split(',')[0].trim()));
  const landingScore = jaccardSimilarity(setA, setB) * 100;

  // 3. RFS 年份（权重 20%）
  let rfsScore = 50; // 默认：缺失数据给容忍分，避免因缺数据误判为新缆
  if (rfsA && rfsB) {
    const diff = Math.abs(rfsA - rfsB);
    if (diff <= 1) rfsScore = 100;
    else if (diff === 2) rfsScore = 50;
    else rfsScore = 0;
  }

  // 4. 加权总分
  const totalScore = (nameScore * 0.4) + (landingScore * 0.4) + (rfsScore * 0.2);

  return {
    isMatch: totalScore >= 85,
    needsReview: totalScore >= 60 && totalScore < 85,
    score: Number(totalScore.toFixed(2)),
    details: { nameScore, landingScore, rfsScore },
  };
}

// ════════════════════════════════════════════════════════════════
// 第二部分：地理编码字典 + 死信队列（DLQ）
// ════════════════════════════════════════════════════════════════

/**
 * 地理编码主函数
 * 流程：本地字典缓存 → Nominatim API → 成功写字典 / 失败写DLQ
 */
async function geocodeWithDLQ(
  stationName: string,
  city: string,
  country: string,
  cableId: string,
  source: string,
): Promise<{ lat: number; lng: number } | null> {
  const rawString = stationName.trim();

  // Step 1：查本地字典缓存（命中则直接返回，不消耗 API 额度）
  try {
    const cached = await prisma.locationDictionary.findUnique({
      where: { rawString },
    });
    if (cached) {
      return { lat: cached.latitude, lng: cached.longitude };
    }
  } catch {}

  // Step 2：调用 Nominatim API
  try {
    await delay(1100); // 遵守 Nominatim 频率限制：每秒最多 1 次
    const query = `${city}, ${country}`;
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DeepBlue/5.0 (contact@deep-cloud.org)' } }
    );

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const data = await res.json() as any[];

    if (data.length === 0) {
      throw new Error('Nominatim returned 0 results');
    }

    const confidence = parseFloat(data[0].importance || '0');

    // Step 3A：解析成功 & 置信度合理 → 写入字典，返回坐标
    if (confidence >= 0 || data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };

      const cc = validateCountryCode(getCountryCode(country), stationName);

      await prisma.locationDictionary.upsert({
        where: { rawString },
        update: { latitude: coords.lat, longitude: coords.lng },
        create: {
          rawString,
          standardizedCity: city,
          countryCode: cc,
          latitude: coords.lat,
          longitude: coords.lng,
          source: 'Nominatim',
        },
      }).catch(() => {});

      return coords;
    }

    throw new Error(`Low confidence: ${confidence}`);
  } catch (err: any) {
    // Step 3B：解析失败 → 严禁 XX 兜底，写入 DLQ
    log('WARN', `  [DLQ] 无法解析坐标: "${rawString}" — ${err.message}`);

    await prisma.unresolvedLocation.upsert({
      where: { rawString },
      update: {
        retryCount: { increment: 1 },
        updatedAt: new Date(),
        errorReason: err.message,
      },
      create: {
        rawString,
        originSource: source,
        cableId,
        errorReason: err.message,
        status: 'PENDING',
      },
    }).catch(() => {});

    return null; // 不阻断整体同步流程
  }
}

// ════════════════════════════════════════════════════════════════
// Step 0：清理上次遗留的误判 sn- 重复记录
// ════════════════════════════════════════════════════════════════
async function cleanupDuplicateSNRecords(tgCables: Map<string, TGCable>) {
  log('INFO', '清理上次遗留的误判 sn- 重复记录...');

  const snCables = await prisma.cable.findMany({
    where: { id: { startsWith: 'sn-' } },
    select: {
      id: true, name: true,
      _count: { select: { landingStations: true } },
    },
  });

  // 用新的对齐算法（名称 + RFS）和 TG 数据比对
  const tgList = [...tgCables.values()].map(c => ({
    name: c.name,
    rfsYear: c.rfs_year,
    landings: (c.landing_points || []).map(lp => lp.name),
  }));

  let deleted = 0, kept = 0;

  for (const sn of snCables) {
    let isDuplicate = false;

    for (const tg of tgList) {
      const result = alignCableEntity(
        sn.name, [], null,
        tg.name, tg.landings, tg.rfsYear,
      );
      // 只用名称维度判断（登陆站 SN 记录可能为空，不参与这里的比对）
      if (result.details.nameScore >= 85) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      await prisma.cableLandingStation.deleteMany({ where: { cableId: sn.id } });
      await prisma.cableOwnership.deleteMany({ where: { cableId: sn.id } });
      await prisma.cable.delete({ where: { id: sn.id } }).catch(() => {});
      deleted++;
      log('INFO', `  删除重复: ${sn.name}`);
    } else {
      kept++;
    }
  }

  log('OK', `清理完成：删除 ${deleted} 条重复，保留 ${kept} 条真正独有`);
}

// ════════════════════════════════════════════════════════════════
// Step 1：解析 SN 全量列表
// ════════════════════════════════════════════════════════════════
async function fetchSNCableList(): Promise<Map<string, SNCableRef>> {
  log('INFO', 'SN: 解析全量海缆列表...');
  const res = await fetch(SN_SYSTEMS, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/5.0)' },
  });
  const html = await res.text();

  const linkRegex = /href="(\/en\/systems\/([a-z0-9\-]+)\/([a-z0-9\-]+))"\s*>([^<]+)</gi;
  const CATEGORY_PAGES = new Set([
    'trans-atlantic', 'trans-pacific', 'trans-arctic', 'intra-asia', 'intra-europe',
    'asia-europe-africa', 'australia-usa', 'brazil-us', 'brazil-africa', 'euro-africa',
    'asia-australia', 'eurasia-terrestrial', 'north-america', 'africa-australia',
    'antarctic', 'brazil-europe', 'png-national', 'africa', 'south-pacific',
  ]);

  const result = new Map<string, SNCableRef>();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [, path, category, cableSlug, rawName] = match;
    const name = rawName.trim();
    if (CATEGORY_PAGES.has(cableSlug)) continue;
    if (name.length < 2 || name.length > 100) continue;
    result.set(cableSlug, { name, url: `${SN_BASE}${path}`, slug: cableSlug, category });
  }

  log('OK', `SN: ${result.size} 条`);
  return result;
}

// ════════════════════════════════════════════════════════════════
// Step 2：获取 TG 全量数据
// ════════════════════════════════════════════════════════════════
async function fetchTG(): Promise<Map<string, TGCable>> {
  log('INFO', 'TG: 下载数据...');
  const [allRes, geoRes, lpRes] = await Promise.all([
    fetch(TG_ALL), fetch(TG_GEO), fetch(TG_LP),
  ]);
  const allCables = await allRes.json() as any[];
  const geoData   = await geoRes.json();
  const lpData    = await lpRes.json();

  const geoMap = new Map<string, any>();
  for (const f of geoData.features || []) geoMap.set(f.properties?.id, f.geometry);

  const lpCoords = new Map<string, { lat: number; lng: number }>();
  for (const f of lpData.features || []) {
    const id = f.properties?.id;
    const c  = f.geometry?.coordinates;
    if (id && c) lpCoords.set(id, { lat: c[1], lng: c[0] });
  }

  const result = new Map<string, TGCable>();
  let fetched = 0;
  for (const cable of allCables) {
    try {
      const res  = await fetch(`https://www.submarinecablemap.com/api/v3/cable/${cable.id}.json`);
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trimStart().startsWith('<')) continue;
      const detail = JSON.parse(text) as TGCable;
      detail.geoJson = geoMap.get(cable.id) || null;
      for (const lp of detail.landing_points || []) {
        const c = lpCoords.get(lp.id);
        if (c) { lp.lat = c.lat; lp.lng = c.lng; }
      }
      result.set(cable.id, detail);
      fetched++;
      if (fetched % 50 === 0) log('INFO', `  TG: ${fetched}/${allCables.length}`);
      await delay(50);
    } catch {}
  }
  log('OK', `TG: ${result.size} 条`);
  return result;
}

// ════════════════════════════════════════════════════════════════
// SN 详情页解析
// ════════════════════════════════════════════════════════════════
function parseSNDetail(html: string, sourceUrl: string): SNDetail {
  const result: SNDetail = {
    sourceUrl, isRetired: html.includes('>Retired<') || html.includes('/tag/retired'),
    landingPoints: [], owners: [], lengthKm: null, rfsYear: null,
  };
  const lenMatch = html.match(/(\d[\d,]{2,})\s*km/i);
  if (lenMatch) result.lengthKm = parseInt(lenMatch[1].replace(/,/g, ''));
  const rfsMatch = html.match(/(\d{4})\s+(?:November|December|January|February|March|April|May|June|July|August|September|October)/i);
  if (rfsMatch) result.rfsYear = parseInt(rfsMatch[1]);
  const section = html.match(/lands at the following[^<]*(?:<\/[^>]+>)*\s*<ul[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const items   = section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || [];
  for (const li of items) {
    const text  = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 300) continue;
    const parts = text.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      result.landingPoints.push({
        name: text, city: parts[0],
        country: parts[parts.length - 1].replace(/\(.*\)/g, '').trim(),
      });
    }
  }
  return result;
}

async function fetchSNDetail(ref: SNCableRef): Promise<SNDetail | null> {
  try {
    const res = await fetch(ref.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/5.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(ref.name.slice(0, 4))) return null;
    return parseSNDetail(html, ref.url);
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════
// Wikipedia 验证
// ════════════════════════════════════════════════════════════════
async function checkWikipedia(name: string): Promise<{
  exists: boolean; isRetired?: boolean; summary?: string;
}> {
  try {
    const res = await fetch(
      `${WIKI_API}/${encodeURIComponent(name.replace(/\s+/g, '_'))}`,
      { headers: { 'User-Agent': 'DeepBlue/5.0' } }
    );
    if (!res.ok) return { exists: false };
    const d = await res.json() as any;
    if (!d.extract) return { exists: false };
    const t = d.extract.toLowerCase();
    const ret = ['retired', 'decommission', 'end-of-life', 'out of service'].filter(k => t.includes(k)).length;
    const act = ['operational', 'in service', 'active cable', 'still in'].filter(k => t.includes(k)).length;
    return {
      exists: true,
      isRetired: ret > act ? true : act > ret ? false : undefined,
      summary: d.extract.slice(0, 200),
    };
  } catch { return { exists: false }; }
}

// ════════════════════════════════════════════════════════════════
// 字段仲裁
// ════════════════════════════════════════════════════════════════
async function arbitrateStatus(
  cableName: string, tgStatus: string, snIsRetired: boolean,
): Promise<{ value: string; source: string }> {
  const snStatus = snIsRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
  if (tgStatus === snStatus) return { value: tgStatus, source: 'consistent' };
  log('WARN', `[${cableName}] 状态冲突: TG=${tgStatus} SN=${snStatus}，查 Wikipedia...`);
  const wiki = await checkWikipedia(cableName);
  await delay(500);
  let retV = 0, actV = 0;
  const sources: string[] = [];
  if (tgStatus === 'DECOMMISSIONED') { retV += 3; sources.push('TG:退役'); }
  else { actV += 3; sources.push('TG:在役'); }
  if (snIsRetired) { retV += 2; sources.push('SN:退役'); }
  else { actV += 2; sources.push('SN:在役'); }
  if (wiki.isRetired === true)  { retV += 1; sources.push('Wiki:退役'); }
  if (wiki.isRetired === false) { actV  += 1; sources.push('Wiki:在役'); }
  const value = retV > actV ? 'DECOMMISSIONED' : 'IN_SERVICE';
  log('OK', `  仲裁: ${value} (${sources.join(' | ')})`);
  return { value, source: sources.join(' | ') };
}

function arbitrateLength(name: string, tg: number | null, sn: number | null): number | null {
  if (!tg && !sn) return null;
  if (!tg) return sn;
  if (!sn) return tg;
  const diff = Math.abs(tg - sn) / Math.max(tg, sn);
  if (diff < 0.05) return tg;
  if (diff < 0.20) { log('WARN', `[${name}] 长度差 ${(diff * 100).toFixed(0)}%，取平均`); return Math.round((tg + sn) / 2); }
  log('WARN', `[${name}] 长度差过大(${tg} vs ${sn})，取较大值`);
  return Math.max(tg, sn);
}

// ════════════════════════════════════════════════════════════════
// 登陆站合并（TG + SN 取并集，使用 DLQ 地理编码）
// ════════════════════════════════════════════════════════════════
async function mergeLPs(
  tgLPs: TGLandingPoint[],
  snLPs: SNDetail['landingPoints'],
  cableName: string,
  cableId: string,
): Promise<MergedLP[]> {
  const result: MergedLP[] = [];
  const snMatched = new Set<number>();

  for (const tg of tgLPs) {
    const tgCity = tg.name.split(',')[0].toLowerCase().trim();
    let matched = -1;
    for (let i = 0; i < snLPs.length; i++) {
      if (snMatched.has(i)) continue;
      const snCity = snLPs[i].city.toLowerCase().trim();
      if (tgCity.includes(snCity) || snCity.includes(tgCity)) { matched = i; break; }
    }
    const cc = validateCountryCode(getCountryCode(tg.country), tg.name);
    result.push({
      id: tg.id, name: tg.name, countryCode: cc,
      lat: tg.lat || 0, lng: tg.lng || 0,
      source: matched >= 0 ? 'both' : 'tg_only',
      confidence: matched >= 0 ? 0.95 : 0.80,
    });
    if (matched >= 0) snMatched.add(matched);
  }

  // SN 独有站点：走 DLQ 地理编码流程
  for (let i = 0; i < snLPs.length; i++) {
    if (snMatched.has(i)) continue;
    const lp = snLPs[i];
    log('INFO', `  [${cableName}] SN独有站: "${lp.name}"，查坐标...`);

    const coords = await geocodeWithDLQ(lp.name, lp.city, lp.country, cableId, 'SN');
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);

    if (coords) {
      log('OK', `    坐标: ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`);
      result.push({
        id: `sn-${slugify(lp.name)}-${cc.toLowerCase()}`,
        name: lp.name, countryCode: cc,
        lat: coords.lat, lng: coords.lng,
        source: 'sn_only', confidence: 0.70,
      });
    }
    // 失败时不入库（已写入 DLQ），不再用 XX 兜底
  }

  return result;
}

// ════════════════════════════════════════════════════════════════
// 写入数据库
// ════════════════════════════════════════════════════════════════
async function upsertCable(params: {
  id: string; name: string; status: string;
  lengthKm: number | null; rfsDate: Date | null;
  geoJson: any; supplierName: string | null;
  owners: string[]; notes: string | null;
  landingPoints: MergedLP[];
}) {
  const { id, name, status, lengthKm, rfsDate, geoJson,
          supplierName, owners, notes, landingPoints } = params;

  let vendorId: string | null = null;
  if (supplierName) {
    const v = await prisma.company.upsert({
      where: { name: supplierName }, update: {},
      create: { name: supplierName, type: 'VENDOR' },
    }).catch(() => null);
    vendorId = v?.id || null;
  }

  const cable = await prisma.cable.upsert({
    where: { id },
    update: { name, slug: slugify(name), status, lengthKm, rfsDate, routeGeojson: geoJson, vendorId, notes },
    create: { id, name, slug: slugify(name), status, lengthKm, rfsDate, routeGeojson: geoJson, vendorId, notes },
  });

  for (const lp of landingPoints) {
    if (!lp.countryCode || lp.countryCode === 'XX') continue;
    if (lp.lat === 0 && lp.lng === 0) continue;
    await prisma.country.upsert({
      where: { code: lp.countryCode }, update: {},
      create: { code: lp.countryCode, nameEn: lp.countryCode },
    }).catch(() => {});
    const station = await prisma.landingStation.upsert({
      where: { id: lp.id },
      update: { name: lp.name, countryCode: lp.countryCode, latitude: lp.lat, longitude: lp.lng },
      create: { id: lp.id, name: lp.name, countryCode: lp.countryCode, latitude: lp.lat, longitude: lp.lng },
    }).catch(() => null);
    if (!station) continue;
    await prisma.cableLandingStation.upsert({
      where: { cableId_landingStationId: { cableId: cable.id, landingStationId: station.id } },
      update: {}, create: { cableId: cable.id, landingStationId: station.id },
    }).catch(() => {});
  }

  for (const ownerName of owners) {
    const company = await prisma.company.upsert({
      where: { name: ownerName }, update: {},
      create: { name: ownerName, type: 'OPERATOR' },
    }).catch(() => null);
    if (company) {
      await prisma.cableOwnership.upsert({
        where: { cableId_companyId: { cableId: cable.id, companyId: company.id } },
        update: {}, create: { cableId: cable.id, companyId: company.id },
      }).catch(() => {});
    }
  }

  return cable;
}

// ════════════════════════════════════════════════════════════════
// 主流程
// ════════════════════════════════════════════════════════════════
async function main() {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 夜间同步 v5                                   ║');
  console.log('║  Jaro-Winkler对齐 + 地理编码字典 + DLQ                  ║');
  console.log(`║  ${new Date().toISOString()}                        ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const stats = {
    tgTotal: 0, snTotal: 0,
    snOnlyCount: 0, snOnlyAdded: 0, snOnlySkipped: 0,
    tgProcessed: 0, conflictsFound: 0,
    snStationsAdded: 0, dlqCount: 0, dictHits: 0,
  };

  // Step 1 & 2：并行获取
  const [snCables, tgCables] = await Promise.all([
    fetchSNCableList(),
    fetchTG(),
  ]);
  stats.snTotal = snCables.size;
  stats.tgTotal = tgCables.size;

  // Step 0：清理误判重复
  await cleanupDuplicateSNRecords(tgCables);

  // 建立 TG 实体列表，用于差集比对
  const tgEntityList = [...tgCables.values()].map(c => ({
    id: c.id,
    name: c.name,
    rfsYear: c.rfs_year,
    landings: (c.landing_points || []).map(lp => lp.name),
  }));

  // Step 3：找出真正 SN 独有的海缆（使用多维对齐算法）
  const snOnlyCables: SNCableRef[] = [];
  const snNeedsReview: Array<{ ref: SNCableRef; score: number; matchedTG: string }> = [];

  for (const [, ref] of snCables) {
    let bestScore = 0;
    let bestMatch = '';
    let needsReview = false;

    for (const tg of tgEntityList) {
      const result = alignCableEntity(
        ref.name, [], null,
        tg.name, tg.landings, tg.rfsYear,
      );
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = tg.name;
        needsReview = result.needsReview;
      }
      if (result.isMatch) break; // 已确认匹配，无需继续
    }

    if (bestScore >= 85) {
      // 自动确认为 TG 已有，跳过
    } else if (bestScore >= 60) {
      // 疑似同源，记录下来但暂不入库（保守策略）
      snNeedsReview.push({ ref, score: bestScore, matchedTG: bestMatch });
      log('WARN', `[疑似重复] ${ref.name} ↔ ${bestMatch} (${bestScore.toFixed(0)}分)`);
    } else {
      // 确认为 SN 独有
      snOnlyCables.push(ref);
    }
  }

  stats.snOnlyCount = snOnlyCables.length;
  log('INFO', `\nSN 真正独有: ${snOnlyCables.length} 条 | 疑似重复待审: ${snNeedsReview.length} 条`);

  // Step 4：处理 SN 独有海缆
  log('INFO', '\n处理 SN 独有海缆...');
  for (const ref of snOnlyCables) {
    log('INFO', `处理: [${ref.name}]`);
    const snDetail = await fetchSNDetail(ref);
    await delay(300);
    if (!snDetail) { log('WARN', `  无法获取详情，跳过`); stats.snOnlySkipped++; continue; }

    const wiki = await checkWikipedia(ref.name);
    await delay(500);
    if (wiki.exists) {
      log('OK', `  Wikipedia 确认: ${wiki.summary?.slice(0, 60)}...`);
    }

    const status  = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
    const rfsDate = snDetail.rfsYear ? new Date(snDetail.rfsYear, 0, 1) : null;
    const cableId = `sn-${ref.slug}`;

    const landingPoints: MergedLP[] = [];
    for (const lp of snDetail.landingPoints) {
      const coords = await geocodeWithDLQ(lp.name, lp.city, lp.country, cableId, 'SN');
      const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
      if (coords) {
        landingPoints.push({
          id: `sn-${slugify(lp.name)}-${cc.toLowerCase()}`,
          name: lp.name, countryCode: cc,
          lat: coords.lat, lng: coords.lng,
          source: 'sn_only', confidence: wiki.exists ? 0.80 : 0.65,
        });
      }
    }

    try {
      await upsertCable({
        id: cableId, name: ref.name, status,
        lengthKm: snDetail.lengthKm, rfsDate,
        geoJson: null, supplierName: null,
        owners: snDetail.owners, notes: null,
        landingPoints,
      });
      log('OK', `  已入库: ${ref.name} (${status}, ${landingPoints.length} 站)`);
      stats.snOnlyAdded++;
      stats.snStationsAdded += landingPoints.length;
    } catch (e: any) {
      log('ERROR', `  入库失败: ${e.message}`);
      stats.snOnlySkipped++;
    }
    await delay(200);
  }

  // Step 5：处理 TG 全量数据（交叉验证所有字段）
  log('INFO', '\n处理 TG 全量数据...');
  for (const [cableId, tg] of tgCables) {
    try {
      const tgLengthKm = parseLength(tg.length);
      const tgRfsYear  = tg.rfs_year || null;
      const rfsDate    = tgRfsYear ? new Date(tgRfsYear, 0, 1) : null;
      let tgStatus = 'IN_SERVICE';
      if (tg.is_planned) tgStatus = 'PLANNED';
      else if (rfsDate && rfsDate > new Date()) tgStatus = 'UNDER_CONSTRUCTION';

      const cableAge = tgRfsYear ? new Date().getFullYear() - tgRfsYear : 0;
      const needSN   = cableAge >= 20 || (tg.landing_points || []).length <= 5;

      let snDetail: SNDetail | null = null;
      if (needSN) {
        // 用对齐算法在 SN 列表里找对应页面
        let bestRef: SNCableRef | null = null;
        let bestScore = 0;
        for (const [, ref] of snCables) {
          const result = alignCableEntity(
            tg.name, (tg.landing_points || []).map(lp => lp.name), tgRfsYear,
            ref.name, [], null,
          );
          if (result.score > bestScore) {
            bestScore = result.score;
            bestRef = ref;
          }
        }
        if (bestRef && bestScore >= 60) {
          snDetail = await fetchSNDetail(bestRef);
          await delay(300);
        }
      }

      // 状态仲裁
      let finalStatus = tgStatus;
      if (snDetail?.isRetired !== undefined) {
        const verdict = await arbitrateStatus(tg.name, tgStatus, snDetail.isRetired);
        if (verdict.value !== finalStatus) { stats.conflictsFound++; finalStatus = verdict.value; }
      }

      const finalLength  = arbitrateLength(tg.name, tgLengthKm, snDetail?.lengthKm || null);
      const finalRfsYear = tgRfsYear ?? snDetail?.rfsYear ?? null;
      const finalRfsDate = finalRfsYear ? new Date(finalRfsYear, 0, 1) : null;

      // 登陆站合并
      const mergedLPs = await mergeLPs(
        tg.landing_points || [],
        snDetail?.landingPoints || [],
        tg.name, cableId,
      );
      const snOnly = mergedLPs.filter(lp => lp.source === 'sn_only').length;
      if (snOnly > 0) {
        stats.snStationsAdded += snOnly;
        log('OK', `[${tg.name}] 补充 ${snOnly} 个SN独有登陆站`);
      }

      const owners       = tg.owners ? String(tg.owners).split(',').map(s => s.trim()).filter(Boolean) : [];
      const supplierName = tg.suppliers ? String(tg.suppliers).split(',')[0].trim() : null;

      await upsertCable({
        id: cableId, name: tg.name, status: finalStatus,
        lengthKm: finalLength, rfsDate: finalRfsDate,
        geoJson: tg.geoJson, supplierName, owners,
        notes: tg.notes || null, landingPoints: mergedLPs,
      });

      stats.tgProcessed++;
    } catch (e: any) {
      log('ERROR', `处理 ${cableId} 失败: ${e.message}`);
    }
  }

  // 统计 DLQ 数量
  try {
    stats.dlqCount = await prisma.unresolvedLocation.count({ where: { status: 'PENDING' } });
  } catch {}

  // 报告
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s`);
  console.log(`║  TG: ${stats.tgTotal} 条 | SN: ${stats.snTotal} 条`);
  console.log(`║  SN独有入库: ${stats.snOnlyAdded} | 跳过: ${stats.snOnlySkipped} | 疑似重复待审: ${snNeedsReview.length}`);
  console.log(`║  字段冲突仲裁: ${stats.conflictsFound} 次`);
  console.log(`║  SN补充登陆站: ${stats.snStationsAdded} 个`);
  console.log(`║  DLQ待处理坐标: ${stats.dlqCount} 个`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (snNeedsReview.length > 0) {
    console.log('\n疑似重复待人工确认：');
    for (const r of snNeedsReview) {
      console.log(`  [${r.score.toFixed(0)}分] ${r.ref.name} ↔ ${r.matchedTG}`);
    }
  }

  // Redis
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set('sync:report:latest', JSON.stringify({ ...stats, runAt: new Date().toISOString() }), { ex: 7 * 24 * 3600 });
    await redis.del('cables:geojson:full');
    log('OK', 'Redis: 报告已保存，缓存已清空');
  } catch (e: any) {
    log('WARN', `Redis 写入失败（非致命）: ${e.message}`);
  }

  // Vercel 缓存刷新
  try {
    const siteUrl = process.env.SITE_URL || 'https://deep-blue-ten.vercel.app';
    await fetch(`${siteUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': process.env.REVALIDATE_SECRET || '' },
      body: JSON.stringify({ paths: ['/api/cables', '/api/stats'] }),
    });
    log('OK', 'Vercel: 缓存刷新完成');
  } catch {}

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('同步失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

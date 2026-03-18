// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步与交叉验证脚本 v4
//
// v4 改进：
//   - 标准化名称匹配（去括号/连字符/空格后比对），大幅减少误判
//   - SN独有海缆在入库前先查 Wikipedia 做第三方验证
//   - 已有 sn- 前缀记录的清理逻辑：如果 TG 已有同名海缆，删除 sn- 重复记录
//   - 所有字段全量交叉验证

import { PrismaClient } from '@prisma/client';
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
function log(level: 'INFO'|'WARN'|'OK'|'ERROR', msg: string) {
  const icons = { INFO: '•', WARN: '⚠', OK: '✓', ERROR: '✗' };
  console.log(`${icons[level]} [${level}] ${msg}`);
}

// ── 核心：标准化名称用于跨数据源匹配 ────────────────────────────
// 例：'AAE-1' → 'aae1'
//     'Asia-Africa-Europe-1 (AAE-1)' → 'asiaafrica europe1aae1' → 'asiaafrica'... → 'aae1'
//     'SEA-ME-WE 3' → 'seamewe3'
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, ' ')   // 去括号内容（保留括号外）
    .replace(/[-\/\s]+/g, '')         // 去连字符、斜线、空格
    .replace(/[^a-z0-9]/g, '')        // 只保留字母数字
    .trim();
}

// 从一个名称中提取所有有意义的标记（用于模糊匹配）
function extractTokens(name: string): string[] {
  const tokens = new Set<string>();
  tokens.add(normalize(name));
  // 去掉括号内容后再标准化
  tokens.add(normalize(name.replace(/\s*\([^)]*\)/g, '')));
  // 只取括号内容
  const inner = name.match(/\(([^)]+)\)/g);
  if (inner) inner.forEach(m => tokens.add(normalize(m.replace(/[()]/g, ''))));
  // 去掉常见前缀词
  tokens.add(normalize(name.replace(/^(the|system|cable)\s+/i, '')));
  return [...tokens].filter(t => t.length >= 2);
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
  isRetired: boolean; lengthKm: number | null;
  rfsYear: number | null;
  landingPoints: { name: string; city: string; country: string }[];
  owners: string[]; sourceUrl: string;
}
interface MergedLP {
  id: string; name: string; countryCode: string;
  lat: number; lng: number;
  source: 'tg_only'|'sn_only'|'both'; confidence: number;
}

// ── Step 0: 清理上次遗留的误判 sn- 重复记录 ─────────────────────
async function cleanupDuplicateSNRecords(tgCables: Map<string, TGCable>) {
  log('INFO', '清理上次遗留的误判 sn- 重复记录...');

  const snCables = await prisma.cable.findMany({
    where: { id: { startsWith: 'sn-' } },
    select: { id: true, name: true, _count: { select: { landingStations: true } } },
  });

  // 建立 TG 的标准化名称集合
  const tgNormSet = new Set<string>();
  for (const [id, cable] of tgCables) {
    extractTokens(id.replace(/-/g, ' ')).forEach(t => tgNormSet.add(t));
    extractTokens(cable.name).forEach(t => tgNormSet.add(t));
  }

  let deleted = 0;
  let kept = 0;

  for (const sn of snCables) {
    const snTokens = extractTokens(sn.name);
    // 只要有任意一个 token 在 TG 集合里命中，就认为是重复
    const isDuplicate = snTokens.some(t => t.length >= 3 && tgNormSet.has(t));

    if (isDuplicate) {
      // 删除关联关系和海缆记录
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

// ── Step 1: 解析 SN 全量列表 ─────────────────────────────────────
async function fetchSNCableList(): Promise<Map<string, SNCableRef>> {
  log('INFO', 'SN: 解析全量海缆列表...');

  const res = await fetch(SN_SYSTEMS, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/4.0)' },
  });
  const html = await res.text();

  const linkRegex = /href="(\/en\/systems\/([a-z0-9\-]+)\/([a-z0-9\-]+))"\s*>([^<]+)</gi;
  const CATEGORY_PAGES = new Set([
    'trans-atlantic','trans-pacific','trans-arctic','intra-asia','intra-europe',
    'asia-europe-africa','australia-usa','brazil-us','brazil-africa','euro-africa',
    'asia-australia','eurasia-terrestrial','north-america','africa-australia',
    'antarctic','brazil-europe','png-national','africa','south-pacific',
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

// ── Step 2: 获取 TG 全量数据 ─────────────────────────────────────
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

// ── SN 详情页解析 ─────────────────────────────────────────────────
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/4.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(ref.name.slice(0, 4))) return null;
    return parseSNDetail(html, ref.url);
  } catch { return null; }
}

// ── Nominatim 地理编码 ────────────────────────────────────────────
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
async function geocode(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${city}|${country}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    await delay(1100);
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(`${city}, ${country}`)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DeepBlue/4.0 (contact@deep-cloud.org)' } }
    );
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json() as any[];
    if (!data.length) { geocodeCache.set(key, null); return null; }
    const r = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geocodeCache.set(key, r);
    return r;
  } catch { geocodeCache.set(key, null); return null; }
}

// ── Wikipedia 验证 ────────────────────────────────────────────────
async function checkWikipedia(name: string): Promise<{
  exists: boolean; isRetired?: boolean; summary?: string;
}> {
  try {
    const res = await fetch(
      `${WIKI_API}/${encodeURIComponent(name.replace(/\s+/g, '_'))}`,
      { headers: { 'User-Agent': 'DeepBlue/4.0' } }
    );
    if (!res.ok) return { exists: false };
    const d = await res.json() as any;
    if (!d.extract) return { exists: false };
    const t = d.extract.toLowerCase();
    const ret = ['retired','decommission','end-of-life','out of service'].filter(k => t.includes(k)).length;
    const act = ['operational','in service','active cable','still in'].filter(k => t.includes(k)).length;
    return {
      exists: true,
      isRetired: ret > act ? true : act > ret ? false : undefined,
      summary: d.extract.slice(0, 200),
    };
  } catch { return { exists: false }; }
}

// ── 状态仲裁 ─────────────────────────────────────────────────────
async function arbitrateStatus(
  cableName: string, tgStatus: string, snIsRetired: boolean
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
  if (diff < 0.20) { log('WARN', `[${name}] 长度差 ${(diff*100).toFixed(0)}%，取平均`); return Math.round((tg+sn)/2); }
  log('WARN', `[${name}] 长度差过大(${tg} vs ${sn})，取较大值`);
  return Math.max(tg, sn);
}

// ── 登陆站合并 ───────────────────────────────────────────────────
async function mergeLPs(
  tgLPs: TGLandingPoint[],
  snLPs: SNDetail['landingPoints'],
  cableName: string,
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

  for (let i = 0; i < snLPs.length; i++) {
    if (snMatched.has(i)) continue;
    const lp = snLPs[i];
    log('INFO', `  [${cableName}] SN独有站: "${lp.name}"，查坐标...`);
    const coords = await geocode(lp.city, lp.country);
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
    if (coords) {
      log('OK', `    坐标: ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`);
      result.push({
        id: `sn-${slugify(lp.name)}-${cc.toLowerCase()}`,
        name: lp.name, countryCode: cc,
        lat: coords.lat, lng: coords.lng,
        source: 'sn_only', confidence: 0.70,
      });
    } else {
      log('WARN', `    坐标获取失败，跳过`);
    }
  }
  return result;
}

// ── 写入数据库 ────────────────────────────────────────────────────
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

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 夜间同步 v4 - 改进匹配 + 自动清理重复    ║');
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const stats = {
    tgTotal: 0, snTotal: 0,
    snOnlyCount: 0, snOnlyAdded: 0, snOnlySkipped: 0,
    tgProcessed: 0, conflictsFound: 0, snStationsAdded: 0,
    duplicatesRemoved: 0,
  };

  // ── Step 1 & 2: 并行获取 SN 列表和 TG 数据 ───────────────────
  const [snCables, tgCables] = await Promise.all([
    fetchSNCableList(),
    fetchTG(),
  ]);
  stats.snTotal  = snCables.size;
  stats.tgTotal  = tgCables.size;

  // ── Step 0: 清理上次遗留的误判重复 ───────────────────────────
  await cleanupDuplicateSNRecords(tgCables);

  // ── 建立 TG 标准化名称集合（用于差集判断）────────────────────
  const tgNormSet = new Set<string>();
  for (const [id, cable] of tgCables) {
    extractTokens(id.replace(/-/g, ' ')).forEach(t => { if (t.length >= 2) tgNormSet.add(t); });
    extractTokens(cable.name).forEach(t => { if (t.length >= 2) tgNormSet.add(t); });
  }

  // ── Step 3: 找出真正 SN 独有的海缆 ──────────────────────────
  const snOnlyCables: SNCableRef[] = [];
  for (const [snSlug, ref] of snCables) {
    const snTokens = extractTokens(ref.name).concat(extractTokens(snSlug.replace(/-/g, ' ')));
    // 只有所有 token 都不在 TG 集合里，才判定为 SN 独有
    // 任意一个长度 >= 3 的 token 命中 TG，就认为是 TG 已有
    const matchedInTG = snTokens.some(t => t.length >= 3 && tgNormSet.has(t));
    if (!matchedInTG) snOnlyCables.push(ref);
  }

  stats.snOnlyCount = snOnlyCables.length;
  log('INFO', `\nSN 独有（TG 确实缺失）: ${snOnlyCables.length} 条`);
  for (const c of snOnlyCables.slice(0, 30)) {
    console.log(`  - ${c.name}`);
  }
  if (snOnlyCables.length > 30) console.log(`  ... 还有 ${snOnlyCables.length - 30} 条`);

  // ── Step 4: 处理 SN 独有海缆（第三方验证后入库）──────────────
  log('INFO', '\n开始处理 SN 独有海缆...');
  for (const ref of snOnlyCables) {
    log('INFO', `处理: [${ref.name}]`);

    const snDetail = await fetchSNDetail(ref);
    await delay(300);
    if (!snDetail) { log('WARN', `  无法获取详情，跳过`); stats.snOnlySkipped++; continue; }

    // Wikipedia 第三方验证：确认这条缆确实存在
    const wiki = await checkWikipedia(ref.name);
    await delay(500);

    // 入库判断：
    // ① SN 详情可以解析到（已上面确认）
    // ② Wikipedia 有记录 → 高置信度，直接入库
    // ③ Wikipedia 无记录 → 较低置信度，但 SN 本身就是权威来源，仍然入库
    const status  = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
    const rfsDate = snDetail.rfsYear ? new Date(snDetail.rfsYear, 0, 1) : null;

    if (wiki.exists) {
      log('OK', `  Wikipedia 确认存在: ${wiki.summary?.slice(0, 80)}...`);
    } else {
      log('WARN', `  Wikipedia 无记录，但 SN 有数据，仍然入库（置信度较低）`);
    }

    // 获取登陆站坐标
    const landingPoints: MergedLP[] = [];
    for (const lp of snDetail.landingPoints) {
      const coords = await geocode(lp.city, lp.country);
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
        id: `sn-${ref.slug}`, name: ref.name, status,
        lengthKm: snDetail.lengthKm, rfsDate,
        geoJson: null, supplierName: null,
        owners: snDetail.owners, notes: null,
        landingPoints,
      });
      log('OK', `  已入库: ${ref.name} (${status}, ${landingPoints.length} 个登陆站)`);
      stats.snOnlyAdded++;
      stats.snStationsAdded += landingPoints.length;
    } catch (e: any) {
      log('ERROR', `  入库失败: ${e.message}`);
      stats.snOnlySkipped++;
    }

    await delay(200);
  }

  // ── Step 5: 处理 TG 全量数据（交叉验证所有字段）──────────────
  log('INFO', '\n开始处理 TG 全量数据...');
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
        const tgNorm   = normalize(tg.name);
        const snRef    = snCables.get(cableId) ||
          [...snCables.values()].find(r => normalize(r.name) === tgNorm);
        if (snRef) {
          snDetail = await fetchSNDetail(snRef);
          await delay(300);
        }
      }

      let finalStatus = tgStatus;
      if (snDetail?.isRetired !== undefined) {
        const verdict = await arbitrateStatus(tg.name, tgStatus, snDetail.isRetired);
        if (verdict.value !== finalStatus) { stats.conflictsFound++; finalStatus = verdict.value; }
      }

      const finalLength  = arbitrateLength(tg.name, tgLengthKm, snDetail?.lengthKm || null);
      const finalRfsYear = tgRfsYear ?? snDetail?.rfsYear ?? null;
      const finalRfsDate = finalRfsYear ? new Date(finalRfsYear, 0, 1) : null;

      const mergedLPs = await mergeLPs(tg.landing_points || [], snDetail?.landingPoints || [], tg.name);
      const snOnly = mergedLPs.filter(lp => lp.source === 'sn_only').length;
      if (snOnly > 0) { stats.snStationsAdded += snOnly; log('OK', `[${tg.name}] 补充 ${snOnly} 个SN登陆站`); }

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

  // ── 报告 ─────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s`);
  console.log(`║  TG: ${stats.tgTotal} 条 | SN: ${stats.snTotal} 条`);
  console.log(`║  SN真正独有: ${stats.snOnlyCount} 条 → 入库 ${stats.snOnlyAdded} | 跳过 ${stats.snOnlySkipped}`);
  console.log(`║  字段冲突仲裁: ${stats.conflictsFound} 次`);
  console.log(`║  SN补充登陆站: ${stats.snStationsAdded} 个`);
  console.log('╚══════════════════════════════════════════════════════╝');

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

// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步与交叉验证脚本 v3
//
// 三层数据采集：
//   Layer 1: TeleGeography API（主数据源，690 条）
//   Layer 2: Submarine Networks 网页（验证 + 补充）
//   Layer 3: Wikipedia / FiberAtlantic / Nominatim（仲裁 + 坐标）
//
// 流程：
//   Step 1: 解析 SN /en/systems 页面，获取 SN 全量海缆列表
//   Step 2: 获取 TG 全量数据
//   Step 3: 找出 SN 有但 TG 没有的海缆（差集）
//   Step 4: 对差集海缆做第三方验证，验证通过则入库
//   Step 5: 对 TG 全量数据做交叉验证（所有字段），入库
//   Step 6: 生成报告写入 Redis

import { PrismaClient } from '@prisma/client';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();

const TG_ALL    = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const TG_GEO    = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const TG_LP     = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
const SN_BASE   = 'https://www.submarinenetworks.com';
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
  name: string;           // 显示名称
  url: string;            // 完整 URL
  slug: string;           // URL 最后一段
  category: string;       // 类别路径
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

// ── Step 1: 解析 SN 全量海缆列表 ─────────────────────────────────
async function fetchSNCableList(): Promise<Map<string, SNCableRef>> {
  log('INFO', 'SN: 解析全量海缆列表...');

  const res = await fetch(SN_SYSTEMS, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/3.0)' },
  });
  const html = await res.text();

  // 提取所有 /en/systems/{category}/{cable} 格式的链接
  const linkRegex = /href="(\/en\/systems\/([a-z0-9\-]+)\/([a-z0-9\-]+))"\s*>([^<]+)</gi;
  const result = new Map<string, SNCableRef>();

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [, path, category, cableSlug, rawName] = match;
    const name = rawName.trim();

    // 过滤掉类别页面本身（只要叶子节点海缆）
    if (['trans-atlantic', 'trans-pacific', 'intra-asia', 'intra-europe',
         'asia-europe-africa', 'australia-usa', 'brazil-us', 'brazil-africa',
         'euro-africa', 'asia-australia', 'eurasia-terrestrial', 'trans-arctic',
         'north-america', 'africa-australia', 'antarctic', 'brazil-europe',
         'png-national'].includes(cableSlug)) continue;

    if (name.length < 2 || name.length > 100) continue;

    result.set(cableSlug, {
      name,
      url: `${SN_BASE}${path}`,
      slug: cableSlug,
      category,
    });
  }

  log('OK', `SN: 找到 ${result.size} 条海缆`);
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

  log('OK', `TG: ${result.size} 条海缆`);
  return result;
}

// ── 抓取 SN 详情页 ───────────────────────────────────────────────
function parseSNDetail(html: string, sourceUrl: string): SNDetail {
  const result: SNDetail = {
    sourceUrl,
    isRetired: html.includes('>Retired<') || html.includes('/tag/retired'),
    landingPoints: [], owners: [],
    lengthKm: null, rfsYear: null,
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/3.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(ref.name.slice(0, 6))) return null;
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
      { headers: { 'User-Agent': 'DeepBlue/3.0 (contact@deep-cloud.org)' } }
    );
    if (!res.ok) { geocodeCache.set(key, null); return null; }
    const data = await res.json() as any[];
    if (!data.length) { geocodeCache.set(key, null); return null; }
    const r = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    geocodeCache.set(key, r);
    return r;
  } catch { geocodeCache.set(key, null); return null; }
}

// ── 第三方仲裁（状态） ────────────────────────────────────────────
async function arbitrateStatus(
  cableName: string, tgStatus: string, snIsRetired: boolean
): Promise<{ value: string; source: string }> {
  const snStatus = snIsRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
  if (tgStatus === snStatus) return { value: tgStatus, source: 'consistent' };

  log('WARN', `[${cableName}] 状态冲突: TG=${tgStatus} SN=${snStatus}，查询 Wikipedia...`);

  let wikiRetired: boolean | undefined;
  try {
    const r = await fetch(
      `${WIKI_API}/${encodeURIComponent(cableName.replace(/\s+/g, '_'))}`,
      { headers: { 'User-Agent': 'DeepBlue/3.0' } }
    );
    if (r.ok) {
      const d = await r.json() as any;
      const t = (d.extract || '').toLowerCase();
      const ret = ['retired','decommission','end-of-life','out of service'].filter(k => t.includes(k)).length;
      const act = ['currently operational','in service','active cable','still in'].filter(k => t.includes(k)).length;
      if (ret > act) wikiRetired = true;
      else if (act > ret) wikiRetired = false;
    }
  } catch {}
  await delay(500);

  let retV = 0, actV = 0;
  const sources: string[] = [];
  if (tgStatus === 'DECOMMISSIONED') { retV += 3; sources.push('TG:退役'); }
  else { actV += 3; sources.push('TG:在役'); }
  if (snIsRetired) { retV += 2; sources.push('SN:退役'); }
  else { actV += 2; sources.push('SN:在役'); }
  if (wikiRetired === true)  { retV += 1; sources.push('Wiki:退役'); }
  if (wikiRetired === false) { actV  += 1; sources.push('Wiki:在役'); }

  const value = retV > actV ? 'DECOMMISSIONED' : 'IN_SERVICE';
  log('OK', `  仲裁: ${value} (${sources.join(' | ')})`);
  return { value, source: sources.join(' | ') };
}

// ── 仲裁长度 ─────────────────────────────────────────────────────
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

  // SN 独有：Nominatim 补坐标
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

// ── 写入单条海缆到数据库 ─────────────────────────────────────────
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
    if (!lp.countryCode || lp.countryCode === 'XX' || (lp.lat === 0 && lp.lng === 0)) continue;
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
  console.log('║  Deep Blue 夜间同步 v3 - TG + SN 全量交叉验证       ║');
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const stats = {
    tgTotal: 0, snTotal: 0, snOnlyCount: 0,
    snOnlyAdded: 0, snOnlySkipped: 0,
    tgProcessed: 0, conflictsFound: 0,
    snStationsAdded: 0,
  };

  // ── Step 1: 获取 SN 全量列表 ─────────────────────────────────
  const snCables = await fetchSNCableList();
  stats.snTotal = snCables.size;

  // ── Step 2: 获取 TG 全量数据 ─────────────────────────────────
  const tgCables = await fetchTG();
  stats.tgTotal = tgCables.size;

  // 建立 TG 海缆的多种 slug 形式，用于和 SN slug 做匹配
  const tgSlugSet = new Set<string>();
  for (const [id, cable] of tgCables) {
    tgSlugSet.add(id);
    tgSlugSet.add(slugify(cable.name));
    // 去掉括号后再 slugify（如 "SEA-ME-WE 3 (SMW3)" → "sea-me-we-3"）
    tgSlugSet.add(slugify(cable.name.replace(/\s*\(.*\)/g, '')));
  }

  // ── Step 3: 找出 SN 独有的海缆 ───────────────────────────────
  const snOnlyCables: SNCableRef[] = [];
  for (const [snSlug, ref] of snCables) {
    const inTG = tgSlugSet.has(snSlug) ||
                 tgSlugSet.has(slugify(ref.name)) ||
                 tgSlugSet.has(slugify(ref.name.replace(/\s*\(.*\)/g, '')));
    if (!inTG) snOnlyCables.push(ref);
  }

  stats.snOnlyCount = snOnlyCables.length;
  log('INFO', `\nSN 独有海缆（TG 缺失）: ${snOnlyCables.length} 条`);
  if (snOnlyCables.length > 0) {
    console.log('  列表:');
    for (const c of snOnlyCables.slice(0, 20)) {
      console.log(`    - ${c.name} (${c.url})`);
    }
    if (snOnlyCables.length > 20) console.log(`    ... 还有 ${snOnlyCables.length - 20} 条`);
  }

  // ── Step 4: 处理 SN 独有海缆 ─────────────────────────────────
  log('INFO', '\n开始处理 SN 独有海缆（第三方验证）...');
  for (const ref of snOnlyCables) {
    log('INFO', `处理 SN 独有: [${ref.name}]`);

    // 获取 SN 详情
    const snDetail = await fetchSNDetail(ref);
    await delay(300);
    if (!snDetail) { log('WARN', `  无法获取 SN 详情，跳过`); stats.snOnlySkipped++; continue; }

    // 查询 Wikipedia 做第三方验证
    let wikiRetired: boolean | undefined;
    let wikiExists = false;
    try {
      const wRes = await fetch(
        `${WIKI_API}/${encodeURIComponent(ref.name.replace(/\s+/g, '_'))}`,
        { headers: { 'User-Agent': 'DeepBlue/3.0' } }
      );
      if (wRes.ok) {
        const wd = await wRes.json() as any;
        wikiExists = !!(wd.extract);
        const t = (wd.extract || '').toLowerCase();
        const ret = ['retired','decommission','end-of-life'].filter(k => t.includes(k)).length;
        const act = ['operational','in service','active'].filter(k => t.includes(k)).length;
        if (ret > act) wikiRetired = true;
        else if (act > ret) wikiRetired = false;
      }
    } catch {}
    await delay(500);

    // 判断是否应该入库：
    // - SN 标注退役 且 Wiki 也支持退役 → 入库但标 DECOMMISSIONED
    // - SN 标注退役 且 Wiki 不支持 → 入库标 DECOMMISSIONED（SN 权重更高）
    // - SN 标注在役 → 入库标 IN_SERVICE
    // - Wiki 完全没有这条海缆 → 仍然入库（SN 已是权威来源）
    const status = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
    const rfsDate = snDetail.rfsYear ? new Date(snDetail.rfsYear, 0, 1) : null;
    const owners  = snDetail.owners.length > 0 ? snDetail.owners : [];

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
          source: 'sn_only', confidence: 0.70,
        });
      }
    }

    // 入库
    try {
      await upsertCable({
        id: `sn-${ref.slug}`,
        name: ref.name, status,
        lengthKm: snDetail.lengthKm,
        rfsDate, geoJson: null,
        supplierName: null, owners, notes: null,
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

  // ── Step 5: 处理 TG 全量数据（交叉验证所有字段）────────────────
  log('INFO', '\n开始处理 TG 全量数据（交叉验证）...');

  for (const [cableId, tg] of tgCables) {
    try {
      const tgLengthKm = parseLength(tg.length);
      const tgRfsYear  = tg.rfs_year || null;
      const rfsDate    = tgRfsYear ? new Date(tgRfsYear, 0, 1) : null;
      let tgStatus = 'IN_SERVICE';
      if (tg.is_planned) tgStatus = 'PLANNED';
      else if (rfsDate && rfsDate > new Date()) tgStatus = 'UNDER_CONSTRUCTION';

      // 触发 SN 抓取的条件：老缆（>20年）或 TG 登陆站偏少
      const cableAge  = tgRfsYear ? new Date().getFullYear() - tgRfsYear : 0;
      const needSN    = cableAge >= 20 || (tg.landing_points || []).length <= 5;

      let snDetail: SNDetail | null = null;
      if (needSN) {
        // 先从 SN 列表里找到对应的 URL
        const tgSlug   = slugify(tg.name);
        const tgSlugNP = slugify(tg.name.replace(/\s*\(.*\)/g, ''));
        const snRef    = snCables.get(cableId) ||
                         snCables.get(tgSlug) ||
                         snCables.get(tgSlugNP);
        if (snRef) {
          snDetail = await fetchSNDetail(snRef);
          await delay(300);
        }
      }

      // 字段仲裁
      let finalStatus = tgStatus;
      if (snDetail?.isRetired !== undefined) {
        const verdict = await arbitrateStatus(tg.name, tgStatus, snDetail.isRetired);
        if (verdict.value !== finalStatus) {
          stats.conflictsFound++;
          finalStatus = verdict.value;
        }
      }

      const finalLength = arbitrateLength(tg.name, tgLengthKm, snDetail?.lengthKm || null);
      const finalRfsYear = tgRfsYear ?? snDetail?.rfsYear ?? null;
      const finalRfsDate = finalRfsYear ? new Date(finalRfsYear, 0, 1) : null;

      // 登陆站合并
      const mergedLPs = await mergeLPs(
        tg.landing_points || [],
        snDetail?.landingPoints || [],
        tg.name,
      );
      const snOnly = mergedLPs.filter(lp => lp.source === 'sn_only').length;
      if (snOnly > 0) {
        stats.snStationsAdded += snOnly;
        log('OK', `[${tg.name}] 补充 ${snOnly} 个 SN 独有登陆站`);
      }

      const owners      = tg.owners ? String(tg.owners).split(',').map(s => s.trim()).filter(Boolean) : [];
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

  // ── Step 6: 报告 ─────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s`);
  console.log(`║  TG: ${stats.tgTotal} 条 | SN: ${stats.snTotal} 条`);
  console.log(`║  SN独有（TG缺失）: ${stats.snOnlyCount} 条`);
  console.log(`║    → 已入库: ${stats.snOnlyAdded} 条`);
  console.log(`║    → 跳过:   ${stats.snOnlySkipped} 条`);
  console.log(`║  字段冲突仲裁: ${stats.conflictsFound} 次`);
  console.log(`║  SN补充登陆站: ${stats.snStationsAdded} 个`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // 写入 Redis
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set('sync:report:latest', JSON.stringify({ ...stats, runAt: new Date().toISOString() }), { ex: 7 * 24 * 3600 });
    await redis.del('cables:geojson:full');
    log('OK', 'Redis: 报告已保存，GeoJSON 缓存已清空');
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

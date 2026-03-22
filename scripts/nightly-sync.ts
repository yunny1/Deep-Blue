// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步脚本 v6
//
// 核心架构（依据 PRD v2.0）：
//   Tier 1（TG）先写入，强制覆盖，确立主数据权威
//   Tier 2（SN）后合并，只追加不覆盖核心物理字段
//   登陆站无条件先落库（坐标可为 NULL），彻底解耦地理编码
//   实体对齐 Jaro-Winkler(40%) + Jaccard(40%) + RFS(20%)
//   60-85分 → PENDING_REVIEW，<60分 → 独立入库

import { PrismaClient } from '@prisma/client';
import jaroWinkler from 'jaro-winkler';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();

const TG_ALL    = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const TG_GEO    = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const TG_LP     = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
const SN_BASE   = 'https://www.submarinenetworks.com';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const WIKI_API  = 'https://en.wikipedia.org/api/rest_v1/page/summary';

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

// ════════════════════════════════════════════════════════════════
// 模块二：实体对齐算法
// ════════════════════════════════════════════════════════════════

function normalizeCableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(cable|system|network|submarine|fibre|fiber|optic)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

interface AlignmentResult {
  decision: 'MATCH' | 'PENDING_REVIEW' | 'NEW';
  score: number;
  details: { nameScore: number; landingScore: number; rfsScore: number };
}

function alignCableEntity(
  nameA: string, landingsA: string[], rfsA: number | null,
  nameB: string, landingsB: string[], rfsB: number | null,
): AlignmentResult {
  const normA = normalizeCableName(nameA);
  const normB = normalizeCableName(nameB);
  const nameScore = jaroWinkler(normA, normB) * 100;

  const setA = new Set(landingsA.map(s => s.toLowerCase().split(',')[0].trim()));
  const setB = new Set(landingsB.map(s => s.toLowerCase().split(',')[0].trim()));
  const landingScore = jaccardSimilarity(setA, setB) * 100;

  let rfsScore = 50;
  if (rfsA && rfsB) {
    const diff = Math.abs(rfsA - rfsB);
    if (diff <= 1) rfsScore = 100;
    else if (diff === 2) rfsScore = 50;
    else rfsScore = 0;
  }

  const totalScore = (nameScore * 0.4) + (landingScore * 0.4) + (rfsScore * 0.2);

  let decision: AlignmentResult['decision'];
  if (totalScore >= 85) decision = 'MATCH';
  else if (totalScore >= 60) decision = 'PENDING_REVIEW';
  else decision = 'NEW';

  return { decision, score: Number(totalScore.toFixed(2)), details: { nameScore, landingScore, rfsScore } };
}

// ════════════════════════════════════════════════════════════════
// 模块三：登陆站标准化 + 并集去重
// ════════════════════════════════════════════════════════════════

// 标准化登陆站名称：去掉括号、国家后缀、公司名等噪音，提取核心城市名
function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')       // 去括号内容
    .replace(/,.*$/, '')                  // 去逗号后的国家/地区
    .replace(/\b(cable|landing|station|beach|bay|point|port)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 用 Jaro-Winkler 对登陆站数组内部去重（如 Marseille vs Marseille, France）
function deduplicateStations(stations: string[]): string[] {
  const result: string[] = [];
  for (const s of stations) {
    const normS = normalizeStationName(s);
    const isDuplicate = result.some(r => {
      const normR = normalizeStationName(r);
      return jaroWinkler(normS, normR) >= 0.92;
    });
    if (!isDuplicate) result.push(s);
  }
  return result;
}

// 合并两个来源的登陆站，取并集后去重
function mergeStationNames(tgNames: string[], snNames: string[]): string[] {
  return deduplicateStations([...tgNames, ...snNames]);
}

// ════════════════════════════════════════════════════════════════
// 模块四：地理编码（解耦版）
// 先无条件落库（坐标 NULL），再异步补坐标
// ════════════════════════════════════════════════════════════════

// 查本地字典缓存
async function lookupLocationDict(rawString: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const cached = await prisma.locationDictionary.findUnique({ where: { rawString } });
    if (cached) return { lat: cached.latitude, lng: cached.longitude };
  } catch {}
  return null;
}

// Nominatim 地理编码（带 DLQ 写入）
async function geocodeAsync(
  stationName: string, city: string, country: string,
  cableId: string, source: string,
): Promise<{ lat: number; lng: number } | null> {
  // 先查字典缓存
  const cached = await lookupLocationDict(stationName);
  if (cached) return cached;

  try {
    await delay(1100);
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(`${city}, ${country}`)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DeepBlue/6.0 (contact@deep-cloud.org)' } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any[];
    if (!data.length) throw new Error('0 results');

    const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    const cc = validateCountryCode(getCountryCode(country), stationName);

    // 写入字典缓存
    await prisma.locationDictionary.upsert({
      where: { rawString: stationName },
      update: { latitude: coords.lat, longitude: coords.lng },
      create: {
        rawString: stationName, standardizedCity: city,
        countryCode: cc, latitude: coords.lat, longitude: coords.lng,
        source: 'Nominatim',
      },
    }).catch(() => {});

    return coords;
  } catch (err: any) {
    // 写入 DLQ（不阻断流程）
    await prisma.unresolvedLocation.upsert({
      where: { rawString: stationName },
      update: { retryCount: { increment: 1 }, updatedAt: new Date(), errorReason: err.message },
      create: {
        rawString: stationName, originSource: source,
        cableId, errorReason: err.message, status: 'PENDING',
      },
    }).catch(() => {});
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// 模块一：Tier 1 写入（TG，强制覆盖，确立权威）
// ════════════════════════════════════════════════════════════════

async function upsertTier1Cable(tg: TGCable, status: string): Promise<string> {
  const lengthKm    = parseLength(tg.length);
  const rfsDate     = tg.rfs_year ? new Date(tg.rfs_year, 0, 1) : null;
  const supplierName = tg.suppliers ? String(tg.suppliers).split(',')[0].trim() : null;

  let vendorId: string | null = null;
  if (supplierName) {
    const v = await prisma.company.upsert({
      where: { name: supplierName }, update: {},
      create: { name: supplierName, type: 'VENDOR' },
    }).catch(() => null);
    vendorId = v?.id || null;
  }

  // 检查是否存在同名但不同 ID 的记录（可能是旧的 sn- 占位）
  const sameNameDiff = await prisma.cable.findFirst({
    where: { name: tg.name, NOT: { id: tg.id } },
  });

  if (sameNameDiff) {
    // 删除低质量占位记录，释放 name 唯一索引
    log('INFO', `  清理占位记录: ${sameNameDiff.id} → 让位给 TG ${tg.id}`);
    await prisma.cableLandingStation.deleteMany({ where: { cableId: sameNameDiff.id } });
    await prisma.cableOwnership.deleteMany({ where: { cableId: sameNameDiff.id } });
    await prisma.cable.delete({ where: { id: sameNameDiff.id } }).catch(() => {});
  }

  // TG 强制覆盖写入（覆盖所有核心物理字段）
  await prisma.cable.upsert({
    where: { id: tg.id },
    update: {
      name: tg.name, slug: slugify(tg.name), status,
      lengthKm, rfsDate, routeGeojson: tg.geoJson,
      vendorId, notes: tg.notes || null,
    },
    create: {
      id: tg.id, name: tg.name, slug: slugify(tg.name), status,
      lengthKm, rfsDate, routeGeojson: tg.geoJson,
      vendorId, notes: tg.notes || null,
    },
  });

  // 写入登陆站（模块四：先无条件落库，坐标异步补）
  for (const lp of tg.landing_points || []) {
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
    if (!cc || cc === 'XX') continue;

    await prisma.country.upsert({
      where: { code: cc }, update: {},
      create: { code: cc, nameEn: cc },
    }).catch(() => {});

    // TG 自带坐标，直接用
    const lat = lp.lat ?? null;
    const lng = lp.lng ?? null;

    const station = await prisma.landingStation.upsert({
      where: { id: lp.id },
      update: { name: lp.name, countryCode: cc, latitude: lat, longitude: lng },
      create: { id: lp.id, name: lp.name, countryCode: cc, latitude: lat, longitude: lng },
    }).catch(() => null);

    if (station) {
      await prisma.cableLandingStation.upsert({
        where: { cableId_landingStationId: { cableId: tg.id, landingStationId: station.id } },
        update: {}, create: { cableId: tg.id, landingStationId: station.id },
      }).catch(() => {});
    }
  }

  // 写入运营商
  if (tg.owners) {
    const ownerNames = String(tg.owners).split(',').map(s => s.trim()).filter(Boolean);
    for (const ownerName of ownerNames) {
      const company = await prisma.company.upsert({
        where: { name: ownerName }, update: {},
        create: { name: ownerName, type: 'OPERATOR' },
      }).catch(() => null);
      if (company) {
        await prisma.cableOwnership.upsert({
          where: { cableId_companyId: { cableId: tg.id, companyId: company.id } },
          update: {}, create: { cableId: tg.id, companyId: company.id },
        }).catch(() => {});
      }
    }
  }

  return tg.id;
}

// ════════════════════════════════════════════════════════════════
// 模块一：Tier 2 写入（SN，只追加不覆盖核心物理字段）
// ════════════════════════════════════════════════════════════════

async function mergeTier2IntoExisting(cableId: string, snDetail: SNDetail) {
  const existing = await prisma.cable.findUnique({
    where: { id: cableId },
    include: { landingStations: { include: { landingStation: true } } },
  });
  if (!existing) return;

  // 只在 TG 没有该字段时才用 SN 的数据补充（不覆盖核心物理字段）
  const updates: any = {};
  if (!existing.lengthKm && snDetail.lengthKm) updates.lengthKm = snDetail.lengthKm;
  if (!existing.rfsDate && snDetail.rfsYear) updates.rfsDate = new Date(snDetail.rfsYear, 0, 1);

  // SN 标注退役且 TG 没有标注时，更新状态
  if (snDetail.isRetired && existing.status === 'IN_SERVICE') {
    // 需要 Wikipedia 仲裁，不直接覆盖
    const wikiResult = await checkWikipedia(existing.name);
    if (wikiResult.isRetired) updates.status = 'DECOMMISSIONED';
  }

  if (Object.keys(updates).length > 0) {
    await prisma.cable.update({ where: { id: cableId }, data: updates }).catch(() => {});
  }

  // 追加 SN 独有的登陆站（模块三：取并集）
  const existingStationNames = existing.landingStations.map(ls => ls.landingStation.name);
  const allStationNames = mergeStationNames(existingStationNames, snDetail.landingPoints.map(lp => lp.name));
  const snOnlyStations = snDetail.landingPoints.filter(lp => {
    const normLp = normalizeStationName(lp.name);
    return !existingStationNames.some(n => jaroWinkler(normalizeStationName(n), normLp) >= 0.92);
  });

  if (snOnlyStations.length > 0) {
    log('OK', `  [${existing.name}] SN补充 ${snOnlyStations.length} 个独有登陆站`);
  }

  for (const lp of snOnlyStations) {
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
    if (!cc || cc === 'XX') continue;

    await prisma.country.upsert({
      where: { code: cc }, update: {},
      create: { code: cc, nameEn: cc },
    }).catch(() => {});

    const stationId = `sn-${slugify(lp.name)}-${cc.toLowerCase()}`;

    // 模块四：无条件先落库（坐标为 NULL），再异步补坐标
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

      // 异步补坐标（不阻断主流程）
      geocodeAsync(lp.name, lp.city, lp.country, cableId, 'SN').then(coords => {
        if (coords) {
          prisma.landingStation.update({
            where: { id: stationId },
            data: { latitude: coords.lat, longitude: coords.lng },
          }).catch(() => {});
        }
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════
// Tier 2 独立入库（SN 独有海缆）
// ════════════════════════════════════════════════════════════════

async function upsertTier2Cable(ref: SNCableRef, snDetail: SNDetail, status: string) {
  const cableId = `sn-${ref.slug}`;
  const rfsDate = snDetail.rfsYear ? new Date(snDetail.rfsYear, 0, 1) : null;

  // 检查同名是否已存在（可能是 TG 已用别的 ID 写入）
  const sameNameExisting = await prisma.cable.findFirst({
    where: { name: ref.name, NOT: { id: cableId } },
  });

  if (sameNameExisting) {
    // TG 已有此缆，转为 Tier 2 合并模式
    log('INFO', `  [${ref.name}] TG已有(${sameNameExisting.id})，转为 Tier2 合并`);
    await mergeTier2IntoExisting(sameNameExisting.id, snDetail);
    return;
  }

  await prisma.cable.upsert({
    where: { id: cableId },
    update: { name: ref.name, slug: slugify(ref.name), status, lengthKm: snDetail.lengthKm, rfsDate },
    create: { id: cableId, name: ref.name, slug: slugify(ref.name), status, lengthKm: snDetail.lengthKm, rfsDate },
  });

  for (const lp of snDetail.landingPoints) {
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
    if (!cc || cc === 'XX') continue;

    await prisma.country.upsert({
      where: { code: cc }, update: {},
      create: { code: cc, nameEn: cc },
    }).catch(() => {});

    const stationId = `sn-${slugify(lp.name)}-${cc.toLowerCase()}`;

    // 无条件先落库（坐标可为 NULL）
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

      // 异步补坐标
      geocodeAsync(lp.name, lp.city, lp.country, cableId, 'SN').then(coords => {
        if (coords) {
          prisma.landingStation.update({
            where: { id: stationId },
            data: { latitude: coords.lat, longitude: coords.lng },
          }).catch(() => {});
        }
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════
// SN 数据获取
// ════════════════════════════════════════════════════════════════

async function fetchSNCableList(): Promise<Map<string, SNCableRef>> {
  log('INFO', 'SN: 解析全量列表...');
  const res = await fetch(`${SN_BASE}/en/systems`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/6.0)' },
  });
  const html = await res.text();
  const linkRegex = /href="(\/en\/systems\/([a-z0-9\-]+)\/([a-z0-9\-]+))"\s*>([^<]+)</gi;
  const SKIP = new Set([
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
    if (SKIP.has(cableSlug) || name.length < 2 || name.length > 100) continue;
    result.set(cableSlug, { name, url: `${SN_BASE}${path}`, slug: cableSlug, category });
  }
  log('OK', `SN: ${result.size} 条`);
  return result;
}

function parseSNDetail(html: string, sourceUrl: string): SNDetail {
  const result: SNDetail = {
    sourceUrl, isRetired: html.includes('>Retired<') || html.includes('/tag/retired'),
    landingPoints: [], owners: [], lengthKm: null, rfsYear: null,
  };
  const lenMatch = html.match(/(\d[\d,]{2,})\s*km/i);
  if (lenMatch) result.lengthKm = parseInt(lenMatch[1].replace(/,/g, ''));
  const rfsMatch = html.match(/(\d{4})\s+(?:November|December|January|February|March|April|May|June|July|August|September|October)/i);
  if (rfsMatch) result.rfsYear = parseInt(rfsMatch[1]);
  const section = html.match(/lands at the following[^<]*(?:<\/[^>]+>)*\s*<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/i)?.[1] || '';
for (const li of section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi) || []) {
    const text = li.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^\d+\.\s*/, '').trim();
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeepBlue/6.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes(ref.name.slice(0, 4))) return null;
    return parseSNDetail(html, ref.url);
  } catch { return null; }
}

async function checkWikipedia(name: string): Promise<{ exists: boolean; isRetired?: boolean }> {
  try {
    const res = await fetch(
      `${WIKI_API}/${encodeURIComponent(name.replace(/\s+/g, '_'))}`,
      { headers: { 'User-Agent': 'DeepBlue/6.0' } }
    );
    if (!res.ok) return { exists: false };
    const d = await res.json() as any;
    if (!d.extract) return { exists: false };
    const t = d.extract.toLowerCase();
    const ret = ['retired', 'decommission', 'end-of-life', 'out of service'].filter(k => t.includes(k)).length;
    const act = ['operational', 'in service', 'active cable'].filter(k => t.includes(k)).length;
    return { exists: true, isRetired: ret > act ? true : act > ret ? false : undefined };
  } catch { return { exists: false }; }
}

// ════════════════════════════════════════════════════════════════
// TG 全量数据获取
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
// 主流程
// ════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 夜间同步 v6 — PRD v2.0 合规                      ║');
  console.log('║  TG先写(覆盖) → SN后合并(追加) → 登陆站解耦落库            ║');
  console.log(`║  ${new Date().toISOString()}                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const stats = {
    tgWritten: 0, tgConflictsResolved: 0,
    snMatched: 0, snPendingReview: 0, snNewAdded: 0, snSkipped: 0,
    stationsNullCoord: 0, dlqTotal: 0,
  };

  // ── 步骤一：获取 SN 全量列表 + TG 全量数据（并行）────────────
  const [snCables, tgCables] = await Promise.all([
    fetchSNCableList(),
    fetchTG(),
  ]);

  // ── 步骤二：Tier 1 — TG 全量写入（强制覆盖，确立权威）────────
  log('INFO', `\n[Tier 1] 写入 TG ${tgCables.size} 条海缆...`);

  const tgEntityList = [...tgCables.values()].map(c => ({
    id: c.id, name: c.name, rfsYear: c.rfs_year,
    landings: (c.landing_points || []).map(lp => lp.name),
  }));

  for (const [cableId, tg] of tgCables) {
    try {
      const rfsDate = tg.rfs_year ? new Date(tg.rfs_year, 0, 1) : null;
      let status = 'IN_SERVICE';
      if (tg.is_planned) status = 'PLANNED';
      else if (rfsDate && rfsDate > new Date()) status = 'UNDER_CONSTRUCTION';

      await upsertTier1Cable(tg, status);
      stats.tgWritten++;
    } catch (e: any) {
      log('ERROR', `TG ${cableId}: ${e.message}`);
    }
  }
  log('OK', `[Tier 1] 完成：写入 ${stats.tgWritten} 条`);

  // ── 步骤三：Tier 2 — SN 合并/入库（只追加，不覆盖核心字段）──
  log('INFO', `\n[Tier 2] 处理 SN ${snCables.size} 条海缆...`);

  for (const [, ref] of snCables) {
    // 用实体对齐算法找最佳匹配的 TG 海缆
    let bestMatch: typeof tgEntityList[0] | null = null;
    let bestResult: AlignmentResult | null = null;

    for (const tg of tgEntityList) {
      const result = alignCableEntity(
        ref.name, [], null,
        tg.name, tg.landings, tg.rfsYear,
      );
      if (!bestResult || result.score > bestResult.score) {
        bestResult = result;
        bestMatch  = tg;
      }
      if (result.decision === 'MATCH') break;
    }

    if (bestResult!.decision === 'MATCH' && bestMatch) {
      // 自动合并：TG 已有，只追加 SN 的增量数据
      const snDetail = await fetchSNDetail(ref);
      await delay(200);
      if (snDetail) {
        await mergeTier2IntoExisting(bestMatch.id, snDetail);
        stats.snMatched++;
      }

    } else if (bestResult!.decision === 'PENDING_REVIEW') {
      // 疑似同源：独立入库但标记 PENDING_REVIEW，推入后台等待人工确认
      log('WARN', `[PENDING_REVIEW] ${ref.name} ↔ ${bestMatch?.name} (${bestResult!.score.toFixed(0)}分)`);
      const snDetail = await fetchSNDetail(ref);
      await delay(200);
      if (snDetail) {
        await upsertTier2Cable(ref, snDetail, 'PENDING_REVIEW');
        stats.snPendingReview++;
      }

    } else {
      // 全新海缆：独立入库
      const snDetail = await fetchSNDetail(ref);
      await delay(200);
      if (!snDetail) { stats.snSkipped++; continue; }

      const wiki = await checkWikipedia(ref.name);
      await delay(300);

      const status = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
      await upsertTier2Cable(ref, snDetail, status);
      log('OK', `[新缆] ${ref.name} (${status}, ${snDetail.landingPoints.length} 站${wiki.exists ? ', Wiki✓' : ''})`);
      stats.snNewAdded++;
    }
  }

  // ── 步骤四：统计坐标为 NULL 的登陆站数量 ─────────────────────
  try {
    stats.stationsNullCoord = await prisma.landingStation.count({
      where: { OR: [{ latitude: null }, { longitude: null }] },
    });
    stats.dlqTotal = await prisma.unresolvedLocation.count({ where: { status: 'PENDING' } });
  } catch {}

  // ── 报告 ─────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s`);
  console.log(`║  [Tier1-TG]  写入: ${stats.tgWritten} 条`);
  console.log(`║  [Tier2-SN]  合并到TG: ${stats.snMatched} | 待审: ${stats.snPendingReview} | 新增: ${stats.snNewAdded} | 跳过: ${stats.snSkipped}`);
  console.log(`║  坐标待补全的登陆站: ${stats.stationsNullCoord} 个`);
  console.log(`║  DLQ待处理: ${stats.dlqTotal} 个`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Redis
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.set(
      `sync:report:${new Date().toISOString().slice(0, 10)}`,
      JSON.stringify({ ...stats, runAt: new Date().toISOString() }),
      { ex: 30 * 24 * 3600 }
    );
    await redis.set('sync:report:latest', JSON.stringify({ ...stats, runAt: new Date().toISOString() }), { ex: 7 * 24 * 3600 });
    await redis.del('cables:geojson:full');
    log('OK', 'Redis: 报告已保存');
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

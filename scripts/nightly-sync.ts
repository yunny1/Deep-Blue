// scripts/nightly-sync.ts
// Deep Blue 夜间数据同步脚本 v9
//
// v9 变更：Qwen AI 智能去重（第三层）
//   - SyncDedupGuard 升级 v2：模糊匹配 65-85 分的 REVIEW 对自动调 Qwen AI 判断
//   - AI 判断 MERGE → 自动合并, SKIP → 独立入库, UNCERTAIN/失败 → 降级为 PENDING_REVIEW
//   - guard.check() 变为 async（内部调 Qwen API，30s 超时），AI 不可用时行为与 v8 一致
//   - 新增 AI 去重统计指标（aiCalls, aiMerged, aiSkipped, aiFailed）
//
// v8 保留：同步追踪 + 孤儿清理 + 状态变更检测
// v7 保留：去重守门模块 (SyncDedupGuard) + dataSource 标记
//
// 核心架构（依据 PRD v2.0）：
//   Tier 1（TG）先写入，强制覆盖，确立主数据权威
//   Tier 2（SN）后合并，只追加不覆盖核心物理字段
//   登陆站无条件先落库（坐标可为 NULL），彻底解耦地理编码
//   实体对齐：结构化名称解析 + Jaro-Winkler(40%) + Jaccard(40%) + RFS(20%)

import { PrismaClient } from '@prisma/client';
import jaroWinkler from 'jaro-winkler';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';
import { SyncDedupGuard } from './dedup-sync-guard';
import { extractAndRegisterAlias, persistAliasesToDB } from '../src/lib/cable-name-parser';

const prisma = new PrismaClient();

const TG_ALL    = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const TG_GEO    = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const TG_LP     = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
const SN_BASE   = 'https://www.submarinenetworks.com';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const WIKI_API  = 'https://en.wikipedia.org/api/rest_v1/page/summary';

// v8: 全局同步时间戳，用于标记本轮同步确认的记录
let SYNC_TIMESTAMP: Date;

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
// v8: Schema 迁移（幂等，每次运行自动检查）
// ════════════════════════════════════════════════════════════════

async function ensureSyncSchema(): Promise<void> {
  const ddl = [
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS previous_status TEXT`,
    `ALTER TABLE cables ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_cables_last_synced_at ON cables (last_synced_at)`,
  ];
  for (const sql of ddl) {
    try { await prisma.$executeRawUnsafe(sql); } catch (_) {}
  }
}

// ════════════════════════════════════════════════════════════════
// v8: 状态变更检测辅助函数
// ════════════════════════════════════════════════════════════════

/**
 * 检测状态变更并返回需要额外更新的字段
 * 如果状态发生了变化，返回 { statusChangedAt, previousStatus }
 */
async function detectStatusChange(cableId: string, newStatus: string): Promise<Record<string, any>> {
  try {
    const existing = await prisma.cable.findUnique({
      where: { id: cableId },
      select: { status: true },
    });
    if (existing && existing.status && existing.status !== newStatus) {
      return {
        statusChangedAt: SYNC_TIMESTAMP,
        previousStatus: existing.status,
      };
    }
  } catch (_) {}
  return {};
}

// ════════════════════════════════════════════════════════════════
// 模块二：登陆站标准化 + 并集去重
// ════════════════════════════════════════════════════════════════

function normalizeStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/,.*$/, '')
    .replace(/\b(cable|landing|station|beach|bay|point|port)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function mergeStationNames(tgNames: string[], snNames: string[]): string[] {
  return deduplicateStations([...tgNames, ...snNames]);
}

// ════════════════════════════════════════════════════════════════
// 模块四：地理编码（解耦版）
// ════════════════════════════════════════════════════════════════

async function lookupLocationDict(rawString: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const cached = await prisma.locationDictionary.findUnique({ where: { rawString } });
    if (cached) return { lat: cached.latitude, lng: cached.longitude };
  } catch {}
  return null;
}

async function geocodeAsync(
  stationName: string, city: string, country: string,
  cableId: string, source: string,
): Promise<{ lat: number; lng: number } | null> {
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
// v8: 加 lastSyncedAt + firstSeenAt + 状态变更检测
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
    log('INFO', `  清理占位记录: ${sameNameDiff.id} → 让位给 TG ${tg.id}`);
    await prisma.cableLandingStation.deleteMany({ where: { cableId: sameNameDiff.id } });
    await prisma.cableOwnership.deleteMany({ where: { cableId: sameNameDiff.id } });
    await prisma.cable.delete({ where: { id: sameNameDiff.id } }).catch(() => {});
  }

  // v8: 检测状态变更
  const statusChangeFields = await detectStatusChange(tg.id, status);

  // TG 强制覆盖写入
  await prisma.cable.upsert({
    where: { id: tg.id },
    update: {
      name: tg.name, slug: slugify(tg.name), status,
      lengthKm, rfsDate, routeGeojson: tg.geoJson,
      vendorId, notes: tg.notes || null,
      dataSource: 'TELEGEOGRAPHY',
      lastSyncedAt: SYNC_TIMESTAMP,   // v8: 标记本轮同步确认
      ...statusChangeFields,           // v8: 状态变更追踪
    },
    create: {
      id: tg.id, name: tg.name, slug: slugify(tg.name), status,
      lengthKm, rfsDate, routeGeojson: tg.geoJson,
      vendorId, notes: tg.notes || null,
      dataSource: 'TELEGEOGRAPHY',
      lastSyncedAt: SYNC_TIMESTAMP,
      firstSeenAt: SYNC_TIMESTAMP,     // v8: 新增记录标记入库时间
    },
  });

  // 写入登陆站
  for (const lp of tg.landing_points || []) {
    const cc = validateCountryCode(getCountryCode(lp.country), lp.name);
    if (!cc || cc === 'XX') continue;

    await prisma.country.upsert({
      where: { code: cc }, update: {},
      create: { code: cc, nameEn: cc },
    }).catch(() => {});

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
// Tier 2 合并到已有记录（SN，只追加不覆盖核心物理字段）
// v8: 合并时也更新 lastSyncedAt
// ════════════════════════════════════════════════════════════════

async function mergeTier2IntoExisting(cableId: string, snDetail: SNDetail) {
  const existing = await prisma.cable.findUnique({
    where: { id: cableId },
    include: { landingStations: { include: { landingStation: true } } },
  });
  if (!existing) return;

  const updates: any = {
    lastSyncedAt: SYNC_TIMESTAMP,   // v8: 确认本轮同步
  };
  if (!existing.lengthKm && snDetail.lengthKm) updates.lengthKm = snDetail.lengthKm;
  if (!existing.rfsDate && snDetail.rfsYear) updates.rfsDate = new Date(snDetail.rfsYear, 0, 1);

  // SN 标注退役且 TG 没有标注时，需要 Wikipedia 仲裁
  if (snDetail.isRetired && existing.status === 'IN_SERVICE') {
    const wikiResult = await checkWikipedia(existing.name);
    if (wikiResult.isRetired) {
      updates.status = 'DECOMMISSIONED';
      updates.statusChangedAt = SYNC_TIMESTAMP;
      updates.previousStatus = existing.status;
    }
  }

  await prisma.cable.update({ where: { id: cableId }, data: updates }).catch(() => {});

  // 追加 SN 独有的登陆站（取并集）
  const existingStationNames = existing.landingStations.map(ls => ls.landingStation.name);
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
// v8: 加 lastSyncedAt + firstSeenAt + 状态变更检测
// ════════════════════════════════════════════════════════════════

async function upsertTier2Cable(
  ref: SNCableRef,
  snDetail: SNDetail,
  status: string,
  reviewStatus?: string | null,
  possibleDuplicateOf?: string | null,
) {
  const cableId = `sn-${ref.slug}`;
  const rfsDate = snDetail.rfsYear ? new Date(snDetail.rfsYear, 0, 1) : null;

  // 检查同名是否已存在（可能是 TG 已用别的 ID 写入）
  const sameNameExisting = await prisma.cable.findFirst({
    where: { name: ref.name, NOT: { id: cableId } },
  });

  if (sameNameExisting) {
    log('INFO', `  [${ref.name}] TG已有(${sameNameExisting.id})，转为 Tier2 合并`);
    await mergeTier2IntoExisting(sameNameExisting.id, snDetail);
    return;
  }

  // v8: 检测状态变更
  const statusChangeFields = await detectStatusChange(cableId, status);

  try {
    await prisma.cable.upsert({
      where: { id: cableId },
      update: {
        name: ref.name, slug: slugify(ref.name), status,
        lengthKm: snDetail.lengthKm, rfsDate,
        dataSource: 'SUBMARINE_NETWORKS',
        reviewStatus: reviewStatus || null,
        possibleDuplicateOf: possibleDuplicateOf || null,
        lastSyncedAt: SYNC_TIMESTAMP,
        ...statusChangeFields,
      },
      create: {
        id: cableId, name: ref.name, slug: slugify(ref.name), status,
        lengthKm: snDetail.lengthKm, rfsDate,
        dataSource: 'SUBMARINE_NETWORKS',
        reviewStatus: reviewStatus || null,
        possibleDuplicateOf: possibleDuplicateOf || null,
        lastSyncedAt: SYNC_TIMESTAMP,
        firstSeenAt: SYNC_TIMESTAMP,
      },
    });
  } catch (e: any) {
    log("WARN", `Tier2 upsert 跳过 ${ref.name}: ${String(e.message).slice(0,80)}`);
    return;
  }

  for (const lp of snDetail.landingPoints) {
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
// v8: 孤儿清理 — 标记上游不再收录的记录
// ════════════════════════════════════════════════════════════════

async function cleanupOrphans(): Promise<number> {
  // 找出本轮同步中未被确认的活跃记录（lastSyncedAt 不等于本轮 SYNC_TIMESTAMP）
  // 这些记录上游已不再收录，应该标记为 REMOVED
  try {
    const orphans: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, name, status FROM cables 
      WHERE (last_synced_at IS NULL OR last_synced_at < $1)
        AND (merged_into IS NULL)
        AND (status != 'REMOVED' OR status IS NULL)
    `, SYNC_TIMESTAMP);

    if (orphans.length === 0) return 0;

    log('INFO', `\n[孤儿清理] 发现 ${orphans.length} 条上游不再收录的记录：`);
    for (const o of orphans.slice(0, 20)) {
      log('WARN', `  "${o.name}" (${o.status}) → REMOVED`);
    }
    if (orphans.length > 20) {
      log('WARN', `  ... 还有 ${orphans.length - 20} 条`);
    }

    // 批量标记为 REMOVED
    await prisma.$executeRawUnsafe(`
      UPDATE cables 
      SET status = 'REMOVED', 
          previous_status = status, 
          status_changed_at = $1
      WHERE (last_synced_at IS NULL OR last_synced_at < $1)
        AND (merged_into IS NULL)
        AND (status != 'REMOVED' OR status IS NULL)
    `, SYNC_TIMESTAMP);

    return orphans.length;
  } catch (e: any) {
    log('ERROR', `孤儿清理失败: ${e.message}`);
    return 0;
  }
}

// ════════════════════════════════════════════════════════════════
// 主流程
// ════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  SYNC_TIMESTAMP = new Date();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 夜间同步 v9 — AI 智能去重 + 同步追踪            ║');
  console.log('║  TG先写(覆盖) → SN去重(AI增强) → 缓存刷新               ║');
  console.log(`║  ${SYNC_TIMESTAMP.toISOString()}                            ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // v8: 确保新字段存在
  await ensureSyncSchema();

  const stats = {
    tgWritten: 0, tgConflictsResolved: 0,
    snMatched: 0, snPendingReview: 0, snNewAdded: 0, snSkipped: 0,
    // v9: AI 去重统计
    snAiMerged: 0, snAiSkipped: 0, snAiFallback: 0,
    orphansRemoved: 0,
    stationsNullCoord: 0, dlqTotal: 0,
  };

  // ── 步骤一：获取 SN 全量列表 + TG 全量数据（并行）────────────
  const [snCables, tgCables] = await Promise.all([
    fetchSNCableList(),
    fetchTG(),
  ]);

  // ── 步骤二：Tier 1 — TG 全量写入（强制覆盖，确立权威）────────
  log('INFO', `\n[Tier 1] 写入 TG ${tgCables.size} 条海缆...`);

  let newAliasCount = 0;
  for (const [cableId, tg] of tgCables) {
    try {
      const rfsDate = tg.rfs_year ? new Date(tg.rfs_year, 0, 1) : null;
      let status = 'IN_SERVICE';
      if (tg.is_planned) status = 'PLANNED';
      else if (rfsDate && rfsDate > new Date()) status = 'UNDER_CONSTRUCTION';

      // v8: 每条 TG 海缆写入时提取括号缩写，自动扩充别名表
      // 例如 "Africa Coast to Europe (ACE)" → 注册 ace → africa-coast-to-europe
      newAliasCount += extractAndRegisterAlias(tg.name);

      await upsertTier1Cable(tg, status);
      stats.tgWritten++;
    } catch (e: any) {
      log('ERROR', `TG ${cableId}: ${e.message}`);
    }
  }

  // v8: Tier 1 写完后，将新提取的缩写别名持久化到 DB
  // 这样 Tier 2 阶段（SN 去重守门）就能立即使用这些别名
  if (newAliasCount > 0) {
    const persisted = await persistAliasesToDB(prisma);
    log('OK', `[别名] 自动提取 ${newAliasCount} 条缩写别名，持久化 ${persisted} 条到 DB`);
  }

  log('OK', `[Tier 1] 完成：写入 ${stats.tgWritten} 条`);

  // ── 步骤三：初始化去重守门 ───────────────────────────────────
  log('INFO', '\n[Dedup] 初始化去重守门（AI 增强）...');
  const guard = new SyncDedupGuard(prisma, { enableAI: true });
  await guard.init();

  // ── 步骤四：Tier 2 — SN 通过去重守门检查后入库 ────────────────
  log('INFO', `\n[Tier 2] 处理 SN ${snCables.size} 条海缆...`);

  for (const [, ref] of snCables) {
    const snDetail = await fetchSNDetail(ref);
    await delay(200);
    if (!snDetail) { stats.snSkipped++; continue; }

    const stationNames = new Set(
      snDetail.landingPoints.map(lp => lp.name.toLowerCase().split(',')[0].trim()).filter(Boolean)
    );

    // v9: guard.check() 现在是 async（内部可能调 Qwen AI）
    const decision = await guard.check(ref.name, stationNames, snDetail.rfsYear);

    switch (decision.action) {
      case 'MERGE': {
        await mergeTier2IntoExisting(decision.existingId!, snDetail);
        stats.snMatched++;
        // v9: 区分 AI 合并和确定性合并
        if (decision.confidence === 'AI_CONFIRMED') {
          stats.snAiMerged++;
          log('OK', `  [AI合并] "${ref.name}" → "${decision.existingName}" (AI=${decision.score}分) ${decision.detail}`);
        } else {
          log('OK', `  [合并] "${ref.name}" → "${decision.existingName}" (${decision.score}分)`);
        }
        break;
      }

      case 'REVIEW': {
        // v9: 到这里说明 AI 也无法确认（UNCERTAIN 或 API 失败），保持 PENDING_REVIEW
        const wiki = await checkWikipedia(ref.name);
        await delay(300);
        const status = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
        await upsertTier2Cable(ref, snDetail, status, 'PENDING_REVIEW', decision.existingId);
        guard.addToIndex(`sn-${ref.slug}`, ref.name, stationNames, snDetail.rfsYear);
        stats.snPendingReview++;
        stats.snAiFallback++;
        log('WARN', `  [待审核] "${ref.name}" ↔ "${decision.existingName}" (${decision.score}分, AI降级)`);
        break;
      }

      case 'CREATE': {
        // v9: 区分 AI 排除和无匹配
        if (decision.confidence === 'AI_REJECTED') {
          stats.snAiSkipped++;
          log('OK', `  [AI独立] "${ref.name}" — AI确认非重复: ${decision.detail}`);
        }
        const wiki = await checkWikipedia(ref.name);
        await delay(300);
        const status = snDetail.isRetired ? 'DECOMMISSIONED' : 'IN_SERVICE';
        await upsertTier2Cable(ref, snDetail, status);
        guard.addToIndex(`sn-${ref.slug}`, ref.name, stationNames, snDetail.rfsYear);
        stats.snNewAdded++;
        if (decision.confidence !== 'AI_REJECTED') {
          log('OK', `  [新缆] ${ref.name} (${status}, ${snDetail.landingPoints.length} 站${wiki.exists ? ', Wiki✓' : ''})`);
        }
        break;
      }
    }
  }

  guard.printStats();

  // ── 步骤五：孤儿清理已移除 ────────────────────────────────────
  // 时间戳判断法有严重缺陷（曾误删全部数据），已禁用。
  // 如需清理孤儿，使用独立脚本 cleanup-orphans.ts（直接对比上游数据源，安全可靠）
  stats.orphansRemoved = 0;

  // ── 步骤六：统计 ─────────────────────────────────────────────
  try {
    stats.stationsNullCoord = await prisma.landingStation.count({
      where: { OR: [{ latitude: null }, { longitude: null }] },
    });
    stats.dlqTotal = await prisma.unresolvedLocation.count({ where: { status: 'PENDING' } });
  } catch {}

  // ── 报告 ─────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  // v8: 统计活跃海缆数（排除 REMOVED 和 merged）
  let activeCableCount = 0;
  try {
    activeCableCount = await prisma.cable.count({
      where: { mergedInto: null, NOT: { status: 'REMOVED' } },
    });
  } catch {}

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  同步完成！耗时 ${elapsed}s`);
  console.log(`║  [Tier1-TG]  写入: ${stats.tgWritten} 条`);
  console.log(`║  [Tier2-SN]  合并到已有: ${stats.snMatched} | 待审: ${stats.snPendingReview} | 新增: ${stats.snNewAdded} | 跳过: ${stats.snSkipped}`);
  console.log(`║  [AI去重]    AI判断中: 合并=${stats.snAiMerged} | 排除=${stats.snAiSkipped} | 降级待审=${stats.snAiFallback}`);
  console.log(`║  [孤儿清理]  标记REMOVED: ${stats.orphansRemoved} 条`);
  console.log(`║  [活跃海缆]  当前总数: ${activeCableCount} 条`);
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
      JSON.stringify({ ...stats, activeCableCount, runAt: new Date().toISOString() }),
      { ex: 30 * 24 * 3600 }
    );
    await redis.set('sync:report:latest', JSON.stringify({ ...stats, activeCableCount, runAt: new Date().toISOString() }), { ex: 7 * 24 * 3600 });
    // v9: 清除所有前端缓存
    await Promise.all([
      redis.del('cables:geojson:full'),
      redis.del('cables:geo:details'),
      redis.del('cables:geo'),
      redis.del('cables:list'),
      redis.del('stats:global'),
    ]);
    log('OK', 'Redis: 报告已保存，缓存已清除');
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

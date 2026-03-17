// scripts/import-full.ts
// Deep Blue 完整数据导入脚本 v3
// 新增：导入前快照当前状态，导入后对比，将变化记录写入 Redis
// 运行方式: npx tsx scripts/import-full.ts

import { PrismaClient } from '@prisma/client';
import { Redis } from '@upstash/redis';

const prisma = new PrismaClient();

// Redis 连接——使用和 Next.js 相同的环境变量
// 需要在 .env 中有 UPSTASH_REDIS_REST_URL 和 UPSTASH_REDIS_REST_TOKEN
let redis: Redis | null = null;
try {
  redis = Redis.fromEnv();
} catch {
  console.warn('[ChangeTracker] Redis 未配置，变化记录将被跳过');
}

const CABLE_ALL = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const CABLE_GEO = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LP_GEO   = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';

// ── 变化记录类型定义 ────────────────────────────────────────────
export interface CableChange {
  type: 'NEW' | 'UPDATED' | 'REMOVED';
  slug: string;
  name: string;
  changedFields?: string[]; // 仅 UPDATED 时有值
}

export interface ChangeLog {
  importedAt: string;    // ISO 时间戳
  totalCables: number;   // 本次导入的海缆总数
  changes: CableChange[];
  summary: {
    newCount: number;
    updatedCount: number;
    removedCount: number;
  };
}

// ── 工具函数 ─────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

function parseLength(len: string | null | undefined): number | null {
  if (!len) return null;
  const num = String(len).replace(/[^0-9.]/g, '');
  return num ? parseFloat(num) : null;
}

const COUNTRY_MAP: Record<string, string> = {
  'United States': 'US', 'United Kingdom': 'GB', 'France': 'FR', 'Germany': 'DE',
  'Japan': 'JP', 'China': 'CN', 'Singapore': 'SG', 'Australia': 'AU',
  'Brazil': 'BR', 'India': 'IN', 'South Korea': 'KR', 'Taiwan': 'TW',
  'Indonesia': 'ID', 'Malaysia': 'MY', 'Thailand': 'TH', 'Vietnam': 'VN',
  'Philippines': 'PH', 'Spain': 'ES', 'Italy': 'IT', 'Portugal': 'PT',
  'Netherlands': 'NL', 'Belgium': 'BE', 'Denmark': 'DK', 'Sweden': 'SE',
  'Norway': 'NO', 'Finland': 'FI', 'Ireland': 'IE', 'Greece': 'GR',
  'Turkey': 'TR', 'Egypt': 'EG', 'South Africa': 'ZA', 'Nigeria': 'NG',
  'Kenya': 'KE', 'Saudi Arabia': 'SA', 'United Arab Emirates': 'AE',
  'Israel': 'IL', 'Pakistan': 'PK', 'Bangladesh': 'BD', 'Sri Lanka': 'LK',
  'New Zealand': 'NZ', 'Canada': 'CA', 'Mexico': 'MX', 'Colombia': 'CO',
  'Chile': 'CL', 'Argentina': 'AR', 'Peru': 'PE', 'Russia': 'RU',
  'Poland': 'PL', 'Romania': 'RO', 'Ukraine': 'UA', 'Malta': 'MT',
  'Cyprus': 'CY', 'Croatia': 'HR', 'Bulgaria': 'BG', 'Iceland': 'IS',
  'Oman': 'OM', 'Qatar': 'QA', 'Bahrain': 'BH', 'Kuwait': 'KW',
  'Jordan': 'JO', 'Iraq': 'IQ', 'Iran': 'IR', 'Yemen': 'YE',
  'Angola': 'AO', 'Ghana': 'GH', 'Cameroon': 'CM', 'Tanzania': 'TZ',
  'Mozambique': 'MZ', 'Madagascar': 'MG', 'Djibouti': 'DJ', 'Somalia': 'SO',
  'Tunisia': 'TN', 'Morocco': 'MA', 'Algeria': 'DZ', 'Libya': 'LY',
  'Guam': 'GU', 'Fiji': 'FJ', 'Tonga': 'TO', 'Samoa': 'WS',
  'Papua New Guinea': 'PG', 'Hong Kong': 'HK', 'Macao': 'MO',
  'Cambodia': 'KH', 'Myanmar': 'MM', 'Laos': 'LA', 'Mongolia': 'MN',
  'Maldives': 'MV', 'Seychelles': 'SC', 'Mauritius': 'MU',
  'Comoros': 'KM', 'Gabon': 'GA', 'Senegal': 'SN', 'Gambia': 'GM',
  'Guinea': 'GN', 'Sierra Leone': 'SL', 'Liberia': 'LR', 'Togo': 'TG',
  'Benin': 'BJ', 'Niger': 'NE', 'Chad': 'TD', 'Sudan': 'SD',
  'Ethiopia': 'ET', 'Eritrea': 'ER', 'Uganda': 'UG', 'Rwanda': 'RW',
  'Burundi': 'BI', 'Malawi': 'MW', 'Zambia': 'ZM', 'Zimbabwe': 'ZW',
  'Botswana': 'BW', 'Namibia': 'NA', 'Eswatini': 'SZ', 'Lesotho': 'LS',
  "Côte d'Ivoire": 'CI', 'Congo, Rep.': 'CG', 'Congo, Dem. Rep.': 'CD',
  'Equatorial Guinea': 'GQ', 'São Tomé and Príncipe': 'ST',
  'Cape Verde': 'CV', 'Mauritania': 'MR', 'Bermuda': 'BM',
  'Jamaica': 'JM', 'Trinidad and Tobago': 'TT', 'Barbados': 'BB',
  'Grenada': 'GD', 'Guadeloupe': 'GP', 'Martinique': 'MQ',
  'Dominican Republic': 'DO', 'Haiti': 'HT', 'Cuba': 'CU',
  'Puerto Rico': 'PR', 'Curacao': 'CW', 'Aruba': 'AW',
  'Panama': 'PA', 'Costa Rica': 'CR', 'Guatemala': 'GT',
  'Honduras': 'HN', 'Nicaragua': 'NI', 'El Salvador': 'SV',
  'Belize': 'BZ', 'Uruguay': 'UY', 'Paraguay': 'PY',
  'Ecuador': 'EC', 'Venezuela': 'VE', 'Bolivia': 'BO',
  'Guyana': 'GY', 'Suriname': 'SR', 'French Guiana': 'GF',
  'Northern Mariana Islands': 'MP', 'American Samoa': 'AS',
  'Marshall Islands': 'MH', 'Palau': 'PW', 'Micronesia': 'FM',
  'Kiribati': 'KI', 'Nauru': 'NR', 'Tuvalu': 'TV', 'Vanuatu': 'VU',
  'Solomon Islands': 'SB', 'New Caledonia': 'NC', 'French Polynesia': 'PF',
};

function countryToCode(country: string): string {
  if (!country) return 'XX';
  if (COUNTRY_MAP[country]) return COUNTRY_MAP[country];
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (country.includes(name)) return code;
  }
  return country.slice(0, 2).toUpperCase();
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── 核心主函数 ────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Deep Blue 完整数据导入 v3               ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ═══ 第1步：获取海缆ID列表 ═══
  console.log('[1/7] 下载海缆列表...');
  const cablesRes = await fetch(CABLE_ALL);
  const cablesList = await cablesRes.json() as any[];
  console.log(`  找到 ${cablesList.length} 条海缆\n`);

  // ═══ 第2步：获取GeoJSON路由数据 ═══
  console.log('[2/7] 下载GeoJSON路由数据...');
  const geoRes = await fetch(CABLE_GEO);
  const geoData = await geoRes.json();
  const geoMap = new Map<string, any>();
  for (const f of (geoData.features || [])) {
    geoMap.set(f.properties?.id, f.geometry);
  }
  console.log(`  找到 ${geoMap.size} 条路由\n`);

  // ═══ 第3步：获取登陆站坐标 ═══
  console.log('[3/7] 下载登陆站坐标数据...');
  const lpRes = await fetch(LP_GEO);
  const lpData = await lpRes.json();
  const lpCoords = new Map<string, { lat: number; lng: number }>();
  for (const f of (lpData.features || [])) {
    const id = f.properties?.id;
    const coords = f.geometry?.coordinates;
    if (id && coords) lpCoords.set(id, { lat: coords[1], lng: coords[0] });
  }
  console.log(`  找到 ${lpCoords.size} 个登陆站坐标\n`);

  // ═══ 第4步：快照当前数据库状态（在清空之前！）═══
  // 这是变化检测的关键：记录清空之前数据库里有什么，之后才能对比
  console.log('[4/7] 快照当前数据库状态...');
  const snapshot = await prisma.cable.findMany({
    select: {
      slug: true,
      name: true,
      status: true,
      lengthKm: true,
      _count: {
        select: {
          owners: true,        // 运营商数量变化
          landingStations: true, // 登陆站数量变化
        },
      },
    },
  });
  // 用 slug 作为 key 建立快照 Map，O(1) 查找
  const snapshotMap = new Map(snapshot.map(c => [c.slug, c]));
  console.log(`  快照了 ${snapshotMap.size} 条现有海缆\n`);

  // ═══ 第5步：清空旧数据 ═══
  console.log('[5/7] 清空旧数据...');
  await prisma.cableEvent.deleteMany();
  await prisma.countryEvent.deleteMany();
  await prisma.cableLandingStation.deleteMany();
  await prisma.cableOwnership.deleteMany();
  await prisma.riskScore.deleteMany();
  await prisma.event.deleteMany();
  await prisma.cable.deleteMany();
  await prisma.landingStation.deleteMany();
  await prisma.company.deleteMany();
  await prisma.country.deleteMany();
  console.log('  旧数据已清空\n');

  // ═══ 第6步：逐条获取海缆详情并导入 ═══
  console.log('[6/7] 逐条获取海缆详情并导入（这可能需要5-10分钟）...');
  const allCountries = new Set<string>();
  const allCompanies = new Map<string, string>();
  const allLandingStations = new Map<string, { name: string; country: string; lat: number; lng: number }>();
  const cableDetails: any[] = [];

  let fetchCount = 0;
  let failCount = 0;

  for (const cable of cablesList) {
    const id = cable.id;
    try {
      const detailRes = await fetch(`https://www.submarinecablemap.com/api/v3/cable/${id}.json`);
      if (!detailRes.ok) { failCount++; continue; }
      const detail = await detailRes.json();
      cableDetails.push({ ...detail, geoJson: geoMap.get(id) || null });

      if (detail.landing_points) {
        for (const lp of detail.landing_points) {
          const cc = countryToCode(lp.country || '');
          allCountries.add(cc);
          const coords = lpCoords.get(lp.id) || { lat: 0, lng: 0 };
          allLandingStations.set(lp.id, { name: lp.name || 'Unknown', country: cc, lat: coords.lat, lng: coords.lng });
        }
      }
      if (detail.owners) {
        for (const owner of String(detail.owners).split(',').map((s: string) => s.trim()).filter(Boolean)) {
          if (!allCompanies.has(owner)) allCompanies.set(owner, 'OPERATOR');
        }
      }
      if (detail.suppliers) {
        for (const supplier of String(detail.suppliers).split(',').map((s: string) => s.trim()).filter(Boolean)) {
          allCompanies.set(supplier, 'VENDOR');
        }
      }

      fetchCount++;
      if (fetchCount % 50 === 0) console.log(`  已获取 ${fetchCount} / ${cablesList.length} 条...`);
      await delay(50);
    } catch (e) {
      failCount++;
    }
  }
  console.log(`  详情获取完成: 成功 ${fetchCount}, 失败 ${failCount}\n`);

  // 写入国家
  console.log('[6/7] 写入数据库...');
  console.log('  写入国家...');
  for (const cc of allCountries) {
    try {
      await prisma.country.upsert({ where: { code: cc }, update: {}, create: { code: cc, nameEn: cc } });
    } catch {}
  }
  console.log(`  写入 ${allCountries.size} 个国家`);

  // 写入公司
  console.log('  写入公司...');
  const companyIdMap = new Map<string, string>();
  for (const [name, type] of allCompanies) {
    try {
      const company = await prisma.company.upsert({ where: { name }, update: {}, create: { name, type } });
      companyIdMap.set(name, company.id);
    } catch {}
  }
  console.log(`  写入 ${companyIdMap.size} 家公司`);

  // 写入登陆站
  console.log('  写入登陆站...');
  const stationIdMap = new Map<string, string>();
  for (const [lpId, info] of allLandingStations) {
    try {
      await prisma.country.upsert({ where: { code: info.country }, update: {}, create: { code: info.country, nameEn: info.country } });
      const station = await prisma.landingStation.upsert({
        where: { id: lpId },
        update: { name: info.name, latitude: info.lat, longitude: info.lng },
        create: { id: lpId, name: info.name, countryCode: info.country, latitude: info.lat, longitude: info.lng },
      });
      stationIdMap.set(lpId, station.id);
    } catch {}
  }
  console.log(`  写入 ${stationIdMap.size} 个登陆站`);

  // 写入海缆，同时收集新数据的快照用于对比
  console.log('  写入海缆及关联...');
  let cableCount = 0;

  // 新数据的状态快照：slug → { status, lengthKm, ownerCount, stationCount }
  // 写入过程中逐步填充，写完后才能和旧快照对比
  const newSnapshotMap = new Map<string, {
    name: string;
    status: string;
    lengthKm: number | null;
    ownerCount: number;
    stationCount: number;
  }>();

  for (const detail of cableDetails) {
    const id = detail.id;
    const name = detail.name || 'Unknown';
    const slug = slugify(name);
    const lengthKm = parseLength(detail.length);
    const rfsYear = detail.rfs_year || null;
    const rfsDate = rfsYear ? new Date(rfsYear, 0, 1) : null;

    let status = 'IN_SERVICE';
    if (detail.is_planned) status = 'PLANNED';
    else if (rfsDate && rfsDate > new Date()) status = 'UNDER_CONSTRUCTION';

    const supplierName = detail.suppliers ? String(detail.suppliers).split(',')[0].trim() : null;
    const vendorId = supplierName ? companyIdMap.get(supplierName) || null : null;

    // 统计本条海缆的运营商数量和登陆站数量（用于变化检测）
    const ownerNames = detail.owners
      ? String(detail.owners).split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    const stationCount = detail.landing_points ? detail.landing_points.length : 0;

    newSnapshotMap.set(slug, {
      name,
      status,
      lengthKm,
      ownerCount: ownerNames.length,
      stationCount,
    });

    try {
      const cable = await prisma.cable.upsert({
        where: { name },
        update: { status, lengthKm, rfsDate, routeGeojson: detail.geoJson, vendorId, notes: detail.notes || null },
        create: { id, name, slug, status, lengthKm, rfsDate, routeGeojson: detail.geoJson, vendorId, notes: detail.notes || null },
      });

      if (detail.landing_points) {
        for (const lp of detail.landing_points) {
          const stationId = stationIdMap.get(lp.id);
          if (stationId) {
            try {
              await prisma.cableLandingStation.upsert({
                where: { cableId_landingStationId: { cableId: cable.id, landingStationId: stationId } },
                update: {},
                create: { cableId: cable.id, landingStationId: stationId },
              });
            } catch {}
          }
        }
      }

      for (const ownerName of ownerNames) {
        const companyId = companyIdMap.get(ownerName);
        if (companyId) {
          try {
            await prisma.cableOwnership.upsert({
              where: { cableId_companyId: { cableId: cable.id, companyId } },
              update: {},
              create: { cableId: cable.id, companyId },
            });
          } catch {}
        }
      }

      cableCount++;
    } catch (e: any) {}
  }
  console.log(`  写入 ${cableCount} 条海缆（含关联）`);

  // ═══ 第7步：对比快照，生成变化记录 ═══
  console.log('\n[7/7] 对比变化...');
  const changes: CableChange[] = [];

  // 找出新增的海缆（新数据里有，旧快照里没有）
  for (const [slug, newData] of newSnapshotMap) {
    if (!snapshotMap.has(slug)) {
      changes.push({ type: 'NEW', slug, name: newData.name });
    }
  }

  // 找出已删除的海缆（旧快照里有，新数据里没有）
  for (const [slug, oldData] of snapshotMap) {
    if (!newSnapshotMap.has(slug)) {
      changes.push({ type: 'REMOVED', slug, name: oldData.name });
    }
  }

  // 找出字段发生变化的海缆
  for (const [slug, newData] of newSnapshotMap) {
    const old = snapshotMap.get(slug);
    if (!old) continue; // 新增的已经在上面处理了

    const changedFields: string[] = [];

    if (old.status !== newData.status) changedFields.push('status');

    // 长度变化超过 50km 才算变化（容忍小的数据精度差异）
    const oldLen = old.lengthKm ?? 0;
    const newLen = newData.lengthKm ?? 0;
    if (Math.abs(oldLen - newLen) > 50) changedFields.push('length');

    if (old._count.owners !== newData.ownerCount) changedFields.push('owners');
    if (old._count.landingStations !== newData.stationCount) changedFields.push('landingStations');

    if (changedFields.length > 0) {
      changes.push({ type: 'UPDATED', slug, name: newData.name, changedFields });
    }
  }

  const summary = {
    newCount: changes.filter(c => c.type === 'NEW').length,
    updatedCount: changes.filter(c => c.type === 'UPDATED').length,
    removedCount: changes.filter(c => c.type === 'REMOVED').length,
  };

  console.log(`  新增: ${summary.newCount} 条 | 更新: ${summary.updatedCount} 条 | 删除: ${summary.removedCount} 条`);

  // 将变化记录写入 Redis，供前端读取
  // TTL 7天——即使下次导入没有变化，记录也会保留一周供用户查看历史
  if (redis && changes.length > 0) {
    const changeLog: ChangeLog = {
      importedAt: new Date().toISOString(),
      totalCables: cableCount,
      changes,
      summary,
    };
    try {
      await redis.set('changes:latest', changeLog, { ex: 60 * 60 * 24 * 7 });
      console.log(`  变化记录已写入 Redis (TTL 7天)`);
    } catch (e) {
      console.warn('  写入 Redis 失败（不影响主流程）:', e);
    }
  } else if (changes.length === 0) {
    console.log('  数据无变化，无需写入变化记录');
  }

  // ═══ 完成 ═══
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  导入完成！                               ║`);
  console.log(`║  海缆:    ${String(cableCount).padStart(5)} 条                      ║`);
  console.log(`║  登陆站:  ${String(stationIdMap.size).padStart(5)} 个                      ║`);
  console.log(`║  公司:    ${String(companyIdMap.size).padStart(5)} 家                      ║`);
  console.log(`║  国家:    ${String(allCountries.size).padStart(5)} 个                      ║`);
  console.log('╚══════════════════════════════════════════╝');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('导入失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

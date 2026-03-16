// scripts/import-full.ts
// Deep Blue 完整数据导入脚本 v2
// 逐条查询每条海缆的详情API，导入所有字段和关联关系
// 运行方式: npx tsx scripts/import-full.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CABLE_ALL = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const CABLE_GEO = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LP_GEO = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';

// 工具函数：名称转slug
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

// 工具函数：解析长度字符串（如 "45,000 km" → 45000）
function parseLength(len: string | null | undefined): number | null {
  if (!len) return null;
  const num = String(len).replace(/[^0-9.]/g, '');
  return num ? parseFloat(num) : null;
}

// 工具函数：从国家全名提取2字母国家代码
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
  // 先查精确匹配
  if (COUNTRY_MAP[country]) return COUNTRY_MAP[country];
  // 模糊匹配（处理 "Tinian, Northern Mariana Islands" 这种格式）
  for (const [name, code] of Object.entries(COUNTRY_MAP)) {
    if (country.includes(name)) return code;
  }
  // 取前两个字母作为兜底
  return country.slice(0, 2).toUpperCase();
}

// 延迟函数（避免请求太快被API拒绝）
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Deep Blue 完整数据导入 v2               ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ═══ 第1步：获取海缆ID列表 ═══
  console.log('[1/6] 下载海缆列表...');
  const cablesRes = await fetch(CABLE_ALL);
  const cablesList = await cablesRes.json() as any[];
  console.log(`  找到 ${cablesList.length} 条海缆\n`);

  // ═══ 第2步：获取GeoJSON路由数据 ═══
  console.log('[2/6] 下载GeoJSON路由数据...');
  const geoRes = await fetch(CABLE_GEO);
  const geoData = await geoRes.json();
  const geoMap = new Map<string, any>();
  for (const f of (geoData.features || [])) {
    geoMap.set(f.properties?.id, f.geometry);
  }
  console.log(`  找到 ${geoMap.size} 条路由\n`);

  // ═══ 第3步：获取登陆站坐标（用于经纬度） ═══
  console.log('[3/6] 下载登陆站坐标数据...');
  const lpRes = await fetch(LP_GEO);
  const lpData = await lpRes.json();
  const lpCoords = new Map<string, { lat: number; lng: number }>();
  for (const f of (lpData.features || [])) {
    const id = f.properties?.id;
    const coords = f.geometry?.coordinates;
    if (id && coords) {
      lpCoords.set(id, { lat: coords[1], lng: coords[0] });
    }
  }
  console.log(`  找到 ${lpCoords.size} 个登陆站坐标\n`);

  // ═══ 第4步：清空旧数据（重新导入） ═══
  console.log('[4/6] 清空旧数据...');
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

  // ═══ 第5步：逐条获取海缆详情并导入 ═══
  console.log('[5/6] 逐条获取海缆详情并导入（这可能需要5-10分钟）...');
  const allCountries = new Set<string>();
  const allCompanies = new Map<string, string>(); // name → type
  const allLandingStations = new Map<string, { name: string; country: string; lat: number; lng: number }>();
  const cableDetails: any[] = [];

  let fetchCount = 0;
  let failCount = 0;

  for (const cable of cablesList) {
    const id = cable.id;
    try {
      const detailRes = await fetch(`https://www.submarinecablemap.com/api/v3/cable/${id}.json`);
      if (!detailRes.ok) {
        failCount++;
        continue;
      }
      const detail = await detailRes.json();
      cableDetails.push({ ...detail, geoJson: geoMap.get(id) || null });

      // 收集登陆站
      if (detail.landing_points) {
        for (const lp of detail.landing_points) {
          const cc = countryToCode(lp.country || '');
          allCountries.add(cc);
          const coords = lpCoords.get(lp.id) || { lat: 0, lng: 0 };
          allLandingStations.set(lp.id, {
            name: lp.name || 'Unknown',
            country: cc,
            lat: coords.lat,
            lng: coords.lng,
          });
        }
      }

      // 收集运营商
      if (detail.owners) {
        for (const owner of String(detail.owners).split(',').map((s: string) => s.trim()).filter(Boolean)) {
          if (!allCompanies.has(owner)) allCompanies.set(owner, 'OPERATOR');
        }
      }

      // 收集建造商
      if (detail.suppliers) {
        for (const supplier of String(detail.suppliers).split(',').map((s: string) => s.trim()).filter(Boolean)) {
          allCompanies.set(supplier, 'VENDOR');
        }
      }

      fetchCount++;
      // 每50条打印一次进度
      if (fetchCount % 50 === 0) {
        console.log(`  已获取 ${fetchCount} / ${cablesList.length} 条...`);
      }

      // 每个请求间隔50ms，避免触发速率限制
      await delay(50);
    } catch (e) {
      failCount++;
    }
  }
  console.log(`  详情获取完成: 成功 ${fetchCount}, 失败 ${failCount}\n`);

  // ═══ 第6步：批量写入数据库 ═══
  console.log('[6/6] 写入数据库...');

  // 6a. 写入国家
  console.log('  写入国家...');
  for (const cc of allCountries) {
    try {
      await prisma.country.upsert({
        where: { code: cc },
        update: {},
        create: { code: cc, nameEn: cc },
      });
    } catch {}
  }
  console.log(`  写入 ${allCountries.size} 个国家`);

  // 6b. 写入公司
  console.log('  写入公司...');
  const companyIdMap = new Map<string, string>();
  for (const [name, type] of allCompanies) {
    try {
      const company = await prisma.company.upsert({
        where: { name },
        update: {},
        create: { name, type },
      });
      companyIdMap.set(name, company.id);
    } catch {}
  }
  console.log(`  写入 ${companyIdMap.size} 家公司`);

  // 6c. 写入登陆站
  console.log('  写入登陆站...');
  const stationIdMap = new Map<string, string>();
  for (const [lpId, info] of allLandingStations) {
    try {
      // 确保country存在
      await prisma.country.upsert({
        where: { code: info.country },
        update: {},
        create: { code: info.country, nameEn: info.country },
      });
      const station = await prisma.landingStation.upsert({
        where: { id: lpId },
        update: { name: info.name, latitude: info.lat, longitude: info.lng },
        create: {
          id: lpId,
          name: info.name,
          countryCode: info.country,
          latitude: info.lat,
          longitude: info.lng,
        },
      });
      stationIdMap.set(lpId, station.id);
    } catch {}
  }
  console.log(`  写入 ${stationIdMap.size} 个登陆站`);

  // 6d. 写入海缆 + 关联
  console.log('  写入海缆及关联...');
  let cableCount = 0;
  for (const detail of cableDetails) {
    const id = detail.id;
    const name = detail.name || 'Unknown';
    const slug = slugify(name);
    const lengthKm = parseLength(detail.length);
    const rfsYear = detail.rfs_year || null;
    const rfsDate = rfsYear ? new Date(rfsYear, 0, 1) : null;

    // 判断状态
    let status = 'IN_SERVICE';
    if (detail.is_planned) {
      status = 'PLANNED';
    } else if (rfsDate && rfsDate > new Date()) {
      status = 'UNDER_CONSTRUCTION';
    }

    // 找到建造商ID
    const supplierName = detail.suppliers ? String(detail.suppliers).split(',')[0].trim() : null;
    const vendorId = supplierName ? companyIdMap.get(supplierName) || null : null;

    try {
      const cable = await prisma.cable.upsert({
        where: { name },
        update: {
          status,
          lengthKm,
          rfsDate,
          routeGeojson: detail.geoJson,
          vendorId,
          notes: detail.notes || null,
        },
        create: {
          id,
          name,
          slug,
          status,
          lengthKm,
          rfsDate,
          routeGeojson: detail.geoJson,
          vendorId,
          notes: detail.notes || null,
        },
      });

      // 关联登陆站
      if (detail.landing_points) {
        for (const lp of detail.landing_points) {
          const stationId = stationIdMap.get(lp.id);
          if (stationId) {
            try {
              await prisma.cableLandingStation.upsert({
                where: {
                  cableId_landingStationId: { cableId: cable.id, landingStationId: stationId },
                },
                update: {},
                create: { cableId: cable.id, landingStationId: stationId },
              });
            } catch {}
          }
        }
      }

      // 关联运营商
      if (detail.owners) {
        const ownerNames = String(detail.owners).split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const ownerName of ownerNames) {
          const companyId = companyIdMap.get(ownerName);
          if (companyId) {
            try {
              await prisma.cableOwnership.upsert({
                where: {
                  cableId_companyId: { cableId: cable.id, companyId },
                },
                update: {},
                create: { cableId: cable.id, companyId },
              });
            } catch {}
          }
        }
      }

      cableCount++;
    } catch (e: any) {
      // slug冲突等跳过
    }
  }
  console.log(`  写入 ${cableCount} 条海缆（含关联）`);

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

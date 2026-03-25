/**
 * fix-sn-stations.ts — v2（已核实数据）
 * 
 * 数据来源：
 * - ICN1: fiberatlantic.com (GiDB)
 * - MCT: submarinenetworks.com
 * - MENA: fiberatlantic.com (GiDB)
 * - NCP: fiberatlantic.com (GiDB)
 * - PC-1: fiberatlantic.com (GiDB)
 * - SJC2: TeleGeography
 * - TGA: submarinenetworks.com
 * - TW1: fiberatlantic.com (GiDB)
 * 
 * 用法：
 *   DRY_RUN:  npx tsx scripts/fix-sn-stations.ts
 *   EXECUTE:  EXECUTE=true npx tsx scripts/fix-sn-stations.ts
 */

import { PrismaClient } from '@prisma/client';

const EXECUTE = process.env.EXECUTE === 'true';
const prisma = new PrismaClient();

interface StationFix {
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
}

interface CableFix {
  cableId: string;
  cableName: string;
  source: string;
  stations: StationFix[];
}

const CORRECTIONS: CableFix[] = [
  {
    cableId: 'sn-icn1',
    cableName: 'ICN1',
    source: 'fiberatlantic.com (GiDB)',
    stations: [
      { name: 'Port Vila, Vanuatu', countryCode: 'VU', lat: -17.73, lon: 168.32 },
      { name: 'Suva, Fiji', countryCode: 'FJ', lat: -18.14, lon: 178.44 },
    ],
  },
  {
    cableId: 'sn-mct',
    cableName: 'MCT',
    source: 'submarinenetworks.com',
    stations: [
      { name: 'Sihanoukville, Cambodia', countryCode: 'KH', lat: 10.63, lon: 103.50 },
      { name: 'Cherating, Malaysia', countryCode: 'MY', lat: 4.13, lon: 103.39 },
      { name: 'Rayong, Thailand', countryCode: 'TH', lat: 12.68, lon: 101.28 },
    ],
  },
  {
    cableId: 'sn-mena',
    cableName: 'MENA',
    source: 'fiberatlantic.com (GiDB)',
    stations: [
      { name: 'Abu Talat, Egypt', countryCode: 'EG', lat: 31.10, lon: 29.78 },
      { name: 'Al Seeb, Oman', countryCode: 'OM', lat: 23.68, lon: 58.19 },
      { name: 'Djibouti City, Djibouti', countryCode: 'DJ', lat: 11.59, lon: 43.15 },
      { name: 'Jeddah, Saudi Arabia', countryCode: 'SA', lat: 21.49, lon: 39.19 },
      { name: 'Mazara del Vallo, Italy', countryCode: 'IT', lat: 37.65, lon: 12.59 },
      { name: 'Zafarana, Egypt', countryCode: 'EG', lat: 29.12, lon: 32.65 },
    ],
  },
  {
    cableId: 'sn-ncp',
    cableName: 'NCP',
    source: 'fiberatlantic.com (GiDB)',
    stations: [
      { name: 'Chongming, China', countryCode: 'CN', lat: 31.62, lon: 121.73 },
      { name: 'Lingang, China', countryCode: 'CN', lat: 30.89, lon: 121.93 },
      { name: 'Maruyama, Japan', countryCode: 'JP', lat: 33.47, lon: 135.89 },
      { name: 'Nanhui, China', countryCode: 'CN', lat: 30.95, lon: 121.87 },
      { name: 'Pacific City, Oregon, United States', countryCode: 'US', lat: 45.20, lon: -123.96 },
      { name: 'Pusan, South Korea', countryCode: 'KR', lat: 35.10, lon: 129.04 },
      { name: 'Toucheng, Taiwan', countryCode: 'TW', lat: 24.85, lon: 121.83 },
    ],
  },
  {
    cableId: 'sn-pc-1',
    cableName: 'PC-1',
    source: 'fiberatlantic.com (GiDB)',
    stations: [
      { name: 'Ajigaura, Japan', countryCode: 'JP', lat: 36.38, lon: 140.61 },
      { name: 'Shima, Japan', countryCode: 'JP', lat: 34.34, lon: 136.82 },
      { name: 'Grover Beach, California, USA', countryCode: 'US', lat: 35.12, lon: -120.62 },
      { name: 'Harbour Pointe, Washington, USA', countryCode: 'US', lat: 48.07, lon: -122.19 },
    ],
  },
  {
    cableId: 'sn-sjc2',
    cableName: 'SJC2',
    source: 'TeleGeography submarinecablemap.com',
    stations: [
      { name: 'Chung Hom Kok, China', countryCode: 'HK', lat: 22.21, lon: 114.20 },
      { name: 'Lingang, China', countryCode: 'CN', lat: 30.89, lon: 121.93 },
      { name: 'Chikura, Japan', countryCode: 'JP', lat: 34.92, lon: 139.96 },
      { name: 'Shima, Japan', countryCode: 'JP', lat: 34.34, lon: 136.82 },
      { name: 'Changi South, Singapore', countryCode: 'SG', lat: 1.33, lon: 103.98 },
      { name: 'Busan, South Korea', countryCode: 'KR', lat: 35.10, lon: 129.04 },
      { name: 'Fangshan, Taiwan', countryCode: 'TW', lat: 22.23, lon: 120.63 },
      { name: 'Tanshui, Taiwan', countryCode: 'TW', lat: 25.17, lon: 121.44 },
      { name: 'Songkhla, Thailand', countryCode: 'TH', lat: 7.19, lon: 100.60 },
      { name: 'Quy Nhon, Vietnam', countryCode: 'VN', lat: 13.76, lon: 109.22 },
    ],
  },
  {
    cableId: 'sn-tga',
    cableName: 'TGA',
    source: 'submarinenetworks.com',
    stations: [
      { name: 'Raglan, New Zealand', countryCode: 'NZ', lat: -37.80, lon: 174.88 },
      { name: 'Oxford Falls, Australia', countryCode: 'AU', lat: -33.73, lon: 151.25 },
    ],
  },
  {
    cableId: 'sn-tw1',
    cableName: 'TW1',
    source: 'fiberatlantic.com (GiDB)',
    stations: [
      { name: 'Al Seeb, Oman', countryCode: 'OM', lat: 23.68, lon: 58.19 },
      { name: 'Fujairah, UAE', countryCode: 'AE', lat: 25.13, lon: 56.34 },
      { name: 'Karachi, Pakistan', countryCode: 'PK', lat: 24.85, lon: 66.99 },
    ],
  },
];

function slugify(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[SN 登陆站修复 v2] ${EXECUTE ? '🔥 EXECUTE MODE' : '👀 DRY RUN MODE'}`);
  console.log(`${'='.repeat(60)}\n`);

  let totalRemoved = 0;
  let totalAdded = 0;

  for (const fix of CORRECTIONS) {
    console.log(`\n[${fix.cableName}] (${fix.cableId})`);
    console.log(`  来源: ${fix.source}`);

    let cableId = fix.cableId;
    const cable = await prisma.cable.findUnique({ where: { id: cableId } });
    if (!cable) {
      const byName = await prisma.cable.findFirst({
        where: { name: fix.cableName, mergedInto: null },
      });
      if (!byName) { console.log(`  ⚠ 海缆不存在，跳过`); continue; }
      console.log(`  ℹ ID 不匹配，用名称找到: ${byName.id}`);
      cableId = byName.id;
    }

    const currentStations = await prisma.$queryRawUnsafe(`
      SELECT cls.landing_station_id, ls.name, ls.latitude, ls.longitude
      FROM cable_landing_stations cls
      JOIN landing_stations ls ON cls.landing_station_id = ls.id
      WHERE cls.cable_id = $1
    `, cableId) as any[];

    console.log(`  当前: ${currentStations.length} 个站`);
    for (const s of currentStations) {
      const lat = s.latitude ? parseFloat(s.latitude).toFixed(2) : 'NULL';
      const lon = s.longitude ? parseFloat(s.longitude).toFixed(2) : 'NULL';
      console.log(`    ✗ "${s.name}" → ${lat}, ${lon}`);
    }

    console.log(`  修正: ${fix.stations.length} 个站`);
    for (const s of fix.stations) {
      console.log(`    ✓ "${s.name}" (${s.countryCode}) → ${s.lat}, ${s.lon}`);
    }

    if (EXECUTE) {
      await prisma.cableLandingStation.deleteMany({ where: { cableId } });
      totalRemoved += currentStations.length;

      for (const station of fix.stations) {
        const stationId = `sn-${slugify(station.name)}-${station.countryCode.toLowerCase()}`;

        await prisma.country.upsert({
          where: { code: station.countryCode },
          update: {},
          create: { code: station.countryCode, nameEn: station.countryCode },
        }).catch(() => {});

        await prisma.landingStation.upsert({
          where: { id: stationId },
          update: { name: station.name, countryCode: station.countryCode, latitude: station.lat, longitude: station.lon },
          create: { id: stationId, name: station.name, countryCode: station.countryCode, latitude: station.lat, longitude: station.lon },
        });

        await prisma.cableLandingStation.upsert({
          where: { cableId_landingStationId: { cableId, landingStationId: stationId } },
          update: {},
          create: { cableId, landingStationId: stationId },
        });

        totalAdded++;
      }

      await prisma.$executeRawUnsafe(
        `UPDATE cables SET route_geojson = NULL, is_approximate_route = FALSE WHERE id = $1`,
        cableId
      );

      await prisma.cable.update({
        where: { id: cableId },
        data: { reviewStatus: 'STATIONS_VERIFIED' },
      });

      console.log(`  ✅ 已修复 + 标记 STATIONS_VERIFIED`);
    } else {
      console.log(`  📝 [DRY RUN]`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[SN 登陆站修复 v2] 完成`);
  console.log(`  处理海缆: ${CORRECTIONS.length} 条`);
  if (EXECUTE) {
    console.log(`  删除旧站: ${totalRemoved} 个`);
    console.log(`  新增正确站: ${totalAdded} 个`);
  }
  console.log(`  模式: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch(err => { console.error('修复失败:', err); process.exit(1); });

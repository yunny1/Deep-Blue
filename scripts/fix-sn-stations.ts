/**
 * fix-sn-stations.ts
 * 
 * 一次性脚本：修复 SN 解析器产生的垃圾登陆站数据
 * 
 * 问题：SN 解析器从页面提取登陆站时，把国家名称（如 "Australia"、"Egypt"）
 *        当作登陆站名称入库，坐标是国家中心点（内陆），导致路由穿越陆地。
 * 
 * 修复：用公开资料（Wikipedia、TeleGeography、SubmarineNetworks）核实后，
 *        替换为正确的海岸城市登陆站，使用海岸线坐标。
 * 
 * 安全机制：
 * - 默认 DRY_RUN，只打印会做的修改
 * - EXECUTE=true 时才写入数据库
 * - 修复后自动清除并重新生成近似路由
 * 
 * 用法：
 *   DRY_RUN:  npx tsx scripts/fix-sn-stations.ts
 *   EXECUTE:  EXECUTE=true npx tsx scripts/fix-sn-stations.ts
 * 
 * 路径：scripts/fix-sn-stations.ts
 */

import { PrismaClient } from '@prisma/client';

const EXECUTE = process.env.EXECUTE === 'true';
const prisma = new PrismaClient();

// ============================================================
// 修正表：每条海缆的正确登陆站
// 来源：Wikipedia, TeleGeography, SubmarineNetworks 公开页面
// 坐标均为海岸城市，确保路由不穿越内陆
// ============================================================

interface StationFix {
  name: string;
  countryCode: string;
  lat: number;
  lon: number;
}

interface CableFix {
  cableId: string;
  cableName: string;
  source: string;  // 数据来源说明
  stations: StationFix[];
}

const CORRECTIONS: CableFix[] = [
  {
    cableId: 'sn-icn1',
    cableName: 'ICN1',
    source: 'Wikipedia: Interchange Cable Network',
    stations: [
      { name: 'Tamarama, Sydney', countryCode: 'AU', lat: -33.90, lon: 151.27 },
      { name: 'Mangawhai, New Zealand', countryCode: 'NZ', lat: -36.13, lon: 174.57 },
    ],
  },
  {
    cableId: 'sn-mct',
    cableName: 'MCT',
    source: 'SubmarineNetworks: Malaysia-Cambodia-Thailand Cable',
    stations: [
      { name: 'Sihanoukville, Cambodia', countryCode: 'KH', lat: 10.63, lon: 103.50 },
      { name: 'Cherating, Malaysia', countryCode: 'MY', lat: 4.13, lon: 103.39 },
      { name: 'Rayong, Thailand', countryCode: 'TH', lat: 12.68, lon: 101.28 },
    ],
  },
  {
    cableId: 'sn-mena-submarine-cable',
    cableName: 'MENA',
    source: 'SubmarineNetworks: MENA Submarine Cable System',
    stations: [
      { name: 'Abu Talat, Egypt', countryCode: 'EG', lat: 31.10, lon: 29.78 },
      { name: 'Mazara del Vallo, Italy', countryCode: 'IT', lat: 37.65, lon: 12.59 },
      { name: 'Barka, Oman', countryCode: 'OM', lat: 23.68, lon: 57.88 },
      { name: 'Jeddah, Saudi Arabia', countryCode: 'SA', lat: 21.49, lon: 39.19 },
    ],
  },
  {
    cableId: 'sn-ncp',
    cableName: 'NCP',
    source: 'SubmarineNetworks: New Cross Pacific Cable / North-East Asia Cable',
    stations: [
      { name: 'Chikura, Japan', countryCode: 'JP', lat: 34.92, lon: 139.96 },
      { name: 'Geoje, South Korea', countryCode: 'KR', lat: 34.88, lon: 128.62 },
      { name: 'Toucheng, Taiwan', countryCode: 'TW', lat: 24.85, lon: 121.83 },
    ],
  },
  {
    cableId: 'sn-pc-1',
    cableName: 'PC-1',
    source: 'Wikipedia: Pacific Crossing-1',
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
    source: 'SubmarineNetworks: SJC2 (Southeast Asia-Japan Cable 2)',
    stations: [
      { name: 'Sihanoukville, Cambodia', countryCode: 'KH', lat: 10.63, lon: 103.50 },
      { name: 'Sattahip, Thailand', countryCode: 'TH', lat: 12.67, lon: 100.88 },
      { name: 'Quy Nhon, Vietnam', countryCode: 'VN', lat: 13.76, lon: 109.22 },
      { name: 'Changi, Singapore', countryCode: 'SG', lat: 1.33, lon: 103.98 },
      { name: 'Chung Hom Kok, Hong Kong', countryCode: 'HK', lat: 22.21, lon: 114.20 },
      { name: 'Maruyama, Japan', countryCode: 'JP', lat: 33.47, lon: 135.89 },
      { name: 'Toucheng, Taiwan', countryCode: 'TW', lat: 24.85, lon: 121.83 },
      { name: 'Geoje, South Korea', countryCode: 'KR', lat: 34.88, lon: 128.62 },
    ],
  },
  {
    cableId: 'sn-tga',
    cableName: 'TGA',
    source: 'SubmarineNetworks: Tasman Global Access',
    stations: [
      { name: 'Narara, Sydney, Australia', countryCode: 'AU', lat: -33.39, lon: 151.34 },
      { name: 'Whenuapai, Auckland, New Zealand', countryCode: 'NZ', lat: -36.79, lon: 174.63 },
    ],
  },
  {
    cableId: 'sn-tw1',
    cableName: 'TW1',
    source: 'SubmarineNetworks: TW1 Cable System',
    stations: [
      { name: 'Barka, Oman', countryCode: 'OM', lat: 23.68, lon: 57.88 },
      { name: 'Karachi, Pakistan', countryCode: 'PK', lat: 24.85, lon: 66.99 },
      { name: 'Fujairah, UAE', countryCode: 'AE', lat: 25.13, lon: 56.34 },
    ],
  },
];

// ============================================================
// 主逻辑
// ============================================================

function slugify(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[SN 登陆站修复] ${EXECUTE ? '🔥 EXECUTE MODE' : '👀 DRY RUN MODE'}`);
  console.log(`${'='.repeat(60)}\n`);

  let totalRemoved = 0;
  let totalAdded = 0;

  for (const fix of CORRECTIONS) {
    console.log(`\n[${fix.cableName}] (${fix.cableId})`);
    console.log(`  来源: ${fix.source}`);

    // 确认海缆存在
    const cable = await prisma.cable.findUnique({ where: { id: fix.cableId } });
    if (!cable) {
      // 尝试用名称查找
      const byName = await prisma.cable.findFirst({
        where: { name: fix.cableName, mergedInto: null },
      });
      if (!byName) {
        console.log(`  ⚠ 海缆不存在，跳过`);
        continue;
      }
      console.log(`  ℹ ID 不匹配，用名称找到: ${byName.id}`);
      fix.cableId = byName.id;
    }

    // 获取当前登陆站
    const currentStations = await prisma.$queryRawUnsafe(`
      SELECT cls.landing_station_id, ls.name, ls.latitude, ls.longitude
      FROM cable_landing_stations cls
      JOIN landing_stations ls ON cls.landing_station_id = ls.id
      WHERE cls.cable_id = $1
    `, fix.cableId) as any[];

    console.log(`  当前: ${currentStations.length} 个站`);
    for (const s of currentStations) {
      const lat = s.latitude ? parseFloat(s.latitude).toFixed(2) : 'NULL';
      const lon = s.longitude ? parseFloat(s.longitude).toFixed(2) : 'NULL';
      console.log(`    ✗ "${s.name}" → ${lat}, ${lon} (将删除)`);
    }

    console.log(`  修正: ${fix.stations.length} 个站`);
    for (const s of fix.stations) {
      console.log(`    ✓ "${s.name}" (${s.countryCode}) → ${s.lat}, ${s.lon}`);
    }

    if (EXECUTE) {
      // 1. 删除旧的关联
      await prisma.cableLandingStation.deleteMany({ where: { cableId: fix.cableId } });
      totalRemoved += currentStations.length;

      // 2. 创建新的登陆站并关联
      for (const station of fix.stations) {
        const stationId = `sn-${slugify(station.name)}-${station.countryCode.toLowerCase()}`;

        // 确保国家存在
        await prisma.country.upsert({
          where: { code: station.countryCode },
          update: {},
          create: { code: station.countryCode, nameEn: station.countryCode },
        }).catch(() => {});

        // 创建或更新登陆站（用正确的海岸坐标）
        await prisma.landingStation.upsert({
          where: { id: stationId },
          update: {
            name: station.name,
            countryCode: station.countryCode,
            latitude: station.lat,
            longitude: station.lon,
          },
          create: {
            id: stationId,
            name: station.name,
            countryCode: station.countryCode,
            latitude: station.lat,
            longitude: station.lon,
          },
        });

        // 关联到海缆
        await prisma.cableLandingStation.upsert({
          where: {
            cableId_landingStationId: {
              cableId: fix.cableId,
              landingStationId: stationId,
            },
          },
          update: {},
          create: {
            cableId: fix.cableId,
            landingStationId: stationId,
          },
        });

        totalAdded++;
      }

      // 3. 清除该海缆的近似路由（需要用新站点重新生成）
      await prisma.$executeRawUnsafe(
        `UPDATE cables SET route_geojson = NULL, is_approximate_route = FALSE WHERE id = $1`,
        fix.cableId
      );

      console.log(`  ✅ 已修复`);
    } else {
      console.log(`  📝 [DRY RUN]`);
    }
  }

  // 汇总
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[SN 登陆站修复] 完成`);
  console.log(`  处理海缆: ${CORRECTIONS.length} 条`);
  if (EXECUTE) {
    console.log(`  删除旧站: ${totalRemoved} 个`);
    console.log(`  新增正确站: ${totalAdded} 个`);
    console.log(`  近似路由已清除，需要重新运行 generate-approximate-routes.ts`);
  }
  console.log(`  模式: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`${'='.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('修复失败:', err);
  process.exit(1);
});

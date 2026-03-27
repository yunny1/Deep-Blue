// scripts/import-data.ts
// 海缆数据导入脚本 —— 从TeleGeography获取全球海缆+登陆站数据

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// TeleGeography 公开API地址
const CABLE_ALL = 'https://www.submarinecablemap.com/api/v3/cable/all.json';
const CABLE_GEO = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
const LP_GEO = 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';

// 将名称转换为URL友好的格式（例如 "PEACE Cable" → "peace-cable"）
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 200);
}

async function main() {
  console.log('=== Deep Blue 数据导入开始 ===');
  console.log();

  // 第一步：下载数据
  console.log('[1/4] 下载海缆属性数据...');
  const cablesRes = await fetch(CABLE_ALL);
  const cablesData = await cablesRes.json() as any[];
  console.log(`  获取到 ${cablesData.length} 条海缆`);

  console.log('[2/4] 下载海缆GeoJSON路由...');
  const geoRes = await fetch(CABLE_GEO);
  const geoData = await geoRes.json();
  const geoMap = new Map<string, any>();
  for (const f of geoData.features || []) {
    geoMap.set(f.properties?.id, f.geometry);
  }
  console.log(`  获取到 ${geoMap.size} 条路由`);

  console.log('[3/4] 下载登陆站数据...');
  const lpRes = await fetch(LP_GEO);
  const lpData = await lpRes.json();
  const lpFeatures = lpData.features || [];
  console.log(`  获取到 ${lpFeatures.length} 个登陆站`);

  // 第二步：导入海缆
  console.log('[4/4] 正在导入数据库...');
  let cableCount = 0;
  for (const cable of cablesData) {
    const id = String(cable.id || cable.cable_id || '');
    const name = cable.name || 'Unknown';
    const slug = slugify(name);
    if (!id || !name) continue;

    // 判断状态
    let status = 'IN_SERVICE';
    if (cable.is_planned) status = 'PLANNED';

    // 解析长度（可能是字符串如 "12,000 km"）
    let lengthKm: number | null = null;
    if (cable.length) {
      const num = String(cable.length).replace(/[^0-9.]/g, '');
      if (num) lengthKm = parseFloat(num);
    }

    // 获取GeoJSON路由
    const geo = geoMap.get(id) || null;

    try {
      await prisma.cable.upsert({
        where: { name },
        update: { status, lengthKm, ...(!existing?.isApproximateRoute ? { routeGeojson: geo } : {}) },
        create: { id, name, slug, status, lengthKm, routeGeojson: geo },
      });
      cableCount++;
    } catch (e: any) {
      // 跳过重复slug等错误
    }
  }
  console.log(`  导入海缆: ${cableCount} 条`);

  // 第三步：创建国家记录（从登陆站数据中提取）
  const countryCodes = new Set<string>();
  for (const f of lpFeatures) {
    const cc = (f.properties?.country || 'XX').slice(0, 2).toUpperCase();
    countryCodes.add(cc);
  }
  for (const cc of countryCodes) {
    try {
      await prisma.country.upsert({
        where: { code: cc },
        update: {},
        create: { code: cc, nameEn: cc },
      });
    } catch {}
  }

  // 第四步：导入登陆站
  let lpCount = 0;
  for (const f of lpFeatures) {
    const props = f.properties || {};
    const coords = f.geometry?.coordinates || [0, 0];
    const cc = (props.country || 'XX').slice(0, 2).toUpperCase();
    try {
      await prisma.landingStation.upsert({
        where: { id: String(props.id || props.name) },
        update: { latitude: coords[1], longitude: coords[0] },
        create: {
          id: String(props.id || props.name),
          name: props.name || 'Unknown',
          countryCode: cc,
          latitude: coords[1],
          longitude: coords[0],
        },
      });
      lpCount++;
    } catch {}
  }
  console.log(`  导入登陆站: ${lpCount} 个`);

  console.log();
  console.log('=== 导入完成！ ===');
  console.log(`海缆: ${cableCount} 条 | 登陆站: ${lpCount} 个`);
  await prisma.$disconnect();
}

main().catch(console.error);

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // 全景统计
  const total = await p.cable.count({ where: { mergedInto: null, status: { notIn: ['REMOVED'] } } });
  const merged = await p.cable.count({ where: { NOT: { mergedInto: null } } });
  const byStatus: any[] = await p.$queryRawUnsafe(`
    SELECT status, COUNT(*)::int as count FROM cables 
    WHERE merged_into IS NULL AND status NOT IN ('REMOVED') 
    GROUP BY status ORDER BY count DESC
  `);
  const bySource: any[] = await p.$queryRawUnsafe(`
    SELECT COALESCE(data_source,'UNKNOWN') as src, COUNT(*)::int as count FROM cables 
    WHERE merged_into IS NULL AND status NOT IN ('REMOVED') 
    GROUP BY data_source ORDER BY count DESC
  `);
  const withStations = await p.cable.count({
    where: { mergedInto: null, status: { notIn: ['REMOVED'] }, landingStations: { some: {} } }
  });
  const zeroStations = total - withStations;
  const has16600 = await p.cable.count({
    where: { mergedInto: null, status: { notIn: ['REMOVED'] }, lengthKm: 16600 }
  });

  console.log('=== 全景统计 ===\n');
  console.log('活跃海缆: ' + total);
  console.log('已合并(去重): ' + merged);
  console.log('有登陆站: ' + withStations + ' (' + Math.round(withStations/total*100) + '%)');
  console.log('零登陆站: ' + zeroStations + ' (' + Math.round(zeroStations/total*100) + '%)');
  console.log('16600km假值: ' + has16600);
  console.log('\n状态分布:');
  for (const r of byStatus) console.log('  ' + r.status + ': ' + r.count);
  console.log('\n数据源分布:');
  for (const r of bySource) console.log('  ' + r.src + ': ' + r.count);

  // TG 抽样50条
  const tg50 = await p.cable.findMany({
    where: { mergedInto: null, id: { not: { startsWith: 'sn-' } }, status: { notIn: ['REMOVED'] } },
    select: { name: true, status: true, lengthKm: true,
      landingStations: { select: { landingStation: { select: { countryCode: true } } } } },
    orderBy: { name: 'asc' }, skip: 100, take: 50,
  });

  console.log('\n=== TG 抽样50条（跳过前100取中间段）===\n');
  for (const c of tg50) {
    const countries = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    console.log(c.name + ' | ' + c.status + ' | ' + (c.lengthKm || '?') + 'km | ' + c.landingStations.length + '站 | ' + countries.join(','));
  }

  // SN 抽样50条
  const sn50 = await p.cable.findMany({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] } },
    select: { name: true, status: true, lengthKm: true,
      landingStations: { select: { landingStation: { select: { countryCode: true } } } } },
    orderBy: { name: 'asc' }, skip: 50, take: 50,
  });

  console.log('\n=== SN独有 抽样50条（跳过前50取中间段）===\n');
  for (const c of sn50) {
    const countries = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    console.log(c.name + ' | ' + c.status + ' | ' + (c.lengthKm || '?') + 'km | ' + c.landingStations.length + '站 | ' + countries.join(','));
  }

  // 去重验证：检查是否还有跨源重复
  console.log('\n=== 去重验证 ===\n');
  const mergeLog: any[] = await p.$queryRawUnsafe(`
    SELECT COUNT(*)::int as count, merge_method FROM cable_merge_log GROUP BY merge_method ORDER BY count DESC
  `);
  console.log('合并日志:');
  for (const r of mergeLog) console.log('  ' + r.merge_method + ': ' + r.count + ' 对');

  const totalMerged = mergeLog.reduce((s: number, r: any) => s + r.count, 0);
  console.log('  总计: ' + totalMerged + ' 对已合并');

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

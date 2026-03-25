import { PrismaClient } from '@prisma/client';
import { parseCableName, loadAliases } from '../src/lib/cable-name-parser';
const p = new PrismaClient();

async function main() {
  await loadAliases(p);

  const tg50 = await p.cable.findMany({
    where: { mergedInto: null, id: { not: { startsWith: 'sn-' } }, status: { notIn: ['REMOVED'] } },
    select: { id: true, name: true, status: true, lengthKm: true,
      landingStations: { select: { landingStation: { select: { name: true, countryCode: true } } } } },
    orderBy: { name: 'asc' }, take: 50,
  });
  const sn50 = await p.cable.findMany({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] } },
    select: { id: true, name: true, status: true, lengthKm: true,
      landingStations: { select: { landingStation: { select: { name: true, countryCode: true } } } } },
    orderBy: { name: 'asc' }, take: 50,
  });

  const allActive = await p.cable.findMany({
    where: { mergedInto: null, status: { notIn: ['REMOVED'] } },
    select: { id: true, name: true },
  });
  const canonicalMap = new Map<string, {id:string,name:string}[]>();
  for (const c of allActive) {
    const parsed = parseCableName(c.name);
    const key = parsed.canonical;
    if (canonicalMap.has(key)) {
      canonicalMap.get(key)!.push({ id: c.id, name: c.name });
    } else {
      canonicalMap.set(key, [{ id: c.id, name: c.name }]);
    }
  }

  console.log('=== TG 前50条 ===\n');
  for (const c of tg50) {
    const countries = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    const parsed = parseCableName(c.name);
    console.log(c.name + ' | ' + c.status + ' | ' + (c.lengthKm || '?') + 'km | ' + c.landingStations.length + '站 | ' + countries.join(',') + ' | c=' + parsed.canonical);
  }

  console.log('\n=== SN独有 前50条 ===\n');
  for (const c of sn50) {
    const countries = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    const parsed = parseCableName(c.name);
    console.log(c.name + ' | ' + c.status + ' | ' + (c.lengthKm || '?') + 'km | ' + c.landingStations.length + '站 | ' + countries.join(',') + ' | c=' + parsed.canonical);
  }

  console.log('\n=== 唯一性检查 ===\n');
  console.log('活跃海缆总数: ' + allActive.length);
  console.log('唯一canonical数: ' + canonicalMap.size);
  const dupes: {canonical:string, cables:{id:string,name:string}[]}[] = [];
  for (const [canonical, group] of canonicalMap) {
    if (group.length > 1) dupes.push({ canonical, cables: group });
  }
  if (dupes.length > 0) {
    console.log('仍有重复canonical: ' + dupes.length + ' 组');
    for (const d of dupes) {
      console.log('  canonical="' + d.canonical + '":');
      for (const c of d.cables) console.log('    "' + c.name + '" id=' + c.id);
    }
  } else {
    console.log('所有canonical唯一，无重复');
  }

  const snAll = await p.cable.findMany({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] } },
    include: { _count: { select: { landingStations: true } } },
  });
  const zeroStation = snAll.filter((c: any) => c._count.landingStations === 0).length;
  console.log('\n=== SN独有数据质量 ===');
  console.log('SN独有总数: ' + snAll.length);
  console.log('0个登陆站: ' + zeroStation + ' (' + Math.round(zeroStation/snAll.length*100) + '%)');
  console.log('有登陆站: ' + (snAll.length - zeroStation));

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // 随机抽取100条SN独有记录
  const snAll = await p.cable.findMany({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] } },
    select: { name: true, status: true, lengthKm: true, dataSource: true,
      landingStations: { select: { landingStation: { select: { name: true, countryCode: true } } } } },
  });

  // 随机打乱
  for (let i = snAll.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [snAll[i], snAll[j]] = [snAll[j], snAll[i]];
  }

  const sample = snAll.slice(0, 100);

  // 统计
  let hasStations = 0, zeroStations = 0, hasLength = 0, noLength = 0, has16600 = 0;

  console.log('=== SN 随机抽样 100 条 ===\n');
  console.log('序号 | 名称 | 状态 | 长度 | 登陆站数 | 国家\n');

  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    const countries = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    const stCount = c.landingStations.length;
    const lenStr = c.lengthKm ? c.lengthKm + 'km' : '?';
    const flag16600 = c.lengthKm === 16600 ? ' ⚠' : '';

    if (stCount > 0) hasStations++; else zeroStations++;
    if (c.lengthKm && c.lengthKm !== 16600) hasLength++;
    else if (!c.lengthKm) noLength++;
    if (c.lengthKm === 16600) has16600++;

    console.log((i+1) + ' | ' + c.name + ' | ' + c.status + ' | ' + lenStr + flag16600 + ' | ' + stCount + '站 | ' + countries.join(','));
  }

  console.log('\n=== 抽样统计 ===\n');
  console.log('有登陆站: ' + hasStations + ' (' + hasStations + '%)');
  console.log('零登陆站: ' + zeroStations + ' (' + zeroStations + '%)');
  console.log('有合理长度: ' + hasLength + '%');
  console.log('无长度: ' + noLength + '%');
  console.log('16600km假值: ' + has16600 + '%');

  // 有登陆站的记录中，站点数分布
  const withSt = sample.filter(c => c.landingStations.length > 0);
  if (withSt.length > 0) {
    const avgSt = withSt.reduce((s, c) => s + c.landingStations.length, 0) / withSt.length;
    const maxSt = Math.max(...withSt.map(c => c.landingStations.length));
    console.log('\n有登陆站的记录:');
    console.log('  平均站点数: ' + avgSt.toFixed(1));
    console.log('  最大站点数: ' + maxSt);
  }

  // SN总体统计
  console.log('\n=== SN 总体（全部 ' + snAll.length + ' 条）===\n');
  const totalHasSt = snAll.filter(c => c.landingStations.length > 0).length;
  const totalNoLen = snAll.filter(c => !c.lengthKm).length;
  const total16600 = snAll.filter(c => c.lengthKm === 16600).length;
  console.log('有登陆站: ' + totalHasSt + '/' + snAll.length + ' (' + Math.round(totalHasSt/snAll.length*100) + '%)');
  console.log('零登陆站: ' + (snAll.length - totalHasSt) + '/' + snAll.length + ' (' + Math.round((snAll.length-totalHasSt)/snAll.length*100) + '%)');
  console.log('无长度: ' + totalNoLen + '/' + snAll.length);
  console.log('16600km假值: ' + total16600 + '/' + snAll.length);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const CHINA_GROUP = ['CN', 'TW', 'HK', 'MO'];

  // 找出所有登陆站国家全部在 CN/TW/HK/MO 范围内的海缆
  const cables = await p.cable.findMany({
    where: { mergedInto: null, status: { notIn: ['REMOVED'] } },
    select: {
      name: true, slug: true, status: true,
      landingStations: { select: { landingStation: { select: { countryCode: true } } } },
    },
  });

  console.log('=== 仅连接 CN/TW/HK/MO 的海缆（应归为国内线）===\n');

  let count = 0;
  for (const c of cables) {
    const codes = [...new Set(c.landingStations.map((ls: any) => ls.landingStation.countryCode))];
    if (codes.length === 0) continue;
    // 所有国家都在大中华区内，且涉及2个以上不同代码（否则已经被单国家规则覆盖）
    const allInChina = codes.every(cc => CHINA_GROUP.includes(cc));
    const multiCode = new Set(codes).size > 1;
    if (allInChina && multiCode) {
      count++;
      console.log(c.name + ' | ' + c.status + ' | ' + codes.join(',') + ' | slug=' + c.slug);
    }
  }

  console.log('\n共 ' + count + ' 条海缆应归为国内线（当前可能被错误分类为国际线）');

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

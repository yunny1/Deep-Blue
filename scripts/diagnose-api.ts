// scripts/diagnose-api.ts
// 诊断脚本：查看TeleGeography API返回的完整数据结构
// 这样我们就知道有哪些字段可以导入

async function main() {
  console.log('=== 诊断 TeleGeography API 数据结构 ===\n');

  // 1. 查看海缆属性数据
  console.log('[1] 下载海缆属性数据 (all.json)...');
  const cablesRes = await fetch('https://www.submarinecablemap.com/api/v3/cable/all.json');
  const cables = await cablesRes.json() as any[];
  console.log(`  获取到 ${cables.length} 条海缆\n`);

  // 打印前3条海缆的完整结构
  console.log('--- 前3条海缆的完整字段 ---');
  for (let i = 0; i < Math.min(3, cables.length); i++) {
    console.log(`\n海缆 #${i + 1}: ${cables[i].name || cables[i].cable_name || 'Unknown'}`);
    console.log(JSON.stringify(cables[i], null, 2));
  }

  // 汇总所有出现过的字段名
  const allKeys = new Set<string>();
  for (const cable of cables) {
    for (const key of Object.keys(cable)) {
      allKeys.add(key);
    }
  }
  console.log('\n--- 所有出现过的字段名 ---');
  console.log([...allKeys].sort().join(', '));

  // 2. 查看登陆站数据
  console.log('\n\n[2] 下载登陆站数据 (landing-point-geo.json)...');
  const lpRes = await fetch('https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json');
  const lpData = await lpRes.json();
  const lpFeatures = lpData.features || [];
  console.log(`  获取到 ${lpFeatures.length} 个登陆站\n`);

  // 打印前3个登陆站的完整结构
  console.log('--- 前3个登陆站的完整字段 ---');
  for (let i = 0; i < Math.min(3, lpFeatures.length); i++) {
    console.log(`\n登陆站 #${i + 1}:`);
    console.log(JSON.stringify(lpFeatures[i].properties, null, 2));
  }

  // 汇总登陆站字段
  const lpKeys = new Set<string>();
  for (const f of lpFeatures) {
    for (const key of Object.keys(f.properties || {})) {
      lpKeys.add(key);
    }
  }
  console.log('\n--- 登陆站所有字段名 ---');
  console.log([...lpKeys].sort().join(', '));

  console.log('\n=== 诊断完成 ===');
}

main().catch(console.error);

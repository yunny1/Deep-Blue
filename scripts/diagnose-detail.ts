// scripts/diagnose-detail.ts
// 检查单条海缆的详情API返回了哪些字段

async function main() {
  // 用几条知名海缆测试
  const testIds = ['2africa', 'peace-cable', 'marea', 'sea-me-we-6', 'apricot'];

  for (const id of testIds) {
    console.log(`\n=== 查询海缆: ${id} ===`);
    try {
      const res = await fetch(`https://www.submarinecablemap.com/api/v3/cable/${id}.json`);
      if (!res.ok) {
        console.log(`  HTTP ${res.status} - 接口不存在或无数据`);
        continue;
      }
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2).slice(0, 2000)); // 只打印前2000字符避免太长
      console.log('\n字段列表:', Object.keys(data).join(', '));
    } catch (e: any) {
      console.log(`  错误: ${e.message}`);
    }
  }
}

main().catch(console.error);

// scripts/translate-stations.ts
// 批量翻译登陆站名称为中文 — 使用 MiniMax AI
// 策略：每批 20 个，单次 prompt，避免触发频率限制
// 已有 nameZh 的站点跳过，只翻译空值

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MINIMAX_API_KEY  = process.env.MINIMAX_API_KEY!;
const MINIMAX_BASE_URL = 'https://api.minimaxi.chat/v1/text/chatcompletion_v2';
const BATCH_SIZE       = 20;   // 每批翻译数量
const DELAY_MS         = 2000; // 批次间隔，避免限频

// 调用 MiniMax 批量翻译
async function translateBatch(stations: { id: string; name: string; countryCode: string }[]): Promise<Record<string, string>> {
  const list = stations.map((s, i) => `${i + 1}. [${s.countryCode}] ${s.name}`).join('\n');

  const prompt = `你是一个专业的地理名称翻译专家，专注于海底电缆登陆站名称的中文翻译。

请将以下登陆站名称翻译成中文。规则：
1. 地名优先使用官方中文译名（如 Singapore → 新加坡）
2. 无官方译名时使用音译（保持简洁）
3. 方向词翻译：North→北, South→南, East→东, West→西, Cape→角, Bay→湾, Point→角/岬
4. 括号内内容如 (大陆) 保留，如 Hong Kong (SAR) → 香港（特别行政区）
5. 只返回 JSON 对象，格式为 {"序号": "中文名称"}，不要有其他内容

待翻译列表：
${list}`;

  const res = await fetch(MINIMAX_BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`MiniMax API error: ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '{}';

  // 提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]);

  // 映射回 id → nameZh
  const result: Record<string, string> = {};
  stations.forEach((s, i) => {
    const zhName = parsed[String(i + 1)];
    if (zhName && typeof zhName === 'string') {
      result[s.id] = zhName.trim();
    }
  });
  return result;
}

async function main() {
  console.log(`\n[Translate Stations] 开始 ${new Date().toISOString()}`);

  if (!MINIMAX_API_KEY) {
    console.error('未配置 MINIMAX_API_KEY，退出');
    process.exit(1);
  }

  // 查询所有没有中文名的登陆站
  const stations = await prisma.landingStation.findMany({
    where: { nameZh: null },
    select: { id: true, name: true, countryCode: true },
    orderBy: { name: 'asc' },
  });

  console.log(`  需要翻译: ${stations.length} 个登陆站`);
  if (stations.length === 0) {
    console.log('  全部已有中文名，无需翻译');
    await prisma.$disconnect();
    return;
  }

  let translated = 0;
  let failed = 0;

  // 分批处理
  for (let i = 0; i < stations.length; i += BATCH_SIZE) {
    const batch = stations.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stations.length / BATCH_SIZE);
    console.log(`  批次 ${batchNum}/${totalBatches}：翻译 ${batch.length} 个...`);

    try {
      const translations = await translateBatch(batch);

      // 批量写入数据库
      await Promise.all(
        Object.entries(translations).map(([id, nameZh]) =>
          prisma.landingStation.update({ where: { id }, data: { nameZh } })
        )
      );

      translated += Object.keys(translations).length;
      const missing = batch.length - Object.keys(translations).length;
      if (missing > 0) {
        console.log(`    ✓ 成功 ${Object.keys(translations).length} 个，未返回 ${missing} 个`);
      } else {
        console.log(`    ✓ 全部成功`);
      }
    } catch (e: any) {
      console.error(`    ✗ 批次失败: ${e.message}`);
      failed += batch.length;
    }

    // 批次间延迟
    if (i + BATCH_SIZE < stations.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n[Translate Stations] 完成`);
  console.log(`  成功翻译: ${translated} 个`);
  console.log(`  失败: ${failed} 个`);

  // 验证结果
  const remaining = await prisma.landingStation.count({ where: { nameZh: null } });
  console.log(`  剩余未翻译: ${remaining} 个`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('[Translate Stations] 崩溃:', e);
  await prisma.$disconnect();
  process.exit(1);
});

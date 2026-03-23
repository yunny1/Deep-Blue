// scripts/translate-stations.ts
// 批量翻译登陆站名称为中文 — 使用 Qwen（通义千问）

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const QWEN_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const BATCH_SIZE   = 20;
const DELAY_MS     = 1000;

async function translateBatch(stations: { id: string; name: string; countryCode: string }[]): Promise<Record<string, string>> {
  const apiKey = process.env.QWEN_API_KEY!;
  const list   = stations.map((s, i) => `${i + 1}. [${s.countryCode}] ${s.name}`).join('\n');

  const prompt = `你是一个专业的地理名称翻译专家，专注于海底电缆登陆站名称的中文翻译。

请将以下登陆站名称翻译成中文。规则：
1. 地名优先使用官方中文译名（如 Singapore → 新加坡）
2. 无官方译名时使用音译（保持简洁）
3. 方向词翻译：North→北, South→南, East→东, West→西, Cape→角, Bay→湾, Point→角/岬
4. 括号内内容如 (大陆) 保留
5. 只返回 JSON 对象，格式为 {"序号": "中文名称"}，不要有其他内容

待翻译列表：
${list}`;

  const res = await fetch(QWEN_API_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) throw new Error(`Qwen API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text  = data.choices?.[0]?.message?.content || '{}';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(jsonMatch[0]);

  const result: Record<string, string> = {};
  stations.forEach((s, i) => {
    const zh = parsed[String(i + 1)];
    if (zh && typeof zh === 'string') result[s.id] = zh.trim();
  });
  return result;
}

async function main() {
  console.log(`\n[Translate Stations] 开始 ${new Date().toISOString()}`);

  if (!process.env.QWEN_API_KEY) {
    console.error('未配置 QWEN_API_KEY，退出');
    process.exit(1);
  }

  const stations = await prisma.landingStation.findMany({
    where: { nameZh: null },
    select: { id: true, name: true, countryCode: true },
    orderBy: { name: 'asc' },
  });

  console.log(`  需要翻译: ${stations.length} 个登陆站`);
  if (stations.length === 0) { console.log('  全部已有中文名'); await prisma.$disconnect(); return; }

  let translated = 0, failed = 0;

  for (let i = 0; i < stations.length; i += BATCH_SIZE) {
    const batch     = stations.slice(i, i + BATCH_SIZE);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const total     = Math.ceil(stations.length / BATCH_SIZE);
    console.log(`  批次 ${batchNum}/${total}：翻译 ${batch.length} 个...`);

    try {
      const translations = await translateBatch(batch);
      await Promise.all(
        Object.entries(translations).map(([id, nameZh]) =>
          prisma.landingStation.update({ where: { id }, data: { nameZh } })
        )
      );
      translated += Object.keys(translations).length;
      console.log(`    ✓ 成功 ${Object.keys(translations).length} 个`);
    } catch (e: any) {
      console.error(`    ✗ 批次失败: ${e.message}`);
      failed += batch.length;
    }

    if (i + BATCH_SIZE < stations.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const remaining = await prisma.landingStation.count({ where: { nameZh: null } });
  console.log(`\n[Translate Stations] 完成  成功: ${translated}  失败: ${failed}  剩余: ${remaining}`);
  await prisma.$disconnect();
}

main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

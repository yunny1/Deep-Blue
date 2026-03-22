// scripts/geocode-fill.ts
// 坐标补全脚本 — Level 1-4 瀑布流
// 专门处理数据库中 latitude/longitude 为 NULL 的登陆站
//
// Level 1: 查 location_dictionary 本地缓存
// Level 2: Nominatim API（OpenStreetMap，免费）
// Level 3: NLP 清洗站名后再试 Level 2
// Level 4: MiniMax AI 推理城市名 → 写入 DLQ ai_suggested_payload，等人工审核
//
// 运行方式: npx tsx scripts/geocode-fill.ts
// Cron: 每天 UTC 20:00（同步脚本完成后1小时）运行

import { PrismaClient } from '@prisma/client';
import { getCountryCode, validateCountryCode } from '../src/lib/countryCodeMap';

const prisma = new PrismaClient();

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';
const MINIMAX_MODEL   = 'MiniMax-M2';

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function log(level: 'INFO'|'WARN'|'OK'|'ERROR', msg: string) {
  const icons = { INFO: '•', WARN: '⚠', OK: '✓', ERROR: '✗' };
  console.log(`${icons[level]} [${level}] ${msg}`);
}

// ── Level 3：NLP 清洗站名 ────────────────────────────────────────
// 去掉公司名、括号内容、连字符冗余，提取核心城市名
// 例：'Marseille (Sainte-Marguerite), France' → 'Marseille'
//     'Tuas CLS, Singapore' → 'Tuas'
function cleanStationName(raw: string): { city: string; country: string } {
  let s = raw;

  // 提取国家（最后一个逗号后面的部分）
  const parts = s.split(',').map(p => p.trim());
  const country = parts.length >= 2 ? parts[parts.length - 1].replace(/\(.*\)/g, '').trim() : '';
  const cityRaw = parts[0];

  // 去掉括号内容
  let city = cityRaw.replace(/\s*\([^)]*\)/g, '').trim();

  // 去掉常见的噪音后缀
  city = city
    .replace(/\b(CLS|Cable Landing Station|Landing Station|Cable Station|Teleport|Earth Station)\b/gi, '')
    .replace(/\b(North|South|East|West|Upper|Lower|Greater|New|Old)\b\s*$/gi, '')
    .trim();

  // 如果清洗后为空，回退到原始城市名
  if (!city) city = cityRaw;

  return { city: city.trim(), country };
}

// ── Level 2：Nominatim 地理编码 ──────────────────────────────────
async function nominatimGeocode(city: string, country: string): Promise<{ lat: number; lng: number } | null> {
  try {
    await delay(1200); // 严格遵守 Nominatim 1秒/次限制
    const query = country ? `${city}, ${country}` : city;
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DeepBlue/6.0 geocode-fill (contact@deep-cloud.org)' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as any[];
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { return null; }
}

// ── Level 4：MiniMax AI 推理 ─────────────────────────────────────
interface AiGeoResult {
  standardizedCity: string;
  countryCode: string;
  lat: number;
  lng: number;
  confidence: number;
  reasoning: string;
}

async function minimaxGeocode(stationName: string): Promise<AiGeoResult | null> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a submarine cable landing station geolocation expert. 
Given a cable landing station name, identify the exact city and coordinates.
Respond ONLY with valid JSON, no markdown, no explanation:
{
  "standardizedCity": "city name in English",
  "countryCode": "ISO 2-letter code",
  "lat": number,
  "lng": number,
  "confidence": 0-100,
  "reasoning": "brief explanation"
}`,
          },
          {
            role: 'user',
            content: `Find the location of this submarine cable landing station: "${stationName}"`,
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = content.indexOf('{');
    const jsonEnd   = content.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;
    return JSON.parse(content.slice(jsonStart, jsonEnd + 1)) as AiGeoResult;
  } catch { return null; }
}

// ── 主流程 ───────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  Deep Blue 坐标补全脚本 — Level 1-4 瀑布流          ║');
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 查出所有坐标为 NULL 的登陆站
  const nullStations = await prisma.landingStation.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, name: true, countryCode: true },
    orderBy: { id: 'asc' },
  });

  log('INFO', `找到 ${nullStations.length} 个坐标为 NULL 的登陆站`);

  const stats = { level1: 0, level2: 0, level3: 0, level4: 0, failed: 0 };

  for (const station of nullStations) {
    const stationName = station.name;
    const countryCode = station.countryCode;
    log('INFO', `处理: "${stationName}" (${countryCode})`);

    // ── Level 1：查本地字典缓存 ──────────────────────────────
    const cached = await prisma.locationDictionary.findUnique({
      where: { rawString: stationName },
    }).catch(() => null);

    if (cached) {
      await prisma.landingStation.update({
        where: { id: station.id },
        data: { latitude: cached.latitude, longitude: cached.longitude },
      }).catch(() => {});
      log('OK', `  L1 缓存命中: ${cached.latitude.toFixed(3)}, ${cached.longitude.toFixed(3)}`);
      stats.level1++;
      continue;
    }

    // ── Level 2：Nominatim（原始站名）──────────────────────
    const { city: rawCity, country: rawCountry } = cleanStationName(stationName);
    const countryName = rawCountry || countryCode;
    let coords = await nominatimGeocode(rawCity, countryName);

    if (coords) {
      await saveCoords(station.id, stationName, rawCity, countryCode, coords, 'Nominatim-L2');
      log('OK', `  L2 Nominatim: ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`);
      stats.level2++;
      continue;
    }

    // ── Level 3：NLP 清洗后再试 Nominatim ───────────────────
    const { city: cleanedCity, country: cleanedCountry } = cleanStationName(stationName);
    if (cleanedCity !== rawCity) {
      coords = await nominatimGeocode(cleanedCity, cleanedCountry || countryName);
      if (coords) {
        await saveCoords(station.id, stationName, cleanedCity, countryCode, coords, 'Nominatim-L3');
        log('OK', `  L3 清洗后命中 "${cleanedCity}": ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`);
        stats.level3++;
        continue;
      }
    }

    // 只用城市名（不带国家）再试一次
    coords = await nominatimGeocode(cleanedCity, '');
    if (coords) {
      await saveCoords(station.id, stationName, cleanedCity, countryCode, coords, 'Nominatim-L3-noCountry');
      log('OK', `  L3 无国家命中 "${cleanedCity}": ${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`);
      stats.level3++;
      continue;
    }

    // ── Level 4：MiniMax AI 推理 → 写入 DLQ 等人工审核 ──────
    log('WARN', `  L1-L3 均失败，调用 MiniMax AI...`);
    const aiResult = await minimaxGeocode(stationName);
    await delay(2000); // AI API 限速保护

    if (aiResult && aiResult.confidence >= 60) {
      // AI 置信度够高，写入 DLQ 的 ai_suggested_payload，标记为 NEEDS_HUMAN_AUDIT
      await prisma.unresolvedLocation.upsert({
        where: { rawString: stationName },
        update: {
          status: 'NEEDS_HUMAN_AUDIT',
          aiSuggestedPayload: aiResult as any,
          updatedAt: new Date(),
        },
        create: {
          rawString: stationName,
          originSource: 'geocode-fill',
          cableId: null,
          errorReason: 'L1-L3 all failed',
          status: 'NEEDS_HUMAN_AUDIT',
          aiSuggestedPayload: aiResult as any,
        },
      }).catch(() => {});
      log('WARN', `  L4 AI推理完成 (置信度${aiResult.confidence}%)，等待人工审核: ${aiResult.standardizedCity}`);
      stats.level4++;
    } else {
      // AI 也没把握，标记为 PENDING
      await prisma.unresolvedLocation.upsert({
        where: { rawString: stationName },
        update: { retryCount: { increment: 1 }, updatedAt: new Date(), errorReason: 'All levels failed' },
        create: {
          rawString: stationName, originSource: 'geocode-fill',
          cableId: null, errorReason: 'All levels failed', status: 'PENDING',
        },
      }).catch(() => {});
      log('ERROR', `  L4 失败，已写入 DLQ`);
      stats.failed++;
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  坐标补全完成`);
  console.log(`║  L1缓存: ${stats.level1} | L2原始: ${stats.level2} | L3清洗: ${stats.level3}`);
  console.log(`║  L4待审: ${stats.level4} | 失败: ${stats.failed}`);
  console.log('╚══════════════════════════════════════════════════════╝');

  await prisma.$disconnect();
}

// 保存坐标并同步写入字典缓存
async function saveCoords(
  stationId: string, rawName: string, city: string,
  countryCode: string, coords: { lat: number; lng: number }, source: string,
) {
  await prisma.landingStation.update({
    where: { id: stationId },
    data: { latitude: coords.lat, longitude: coords.lng },
  }).catch(() => {});

  // 沉淀到字典，下次直接 L1 命中
  await prisma.locationDictionary.upsert({
    where: { rawString: rawName },
    update: { latitude: coords.lat, longitude: coords.lng, source },
    create: {
      rawString: rawName, standardizedCity: city,
      countryCode, latitude: coords.lat, longitude: coords.lng, source,
    },
  }).catch(() => {});
}

main().catch(async e => {
  console.error('坐标补全失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

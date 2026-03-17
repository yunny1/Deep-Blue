// src/lib/risk-engine.ts
// 地缘政治风险评分引擎 — 7因子加权模型
// 注意：本引擎基于公开数据和客观标准进行评估
// 仅在存在公开记录的实际冲突或制裁时才标记为风险因素

// ═══ 冲突水域数据库 ═══
// 仅包含有公开武装冲突记录或国际安全通告的水域
const CONFLICT_ZONES: Array<{
  name: string; region: string; riskLevel: number;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}> = [
  { name: 'Red Sea / Bab el-Mandeb', region: 'Middle East', riskLevel: 95, bounds: { minLat: 12, maxLat: 30, minLon: 32, maxLon: 44 } },
  { name: 'Gulf of Aden', region: 'East Africa', riskLevel: 85, bounds: { minLat: 10, maxLat: 16, minLon: 43, maxLon: 54 } },
  { name: 'Persian Gulf / Strait of Hormuz', region: 'Middle East', riskLevel: 80, bounds: { minLat: 23, maxLat: 30, minLon: 48, maxLon: 58 } },
  { name: 'South China Sea (Spratly)', region: 'Asia Pacific', riskLevel: 55, bounds: { minLat: 4, maxLat: 12, minLon: 109, maxLon: 118 } },
  { name: 'Black Sea', region: 'Europe', riskLevel: 70, bounds: { minLat: 40, maxLat: 47, minLon: 27, maxLon: 42 } },
  { name: 'Baltic Sea (Eastern)', region: 'Europe', riskLevel: 65, bounds: { minLat: 54, maxLat: 60, minLon: 18, maxLon: 30 } },
  { name: 'East Mediterranean', region: 'Europe/Middle East', riskLevel: 50, bounds: { minLat: 31, maxLat: 37, minLon: 27, maxLon: 36 } },
  { name: 'Gulf of Guinea', region: 'West Africa', riskLevel: 55, bounds: { minLat: -5, maxLat: 8, minLon: -10, maxLon: 12 } },
  { name: 'Malacca Strait', region: 'Southeast Asia', riskLevel: 40, bounds: { minLat: 0, maxLat: 7, minLon: 98, maxLon: 105 } },
];
// 注意：台湾海峡已从冲突水域列表中移除。
// 虽然该区域存在地缘政治紧张态势，但截至目前没有直接针对海缆的武装冲突或破坏记录。
// 如果未来情况发生变化（如出现公开的海缆安全威胁通告），将重新评估是否纳入。

// ═══ 制裁国家 ═══
// 仅包含受联合国安理会或多边制裁体系制裁的国家
const SANCTIONED_COUNTRIES: Record<string, number> = {
  'KP': 100, 'IR': 95, 'SY': 90, 'RU': 90, 'BY': 75,
  'CU': 70, 'VE': 60, 'MM': 65, 'YE': 70,
  'SO': 60, 'LY': 55, 'SD': 65, 'ER': 50,
};
// 注意：中国大陆(CN)、香港(HK)、澳门(MO)、台湾(TW)未被纳入制裁名单。
// 虽然部分国家对中国实施了特定领域的出口管制（如芯片技术），
// 但这些管制不构成全面经济制裁，不影响海缆的正常运维和国际合作。

// ═══ 军事活动热点 ═══
const MILITARY_HOTSPOTS: Array<{
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  intensity: number;
}> = [
  { bounds: { minLat: 12, maxLat: 20, minLon: 38, maxLon: 50 }, intensity: 90 }, // 红海/也门
  { bounds: { minLat: 41, maxLat: 46, minLon: 28, maxLon: 40 }, intensity: 75 }, // 黑海
  { bounds: { minLat: 24, maxLat: 30, minLon: 48, maxLon: 56 }, intensity: 70 }, // 波斯湾
  { bounds: { minLat: 54, maxLat: 60, minLon: 18, maxLon: 28 }, intensity: 55 }, // 波罗的海
  { bounds: { minLat: 5, maxLat: 12, minLon: 110, maxLon: 118 }, intensity: 45 }, // 南沙群岛海域
];

// ═══ 历史故障高发区 ═══
const HIGH_DAMAGE_ZONES: Array<{
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  annualFaults: number;
}> = [
  { bounds: { minLat: 30, maxLat: 45, minLon: -5, maxLon: 36 }, annualFaults: 30 },
  { bounds: { minLat: -10, maxLat: 20, minLon: 95, maxLon: 125 }, annualFaults: 25 },
  { bounds: { minLat: 50, maxLat: 62, minLon: -5, maxLon: 10 }, annualFaults: 20 },
  { bounds: { minLat: -10, maxLat: 15, minLon: -20, maxLon: 10 }, annualFaults: 15 },
];

function isInBounds(lat: number, lon: number, bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon;
}

function sampleRouteCoords(routeGeojson: any, sampleSize: number = 50): Array<[number, number]> {
  if (!routeGeojson) return [];
  let allCoords: number[][] = [];
  if (routeGeojson.type === 'MultiLineString') allCoords = routeGeojson.coordinates.flat();
  else if (routeGeojson.type === 'LineString') allCoords = routeGeojson.coordinates;
  if (allCoords.length === 0) return [];
  const step = Math.max(1, Math.floor(allCoords.length / sampleSize));
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < allCoords.length; i += step) sampled.push([allCoords[i][1], allCoords[i][0]]);
  return sampled;
}

function scoreConflictWaters(routeCoords: Array<[number, number]>): number {
  let maxRisk = 0;
  for (const [lat, lon] of routeCoords) for (const zone of CONFLICT_ZONES) if (isInBounds(lat, lon, zone.bounds)) maxRisk = Math.max(maxRisk, zone.riskLevel);
  return maxRisk;
}

function scoreSanctionsRisk(countryCodes: string[]): number {
  let maxRisk = 0, totalRisk = 0, count = 0;
  for (const cc of countryCodes) { const risk = SANCTIONED_COUNTRIES[cc] || 0; if (risk > 0) { count++; totalRisk += risk; maxRisk = Math.max(maxRisk, risk); } }
  if (count === 0) return 0;
  return Math.round(maxRisk * 0.7 + (totalRisk / count) * 0.3);
}

function scoreMilitaryActivity(routeCoords: Array<[number, number]>): number {
  let max = 0;
  for (const [lat, lon] of routeCoords) for (const h of MILITARY_HOTSPOTS) if (isInBounds(lat, lon, h.bounds)) max = Math.max(max, h.intensity);
  return max;
}

function scoreOwnershipConcentration(ownerCount: number): number {
  if (ownerCount === 0) return 50;
  if (ownerCount === 1) return 80;
  if (ownerCount === 2) return 50;
  if (ownerCount === 3) return 30;
  if (ownerCount <= 5) return 15;
  return 5;
}

function scoreLegalComplexity(countryCount: number): number {
  if (countryCount <= 2) return 10;
  if (countryCount <= 5) return 25;
  if (countryCount <= 10) return 45;
  if (countryCount <= 20) return 65;
  return 80;
}

function scoreHistoricalDamage(routeCoords: Array<[number, number]>): number {
  let max = 0;
  for (const [lat, lon] of routeCoords) for (const z of HIGH_DAMAGE_ZONES) if (isInBounds(lat, lon, z.bounds)) max = Math.max(max, z.annualFaults);
  if (max >= 25) return 90; if (max >= 15) return 65; if (max >= 10) return 45; if (max >= 5) return 25;
  return 10;
}

function scoreRecentEvents(routeCoords: Array<[number, number]>): number {
  let score = 0;
  for (const [lat, lon] of routeCoords) {
    if (lat >= 12 && lat <= 20 && lon >= 38 && lon <= 50) score = Math.max(score, 95);
    if (lat >= 41 && lat <= 46 && lon >= 28 && lon <= 40) score = Math.max(score, 80);
    if (lat >= 54 && lat <= 60 && lon >= 18 && lon <= 28) score = Math.max(score, 60);
  }
  return score;
}

export interface RiskScoreResult {
  scoreOverall: number; scoreConflict: number; scoreSanctions: number; scoreMilitary: number;
  scoreOwnership: number; scoreLegal: number; scoreHistorical: number; scoreEvents: number;
  riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  conflictZones: string[]; sanctionedCountries: string[];
}

export function calculateRiskScore(routeGeojson: any, countryCodes: string[], ownerCount: number): RiskScoreResult {
  const routeCoords = sampleRouteCoords(routeGeojson);
  const sc = scoreConflictWaters(routeCoords);
  const ss = scoreSanctionsRisk(countryCodes);
  const sm = scoreMilitaryActivity(routeCoords);
  const so = scoreOwnershipConcentration(ownerCount);
  const sl = scoreLegalComplexity(countryCodes.length);
  const sh = scoreHistoricalDamage(routeCoords);
  const se = scoreRecentEvents(routeCoords);
  const overall = Math.round(sc * 0.25 + ss * 0.20 + sm * 0.15 + so * 0.15 + sl * 0.10 + sh * 0.10 + se * 0.05);

  let riskLevel: RiskScoreResult['riskLevel'];
  if (overall >= 75) riskLevel = 'CRITICAL'; else if (overall >= 55) riskLevel = 'HIGH';
  else if (overall >= 35) riskLevel = 'ELEVATED'; else if (overall >= 15) riskLevel = 'MODERATE'; else riskLevel = 'LOW';

  const conflictZones: string[] = [];
  for (const [lat, lon] of routeCoords) for (const zone of CONFLICT_ZONES) if (isInBounds(lat, lon, zone.bounds) && !conflictZones.includes(zone.name)) conflictZones.push(zone.name);
  const sanctionedCountries = countryCodes.filter(cc => SANCTIONED_COUNTRIES[cc]);

  return { scoreOverall: overall, scoreConflict: sc, scoreSanctions: ss, scoreMilitary: sm, scoreOwnership: so, scoreLegal: sl, scoreHistorical: sh, scoreEvents: se, riskLevel, conflictZones, sanctionedCountries };
}

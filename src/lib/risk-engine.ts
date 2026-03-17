// src/lib/risk-engine.ts
// 地缘政治风险评分引擎 — Deep Blue 的7因子加权模型
// 为每条海缆计算综合风险分数（0-100），分数越高风险越大
//
// 7个因子及其权重（来自产品策划书v2.0）：
// 1. 冲突水域 (25%) — 海缆是否经过武装冲突或争议水域
// 2. 制裁风险 (20%) — 海缆连接的国家是否受国际制裁
// 3. 军事活动 (15%) — 海缆路由沿线的军事部署密度
// 4. 所有权集中度 (15%) — 海缆是否被单一实体控制
// 5. 法律复杂度 (10%) — 海缆经过的法律管辖区数量和复杂性
// 6. 历史破坏记录 (10%) — 该区域历史上的海缆损坏频率
// 7. 近期事件活跃度 (5%) — 最近是否有相关安全事件

// ═══ 冲突水域数据库 ═══
// 全球已知的高风险水域（基于公开安全报告）
const CONFLICT_ZONES: Array<{
  name: string;
  region: string;
  riskLevel: number; // 0-100
  // 简化的地理围栏（矩形范围）
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}> = [
  {
    name: 'Red Sea / Bab el-Mandeb',
    region: 'Middle East',
    riskLevel: 95,
    bounds: { minLat: 12, maxLat: 30, minLon: 32, maxLon: 44 },
  },
  {
    name: 'South China Sea (Spratly Islands)',
    region: 'Asia Pacific',
    riskLevel: 75,
    bounds: { minLat: 4, maxLat: 22, minLon: 109, maxLon: 121 },
  },
  {
    name: 'Taiwan Strait',
    region: 'Asia Pacific',
    riskLevel: 70,
    bounds: { minLat: 22, maxLat: 26, minLon: 117, maxLon: 122 },
  },
  {
    name: 'Baltic Sea (Eastern)',
    region: 'Europe',
    riskLevel: 65,
    bounds: { minLat: 54, maxLat: 60, minLon: 18, maxLon: 30 },
  },
  {
    name: 'Persian Gulf / Strait of Hormuz',
    region: 'Middle East',
    riskLevel: 80,
    bounds: { minLat: 23, maxLat: 30, minLon: 48, maxLon: 58 },
  },
  {
    name: 'Gulf of Aden',
    region: 'East Africa',
    riskLevel: 85,
    bounds: { minLat: 10, maxLat: 16, minLon: 43, maxLon: 54 },
  },
  {
    name: 'Black Sea',
    region: 'Europe',
    riskLevel: 70,
    bounds: { minLat: 40, maxLat: 47, minLon: 27, maxLon: 42 },
  },
  {
    name: 'East Mediterranean',
    region: 'Europe/Middle East',
    riskLevel: 50,
    bounds: { minLat: 31, maxLat: 37, minLon: 27, maxLon: 36 },
  },
  {
    name: 'Gulf of Guinea',
    region: 'West Africa',
    riskLevel: 55,
    bounds: { minLat: -5, maxLat: 8, minLon: -10, maxLon: 12 },
  },
  {
    name: 'Malacca Strait',
    region: 'Southeast Asia',
    riskLevel: 40,
    bounds: { minLat: 0, maxLat: 7, minLon: 98, maxLon: 105 },
  },
];

// ═══ 制裁/高风险国家 ═══
const SANCTIONED_COUNTRIES: Record<string, number> = {
  // 重度制裁（风险分 80-100）
  'RU': 90, 'IR': 95, 'KP': 100, 'SY': 90, 'CU': 70,
  // 部分制裁/观察名单（风险分 40-69）
  'CN': 45, 'VE': 60, 'MM': 65, 'BY': 75, 'YE': 70,
  'SO': 60, 'LY': 55, 'SD': 65, 'ER': 50,
};

// ═══ 军事活动热点区域 ═══
const MILITARY_HOTSPOTS: Array<{
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  intensity: number; // 0-100
}> = [
  // 红海/也门冲突区
  { bounds: { minLat: 12, maxLat: 20, minLon: 38, maxLon: 50 }, intensity: 90 },
  // 台海
  { bounds: { minLat: 22, maxLat: 26, minLon: 117, maxLon: 122 }, intensity: 65 },
  // 南海
  { bounds: { minLat: 5, maxLat: 18, minLon: 110, maxLon: 120 }, intensity: 60 },
  // 波罗的海
  { bounds: { minLat: 54, maxLat: 60, minLon: 18, maxLon: 28 }, intensity: 55 },
  // 黑海
  { bounds: { minLat: 41, maxLat: 46, minLon: 28, maxLon: 40 }, intensity: 75 },
  // 波斯湾
  { bounds: { minLat: 24, maxLat: 30, minLon: 48, maxLon: 56 }, intensity: 70 },
];

// ═══ 历史破坏高发区域 ═══
// 基于ICPC数据：全球每年约200起海缆故障，这些区域占比最高
const HIGH_DAMAGE_ZONES: Array<{
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  annualFaults: number; // 该区域年均故障数
}> = [
  // 地中海（渔业活动密集）
  { bounds: { minLat: 30, maxLat: 45, minLon: -5, maxLon: 36 }, annualFaults: 30 },
  // 东南亚（锚泊密集）
  { bounds: { minLat: -10, maxLat: 20, minLon: 95, maxLon: 125 }, annualFaults: 25 },
  // 北海（渔业+能源开采）
  { bounds: { minLat: 50, maxLat: 62, minLon: -5, maxLon: 10 }, annualFaults: 20 },
  // 西非（海底地形复杂）
  { bounds: { minLat: -10, maxLat: 15, minLon: -20, maxLon: 10 }, annualFaults: 15 },
];

// ═══ 工具函数 ═══

// 检查一个点是否在矩形范围内
function isInBounds(
  lat: number, lon: number,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number }
): boolean {
  return lat >= bounds.minLat && lat <= bounds.maxLat &&
         lon >= bounds.minLon && lon <= bounds.maxLon;
}

// 从GeoJSON路由中采样坐标点
function sampleRouteCoords(routeGeojson: any, sampleSize: number = 50): Array<[number, number]> {
  if (!routeGeojson) return [];

  let allCoords: number[][] = [];
  if (routeGeojson.type === 'MultiLineString') {
    allCoords = routeGeojson.coordinates.flat();
  } else if (routeGeojson.type === 'LineString') {
    allCoords = routeGeojson.coordinates;
  }

  if (allCoords.length === 0) return [];

  // 均匀采样
  const step = Math.max(1, Math.floor(allCoords.length / sampleSize));
  const sampled: Array<[number, number]> = [];
  for (let i = 0; i < allCoords.length; i += step) {
    sampled.push([allCoords[i][1], allCoords[i][0]]); // [lat, lon]
  }
  return sampled;
}

// ═══ 7个因子的评分函数 ═══

// 因子1: 冲突水域 (25%)
function scoreConflictWaters(routeCoords: Array<[number, number]>): number {
  if (routeCoords.length === 0) return 0;

  let maxRisk = 0;
  for (const [lat, lon] of routeCoords) {
    for (const zone of CONFLICT_ZONES) {
      if (isInBounds(lat, lon, zone.bounds)) {
        maxRisk = Math.max(maxRisk, zone.riskLevel);
      }
    }
  }
  return maxRisk;
}

// 因子2: 制裁风险 (20%)
function scoreSanctionsRisk(countryCodes: string[]): number {
  if (countryCodes.length === 0) return 0;

  let maxRisk = 0;
  let totalRisk = 0;
  let sanctionedCount = 0;

  for (const cc of countryCodes) {
    const risk = SANCTIONED_COUNTRIES[cc] || 0;
    if (risk > 0) {
      sanctionedCount++;
      totalRisk += risk;
      maxRisk = Math.max(maxRisk, risk);
    }
  }

  // 综合评分：最高风险国家占70%权重，平均占30%
  if (sanctionedCount === 0) return 0;
  const avgRisk = totalRisk / sanctionedCount;
  return Math.round(maxRisk * 0.7 + avgRisk * 0.3);
}

// 因子3: 军事活动 (15%)
function scoreMilitaryActivity(routeCoords: Array<[number, number]>): number {
  if (routeCoords.length === 0) return 0;

  let maxIntensity = 0;
  for (const [lat, lon] of routeCoords) {
    for (const hotspot of MILITARY_HOTSPOTS) {
      if (isInBounds(lat, lon, hotspot.bounds)) {
        maxIntensity = Math.max(maxIntensity, hotspot.intensity);
      }
    }
  }
  return maxIntensity;
}

// 因子4: 所有权集中度 (15%)
function scoreOwnershipConcentration(ownerCount: number): number {
  // 单一所有者 = 最高风险（如果那个实体出问题，整条海缆就完了）
  // 多元化所有权 = 低风险
  if (ownerCount === 0) return 50; // 数据缺失，中等风险
  if (ownerCount === 1) return 80;
  if (ownerCount === 2) return 50;
  if (ownerCount === 3) return 30;
  if (ownerCount <= 5) return 15;
  return 5; // 6+个所有者，非常分散
}

// 因子5: 法律复杂度 (10%)
function scoreLegalComplexity(countryCount: number): number {
  // 经过的国家越多，法律管辖区越多，维修和许可证越复杂
  if (countryCount <= 2) return 10;
  if (countryCount <= 5) return 25;
  if (countryCount <= 10) return 45;
  if (countryCount <= 20) return 65;
  return 80; // 20+个国家
}

// 因子6: 历史破坏记录 (10%)
function scoreHistoricalDamage(routeCoords: Array<[number, number]>): number {
  if (routeCoords.length === 0) return 0;

  let maxFaults = 0;
  for (const [lat, lon] of routeCoords) {
    for (const zone of HIGH_DAMAGE_ZONES) {
      if (isInBounds(lat, lon, zone.bounds)) {
        maxFaults = Math.max(maxFaults, zone.annualFaults);
      }
    }
  }

  // 将年均故障数映射到0-100分
  if (maxFaults >= 25) return 90;
  if (maxFaults >= 15) return 65;
  if (maxFaults >= 10) return 45;
  if (maxFaults >= 5) return 25;
  return 10;
}

// 因子7: 近期事件活跃度 (5%)
// 这个因子将来由GDELT/NewsAPI的实际事件数据驱动
// 现在先基于区域的基准风险估算
function scoreRecentEvents(routeCoords: Array<[number, number]>): number {
  // 简化版：如果路由经过当前活跃冲突区域，给高分
  let score = 0;
  for (const [lat, lon] of routeCoords) {
    // 红海区域（当前最活跃的冲突区）
    if (lat >= 12 && lat <= 20 && lon >= 38 && lon <= 50) score = Math.max(score, 95);
    // 黑海区域
    if (lat >= 41 && lat <= 46 && lon >= 28 && lon <= 40) score = Math.max(score, 80);
    // 波罗的海
    if (lat >= 54 && lat <= 60 && lon >= 18 && lon <= 28) score = Math.max(score, 60);
  }
  return score;
}

// ═══ 主评分函数 ═══
export interface RiskScoreResult {
  scoreOverall: number;       // 综合评分 0-100
  scoreConflict: number;      // 因子1: 冲突水域
  scoreSanctions: number;     // 因子2: 制裁风险
  scoreMilitary: number;      // 因子3: 军事活动
  scoreOwnership: number;     // 因子4: 所有权集中度
  scoreLegal: number;         // 因子5: 法律复杂度
  scoreHistorical: number;    // 因子6: 历史破坏
  scoreEvents: number;        // 因子7: 近期事件
  riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  conflictZones: string[];    // 经过的冲突水域名称
  sanctionedCountries: string[]; // 涉及的制裁国家
}

export function calculateRiskScore(
  routeGeojson: any,
  countryCodes: string[],
  ownerCount: number,
): RiskScoreResult {
  const routeCoords = sampleRouteCoords(routeGeojson);

  // 计算每个因子的原始分数
  const scoreConflict = scoreConflictWaters(routeCoords);
  const scoreSanctions = scoreSanctionsRisk(countryCodes);
  const scoreMilitary = scoreMilitaryActivity(routeCoords);
  const scoreOwnership = scoreOwnershipConcentration(ownerCount);
  const scoreLegal = scoreLegalComplexity(countryCodes.length);
  const scoreHistorical = scoreHistoricalDamage(routeCoords);
  const scoreEvents = scoreRecentEvents(routeCoords);

  // 加权求和
  const scoreOverall = Math.round(
    scoreConflict * 0.25 +
    scoreSanctions * 0.20 +
    scoreMilitary * 0.15 +
    scoreOwnership * 0.15 +
    scoreLegal * 0.10 +
    scoreHistorical * 0.10 +
    scoreEvents * 0.05
  );

  // 确定风险等级
  let riskLevel: RiskScoreResult['riskLevel'];
  if (scoreOverall >= 75) riskLevel = 'CRITICAL';
  else if (scoreOverall >= 55) riskLevel = 'HIGH';
  else if (scoreOverall >= 35) riskLevel = 'ELEVATED';
  else if (scoreOverall >= 15) riskLevel = 'MODERATE';
  else riskLevel = 'LOW';

  // 收集经过的冲突水域
  const conflictZones: string[] = [];
  for (const [lat, lon] of routeCoords) {
    for (const zone of CONFLICT_ZONES) {
      if (isInBounds(lat, lon, zone.bounds) && !conflictZones.includes(zone.name)) {
        conflictZones.push(zone.name);
      }
    }
  }

  // 收集涉及的制裁国家
  const sanctionedCountries = countryCodes.filter(cc => SANCTIONED_COUNTRIES[cc]);

  return {
    scoreOverall,
    scoreConflict,
    scoreSanctions,
    scoreMilitary,
    scoreOwnership,
    scoreLegal,
    scoreHistorical,
    scoreEvents,
    riskLevel,
    conflictZones,
    sanctionedCountries,
  };
}

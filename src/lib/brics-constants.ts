/**
 * BRICS+ 海缆战略分析 — 常量定义
 *
 * 成员体系截至 2025 年：
 *   - 11 个成员国（Members）
 *   - 10 个伙伴国（Partners）
 */

// ─── 成员国 ─────────────────────────────────────────────
export const BRICS_MEMBERS = [
  'BR', 'RU', 'IN', 'CN', 'ZA',           // 创始 + 2011
  'SA', 'IR', 'EG', 'AE', 'ET',           // 2024 加入
  'ID',                                     // 2025 加入
] as const;

// ─── 伙伴国 ─────────────────────────────────────────────
export const BRICS_PARTNERS = [
  'BY', 'BO', 'KZ', 'TH', 'CU', 'UG',    // 2024
  'MY', 'UZ', 'NG', 'VN',                 // 2024-2025
] as const;

export const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;

export type BRICSMemberCode = (typeof BRICS_MEMBERS)[number];
export type BRICSPartnerCode = (typeof BRICS_PARTNERS)[number];
export type BRICSCountryCode = (typeof BRICS_ALL)[number];

// ─── 国家元数据 ─────────────────────────────────────────
export interface BRICSCountryMeta {
  code: string;
  name: string;
  nameZh: string;
  tier: 'member' | 'partner';
  joinYear: number;
  /** 用于地图标注的近似中心坐标 */
  center: [lng: number, lat: number];
}

export const BRICS_COUNTRY_META: Record<string, BRICSCountryMeta> = {
  // ── 成员国 ──
  BR: { code: 'BR', name: 'Brazil',              nameZh: '巴西',       tier: 'member',  joinYear: 2006, center: [-51.9, -14.2] },
  RU: { code: 'RU', name: 'Russia',              nameZh: '俄罗斯',     tier: 'member',  joinYear: 2006, center: [105.3, 61.5] },
  IN: { code: 'IN', name: 'India',               nameZh: '印度',       tier: 'member',  joinYear: 2006, center: [78.9, 20.6] },
  CN: { code: 'CN', name: 'China',               nameZh: '中国',       tier: 'member',  joinYear: 2006, center: [104.2, 35.9] },
  ZA: { code: 'ZA', name: 'South Africa',        nameZh: '南非',       tier: 'member',  joinYear: 2011, center: [22.9, -30.6] },
  SA: { code: 'SA', name: 'Saudi Arabia',         nameZh: '沙特阿拉伯', tier: 'member',  joinYear: 2024, center: [45.1, 23.9] },
  IR: { code: 'IR', name: 'Iran',                nameZh: '伊朗',       tier: 'member',  joinYear: 2024, center: [53.7, 32.4] },
  EG: { code: 'EG', name: 'Egypt',               nameZh: '埃及',       tier: 'member',  joinYear: 2024, center: [30.8, 26.8] },
  AE: { code: 'AE', name: 'UAE',                 nameZh: '阿联酋',     tier: 'member',  joinYear: 2024, center: [53.8, 23.4] },
  ET: { code: 'ET', name: 'Ethiopia',            nameZh: '埃塞俄比亚', tier: 'member',  joinYear: 2024, center: [40.5, 9.1] },
  ID: { code: 'ID', name: 'Indonesia',           nameZh: '印度尼西亚', tier: 'member',  joinYear: 2025, center: [113.9, -0.8] },

  // ── 伙伴国 ──
  BY: { code: 'BY', name: 'Belarus',             nameZh: '白俄罗斯',   tier: 'partner', joinYear: 2024, center: [27.9, 53.7] },
  BO: { code: 'BO', name: 'Bolivia',             nameZh: '玻利维亚',   tier: 'partner', joinYear: 2024, center: [-63.6, -16.3] },
  KZ: { code: 'KZ', name: 'Kazakhstan',          nameZh: '哈萨克斯坦', tier: 'partner', joinYear: 2024, center: [66.9, 48.0] },
  TH: { code: 'TH', name: 'Thailand',            nameZh: '泰国',       tier: 'partner', joinYear: 2024, center: [100.5, 15.9] },
  CU: { code: 'CU', name: 'Cuba',                nameZh: '古巴',       tier: 'partner', joinYear: 2024, center: [-77.8, 21.5] },
  UG: { code: 'UG', name: 'Uganda',              nameZh: '乌干达',     tier: 'partner', joinYear: 2024, center: [32.3, 1.4] },
  MY: { code: 'MY', name: 'Malaysia',             nameZh: '马来西亚',   tier: 'partner', joinYear: 2024, center: [101.9, 4.2] },
  UZ: { code: 'UZ', name: 'Uzbekistan',          nameZh: '乌兹别克斯坦', tier: 'partner', joinYear: 2024, center: [64.6, 41.4] },
  NG: { code: 'NG', name: 'Nigeria',             nameZh: '尼日利亚',   tier: 'partner', joinYear: 2025, center: [8.7, 9.1] },
  VN: { code: 'VN', name: 'Vietnam',             nameZh: '越南',       tier: 'partner', joinYear: 2025, center: [108.3, 14.1] },
};

// ─── 视觉设计 Token ────────────────────────────────────
export const BRICS_COLORS = {
  /** 金砖金 — 主色 */
  gold:        '#D4AF37',
  goldLight:   '#E8D48B',
  goldDark:    '#A68B2B',
  /** 深海蓝 — 背景 */
  navy:        '#0A1628',
  navyLight:   '#132240',
  navySurface: '#1A2D4A',
  /** BRICS → 非 BRICS 海缆颜色 */
  silver:      '#8B95A5',
  /** 矩阵状态色 */
  directGreen:   '#22C55E',
  indirectAmber: '#F59E0B',
  noneRed:       '#EF4444',
  /** 创始五国标志色（蓝红黄绿橙） */
  flagBlue:    '#0066B3',
  flagRed:     '#D32F2F',
  flagYellow:  '#FFC107',
  flagGreen:   '#388E3C',
  flagOrange:  '#F57C00',
} as const;

// ─── 判断工具函数 ──────────────────────────────────────
const memberSet = new Set<string>(BRICS_MEMBERS);
const partnerSet = new Set<string>(BRICS_PARTNERS);
const allSet = new Set<string>(BRICS_ALL);

export function isBRICSMember(code: string): boolean {
  return memberSet.has(code.toUpperCase());
}

export function isBRICSPartner(code: string): boolean {
  return partnerSet.has(code.toUpperCase());
}

export function isBRICSCountry(code: string): boolean {
  return allSet.has(code.toUpperCase());
}

/**
 * 判断一条海缆是否为"BRICS 内部"海缆
 * 条件：该海缆所有登陆站所在国家全部属于 BRICS（成员 + 伙伴）
 */
export function isBRICSInternalCable(countryCodes: string[]): boolean {
  return countryCodes.length >= 2 && countryCodes.every(c => isBRICSCountry(c));
}

/**
 * 判断一条海缆是否"涉及 BRICS"
 * 条件：至少有一个登陆站在 BRICS 国家
 */
export function isBRICSRelatedCable(countryCodes: string[]): boolean {
  return countryCodes.some(c => isBRICSCountry(c));
}


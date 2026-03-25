export const BRICS_MEMBERS = ['BR','RU','IN','CN','ZA','SA','IR','EG','AE','ET','ID'] as const;
export const BRICS_PARTNERS = ['BY','BO','KZ','TH','CU','UG','MY','UZ','NG','VN'] as const;
export const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;
export type BRICSMemberCode = (typeof BRICS_MEMBERS)[number];

export interface BRICSCountryMeta {
  code: string; name: string; nameZh: string;
  tier: 'member' | 'partner'; joinYear: number;
  center: [number, number];
}

export const BRICS_COUNTRY_META: Record<string, BRICSCountryMeta> = {
  BR: { code:'BR', name:'Brazil', nameZh:'巴西', tier:'member', joinYear:2006, center:[-51.9,-14.2] },
  RU: { code:'RU', name:'Russia', nameZh:'俄罗斯', tier:'member', joinYear:2006, center:[105.3,61.5] },
  IN: { code:'IN', name:'India', nameZh:'印度', tier:'member', joinYear:2006, center:[78.9,20.6] },
  CN: { code:'CN', name:'China', nameZh:'中国', tier:'member', joinYear:2006, center:[104.2,35.9] },
  ZA: { code:'ZA', name:'South Africa', nameZh:'南非', tier:'member', joinYear:2011, center:[22.9,-30.6] },
  SA: { code:'SA', name:'Saudi Arabia', nameZh:'沙特阿拉伯', tier:'member', joinYear:2024, center:[45.1,23.9] },
  IR: { code:'IR', name:'Iran', nameZh:'伊朗', tier:'member', joinYear:2024, center:[53.7,32.4] },
  EG: { code:'EG', name:'Egypt', nameZh:'埃及', tier:'member', joinYear:2024, center:[30.8,26.8] },
  AE: { code:'AE', name:'UAE', nameZh:'阿联酋', tier:'member', joinYear:2024, center:[53.8,23.4] },
  ET: { code:'ET', name:'Ethiopia', nameZh:'埃塞俄比亚', tier:'member', joinYear:2024, center:[40.5,9.1] },
  ID: { code:'ID', name:'Indonesia', nameZh:'印度尼西亚', tier:'member', joinYear:2025, center:[113.9,-0.8] },
  BY: { code:'BY', name:'Belarus', nameZh:'白俄罗斯', tier:'partner', joinYear:2024, center:[27.9,53.7] },
  BO: { code:'BO', name:'Bolivia', nameZh:'玻利维亚', tier:'partner', joinYear:2024, center:[-63.6,-16.3] },
  KZ: { code:'KZ', name:'Kazakhstan', nameZh:'哈萨克斯坦', tier:'partner', joinYear:2024, center:[66.9,48.0] },
  TH: { code:'TH', name:'Thailand', nameZh:'泰国', tier:'partner', joinYear:2024, center:[100.5,15.9] },
  CU: { code:'CU', name:'Cuba', nameZh:'古巴', tier:'partner', joinYear:2024, center:[-77.8,21.5] },
  UG: { code:'UG', name:'Uganda', nameZh:'乌干达', tier:'partner', joinYear:2024, center:[32.3,1.4] },
  MY: { code:'MY', name:'Malaysia', nameZh:'马来西亚', tier:'partner', joinYear:2024, center:[101.9,4.2] },
  UZ: { code:'UZ', name:'Uzbekistan', nameZh:'乌兹别克斯坦', tier:'partner', joinYear:2024, center:[64.6,41.4] },
  NG: { code:'NG', name:'Nigeria', nameZh:'尼日利亚', tier:'partner', joinYear:2025, center:[8.7,9.1] },
  VN: { code:'VN', name:'Vietnam', nameZh:'越南', tier:'partner', joinYear:2025, center:[108.3,14.1] },
};

export const BRICS_COLORS = {
  gold: '#D4AF37', goldLight: '#E8D48B', goldDark: '#A68B2B',
  navy: '#0A1628', navyLight: '#132240', navySurface: '#1A2D4A',
  silver: '#8B95A5',
  directGreen: '#22C55E', indirectAmber: '#F59E0B', noneRed: '#EF4444',
  flagBlue: '#0066B3', flagRed: '#D32F2F', flagYellow: '#FFC107', flagGreen: '#388E3C', flagOrange: '#F57C00',
} as const;

const allSet = new Set<string>(BRICS_ALL);
export function isBRICSCountry(code: string): boolean { return allSet.has(code.toUpperCase()); }
export function isBRICSInternalCable(codes: string[]): boolean { return codes.length >= 2 && codes.every(c => allSet.has(c.toUpperCase())); }

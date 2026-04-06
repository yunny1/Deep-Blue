// src/app/country/page.tsx
// 国家海缆分析页面 — 完整重设计版
// 结构：全球统计动画 → 推荐国家标签 → 国家详细数据（中国始终包含大陆+港+澳+台，台湾数据排在末尾）

'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import SubPageHeader from '@/components/layout/SubPageHeader';
import CountryCodeBadge from '@/components/ui/CountryCodeBadge';
import MultiCountryExport from '@/components/country/MultiCountryExport';

// ── 登陆站名称翻译表 ──────────────────────────────────────────────
const STATION_ZH: Record<string, string> = {
  // 中国大陆
  'Shanghai': '上海', 'Qingdao': '青岛', 'Chongming': '崇明',
  'Nansha': '南沙', 'Shantou': '汕头', 'Fuzhou': '福州',
  'Zhoushan': '舟山', 'Xiamen': '厦门', 'Wenzhou': '温州',
  'Yangjiang': '阳江', 'Zhanjiang': '湛江', 'Haikou': '海口',
  'Sanya': '三亚', 'Tianjin': '天津', 'Dalian': '大连',
  'Qinhuangdao': '秦皇岛', 'Weihai': '威海', 'Chengmai': '澄迈',
  'Guangzhou': '广州', 'Shenzhen': '深圳', 'Zhuhai': '珠海',
  'Beihai': '北海', 'Ningbo': '宁波', 'Nantong': '南通',
  // 中国香港
  'Hong Kong': '香港', 'Tseung Kwan O': '将军澳', 'Tai Po': '大埔',
  'Chung Hom Kok': '舂坎角', 'Lantau': '大屿山',
  // 中国台湾
  'Tamsui': '淡水', 'Fangshan': '枋山', 'Toucheng': '头城',
  'Chiayi': '嘉义', 'Keelung': '基隆', 'Kaohsiung': '高雄', 'Tainan': '台南',
  // 中国澳门
  'Macao': '澳门', 'Macau': '澳门',
  // 日本
  'Shima': '志摩', 'Okinawa': '冲绳', 'Fukuoka': '福冈',
  'Chikura': '千倉', 'Miyazaki': '宫崎', 'Shibushi': '志布志',
  'Ninomiya': '二宫', 'Tokyo': '东京', 'Osaka': '大阪', 'Naha': '那霸',
  'Kitaibaraki': '北茨城', 'Hamada': '浜田', 'Maruyama': '丸山',
  // 韩国
  'Busan': '釜山', 'Geoje': '巨济', 'Taean': '泰安',
  'Yangyang': '襄阳', 'Seoul': '首尔', 'Incheon': '仁川',
  // 新加坡
  'Singapore': '新加坡', 'Changi': '樟宜', 'Tuas': '大士',
  // 美国
  'Los Angeles': '洛杉矶', 'San Francisco': '旧金山', 'Seattle': '西雅图',
  'Honolulu': '檀香山', 'Miami': '迈阿密', 'New York': '纽约',
  'Virginia Beach': '弗吉尼亚海滩', 'Morro Bay': '莫罗湾',
  'Grover Beach': '格罗弗海滩', 'Jacksonville': '杰克逊维尔',
  // 太平洋
  'Guam': '关岛', 'Hawaii': '夏威夷',
  // 东南亚
  'Manila': '马尼拉', 'Bangkok': '曼谷', 'Cebu': '宿务',
  'Jakarta': '雅加达', 'Surabaya': '泗水', 'Batam': '巴淡岛',
  'Medan': '棉兰', 'Ho Chi Minh City': '胡志明市', 'Hanoi': '河内',
  'Da Nang': '岘港', 'Vung Tau': '头顿', 'Penang': '槟城',
  'Kuala Lumpur': '吉隆坡', 'Kota Kinabalu': '哥打基纳巴卢',
  'Phnom Penh': '金边', 'Yangon': '仰光',
  // 南亚
  'Mumbai': '孟买', 'Chennai': '金奈', 'Colombo': '科伦坡',
  'Karachi': '卡拉奇', 'Dhaka': '达卡', 'Male': '马累',
  // 中东
  'Dubai': '迪拜', 'Abu Dhabi': '阿布扎比',
  'Muscat': '马斯喀特', 'Fujairah': '富查伊拉',
  'Jeddah': '吉达', 'Kuwait City': '科威特城', 'Doha': '多哈',
  'Djibouti': '吉布提', 'Aden': '亚丁', 'Suez': '苏伊士',
  'Cairo': '开罗', 'Alexandria': '亚历山大',
  // 欧洲
  'London': '伦敦', 'Paris': '巴黎', 'Amsterdam': '阿姆斯特丹',
  'Marseille': '马赛', 'Lisbon': '里斯本', 'Madrid': '马德里',
  'Barcelona': '巴塞罗那', 'Rome': '罗马', 'Athens': '雅典',
  'Istanbul': '伊斯坦布尔', 'Dublin': '都柏林',
  // 非洲
  'Cape Town': '开普敦', 'Lagos': '拉各斯', 'Nairobi': '内罗毕',
  'Mombasa': '蒙巴萨', 'Accra': '阿克拉', 'Dakar': '达喀尔',
  // 大洋洲
  'Sydney': '悉尼', 'Melbourne': '墨尔本', 'Perth': '珀斯',
  'Auckland': '奥克兰', 'Suva': '苏瓦',
  // 美洲
  'Sao Paulo': '圣保罗', 'Rio de Janeiro': '里约热内卢',
  'Buenos Aires': '布宜诺斯艾利斯', 'Santiago': '圣地亚哥',
  'Lima': '利马', 'Bogota': '波哥大', 'Panama City': '巴拿马城',
  'Toronto': '多伦多', 'Vancouver': '温哥华', 'Mexico City': '墨西哥城',
};

function stationName(station: { name: string; nameZh?: string | null } | string, zh: boolean): string {
  const name   = typeof station === 'string' ? station : station.name;
  const nameZh = typeof station === 'string' ? null    : station.nameZh;
  if (!zh) return name;
  if (nameZh) return nameZh;
  if (STATION_ZH[name]) return STATION_ZH[name];
  for (const [en, zhName] of Object.entries(STATION_ZH)) {
    if (name.startsWith(en + ',') || name.startsWith(en + ' (')) return name.replace(en, zhName);
  }
  return name;
}


// ── 溢出内容 Popup ────────────────────────────────────────────────
function OverflowPopup({ items, renderItem, maxShow, zh }: {
  items: any[];
  renderItem: (item: any, i: number) => React.ReactNode;
  maxShow: number;
  zh: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
  const hidden = items.slice(maxShow);

  useEffect(() => {
    if (!visible || !isMobile) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [visible, isMobile]);

  if (hidden.length === 0) return <>{items.map(renderItem)}</>;

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isMobile) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 4 }); setVisible(true);
  };
  const handleClick = (e: React.MouseEvent) => {
    if (!isMobile) return;
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 4 }); setVisible(v => !v);
  };

  return (
    <div ref={ref} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
      {items.slice(0, maxShow).map(renderItem)}
      <span onMouseEnter={handleMouseEnter} onMouseLeave={() => { if (!isMobile) setVisible(false); }} onClick={handleClick}
        style={{ fontSize: 10, color: '#2A9D8F', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.2)' }}>
        +{hidden.length}
      </span>
      {visible && (
        <div style={{ position: 'fixed' as const, left: pos.x, top: pos.y, zIndex: 9999, minWidth: 160, maxWidth: 300,
          backgroundColor: 'rgba(8,16,32,0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(42,157,143,0.25)', borderRadius: 10, padding: '8px 10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
          <div style={{ fontSize: 9, color: '#4B5563', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            {zh ? '全部内容' : 'All items'}
          </div>
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ── 数字滚动动画 Hook ─────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start || target === 0) return;
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration, start]);
  return count;
}

// ── 类型定义 ──────────────────────────────────────────────────────
interface CountryOption {
  code: string; nameEn: string; nameZh: string;
  stationCount: number; isGroup?: boolean;
}
interface StationInCountry {
  id: string; name: string; nameZh?: string | null; countryCode: string;
  regionLabel: string | null; latitude: number; longitude: number;
}
interface CableData {
  id: string; name: string; slug: string; status: string;
  lengthKm: number | null; rfsDate: string | null;
  designCapacityTbps: number | null; fiberPairs: number | null;
  vendor: string | null; owners: string[]; ownerCount: number;
  stationsInCountry: StationInCountry[];
  countries: string[]; totalStations: number;
  type: 'international' | 'domestic' | 'branch';
}
interface StationData {
  id: string; name: string; nameZh?: string | null; countryCode: string;
  regionLabel: string | null; latitude: number; longitude: number;
  cableCount: number; cables: { name: string; slug: string }[];
}
interface AnalysisData {
  country: { code: string; nameEn: string; nameZh: string };
  summary: {
    totalCables: number; internationalCables: number;
    domesticCables: number; branchCables: number; totalStations: number;
    breakdown: { CN: number; HK: number; MO: number; TW: number } | null;
  };
  cables: CableData[];
  stations: StationData[];
}

// ── 常量 ─────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6', DECOMMISSIONED: '#6B7280',
};
const STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  IN_SERVICE:         { zh: '在役',  en: 'In Service'        },
  UNDER_CONSTRUCTION: { zh: '在建',  en: 'Under Construction' },
  PLANNED:            { zh: '规划中', en: 'Planned'           },
  DECOMMISSIONED:     { zh: '已退役', en: 'Decommissioned'    },
};
const TYPE_LABELS: Record<string, { zh: string; en: string; color: string }> = {
  international: { zh: '国际海缆', en: 'International', color: '#2A9D8F' },
  domestic:      { zh: '国内线',   en: 'Domestic',      color: '#3B82F6' },
  branch:        { zh: '支线接入', en: 'Branch',         color: '#8B5CF6' },
};
const REGION_COLORS: Record<string, string> = {
  '中国大陆': '#EF4444', '中国香港': '#3B82F6',
  '中国澳门': '#10B981', '中国台湾': '#F59E0B',
};

// 推荐国家（首屏快速入口）
const FEATURED_COUNTRIES = [
  { code: 'CN', flag: '🇨🇳', labelZh: '中国', labelEn: 'China' },
  { code: 'US', flag: '🇺🇸', labelZh: '美国', labelEn: 'United States' },
  { code: 'JP', flag: '🇯🇵', labelZh: '日本', labelEn: 'Japan' },
  { code: 'SG', flag: '🇸🇬', labelZh: '新加坡', labelEn: 'Singapore' },
  { code: 'GB', flag: '🇬🇧', labelZh: '英国', labelEn: 'United Kingdom' },
  { code: 'AU', flag: '🇦🇺', labelZh: '澳大利亚', labelEn: 'Australia' },
  { code: 'IN', flag: '🇮🇳', labelZh: '印度', labelEn: 'India' },
  { code: 'DE', flag: '🇩🇪', labelZh: '德国', labelEn: 'Germany' },
];

// ── 综合情报 CSV 生成（海缆 + 金砖中转路径）──────────────────────
function generateIntelCSV(json: any, locale: 'zh' | 'en') {
  const zh = locale === 'zh';
  const rows: any[][] = [];

  // ─ 文件头 ─
  rows.push([zh ? '综合情报导出' : 'Intel Export', json.code]);
  rows.push([zh ? '导出时间' : 'Exported', new Date().toLocaleString(zh ? 'zh-CN' : 'en-US')]);
  rows.push(['Deep Blue', 'deep-cloud.org']);
  rows.push([]);

  // ─ 第一区：海缆清单 ─
  rows.push([zh ? '【第一区】海缆清单' : '[Part A] Cable List']);
  rows.push(zh
    ? ['海缆名称','类型','状态','长度(km)','RFS年份','光纤对数','建造商','运营商','本地登陆站','全部登陆站（含国家代码）']
    : ['Cable Name','Type','Status','Length(km)','RFS Year','Fiber Pairs','Vendor','Operators','Local Stations','All Stations(with country)']);

  for (const cable of json.cables ?? []) {
    const typeMap: Record<string, {zh:string;en:string}> = {
      international: {zh:'国际海缆',en:'International'},
      domestic: {zh:'国内线',en:'Domestic'},
      branch: {zh:'支线',en:'Branch'},
    };
    const statusMap: Record<string, {zh:string;en:string}> = {
      IN_SERVICE: {zh:'在役',en:'In Service'},
      UNDER_CONSTRUCTION: {zh:'在建',en:'Under Construction'},
      PLANNED: {zh:'规划中',en:'Planned'},
      DECOMMISSIONED: {zh:'已退役',en:'Decommissioned'},
    };
    rows.push([
      cable.name,
      zh ? (typeMap[cable.type]?.zh ?? cable.type) : (typeMap[cable.type]?.en ?? cable.type),
      zh ? (statusMap[cable.status]?.zh ?? cable.status) : (statusMap[cable.status]?.en ?? cable.status),
      cable.lengthKm ?? '',
      cable.rfsYear ?? '',
      cable.fiberPairs ?? '',
      cable.vendor ?? '',
      cable.operators.join(' | '),
      cable.localStations.map((s: any) => zh ? (s.nameZh || s.name) : s.name).join(' | '),
      cable.allStations.map((s: any) => {
        const n = zh ? (s.nameZh || s.name) : s.name;
        return `${n}(${s.countryCode})`;
      }).join(' | '),
    ]);
  }

  // ─ 第二区：金砖中转路径 ─
  if (json.isBRICS && json.transitPairs?.length > 0) {
    rows.push([]);
    rows.push([zh ? '【第二区】金砖中转路径主权分析' : '[Part B] BRICS Transit Path Sovereignty Analysis']);
    rows.push([zh ? '说明：枚举两段中转以内所有路径，最弱链条原则评定主权等级' : 'Note: All paths within 2 transits. Weakest-link principle for sovereignty rating.']);
    rows.push(zh
      ? ['甲方','乙方','路径类型','路径节点序列','中转国全为金砖','路径主权','主权分','段序号','本段起点','本段终点','海缆名称','状态','长度(km)','RFS年份','建造商','运营商','本段所有登陆站','本段主权','主权分','主权说明','是否最优']
      : ['From','To','Path Type','Path Nodes','All Transit BRICS','Path Sov.','Path Score','Seg#','Seg From','Seg To','Cable Name','Status','Length(km)','RFS Year','Vendor','Operators','Seg All Stations','Seg Sov.','Seg Score','Sov. Reason','Is Best']);

    for (const pair of json.transitPairs) {
      for (const path of pair.paths ?? []) {
        const pathType = path.hopCount === 1
          ? (zh ? '直连' : 'Direct')
          : zh ? `${path.hopCount - 1}段中转` : `${path.hopCount - 1}-hop transit`;

        // 路径节点序列：起点 → [中转] → 终点
        const nodeSeq = [
          zh ? pair.fromNameZh : pair.fromName,
          ...path.transitNames.map((t: any) => zh ? t.nameZh : t.name),
          zh ? pair.toNameZh : pair.toName,
        ].join(' → ');

        for (let si = 0; si < path.segments.length; si++) {
          const seg = path.segments[si];
          if (seg.cables.length === 0) {
            rows.push([
              zh ? pair.fromNameZh : pair.fromName,
              zh ? pair.toNameZh : pair.toName,
              pathType, nodeSeq,
              path.allTransitBRICS ? 'Y' : 'N',
              zh ? path.pathSov.label_zh : path.pathSov.label_en,
              path.pathSov.score,
              si + 1,
              zh ? seg.fromNameZh : seg.fromName,
              zh ? seg.toNameZh : seg.toName,
              zh ? '无数据' : 'No data',
              '','','','','','',
              zh ? seg.bestSov.label_zh : seg.bestSov.label_en,
              seg.bestSov.score,
              zh ? seg.bestSov.reason_zh : seg.bestSov.reason_en,
              '',
            ]);
            continue;
          }
          for (let ci = 0; ci < seg.cables.length; ci++) {
            const cable = seg.cables[ci];
            // 这段海缆的所有登陆站（有国家代码）
            const segStations = cable.stations
              .map((s: any) => { const n = zh ? (s.nameZh || s.name) : s.name; return `${n}(${s.countryCode})`; })
              .join(' | ');
            rows.push([
              zh ? pair.fromNameZh : pair.fromName,
              zh ? pair.toNameZh : pair.toName,
              pathType, nodeSeq,
              path.allTransitBRICS ? 'Y' : 'N',
              zh ? path.pathSov.label_zh : path.pathSov.label_en,
              path.pathSov.score,
              si + 1,
              zh ? seg.fromNameZh : seg.fromName,
              zh ? seg.toNameZh : seg.toName,
              cable.name,
              cable.status.replace(/_/g, ' '),
              cable.lengthKm ?? '',
              cable.rfsYear ?? '',
              cable.vendor ?? '',
              cable.operators.join(' | '),
              segStations,
              zh ? cable.sovereignty.label_zh : cable.sovereignty.label_en,
              cable.sovereignty.score,
              zh ? cable.sovereignty.reason_zh : cable.sovereignty.reason_en,
              ci === 0 ? 'Y' : 'N',
            ]);
          }
        }
      }
    }
  }

  // 生成 CSV 并下载
  const csv = rows.map(row => (row as any[]).map(cell => {
    const s = String(cell ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `deep-blue-intel-${json.code}-${locale}-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
}



// ── CSV 导出 ──────────────────────────────────────────────────────
function exportCSV(data: AnalysisData, locale: 'zh' | 'en') {
  const zh = locale === 'zh';
  const isChinaGroup = data.country.code === 'CHINA' || data.country.code === 'CN_GROUP';
  const countryName = zh ? data.country.nameZh : data.country.nameEn;

  const cableHeaders = zh
  ? ['海缆名称', '类型', '状态', '长度(km)', '投产年份', '容量(Tbps)', '光纤对数', '建造商', '运营商', '本地登陆站', '全部登陆站', ...(isChinaGroup ? ['所属地区'] : []), '覆盖国家数']
  : ['Cable Name', 'Type', 'Status', 'Length (km)', 'RFS Year', 'Capacity (Tbps)', 'Fiber Pairs', 'Vendor', 'Owners', 'Local Stations', 'All Stations', ...(isChinaGroup ? ['Region'] : []), 'Country Count'];

  // 台湾数据排在末尾（仅当中国分组时生效）
  const sortedCablesForExport = [...data.cables].sort((a, b) => {
    if (isChinaGroup) {
      const aIsTW = a.stationsInCountry.length > 0 && a.stationsInCountry.every(s => s.countryCode === 'TW');
      const bIsTW = b.stationsInCountry.length > 0 && b.stationsInCountry.every(s => s.countryCode === 'TW');
      if (aIsTW !== bIsTW) return aIsTW ? 1 : -1;
    }
    return 0;
  });

  const cableRows = sortedCablesForExport.map(c => [
    c.name,
    zh ? TYPE_LABELS[c.type]?.zh : TYPE_LABELS[c.type]?.en,
    zh ? STATUS_LABELS[c.status]?.zh : STATUS_LABELS[c.status]?.en,
    c.lengthKm ?? '',
    c.rfsDate ? new Date(c.rfsDate).getFullYear() : '',
    c.designCapacityTbps ?? '',
    c.fiberPairs ?? '',
    c.vendor ?? '',
    c.owners.join(' / '),
    c.stationsInCountry.map(s => stationName(s, zh)).join(' | '),
    // ✅ 新增：全部登陆站（所有国家，用 | 分隔，中文页面优先显示中文站名）
    (c as any).allStations
      ? (c as any).allStations.map((s: any) => {
          const displayName = zh ? (s.nameZh || s.name) : s.name;
          return `${displayName}(${s.countryCode})`;
        }).join(' | ')
      : c.stationsInCountry.map(s => stationName(s, zh)).join(' | '),
    ...(isChinaGroup ? [[...new Set(c.stationsInCountry.map(s => s.regionLabel).filter(Boolean))].join(' / ')] : []),
    c.countries.length,
  ]);

  const stationHeaders = zh
    ? ['登陆站名称', ...(isChinaGroup ? ['所属地区'] : []), '国家代码', '纬度', '经度', '接入海缆数']
    : ['Station Name', ...(isChinaGroup ? ['Region'] : []), 'Code', 'Lat', 'Lng', 'Cables'];

  const stationRows = [...data.stations].sort((a, b) => {
    if (isChinaGroup) {
      const aIsTW = a.countryCode === 'TW';
      const bIsTW = b.countryCode === 'TW';
      if (aIsTW !== bIsTW) return aIsTW ? 1 : -1;
    }
    return 0;
  }).map(s => [
    stationName(s, zh),
    ...(isChinaGroup ? [s.regionLabel || s.countryCode] : []),
    s.countryCode, s.latitude.toFixed(4), s.longitude.toFixed(4), s.cableCount,
  ]);

  const rows = [
    [zh ? '国家/地区' : 'Country', countryName],
    [zh ? '导出时间' : 'Exported', new Date().toLocaleString(zh ? 'zh-CN' : 'en-US')],
    ['Deep Blue', 'deep-cloud.org'], [],
    [zh ? '📊 统计' : '📊 Summary'],
    [zh ? '总海缆' : 'Total Cables', data.summary.totalCables],
    [zh ? '总登陆站' : 'Stations', data.summary.totalStations],
    [zh ? '国际海缆' : 'International', data.summary.internationalCables],
    [zh ? '国内线' : 'Domestic', data.summary.domesticCables],
    [zh ? '支线' : 'Branch', data.summary.branchCables],
    [], [zh ? '📡 海缆' : '📡 Cables'], cableHeaders, ...cableRows,
    [], [zh ? '🏖️ 登陆站' : '🏖️ Stations'], stationHeaders, ...stationRows,
  ];

  const csv = rows.map(r => (r as any[]).map(c => {
    const s = String(c ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `deep-blue-${data.country.code}-${locale}-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  a.click();
}

// ── 全局统计英雄区（动态数据版）────────────────────────────────────
interface GlobalStatsData {
  cables: {
    total: number; inService: number; underConstruction: number;
    planned: number; decommissioned: number;
    activeInternational: number; activeDomestic: number;
  };
  landingStations: number;
  countries: number;
  totalLengthKm: number;
}
function HeroStats({ zh, onStart, data }: { zh: boolean; onStart: boolean; data: GlobalStatsData | null }) {
  const countries = useCountUp(data?.countries          || 0, 1400, onStart && !!data);
  const stations  = useCountUp(data?.landingStations    || 0, 1800, onStart && !!data);
  const lengthM   = useCountUp(data ? Math.round((data.totalLengthKm || 0) / 10000) : 0, 2000, onStart && !!data);

  const stats = [
    {
      value: countries,
      label: zh ? '覆盖国家与地区' : 'Countries & Territories',
      unit: '+',
      color: '#3B82F6',
      icon: '🌍',
      desc: zh ? '海缆登陆的主权国家和地区' : 'Sovereign nations with landing stations',
    },
    {
      value: stations,
      label: zh ? '全球登陆站数' : 'Landing Stations',
      unit: '',
      color: '#E9C46A',
      icon: '📡',
      desc: zh ? '海缆接触陆地的物理节点' : 'Where cables come ashore',
    },
    {
      value: lengthM,
      label: zh ? '总铺设里程' : 'Total Cable Length',
      unit: zh ? '万 km' : 'M km',
      color: '#8B5CF6',
      icon: '📏',
      desc: zh ? '约为地球到月球距离的3倍' : 'About 3× Earth-Moon distance',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: `1px solid ${s.color}25`,
          borderRadius: 16, padding: '24px 20px',
          position: 'relative' as const, overflow: 'hidden',
          transition: 'transform 0.2s, border-color 0.2s',
          animation: `fadeInUp 0.4s ease ${i * 0.08}s both`,
        }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = `${s.color}50`; }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.borderColor = `${s.color}25`; }}
        >
          <div style={{ position: 'absolute' as const, top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', backgroundColor: s.color, opacity: 0.06, filter: 'blur(20px)' }} />
          <div style={{ fontSize: 24, marginBottom: 12 }}>{s.icon}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {data ? s.value.toLocaleString() : '—'}
            </span>
            {s.unit && data && <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.unit}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF', marginBottom: 4 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: '#4B5563', lineHeight: 1.5 }}>{s.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── 主内容 ────────────────────────────────────────────────────────
function CountryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [globalStats, setGlobalStats] = useState<GlobalStatsData | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(searchParams.get('code') || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'cables' | 'stations'>('cables');
  const [typeFilter, setTypeFilter] = useState<'all' | 'international' | 'domestic' | 'branch'>('all');
  const [exporting, setExporting] = useState(false);
  // 中国分析始终包含大陆、香港、澳门、台湾（台湾数据排在列表末尾）

  const heroRef = useRef<HTMLDivElement>(null);

  // 加载全局统计
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(d => {
      // 递归解析，兼容双重编码
      let parsed = d;
      while (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { break; } }
      if (parsed?.cables?.total) setGlobalStats(parsed);
    }).catch(() => {});
  }, []);

  // 加载国家列表
  useEffect(() => {
    fetch('/api/analysis/country', { method: 'POST' })
      .then(r => r.json())
      .then(d => setCountries(d.countries || []))
      .catch(() => {});
  }, []);

  // 加载分析数据
  useEffect(() => {
    if (!selectedCode) return;
    setLoading(true); setData(null);
    // 中国始终请求 CN_WITH_TW（包含大陆+港+澳+台），台湾数据由后端排在末尾
    const code = selectedCode === 'CN' ? 'CN_WITH_TW' : selectedCode;
    fetch(`/api/analysis/country?code=${code}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    router.replace(`/country?code=${selectedCode}`);
  }, [selectedCode]);

  const isChinaSelected = selectedCode === 'CN';
  const isChinaGroup = data?.country.code?.startsWith('CN') || false;

  // 台湾数据排在末尾：只有 stationsInCountry 全部是台湾的海缆才排最后
  const filteredCables = (data?.cables.filter(c =>
    typeFilter === 'all' ? true : c.type === typeFilter
  ) || []).sort((a, b) => {
    if (isChinaGroup) {
      const aIsTW = a.stationsInCountry.length > 0 && a.stationsInCountry.every(s => s.countryCode === 'TW');
      const bIsTW = b.stationsInCountry.length > 0 && b.stationsInCountry.every(s => s.countryCode === 'TW');
      if (aIsTW !== bIsTW) return aIsTW ? 1 : -1;
    }
    return 0;
  });

  const filteredCountries = countries.filter(c =>
    c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nameZh?.includes(searchQuery) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = (exportLocale: 'zh' | 'en') => {
    if (!data) return;
    setExporting(true);
    setTimeout(() => { exportCSV(data, exportLocale); setExporting(false); }, 100);
  };

  const selectCountry = (code: string) => {
    setSelectedCode(code);
    setTypeFilter('all');
    setActiveTab('cables');
    // 平滑滚动到数据区
    setTimeout(() => {
      document.getElementById('data-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <SubPageHeader
        badgeZh="分析工具"
        badgeEn="Analysis Tool"
        titleZh="国家海缆分析"
        titleEn="Country Analysis"
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>

        {/* ── 全局海缆类型统计横幅 ── */}
        {globalStats && (
          <div style={{
            marginBottom: 32,
            backgroundColor: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(42,157,143,0.15)',
            borderRadius: 16, padding: '20px 24px',
            animation: 'fadeInUp 0.4s ease 0.1s both',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>
              🌐 {zh ? '全球海缆总览' : 'Global Cable Overview'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { n: globalStats.cables.total,                    label: zh ? '全球总计' : 'Total',           color: '#2A9D8F', pct: 100 },
                { n: globalStats.cables.activeInternational || 0, label: zh ? '在役国际' : 'Active Intl.',    color: '#06D6A0', pct: Math.round((globalStats.cables.activeInternational || 0) / globalStats.cables.total * 100) },
                { n: globalStats.cables.activeDomestic      || 0, label: zh ? '在役国内' : 'Active Domestic', color: '#3B82F6', pct: Math.round((globalStats.cables.activeDomestic || 0) / globalStats.cables.total * 100) },
                { n: globalStats.cables.underConstruction   || 0, label: zh ? '在建'     : 'Under Const.',   color: '#E9C46A', pct: Math.round((globalStats.cables.underConstruction || 0) / globalStats.cables.total * 100) },
                { n: globalStats.cables.planned             || 0, label: zh ? '规划中'   : 'Planned',        color: '#60A5FA', pct: Math.round((globalStats.cables.planned || 0) / globalStats.cables.total * 100) },
                { n: globalStats.cables.decommissioned      || 0, label: zh ? '已退役'   : 'Decommissioned', color: '#D97706', pct: Math.round((globalStats.cables.decommissioned || 0) / globalStats.cables.total * 100) },
              ].map((s, i) => (
                <div key={i} style={{ position: 'relative' as const }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.n}</span>
                    <span style={{ fontSize: 11, color: '#4B5563' }}>{s.pct}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', backgroundColor: s.color, borderRadius: 2, transition: 'width 1s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              ))}
            </div>
            {/* 比例合并横条 */}
            <div style={{ height: 6, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 1 }}>
              <div style={{ flex: globalStats.cables.activeInternational || 0, backgroundColor: '#06D6A0' }} />
              <div style={{ flex: globalStats.cables.activeDomestic      || 0, backgroundColor: '#3B82F6' }} />
              <div style={{ flex: globalStats.cables.underConstruction   || 0, backgroundColor: '#E9C46A' }} />
              <div style={{ flex: globalStats.cables.planned             || 0, backgroundColor: '#60A5FA' }} />
              <div style={{ flex: globalStats.cables.decommissioned      || 0, backgroundColor: '#D97706' }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' as const }}>
              {[
                { color: '#06D6A0', label: zh ? '在役国际' : 'Active Intl.' },
                { color: '#3B82F6', label: zh ? '在役国内' : 'Active Domestic' },
                { color: '#E9C46A', label: zh ? '在建'     : 'Under Const.' },
                { color: '#60A5FA', label: zh ? '规划中'   : 'Planned' },
                { color: '#D97706', label: zh ? '已退役'   : 'Decommissioned' },
              ].map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
                  <span style={{ fontSize: 10, color: '#4B5563' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 全球统计英雄区 ── */}
        <div ref={heroRef}>
          <HeroStats zh={zh} onStart={!!globalStats} data={globalStats} />
        </div>
        
         {/* ── 多国批量导出 ── */}        {/* ← 新增这一块 */}
        <div style={{ marginBottom: 32, animation: 'fadeInUp 0.4s ease 0.15s both' }}>
          <MultiCountryExport />
        </div>


        {/* ── 推荐国家快速入口 ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {zh ? '快速选择' : 'Quick Select'}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {FEATURED_COUNTRIES.map(c => (
              <button key={c.code} onClick={() => selectCountry(c.code)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${selectedCode === c.code ? 'rgba(42,157,143,0.5)' : 'rgba(255,255,255,0.08)'}`,
                backgroundColor: selectedCode === c.code ? 'rgba(42,157,143,0.12)' : 'rgba(255,255,255,0.03)',
                color: selectedCode === c.code ? '#2A9D8F' : '#9CA3AF',
                fontSize: 13, fontWeight: selectedCode === c.code ? 700 : 400,
                transition: 'all 0.2s',
              }}
                onMouseOver={e => { if (selectedCode !== c.code) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.color = '#EDF2F7'; } }}
                onMouseOut={e => { if (selectedCode !== c.code) { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#9CA3AF'; } }}
              >
                <span style={{ fontSize: 18 }}>{c.flag}</span>
                <span>{zh ? c.labelZh : c.labelEn}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 搜索所有国家 ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ position: 'relative', maxWidth: 440 }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#4B5563', pointerEvents: 'none' }}>🔍</span>
            <input type="text"
              placeholder={zh ? '搜索任意国家名称或代码...' : 'Search any country name or code...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 14px 0 40px', color: '#EDF2F7', fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(42,157,143,0.4)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
            {searchQuery && filteredCountries.length > 0 && (
              <div style={{ position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: 'rgba(10,17,34,0.99)', backdropFilter: 'blur(16px)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 10, maxHeight: 280, overflowY: 'auto', zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
                {filteredCountries.slice(0, 15).map(c => (
                  <div key={c.code}
                    onClick={() => { selectCountry(c.code); setSearchQuery(''); }}
                    style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background-color 0.15s' }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span style={{ fontSize: 13, color: '#EDF2F7' }}>{zh ? (c.nameZh || c.nameEn) : c.nameEn}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#4B5563', fontFamily: 'monospace' }}>{c.code}</span>
                      <span style={{ fontSize: 10, color: '#2A9D8F' }}>{c.stationCount} {zh ? '站' : 'stn'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 数据区 ── */}
        <div id="data-section">

          {!selectedCode && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#4B5563' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>👆</div>
              <div style={{ fontSize: 15, color: '#6B7280' }}>
                {zh ? '选择一个国家开始分析' : 'Select a country to begin analysis'}
              </div>
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 80, color: '#6B7280' }}>
              <div style={{ width: 36, height: 36, border: '3px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 14 }}>{zh ? '正在分析数据...' : 'Analyzing...'}</div>
            </div>
          )}

          {data && !loading && (
            <div style={{ animation: 'fadeInUp 0.4s ease' }}>

              {/* 国家标题行 + 导出 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#EDF2F7', margin: '0 0 4px' }}>
                    {zh ? data.country.nameZh : data.country.nameEn}
                  </h2>
                  {isChinaGroup && data.summary.breakdown && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: zh ? '大陆' : 'Mainland', code: 'CN', count: data.summary.breakdown.CN, color: '#EF4444' },
                        { label: zh ? '香港' : 'HK', code: 'HK', count: data.summary.breakdown.HK, color: '#3B82F6' },
                        { label: zh ? '澳门' : 'MO', code: 'MO', count: data.summary.breakdown.MO, color: '#10B981' },
                        { label: zh ? '台湾' : 'TW', code: 'TW', count: data.summary.breakdown.TW ?? 0, color: '#F59E0B' },
                      ].map(r => (
                        <span key={r.code} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: `${r.color}15`, color: r.color, border: `1px solid ${r.color}30` }}>
                          {r.label} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => handleExport('zh')} disabled={exporting}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(42,157,143,0.3)', backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📥 {exporting ? '...' : zh ? '导出中文' : '导出中文'}
                  </button>
                  <button onClick={() => handleExport('en')} disabled={exporting}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📥 {exporting ? '...' : 'Export EN'}
                  </button>
                  {/* ✅ 综合情报导出：海缆数据 + 金砖中转路径（仅金砖国家显示） */}
                  <button
                    onClick={async () => {
                      setExporting(true);
                      try {
                        const code = selectedCode === 'CN' ? 'CN_WITH_TW' : selectedCode;
                        const res = await fetch(`/api/country/intel-export?code=${code}&locale=${locale}`);
                        const json = await res.json();
                        generateIntelCSV(json, locale as 'zh' | 'en');
                      } catch (e) {
                        console.error('Intel export failed', e);
                      } finally {
                        setExporting(false);
                      }
                    }}
                    disabled={!data || exporting}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: !data || exporting ? 'not-allowed' : 'pointer',
                      border: '1px solid rgba(212,175,55,0.4)',
                      backgroundColor: 'rgba(212,175,55,0.08)',
                      color: '#D4AF37',
                      opacity: !data ? 0.5 : 1,
                    }}
                  >
                    📊 {exporting ? '...' : (zh ? '综合情报导出' : 'Intel Export')}
                  </button>
                </div>
              </div>

              {/* 统计卡片 — 层级结构 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' as const }}>
                <div style={{ flex: '1 1 140px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(233,196,106,0.25)', padding: '16px 18px' }}>
                  <div style={{ fontSize: 18, marginBottom: 8 }}>📡</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#E9C46A', lineHeight: 1 }}>{data.summary.totalStations}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{zh ? '总登陆站数' : 'Landing Stations'}</div>
                </div>
                <div style={{ flex: '2 1 300px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(42,157,143,0.25)', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>🔌</span>
                    <span style={{ fontSize: 28, fontWeight: 800, color: '#2A9D8F' }}>{data.summary.totalCables}</span>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{zh ? '条海缆' : 'cables total'}</span>
                  </div>
                  {[
                    { n: data.summary.internationalCables, label: zh ? '国际海缆' : 'International', color: '#06D6A0' },
                    { n: data.summary.domesticCables,      label: zh ? '国内线'   : 'Domestic',      color: '#3B82F6' },
                    { n: data.summary.branchCables,        label: zh ? '支线接入' : 'Branch',        color: '#8B5CF6' },
                  ].map((s, i) => {
                    const pct = data.summary.totalCables > 0 ? (s.n / data.summary.totalCables) * 100 : 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: '#4B5563', width: 4 }}>├</span>
                        <div style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: s.color, borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, minWidth: 24, textAlign: 'right' as const }}>{s.n}</span>
                        <span style={{ fontSize: 10, color: '#6B7280', minWidth: 60 }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tab 切换 */}
              <div style={{ display: 'flex', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {[
                  { key: 'cables',   zh: `海缆 (${data.cables.length})`,   en: `Cables (${data.cables.length})`    },
                  { key: 'stations', zh: `登陆站 (${data.stations.length})`, en: `Stations (${data.stations.length})` },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, color: activeTab === tab.key ? '#2A9D8F' : '#6B7280', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid #2A9D8F' : '2px solid transparent', transition: 'all 0.2s' }}>
                    {zh ? tab.zh : tab.en}
                  </button>
                ))}
              </div>

              {/* 海缆明细 */}
              {activeTab === 'cables' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    {(['all', 'international', 'domestic', 'branch'] as const).map(t => (
                      <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', border: `1px solid ${typeFilter === t ? (t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color) : 'rgba(255,255,255,0.08)'}`, backgroundColor: typeFilter === t ? `${t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color}15` : 'transparent', color: typeFilter === t ? (t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color) : '#6B7280', transition: 'all 0.15s' }}>
                        {t === 'all' ? (zh ? `全部 (${data.cables.length})` : `All (${data.cables.length})`)
                          : zh ? `${TYPE_LABELS[t].zh} (${data.cables.filter(c => c.type === t).length})`
                          : `${TYPE_LABELS[t].en} (${data.cables.filter(c => c.type === t).length})`}
                      </button>
                    ))}
                  </div>

                  <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 1.5fr 1fr', padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1 }}>
                      <div>{zh ? '海缆名称' : 'Cable'}</div>
                      <div>{zh ? '类型' : 'Type'}</div>
                      <div>{zh ? '状态' : 'Status'}</div>
                      <div>{zh ? '长度' : 'Length'}</div>
                      <div>{zh ? '本地登陆站' : 'Local Stations'}</div>
                      <div>{zh ? '运营商' : 'Operators'}</div>
                    </div>
                    {filteredCables.map((cable, i) => (
                      <a key={cable.id} href={`/?cable=${cable.slug}`} style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 1.5fr 1fr', padding: '11px 16px', borderBottom: i < filteredCables.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background-color 0.15s' }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.04)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{cable.name}</div>
                          <div><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: `${TYPE_LABELS[cable.type]?.color}15`, color: TYPE_LABELS[cable.type]?.color }}>{zh ? TYPE_LABELS[cable.type]?.zh : TYPE_LABELS[cable.type]?.en}</span></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: STATUS_COLORS[cable.status] || '#6B7280', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: STATUS_COLORS[cable.status] || '#6B7280' }}>{zh ? STATUS_LABELS[cable.status]?.zh : STATUS_LABELS[cable.status]?.en}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : '—'}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {cable.stationsInCountry.length === 0 ? '—' : (
                              <OverflowPopup items={cable.stationsInCountry} maxShow={2} zh={zh}
                                renderItem={(s: any, si: number) => (
                                  <span key={s.id} style={{ marginRight: 2 }}>
                                    {si > 0 && '、'}{stationName(s, zh)}
                                    {isChinaGroup && s.regionLabel && <span style={{ fontSize: 9, color: REGION_COLORS[s.regionLabel] || '#6B7280', marginLeft: 2 }}>({s.regionLabel.replace('中国', '')})</span>}
                                  </span>
                                )}
                              />
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {cable.owners.length === 0 ? '—' : (
                              <OverflowPopup items={cable.owners} maxShow={1} zh={zh}
                                renderItem={(owner: string, i: number) => (
                                  <span key={i} style={{ marginRight: 2 }}>{i > 0 && ', '}{owner}</span>
                                )}
                              />
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                    {filteredCables.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>{zh ? '无符合条件的海缆' : 'No cables match'}</div>}
                  </div>
                </div>
              )}

              {/* 登陆站明细 */}
              {activeTab === 'stations' && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `2fr ${isChinaGroup ? '90px ' : ''}110px 110px 50px 3fr`, padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1 }}>
                    <div>{zh ? '登陆站名称' : 'Station'}</div>
                    {isChinaGroup && <div>{zh ? '地区' : 'Region'}</div>}
                    <div>{zh ? '纬度' : 'Lat'}</div>
                    <div>{zh ? '经度' : 'Lng'}</div>
                    <div>{zh ? '缆数' : 'Cables'}</div>
                    <div>{zh ? '接入海缆' : 'Cable List'}</div>
                  </div>
                  {/* 台湾登陆站排在末尾 */}
                  {[...data.stations].sort((a, b) => {
                    if (isChinaGroup) {
                      const aIsTW = a.countryCode === 'TW';
                      const bIsTW = b.countryCode === 'TW';
                      if (aIsTW !== bIsTW) return aIsTW ? 1 : -1;
                    }
                    return 0;
                  }).map((station, i) => (
                    <div key={station.id} style={{ display: 'grid', gridTemplateColumns: `2fr ${isChinaGroup ? '90px ' : ''}110px 110px 50px 3fr`, padding: '11px 16px', borderBottom: i < data.stations.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{stationName(station, zh)}</div>
                      {isChinaGroup && (
                        <div><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, backgroundColor: `${REGION_COLORS[station.regionLabel || ''] || '#6B7280'}15`, color: REGION_COLORS[station.regionLabel || ''] || '#9CA3AF' }}>{station.regionLabel?.replace('中国', '') || station.countryCode}</span></div>
                      )}
                      <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{station.latitude.toFixed(3)}°</div>
                      <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{station.longitude.toFixed(3)}°</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2A9D8F' }}>{station.cableCount}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <OverflowPopup items={station.cables} maxShow={3} zh={zh}
                          renderItem={(c: any) => (
                            <a key={c.slug} href={`/?cable=${c.slug}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.15)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>{c.name}</a>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 20, fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
                {zh ? '数据来源：TeleGeography · 支线判断：本地仅1站且总站>4 · Deep Blue' : 'Source: TeleGeography · Branch: 1 local station & total > 4 · Deep Blue'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CountryPage() {
  return (
    <I18nProvider>
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
        <CountryContent />
      </Suspense>
    </I18nProvider>
  );
}

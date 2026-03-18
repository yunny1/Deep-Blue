// src/app/country/page.tsx
// 国家海缆分析页面 — 完整重设计版
// 结构：全球统计动画 → 推荐国家标签 → 国家详细数据（中国有台湾专属选项）

'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import LangSwitcher from '@/components/layout/LangSwitcher';

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

function stationName(name: string, zh: boolean): string {
  if (!zh) return name;
  if (STATION_ZH[name]) return STATION_ZH[name];
  for (const [en, zhName] of Object.entries(STATION_ZH)) {
    if (name.startsWith(en + ',') || name.startsWith(en + ' (')) return name.replace(en, zhName);
  }
  return name;
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
  id: string; name: string; countryCode: string;
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
  id: string; name: string; countryCode: string;
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

// ── CSV 导出 ──────────────────────────────────────────────────────
function exportCSV(data: AnalysisData, locale: 'zh' | 'en') {
  const zh = locale === 'zh';
  const isChinaGroup = data.country.code === 'CHINA' || data.country.code === 'CN_GROUP';
  const countryName = zh ? data.country.nameZh : data.country.nameEn;

  const cableHeaders = zh
    ? ['海缆名称', '类型', '状态', '长度(km)', '投产年份', '容量(Tbps)', '光纤对数', '建造商', '运营商', '本地登陆站', ...(isChinaGroup ? ['所属地区'] : []), '覆盖国家数']
    : ['Cable Name', 'Type', 'Status', 'Length (km)', 'RFS Year', 'Capacity (Tbps)', 'Fiber Pairs', 'Vendor', 'Owners', 'Local Stations', ...(isChinaGroup ? ['Region'] : []), 'Country Count'];

  const cableRows = data.cables.map(c => [
    c.name,
    zh ? TYPE_LABELS[c.type]?.zh : TYPE_LABELS[c.type]?.en,
    zh ? STATUS_LABELS[c.status]?.zh : STATUS_LABELS[c.status]?.en,
    c.lengthKm ?? '',
    c.rfsDate ? new Date(c.rfsDate).getFullYear() : '',
    c.designCapacityTbps ?? '',
    c.fiberPairs ?? '',
    c.vendor ?? '',
    c.owners.join(' / '),
    c.stationsInCountry.map(s => stationName(s.name, zh)).join(' / '),
    ...(isChinaGroup ? [[...new Set(c.stationsInCountry.map(s => s.regionLabel).filter(Boolean))].join(' / ')] : []),
    c.countries.length,
  ]);

  const stationHeaders = zh
    ? ['登陆站名称', ...(isChinaGroup ? ['所属地区'] : []), '国家代码', '纬度', '经度', '接入海缆数']
    : ['Station Name', ...(isChinaGroup ? ['Region'] : []), 'Code', 'Lat', 'Lng', 'Cables'];

  const stationRows = data.stations.map(s => [
    stationName(s.name, zh),
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

// ── 全局统计英雄区 ────────────────────────────────────────────────
function HeroStats({ zh, onStart }: { zh: boolean; onStart: boolean }) {
  const cables    = useCountUp(690,  1600, onStart);
  const countries = useCountUp(160,  1400, onStart);
  const stations  = useCountUp(1907, 1800, onStart);
  const lengthKm  = useCountUp(1300000, 2000, onStart); // 约130万公里

  const stats = [
    {
      value: cables,
      label: zh ? '全球海缆总数' : 'Submarine Cables',
      unit: '',
      color: '#2A9D8F',
      icon: '🔌',
      desc: zh ? '覆盖全球各大洲与大洋' : 'Spanning every ocean and continent',
    },
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
      value: Math.round(lengthKm / 10000),
      label: zh ? '总铺设里程' : 'Total Cable Length',
      unit: zh ? '万 km' : 'M km',
      color: '#8B5CF6',
      icon: '📏',
      desc: zh ? '约为地球到月球距离的3倍' : 'About 3× Earth-Moon distance',
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: `1px solid ${s.color}25`,
          borderRadius: 16, padding: '24px 20px',
          position: 'relative', overflow: 'hidden',
          transition: 'transform 0.2s, border-color 0.2s',
        }}
          onMouseOver={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = `${s.color}50`; }}
          onMouseOut={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.borderColor = `${s.color}25`; }}
        >
          {/* 背景光晕 */}
          <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', backgroundColor: s.color, opacity: 0.06, filter: 'blur(20px)' }} />
          <div style={{ fontSize: 24, marginBottom: 12 }}>{s.icon}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: s.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {s.value.toLocaleString()}
            </span>
            {s.unit && <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.unit}</span>}
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

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(searchParams.get('code') || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'cables' | 'stations'>('cables');
  const [typeFilter, setTypeFilter] = useState<'all' | 'international' | 'domestic' | 'branch'>('all');
  const [exporting, setExporting] = useState(false);
  const [heroStarted, setHeroStarted] = useState(false);
  // 中国专属：是否包含台湾
  const [includeTaiwan, setIncludeTaiwan] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);

  // 触发英雄区数字动画（进入视口时开始）
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHeroStarted(true); },
      { threshold: 0.3 }
    );
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
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
    // 中国时根据台湾勾选状态决定请求哪个 code
    const code = selectedCode === 'CN' ? (includeTaiwan ? 'CN_WITH_TW' : 'CN') : selectedCode;
    fetch(`/api/analysis/country?code=${code}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    router.replace(`/country?code=${selectedCode}`);
  }, [selectedCode, includeTaiwan]);

  const isChinaSelected = selectedCode === 'CN';
  const isChinaGroup = data?.country.code?.startsWith('CN') || false;

  const filteredCables = data?.cables.filter(c =>
    typeFilter === 'all' ? true : c.type === typeFilter
  ) || [];

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
    if (code !== 'CN') setIncludeTaiwan(false);
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

      {/* 导航栏 */}
      <nav style={{ height: 56, backgroundColor: 'rgba(13,27,42,0.97)', borderBottom: '1px solid rgba(42,157,143,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icons/deep-blue-icon.png" alt="Deep Blue" style={{ width: 28, height: 28, borderRadius: 5 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 11, color: '#2A9D8F', padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.08)', border: '1px solid rgba(42,157,143,0.2)', fontWeight: 600, letterSpacing: 0.5 }}>
            {zh ? '国家海缆分析' : 'Country Analysis'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}>{zh ? '← 返回地图' : '← Back to Map'}</a>
          <LangSwitcher />
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>

        {/* ── 页面标题 ── */}
        <div style={{ marginBottom: 36, animation: 'fadeInUp 0.5s ease' }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#EDF2F7', margin: '0 0 8px', lineHeight: 1.3 }}>
            {zh ? '全球海缆国家分析' : 'Global Cable Country Analysis'}
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
            {zh
              ? '探索全球 690 条海缆的分布格局，按国家维度查看登陆站、海缆类型与连接关系，支持中英文数据导出。'
              : 'Explore the distribution of 690+ submarine cables. View landing stations, cable types and connectivity by country, with CSV export.'
            }
          </p>
        </div>

        {/* ── 全球统计英雄区 ── */}
        <div ref={heroRef}>
          <HeroStats zh={zh} onStart={heroStarted} />
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

          {/* 中国专属：台湾选项框 */}
          {isChinaSelected && (
            <div style={{ marginBottom: 24, padding: '16px 20px', backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', animation: 'fadeInUp 0.3s ease' }}>
              <span style={{ fontSize: 13, color: '#9CA3AF', flex: 1 }}>
                {zh
                  ? '中国的分析默认包含大陆、香港、澳门。是否同时纳入台湾地区？'
                  : 'China analysis includes Mainland, Hong Kong, and Macao by default. Include Taiwan?'
                }
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}>
                <div onClick={() => setIncludeTaiwan(!includeTaiwan)} style={{
                  width: 44, height: 24, borderRadius: 12,
                  backgroundColor: includeTaiwan ? '#2A9D8F' : 'rgba(255,255,255,0.1)',
                  position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                  border: `1px solid ${includeTaiwan ? '#2A9D8F' : 'rgba(255,255,255,0.2)'}`,
                }}>
                  <div style={{ position: 'absolute', top: 2, left: includeTaiwan ? 22 : 2, width: 18, height: 18, borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: includeTaiwan ? '#2A9D8F' : '#6B7280' }}>
                  {zh ? (includeTaiwan ? '已包含台湾' : '不含台湾') : (includeTaiwan ? 'Taiwan included' : 'Exclude Taiwan')}
                </span>
              </label>
            </div>
          )}

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
                        ...(includeTaiwan ? [{ label: zh ? '台湾' : 'TW', code: 'TW', count: data.summary.breakdown.TW, color: '#F59E0B' }] : []),
                      ].map(r => (
                        <span key={r.code} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, backgroundColor: `${r.color}15`, color: r.color, border: `1px solid ${r.color}30` }}>
                          {r.label} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleExport('zh')} disabled={exporting}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(42,157,143,0.3)', backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📥 {exporting ? '...' : zh ? '导出中文' : '导出中文'}
                  </button>
                  <button onClick={() => handleExport('en')} disabled={exporting}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#9CA3AF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📥 {exporting ? '...' : 'Export EN'}
                  </button>
                </div>
              </div>

              {/* 统计卡片 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                {[
                  { n: data.summary.totalCables,         label: zh ? '总海缆数'   : 'Total Cables',     color: '#2A9D8F', icon: '🔌' },
                  { n: data.summary.totalStations,       label: zh ? '总登陆站数' : 'Landing Stations',  color: '#E9C46A', icon: '📡' },
                  { n: data.summary.internationalCables, label: zh ? '国际海缆'   : 'International',     color: '#06D6A0', icon: '🌐' },
                  { n: data.summary.domesticCables,      label: zh ? '国内线'     : 'Domestic',          color: '#3B82F6', icon: '🏠' },
                  { n: data.summary.branchCables,        label: zh ? '支线接入'   : 'Branch',            color: '#8B5CF6', icon: '⑂'  },
                ].map((s, i) => (
                  <div key={i} style={{ flex: '1 1 140px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, border: `1px solid ${s.color}25`, padding: '16px 18px' }}>
                    <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.n}</div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
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
                            {cable.stationsInCountry.slice(0, 2).map((s, si) => (
                              <span key={s.id}>{si > 0 && '、'}{stationName(s.name, zh)}{isChinaGroup && s.regionLabel && <span style={{ fontSize: 9, color: REGION_COLORS[s.regionLabel] || '#6B7280', marginLeft: 2 }}>({s.regionLabel.replace('中国', '')})</span>}</span>
                            ))}
                            {cable.stationsInCountry.length > 2 && <span style={{ color: '#4B5563' }}> +{cable.stationsInCountry.length - 2}</span>}
                            {cable.stationsInCountry.length === 0 && '—'}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {cable.owners.slice(0, 1).join(', ')}
                            {cable.owners.length > 1 && <span style={{ color: '#4B5563' }}> +{cable.owners.length - 1}</span>}
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
                  {data.stations.map((station, i) => (
                    <div key={station.id} style={{ display: 'grid', gridTemplateColumns: `2fr ${isChinaGroup ? '90px ' : ''}110px 110px 50px 3fr`, padding: '11px 16px', borderBottom: i < data.stations.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{stationName(station.name, zh)}</div>
                      {isChinaGroup && (
                        <div><span style={{ fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 4, backgroundColor: `${REGION_COLORS[station.regionLabel || ''] || '#6B7280'}15`, color: REGION_COLORS[station.regionLabel || ''] || '#9CA3AF' }}>{station.regionLabel?.replace('中国', '') || station.countryCode}</span></div>
                      )}
                      <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{station.latitude.toFixed(3)}°</div>
                      <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{station.longitude.toFixed(3)}°</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2A9D8F' }}>{station.cableCount}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {station.cables.slice(0, 3).map(c => (
                          <a key={c.slug} href={`/?cable=${c.slug}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.15)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{c.name}</a>
                        ))}
                        {station.cables.length > 3 && <span style={{ fontSize: 10, color: '#4B5563' }}>+{station.cables.length - 3}</span>}
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

// src/app/country/page.tsx
// 国家海缆分析页面 — 支持大中华区聚合查询
// 查询 code='CHINA' 时自动合并大陆+港+澳+台的数据

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import LangSwitcher from '@/components/layout/LangSwitcher';

interface CountryOption {
  code: string; nameEn: string; nameZh: string;
  stationCount: number; isGroup: boolean;
}

interface StationInCountry {
  id: string; name: string; countryCode: string;
  regionLabel: string | null;
  latitude: number; longitude: number;
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
  regionLabel: string | null;
  latitude: number; longitude: number;
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
// 大中华区各地区颜色标注
const REGION_COLORS: Record<string, string> = {
  '中国大陆': '#EF4444', '中国香港': '#3B82F6',
  '中国澳门': '#10B981', '中国台湾': '#F59E0B',
};

// ── CSV 导出 ──────────────────────────────────────────────────────
function exportCSV(data: AnalysisData, locale: 'zh' | 'en') {
  const zh = locale === 'zh';
  const countryName = zh ? data.country.nameZh : data.country.nameEn;
  const isChinaGroup = data.country.code === 'CHINA';

  const cableHeaders = zh
    ? ['海缆名称', '类型', '状态', '长度(km)', '投产年份', '设计容量(Tbps)', '光纤对数', '建造商', '运营商', '运营商数量', '本地登陆站', isChinaGroup ? '所属地区' : '', '覆盖国家数', '总登陆站数']
    : ['Cable Name', 'Type', 'Status', 'Length (km)', 'RFS Year', 'Capacity (Tbps)', 'Fiber Pairs', 'Vendor', 'Owners', 'Owner Count', 'Local Stations', isChinaGroup ? 'Region' : '', 'Country Count', 'Total Stations'];

  const cableRows = data.cables.map(c => [
    c.name,
    zh ? TYPE_LABELS[c.type].zh : TYPE_LABELS[c.type].en,
    zh ? (STATUS_LABELS[c.status]?.zh || c.status) : (STATUS_LABELS[c.status]?.en || c.status),
    c.lengthKm ?? '',
    c.rfsDate ? new Date(c.rfsDate).getFullYear() : '',
    c.designCapacityTbps ?? '',
    c.fiberPairs ?? '',
    c.vendor ?? '',
    c.owners.join(' / '),
    c.ownerCount,
    c.stationsInCountry.map(s => s.name).join(' / '),
    isChinaGroup ? [...new Set(c.stationsInCountry.map(s => s.regionLabel).filter(Boolean))].join(' / ') : '',
    c.countries.length,
    c.totalStations,
  ].filter((_, i) => isChinaGroup || i !== 11)); // 非大中华区去掉"所属地区"列

  const stationHeaders = zh
    ? ['登陆站名称', isChinaGroup ? '所属地区' : '', '国家代码', '纬度', '经度', '接入海缆数', '接入海缆列表']
    : ['Station Name', isChinaGroup ? 'Region' : '', 'Code', 'Latitude', 'Longitude', 'Cable Count', 'Cable List'];

  const stationRows = data.stations.map(s => [
    s.name,
    isChinaGroup ? (s.regionLabel || s.countryCode) : '',
    s.countryCode,
    s.latitude.toFixed(4),
    s.longitude.toFixed(4),
    s.cableCount,
    s.cables.map(c => c.name).join(' / '),
  ].filter((_, i) => isChinaGroup || i !== 1));

  const breakdownRows = isChinaGroup && data.summary.breakdown ? (zh ? [
    ['地区细分'],
    ['中国大陆 (CN)', data.summary.breakdown.CN, '个登陆站'],
    ['中国香港 (HK)', data.summary.breakdown.HK, '个登陆站'],
    ['中国澳门 (MO)', data.summary.breakdown.MO, '个登陆站'],
    ['中国台湾 (TW)', data.summary.breakdown.TW, '个登陆站'],
    [],
  ] : [
    ['Regional Breakdown'],
    ['Mainland China (CN)', data.summary.breakdown.CN, 'stations'],
    ['Hong Kong (HK)',       data.summary.breakdown.HK, 'stations'],
    ['Macao (MO)',           data.summary.breakdown.MO, 'stations'],
    ['Taiwan (TW)',          data.summary.breakdown.TW, 'stations'],
    [],
  ]) : [];

  const summaryRows = zh ? [
    ['国家/地区', countryName],
    ['导出时间', new Date().toLocaleString('zh-CN')],
    ['数据来源', 'TeleGeography · Deep Blue'],
    [],
    ['📊 统计摘要'],
    ['总海缆数', data.summary.totalCables],
    ['国际海缆', data.summary.internationalCables],
    ['国内线', data.summary.domesticCables],
    ['支线接入', data.summary.branchCables],
    ['总登陆站数', data.summary.totalStations],
    [],
    ...breakdownRows,
    ['📡 海缆明细'],
    cableHeaders,
    ...cableRows,
    [],
    ['🏖️ 登陆站明细'],
    stationHeaders,
    ...stationRows,
  ] : [
    ['Country / Region', countryName],
    ['Export Date', new Date().toLocaleString('en-US')],
    ['Data Source', 'TeleGeography · Deep Blue'],
    [],
    ['📊 Summary'],
    ['Total Cables', data.summary.totalCables],
    ['International', data.summary.internationalCables],
    ['Domestic', data.summary.domesticCables],
    ['Branch Access', data.summary.branchCables],
    ['Total Stations', data.summary.totalStations],
    [],
    ...breakdownRows,
    ['📡 Cable Details'],
    cableHeaders,
    ...cableRows,
    [],
    ['🏖️ Landing Stations'],
    stationHeaders,
    ...stationRows,
  ];

  const csvContent = summaryRows.map(row =>
    (row as any[]).map(cell => {
      const str = String(cell ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deep-blue-${data.country.code}-${locale}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({ number, label, color, sub }: { number: number; label: string; color: string; sub?: string }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
      border: `1px solid ${color}30`, padding: '20px 24px', flex: 1, minWidth: 150,
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#4B5563', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CountryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCode, setSelectedCode] = useState(searchParams.get('code') || 'CHINA');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'cables' | 'stations'>('cables');
  const [typeFilter, setTypeFilter] = useState<'all' | 'international' | 'domestic' | 'branch'>('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch('/api/analysis/country', { method: 'POST' })
      .then(r => r.json())
      .then(d => setCountries(d.countries || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    setLoading(true); setData(null);
    fetch(`/api/analysis/country?code=${selectedCode}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    router.replace(`/country?code=${selectedCode}`);
  }, [selectedCode]);

  const filteredCables = data?.cables.filter(c =>
    typeFilter === 'all' ? true : c.type === typeFilter
  ) || [];

  const filteredCountries = countries.filter(c =>
    c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nameZh.includes(searchQuery) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isChinaGroup = data?.country.code === 'CHINA';

  const handleExport = (exportLocale: 'zh' | 'en') => {
    if (!data) return;
    setExporting(true);
    setTimeout(() => { exportCSV(data, exportLocale); setExporting(false); }, 100);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>

      <nav style={{ height: 56, backgroundColor: 'rgba(13,27,42,0.95)', borderBottom: '1px solid rgba(42,157,143,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icons/deep-blue-icon.png" alt="Deep Blue" style={{ width: 28, height: 28, borderRadius: 5 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 12, color: '#2A9D8F', padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(42,157,143,0.08)', border: '1px solid rgba(42,157,143,0.2)' }}>
            {zh ? '🌏 国家海缆分析' : '🌏 Country Cable Analysis'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}>{zh ? '← 返回地图' : '← Back to Map'}</a>
          <LangSwitcher />
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>

        {/* 国家选择器 */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            {zh ? '选择国家 / 地区' : 'Select Country / Region'}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: 320 }}>
              <input type="text"
                placeholder={zh ? '搜索国家名称、代码，或输入"中国"...' : 'Search country name or code...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', height: 44, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(42,157,143,0.3)', padding: '0 14px', color: '#EDF2F7', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
              {searchQuery && filteredCountries.length > 0 && (
                <div style={{ position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: 'rgba(13,27,42,0.98)', backdropFilter: 'blur(16px)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 10, maxHeight: 300, overflowY: 'auto', zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
                  {filteredCountries.slice(0, 20).map(c => (
                    <div key={c.code}
                      onClick={() => { setSelectedCode(c.code); setSearchQuery(''); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', backgroundColor: selectedCode === c.code ? 'rgba(42,157,143,0.1)' : 'transparent', transition: 'background-color 0.15s' }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = selectedCode === c.code ? 'rgba(42,157,143,0.1)' : 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* 大中华区特殊标识 */}
                        {c.isGroup && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>聚合</span>}
                        <span style={{ fontSize: 13, color: '#EDF2F7', fontWeight: c.isGroup ? 700 : 500 }}>
                          {zh ? c.nameZh : c.nameEn}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#4B5563' }}>{c.isGroup ? '' : c.code}</span>
                        <span style={{ fontSize: 10, color: '#2A9D8F' }}>{c.stationCount} {zh ? '站' : 'stn'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 当前选中 */}
            {data && (
              <div style={{ padding: '10px 20px', borderRadius: 10, backgroundColor: isChinaGroup ? 'rgba(239,68,68,0.08)' : 'rgba(42,157,143,0.1)', border: `1px solid ${isChinaGroup ? 'rgba(239,68,68,0.3)' : 'rgba(42,157,143,0.3)'}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🌏</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isChinaGroup ? '#EF4444' : '#2A9D8F' }}>
                    {zh ? data.country.nameZh : data.country.nameEn}
                  </div>
                  {isChinaGroup && (
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                      {zh ? '大陆 + 香港 + 澳门 + 台湾（聚合视图）' : 'Mainland + HK + MO + TW (aggregated)'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 导出按钮 */}
            {data && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={() => handleExport('zh')} disabled={exporting}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(42,157,143,0.3)', backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📥 {exporting ? '导出中...' : '导出中文表格'}
                </button>
                <button onClick={() => handleExport('en')} disabled={exporting}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#9CA3AF', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📥 {exporting ? 'Exporting...' : 'Export English'}
                </button>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 80, color: '#6B7280' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 14 }}>{zh ? '正在分析数据...' : 'Analyzing...'}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {data && !loading && (
          <>
            {/* 统计卡片 */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatCard number={data.summary.totalCables} label={zh ? '总海缆数' : 'Total Cables'} color="#2A9D8F" sub={zh ? `${data.summary.totalStations} 个登陆站` : `${data.summary.totalStations} stations`} />
              <StatCard number={data.summary.internationalCables} label={zh ? '国际海缆' : 'International'} color="#06D6A0" sub={zh ? '连接其他国家' : 'Cross-border'} />
              <StatCard number={data.summary.domesticCables} label={zh ? '国内线' : 'Domestic'} color="#3B82F6" sub={isChinaGroup && zh ? '仅在大中华区内' : zh ? '仅连接本国' : 'Local only'} />
              <StatCard number={data.summary.branchCables} label={zh ? '支线接入' : 'Branch Access'} color="#8B5CF6" sub={zh ? '通过支线接入主干' : 'Via branch unit'} />
            </div>

            {/* 大中华区细分 */}
            {isChinaGroup && data.summary.breakdown && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, padding: '14px 16px', backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12 }}>
                <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center', marginRight: 8 }}>
                  {zh ? '登陆站地区分布：' : 'Station breakdown:'}
                </span>
                {[
                  { label: zh ? '大陆' : 'Mainland', code: 'CN', count: data.summary.breakdown.CN, color: '#EF4444' },
                  { label: zh ? '香港' : 'Hong Kong', code: 'HK', count: data.summary.breakdown.HK, color: '#3B82F6' },
                  { label: zh ? '澳门' : 'Macao',     code: 'MO', count: data.summary.breakdown.MO, color: '#10B981' },
                  { label: zh ? '台湾' : 'Taiwan',    code: 'TW', count: data.summary.breakdown.TW, color: '#F59E0B' },
                ].map(r => (
                  <div key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, backgroundColor: `${r.color}10`, border: `1px solid ${r.color}25` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: r.color }} />
                    <span style={{ fontSize: 12, color: r.color, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 切换 */}
            <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { key: 'cables',   labelZh: `海缆明细 (${data.cables.length})`,   labelEn: `Cables (${data.cables.length})`   },
                { key: 'stations', labelZh: `登陆站 (${data.stations.length})`,    labelEn: `Stations (${data.stations.length})` },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, color: activeTab === tab.key ? '#2A9D8F' : '#6B7280', background: 'none', border: 'none', cursor: 'pointer', borderBottom: activeTab === tab.key ? '2px solid #2A9D8F' : '2px solid transparent', transition: 'all 0.2s' }}>
                  {zh ? tab.labelZh : tab.labelEn}
                </button>
              ))}
            </div>

            {/* 海缆明细 */}
            {activeTab === 'cables' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {(['all', 'international', 'domestic', 'branch'] as const).map(t => (
                    <button key={t} onClick={() => setTypeFilter(t)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: `1px solid ${typeFilter === t ? (t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color) : 'rgba(255,255,255,0.1)'}`, backgroundColor: typeFilter === t ? `${t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color}15` : 'rgba(255,255,255,0.03)', color: typeFilter === t ? (t === 'all' ? '#2A9D8F' : TYPE_LABELS[t]?.color) : '#6B7280', transition: 'all 0.15s' }}>
                      {t === 'all'
                        ? (zh ? `全部 (${data.cables.length})` : `All (${data.cables.length})`)
                        : zh
                        ? `${TYPE_LABELS[t].zh} (${data.cables.filter(c => c.type === t).length})`
                        : `${TYPE_LABELS[t].en} (${data.cables.filter(c => c.type === t).length})`
                      }
                    </button>
                  ))}
                </div>

                <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 100px 1.5fr 1.2fr', padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                    <div>{zh ? '海缆名称' : 'Cable Name'}</div>
                    <div>{zh ? '类型' : 'Type'}</div>
                    <div>{zh ? '状态' : 'Status'}</div>
                    <div>{zh ? '长度' : 'Length'}</div>
                    <div>{zh ? '本地登陆站' : 'Local Stations'}</div>
                    <div>{zh ? '运营商' : 'Operators'}</div>
                  </div>

                  {filteredCables.map((cable, i) => (
                    <a key={cable.id} href={`/?cable=${cable.slug}`} style={{ textDecoration: 'none' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 90px 100px 1.5fr 1.2fr', padding: '12px 16px', borderBottom: i < filteredCables.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background-color 0.15s', cursor: 'pointer' }}
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.05)')}
                        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{cable.name}</div>
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, backgroundColor: `${TYPE_LABELS[cable.type].color}15`, color: TYPE_LABELS[cable.type].color, border: `1px solid ${TYPE_LABELS[cable.type].color}30` }}>
                            {zh ? TYPE_LABELS[cable.type].zh : TYPE_LABELS[cable.type].en}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: STATUS_COLORS[cable.status] || '#6B7280', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: STATUS_COLORS[cable.status] || '#6B7280' }}>
                            {zh ? STATUS_LABELS[cable.status]?.zh : STATUS_LABELS[cable.status]?.en}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                          {cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {/* 大中华区时在站名旁显示所属地区 */}
                          {cable.stationsInCountry.map((s, si) => (
                            <span key={s.id}>
                              {si > 0 && '、'}
                              {s.name}
                              {isChinaGroup && s.regionLabel && (
                                <span style={{ fontSize: 9, color: REGION_COLORS[s.regionLabel] || '#6B7280', marginLeft: 3 }}>
                                  ({s.regionLabel?.replace('中国', '')})
                                </span>
                              )}
                            </span>
                          ))}
                          {cable.stationsInCountry.length === 0 && '—'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                          {cable.owners.slice(0, 2).join(', ')}
                          {cable.owners.length > 2 && <span style={{ color: '#4B5563' }}> +{cable.owners.length - 2}</span>}
                        </div>
                      </div>
                    </a>
                  ))}

                  {filteredCables.length === 0 && (
                    <div style={{ padding: 32, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                      {zh ? '无符合条件的海缆' : 'No cables match the filter'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 登陆站明细 */}
            {activeTab === 'stations' && (
              <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `2fr ${isChinaGroup ? '100px ' : ''}120px 120px 60px 3fr`, padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <div>{zh ? '登陆站名称' : 'Station Name'}</div>
                  {isChinaGroup && <div>{zh ? '所属地区' : 'Region'}</div>}
                  <div>{zh ? '纬度' : 'Latitude'}</div>
                  <div>{zh ? '经度' : 'Longitude'}</div>
                  <div>{zh ? '海缆数' : 'Cables'}</div>
                  <div>{zh ? '接入海缆' : 'Cable List'}</div>
                </div>
                {data.stations.map((station, i) => (
                  <div key={station.id} style={{ display: 'grid', gridTemplateColumns: `2fr ${isChinaGroup ? '100px ' : ''}120px 120px 60px 3fr`, padding: '12px 16px', borderBottom: i < data.stations.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{station.name}</div>
                    {isChinaGroup && (
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: `${REGION_COLORS[station.regionLabel || ''] || '#6B7280'}15`, color: REGION_COLORS[station.regionLabel || ''] || '#9CA3AF' }}>
                          {station.regionLabel?.replace('中国', '') || station.countryCode}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace' }}>{station.latitude.toFixed(3)}°</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace' }}>{station.longitude.toFixed(3)}°</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2A9D8F' }}>{station.cableCount}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {station.cables.slice(0, 3).map(c => (
                        <a key={c.slug} href={`/?cable=${c.slug}`} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.2)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </a>
                      ))}
                      {station.cables.length > 3 && <span style={{ fontSize: 10, color: '#4B5563', padding: '2px 0' }}>+{station.cables.length - 3}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24, padding: '12px 16px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
              {zh
                ? `数据来源：TeleGeography 海底电缆地图 · 支线判断基于启发式规则（本地仅1个登陆站且总站数>4）· Deep Blue`
                : `Data source: TeleGeography · Branch classification: 1 local station & total stations > 4 · Deep Blue`
              }
            </div>
          </>
        )}
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

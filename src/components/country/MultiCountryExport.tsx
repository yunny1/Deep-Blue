'use client';
// src/components/country/MultiCountryExport.tsx
// 多国海缆批量导出组件
// 支持：预设国家集合一键选择、手动搜索添加、CSV 下载
// 放置位置：src/app/country/page.tsx 顶部区域（在单国家查询上方）

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

// ── 预设国家集合 ────────────────────────────────────────────────────
const PRESETS: Record<string, { name_zh: string; name_en: string; codes: string[] }> = {
  BRICS_MEMBERS: {
    name_zh: '金砖成员国（11国）',
    name_en: 'BRICS Members (11)',
    codes: ['BR', 'RU', 'IN', 'CN', 'ZA', 'SA', 'IR', 'EG', 'AE', 'ET', 'ID'],
  },
  BRICS_ALL: {
    name_zh: '金砖全体（21国）',
    name_en: 'BRICS+ All (21)',
    codes: ['BR', 'RU', 'IN', 'CN', 'ZA', 'SA', 'IR', 'EG', 'AE', 'ET', 'ID',
            'BY', 'BO', 'KZ', 'TH', 'CU', 'UG', 'MY', 'UZ', 'NG', 'VN'],
  },
  ASEAN: {
    name_zh: '东盟（10国）',
    name_en: 'ASEAN (10)',
    codes: ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN'],
  },
  APEC: {
    name_zh: 'APEC（21成员）',
    name_en: 'APEC (21)',
    codes: ['AU', 'BN', 'CA', 'CL', 'CN', 'HK', 'ID', 'JP', 'KR', 'MY',
            'MX', 'NZ', 'PG', 'PE', 'PH', 'RU', 'SG', 'TW', 'TH', 'US', 'VN'],
  },
  G7: {
    name_zh: 'G7',
    name_en: 'G7',
    codes: ['CA', 'FR', 'DE', 'IT', 'JP', 'GB', 'US'],
  },
  G20: {
    name_zh: 'G20',
    name_en: 'G20',
    codes: ['AR', 'AU', 'BR', 'CA', 'CN', 'FR', 'DE', 'IN', 'ID', 'IT',
            'JP', 'KR', 'MX', 'RU', 'SA', 'ZA', 'TR', 'GB', 'US'],
  },
};

// 简易国家名称映射（用于搜索提示，不需要完整）
const COUNTRY_NAMES: Record<string, string> = {
  CN:'China 中国', US:'United States 美国', RU:'Russia 俄罗斯', IN:'India 印度',
  BR:'Brazil 巴西', AU:'Australia 澳大利亚', JP:'Japan 日本', GB:'United Kingdom 英国',
  FR:'France 法国', DE:'Germany 德国', SG:'Singapore 新加坡', KR:'South Korea 韩国',
  ID:'Indonesia 印度尼西亚', MY:'Malaysia 马来西亚', TH:'Thailand 泰国',
  VN:'Vietnam 越南', PH:'Philippines 菲律宾', SA:'Saudi Arabia 沙特',
  AE:'UAE 阿联酋', EG:'Egypt 埃及', ZA:'South Africa 南非', NG:'Nigeria 尼日利亚',
  KE:'Kenya 肯尼亚', ET:'Ethiopia 埃塞俄比亚', MX:'Mexico 墨西哥', CA:'Canada 加拿大',
  AR:'Argentina 阿根廷', CL:'Chile 智利', PE:'Peru 秘鲁', CO:'Colombia 哥伦比亚',
  IT:'Italy 意大利', ES:'Spain 西班牙', PT:'Portugal 葡萄牙', TR:'Turkey 土耳其',
  IR:'Iran 伊朗', PK:'Pakistan 巴基斯坦', BD:'Bangladesh 孟加拉',
  LK:'Sri Lanka 斯里兰卡', NZ:'New Zealand 新西兰', PG:'Papua New Guinea 巴布亚新几内亚',
  GU:'Guam 关岛', HK:'Hong Kong 香港', TW:'Taiwan 台湾', MO:'Macao 澳门',
  BN:'Brunei 文莱', KH:'Cambodia 柬埔寨', MM:'Myanmar 缅甸', LA:'Laos 老挝',
  BY:'Belarus 白俄罗斯', KZ:'Kazakhstan 哈萨克斯坦', UZ:'Uzbekistan 乌兹别克斯坦',
  BO:'Bolivia 玻利维亚', CU:'Cuba 古巴', UG:'Uganda 乌干达',
  MA:'Morocco 摩洛哥', DZ:'Algeria 阿尔及利亚', TZ:'Tanzania 坦桑尼亚',
  DJ:'Djibouti 吉布提', MV:'Maldives 马尔代夫', MU:'Mauritius 毛里求斯',
  SC:'Seychelles 塞舌尔', CV:'Cape Verde 佛得角', GH:'Ghana 加纳', SN:'Senegal 塞内加尔',
};

const STATUS_LABEL: Record<string, string> = {
  IN_SERVICE: 'In Service', UNDER_CONSTRUCTION: 'Under Construction',
  PLANNED: 'Planned', DECOMMISSIONED: 'Decommissioned',
};

// ── CSV 生成逻辑 ──────────────────────────────────────────────────
function buildCSV(data: any, codes: string[], zh: boolean): string {
  const headers = zh
    ? ['国家代码','国家','海缆名称','状态','长度(km)','光纤对数','RFS年份','建造商','运营商','本国登陆站','登陆站总数','类型']
    : ['Country Code','Country','Cable Name','Status','Length(km)','Fiber Pairs','RFS Year','Vendor/Builder','Operators','Local Stations','Total Stations','Type'];

  const rows: string[][] = [headers];

  for (const code of codes) {
    const countryData = data[code];
    if (!countryData) continue;
    const countryName = COUNTRY_NAMES[code] || code;

    for (const cable of countryData.cables) {
      rows.push([
        code,
        countryName,
        cable.name,
        STATUS_LABEL[cable.status] || cable.status,
        cable.lengthKm?.toString() || '',
        cable.fiberPairs?.toString() || '',
        cable.rfsYear?.toString() || '',
        cable.vendor || '',
        cable.operators.join(' | '),
        cable.localStations.map((s: any) => s.name).join(' | '),
        cable.totalStations?.toString() || '',
        cable.isInternational ? (zh ? '国际缆' : 'International') : (zh ? '国内缆' : 'Domestic'),
      ]);
    }
  }

  // CSV 转义：含逗号/引号的字段加双引号
  return rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function MultiCountryExport() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 搜索过滤的国家列表（最多显示8条）
  const searchResults = search.trim().length >= 1
    ? Object.entries(COUNTRY_NAMES)
        .filter(([code, name]) =>
          !selected.has(code) &&
          (code.toLowerCase().includes(search.toLowerCase()) ||
           name.toLowerCase().includes(search.toLowerCase()))
        ).slice(0, 8)
    : [];

  const addCountry = (code: string) => {
    setSelected(prev => new Set([...prev, code]));
    setSearch('');
    inputRef.current?.focus();
  };

  const removeCountry = (code: string) => {
    setSelected(prev => { const s = new Set(prev); s.delete(code); return s; });
  };

  const applyPreset = (presetKey: string) => {
    setSelected(new Set(PRESETS[presetKey].codes));
  };

  const handleDownload = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    setProgress(zh ? '正在查询数据库...' : 'Querying database...');

    try {
      const codes = [...selected].join(',');
      const res = await fetch(`/api/country/bulk-export?codes=${codes}`);
      if (!res.ok) throw new Error('API error');
      const json = await res.json();

      setProgress(zh ? '正在生成 CSV...' : 'Generating CSV...');
      const csv = buildCSV(json.data, [...selected], zh);

      // 触发下载
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `deep-blue-cables-${[...selected].join('-')}-${dateStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(zh ? `已导出 ${json.meta?.totalUniqueCables} 条海缆数据` : `Exported ${json.meta?.totalUniqueCables} cables`);
      setTimeout(() => setProgress(''), 3000);
    } catch (err) {
      setProgress(zh ? '导出失败，请重试' : 'Export failed, please retry');
      setTimeout(() => setProgress(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
          backgroundColor: 'rgba(42,157,143,0.08)',
          border: '1px solid rgba(42,157,143,0.25)',
          color: '#2A9D8F', fontSize: 13, fontWeight: 500,
          transition: 'all 0.2s',
        }}
        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.15)')}
        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')}
      >
        <span style={{ fontSize: 16 }}>⬇</span>
        {zh ? '多国批量导出 CSV' : 'Multi-Country CSV Export'}
      </button>
    );
  }

  return (
    <div style={{
      backgroundColor: 'rgba(13,27,42,0.95)',
      border: '1px solid rgba(42,157,143,0.2)',
      borderRadius: 12, padding: 20,
      backdropFilter: 'blur(12px)',
    }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#EDF2F7' }}>
            {zh ? '多国海缆批量导出' : 'Multi-Country Cable Export'}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
            {zh ? '选择国家集合，下载完整海缆数据 CSV' : 'Select country groups and download cable data as CSV'}
          </div>
        </div>
        <button onClick={() => setExpanded(false)}
          style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 18, padding: 4 }}>
          ✕
        </button>
      </div>

      {/* 预设集合按钮 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {zh ? '快速选择' : 'Quick Select'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button key={key} onClick={() => applyPreset(key)}
              style={{
                padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer',
                border: '1px solid rgba(42,157,143,0.3)',
                backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F',
                transition: 'all 0.15s', fontWeight: 500,
              }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.2)')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')}
            >
              {zh ? preset.name_zh : preset.name_en}
            </button>
          ))}
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())}
              style={{ padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444', transition: 'all 0.15s' }}>
              {zh ? '清空选择' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {/* 搜索添加 */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {zh ? '搜索添加单个国家' : 'Search & Add Country'}
        </div>
        <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
          placeholder={zh ? '输入国家名称或代码（如 CN、Japan）...' : 'Type country name or code (e.g. CN, Japan)...'}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 12,
            backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#EDF2F7', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {searchResults.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            backgroundColor: '#0D1B2A', border: '1px solid rgba(42,157,143,0.3)',
            borderRadius: 8, marginTop: 4, zIndex: 100, overflow: 'hidden',
          }}>
            {searchResults.map(([code, name]) => (
              <button key={code} onClick={() => addCountry(code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.1)')}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2A9D8F', minWidth: 32 }}>{code}</span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 已选国家列表 */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {zh ? `已选择 ${selected.size} 个国家/地区` : `${selected.size} countries/regions selected`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[...selected].map(code => (
              <span key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 8px', borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 11, color: '#D1D5DB',
              }}>
                <span style={{ fontWeight: 700, color: '#2A9D8F' }}>{code}</span>
                <button onClick={() => removeCountry(code)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 12, padding: 0, lineHeight: 1 }}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 下载按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleDownload}
          disabled={selected.size === 0 || loading}
          style={{
            padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: selected.size === 0 || loading ? 'not-allowed' : 'pointer',
            backgroundColor: selected.size === 0 || loading ? 'rgba(42,157,143,0.2)' : '#2A9D8F',
            color: selected.size === 0 || loading ? '#6B7280' : '#fff',
            border: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {loading ? (
            <>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite', display: 'inline-block' }} />
              {zh ? '处理中...' : 'Processing...'}
            </>
          ) : (
            <>⬇ {zh ? `下载 CSV（${selected.size} 国）` : `Download CSV (${selected.size} countries)`}</>
          )}
        </button>
        {progress && (
          <span style={{ fontSize: 12, color: progress.includes('失败') || progress.includes('failed') ? '#EF4444' : '#2A9D8F' }}>
            {progress}
          </span>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

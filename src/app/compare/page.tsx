// src/app/compare/page.tsx
// 海缆对比工具 — 搜索区域竖排设计，VS作为独立圆形徽章，彻底解决重叠问题

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import LangSwitcher from '@/components/layout/LangSwitcher';

interface CableData {
  name: string; slug: string; status: string; lengthKm: number | null;
  rfsDate: string | null; designCapacityTbps: number | null; fiberPairs: number | null;
  technology: string | null; vendor: string | null; ownerCount: number;
  owners: string[]; stationCount: number; countryCount: number; countries: string[];
  risk: {
    scoreOverall: number; riskLevel: string; scoreConflict: number;
    scoreSanctions: number; scoreMilitary: number; scoreOwnership: number;
    scoreLegal: number; scoreHistorical: number; scoreEvents: number;
    conflictZones: string[];
  };
}

interface CompareData {
  cableA: CableData; cableB: CableData;
  comparison: { commonCountries: string[]; commonCountryCount: number };
}

const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6', DECOMMISSIONED: '#6B7280',
};
const RISK_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444', HIGH: '#F97316', ELEVATED: '#F59E0B',
  MODERATE: '#3B82F6', LOW: '#06D6A0',
};

const RECOMMENDED_PAIRS = [
  { a: { slug: 'peace-cable', name: 'PEACE Cable' }, b: { slug: '2africa', name: '2Africa' }, desc: { en: 'Two mega-cables connecting Africa, Asia & Europe', zh: '连接非洲、亚洲和欧洲的两条超级海缆' } },
  { a: { slug: 'marea', name: 'MAREA' }, b: { slug: 'dunant', name: 'Dunant' }, desc: { en: 'US-Europe cables: Meta vs Google', zh: '跨大西洋海缆：Meta vs Google' } },
  { a: { slug: 'sea-me-we-6', name: 'SEA-ME-WE 6' }, b: { slug: 'sea-me-we-3', name: 'SEA-ME-WE 3' }, desc: { en: 'New vs old generation of SEA-ME-WE', zh: 'SEA-ME-WE 系列新旧代际对比' } },
  { a: { slug: 'equiano', name: 'Equiano' }, b: { slug: 'ace', name: 'ACE' }, desc: { en: "Google's Equiano vs consortium ACE", zh: 'Google Equiano vs 非洲西海岸联合体 ACE' } },
];

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [suggestionsA, setSuggestionsA] = useState<any[]>([]);
  const [suggestionsB, setSuggestionsB] = useState<any[]>([]);
  const [slugA, setSlugA] = useState(searchParams.get('a') || '');
  const [slugB, setSlugB] = useState(searchParams.get('b') || '');
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const fetchSuggestions = (query: string, setter: (v: any[]) => void) => {
    if (query.length < 2) { setter([]); return; }
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(d => setter(d.cables || []))
      .catch(() => setter([]));
  };

  useEffect(() => {
    if (!slugA || !slugB) return;
    setLoading(true);
    fetch(`/api/compare?a=${slugA}&b=${slugB}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slugA, slugB]);

  const startCompare = () => {
    if (!slugA || !slugB) return;
    router.push(`/compare?a=${slugA}&b=${slugB}`);
    setLoading(true);
    fetch(`/api/compare?a=${slugA}&b=${slugB}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>

      {/* 导航栏 */}
      <nav style={{
        height: 56, backgroundColor: 'rgba(13,27,42,0.95)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/icons/deep-blue-icon.png" alt="Deep Blue" style={{ width: 28, height: 28, borderRadius: 5 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 12, color: '#6B7280', padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {zh ? '海缆对比' : 'Cable Comparison'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}>{zh ? '← 返回地图' : '← Back to Map'}</a>
          <LangSwitcher />
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>

        {/* ═══ 搜索区域：竖排设计，VS 是独立徽章 ═══
            布局结构：
            [ 海缆 A 输入框（全宽）]
            [     ⬤ VS ⬤      ]  ← 居中的独立徽章，和输入框完全不在同一行
            [ 海缆 B 输入框（全宽）]
            [    开始对比按钮    ]
        */}
        <div style={{
          maxWidth: 640,
          margin: '0 auto 32px',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0,
        }}>

          {/* 海缆 A */}
          <SearchInputBlock
            label={zh ? '海缆 A' : 'Cable A'}
            color="#2A9D8F"
            value={searchA}
            onChange={(v) => { setSearchA(v); fetchSuggestions(v, setSuggestionsA); }}
            suggestions={suggestionsA}
            onSelect={(slug, name) => { setSlugA(slug); setSearchA(name); setSuggestionsA([]); }}
            zh={zh}
          />

          {/* VS 徽章：单独一行，绝对不与输入框在同一 flex 行 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 0',
          }}>
            {/* 左线 */}
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            {/* VS 圆形徽章 */}
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              backgroundColor: '#0D1B2A',
              border: '2px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#4B5563',
              flexShrink: 0, margin: '0 16px',
              letterSpacing: '0.05em',
            }}>
              VS
            </div>
            {/* 右线 */}
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* 海缆 B */}
          <SearchInputBlock
            label={zh ? '海缆 B' : 'Cable B'}
            color="#E9C46A"
            value={searchB}
            onChange={(v) => { setSearchB(v); fetchSuggestions(v, setSuggestionsB); }}
            suggestions={suggestionsB}
            onSelect={(slug, name) => { setSlugB(slug); setSearchB(name); setSuggestionsB([]); }}
            zh={zh}
          />

          {/* 对比按钮 */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={startCompare} style={{
              padding: '12px 48px', borderRadius: 8, border: 'none', cursor: slugA && slugB ? 'pointer' : 'not-allowed',
              backgroundColor: slugA && slugB ? '#2A9D8F' : '#1A2744',
              color: slugA && slugB ? 'white' : '#4B5563',
              fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
            }}>
              {zh ? '开始对比' : 'Compare'}
            </button>
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
            {zh ? '正在加载对比数据...' : 'Loading comparison...'}
          </div>
        )}

        {/* 对比结果 */}
        {data && !loading && (
          <>
            {/* 名称头部 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', marginBottom: 24 }}>
              <div style={{
                textAlign: 'center', padding: 16,
                backgroundColor: 'rgba(42,157,143,0.08)', borderRadius: '12px 0 0 12px',
                border: '1px solid rgba(42,157,143,0.2)', borderRight: 'none',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#2A9D8F' }}>{data.cableA.name}</div>
                <div style={{ fontSize: 11, color: STATUS_COLORS[data.cableA.status], marginTop: 4 }}>
                  {data.cableA.status.replace(/_/g, ' ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#4B5563', fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: 'none', borderRight: 'none' }}>
                VS
              </div>
              <div style={{
                textAlign: 'center', padding: 16,
                backgroundColor: 'rgba(233,196,106,0.08)', borderRadius: '0 12px 12px 0',
                border: '1px solid rgba(233,196,106,0.2)', borderLeft: 'none',
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#E9C46A' }}>{data.cableB.name}</div>
                <div style={{ fontSize: 11, color: STATUS_COLORS[data.cableB.status], marginTop: 4 }}>
                  {data.cableB.status.replace(/_/g, ' ')}
                </div>
              </div>
            </div>

            {/* 对比表格 */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 24 }}>
              <CompareRow label={zh ? '长度' : 'Length'} a={data.cableA.lengthKm ? `${data.cableA.lengthKm.toLocaleString()} km` : '—'} b={data.cableB.lengthKm ? `${data.cableB.lengthKm.toLocaleString()} km` : '—'} winner={(data.cableA.lengthKm || 0) > (data.cableB.lengthKm || 0) ? 'a' : 'b'} />
              <CompareRow label={zh ? '投产年份' : 'RFS Year'} a={data.cableA.rfsDate ? new Date(data.cableA.rfsDate).getFullYear().toString() : '—'} b={data.cableB.rfsDate ? new Date(data.cableB.rfsDate).getFullYear().toString() : '—'} />
              <CompareRow label={zh ? '设计容量' : 'Capacity'} a={data.cableA.designCapacityTbps ? `${data.cableA.designCapacityTbps} Tbps` : '—'} b={data.cableB.designCapacityTbps ? `${data.cableB.designCapacityTbps} Tbps` : '—'} winner={!data.cableA.designCapacityTbps || !data.cableB.designCapacityTbps ? undefined : (data.cableA.designCapacityTbps > data.cableB.designCapacityTbps ? 'a' : 'b')} />
              <CompareRow label={zh ? '光纤对' : 'Fiber Pairs'} a={data.cableA.fiberPairs ? String(data.cableA.fiberPairs) : '—'} b={data.cableB.fiberPairs ? String(data.cableB.fiberPairs) : '—'} />
              <CompareRow label={zh ? '建造商' : 'Vendor'} a={data.cableA.vendor || '—'} b={data.cableB.vendor || '—'} />
              <CompareRow label={zh ? '运营商数' : 'Owners'} a={String(data.cableA.ownerCount)} b={String(data.cableB.ownerCount)} winner={data.cableA.ownerCount > data.cableB.ownerCount ? 'a' : 'b'} winnerLabel={zh ? '更多元' : 'more diverse'} />
              <CompareRow label={zh ? '登陆站' : 'Stations'} a={String(data.cableA.stationCount)} b={String(data.cableB.stationCount)} winner={data.cableA.stationCount > data.cableB.stationCount ? 'a' : 'b'} />
              <CompareRow label={zh ? '覆盖国家' : 'Countries'} a={String(data.cableA.countryCount)} b={String(data.cableB.countryCount)} winner={data.cableA.countryCount > data.cableB.countryCount ? 'a' : 'b'} />
              <CompareRow
                label={zh ? '地缘风险' : 'Risk Score'}
                a={<span style={{ color: RISK_COLORS[data.cableA.risk.riskLevel] }}>{data.cableA.risk.scoreOverall}/100</span>}
                b={<span style={{ color: RISK_COLORS[data.cableB.risk.riskLevel] }}>{data.cableB.risk.scoreOverall}/100</span>}
                winner={data.cableA.risk.scoreOverall < data.cableB.risk.scoreOverall ? 'a' : 'b'}
                winnerLabel={zh ? '更安全' : 'safer'}
              />
            </div>

            {/* 风险因子详细分解 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <RiskBreakdown cable={data.cableA} color="#2A9D8F" zh={zh} />
              <RiskBreakdown cable={data.cableB} color="#E9C46A" zh={zh} />
            </div>

            {/* 共同国家 */}
            {data.comparison.commonCountryCount > 0 && (
              <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>
                  {zh ? `共同连接的国家（${data.comparison.commonCountryCount} 个）` : `Shared Countries (${data.comparison.commonCountryCount})`}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                  {data.comparison.commonCountries.map(cc => (
                    <span key={cc} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.1)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.2)' }}>{cc}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 推荐对比（未选择时显示） */}
        {!data && !loading && (
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', padding: '24px 0 28px' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>⚖️</div>
              <div style={{ fontSize: 14, color: '#6B7280' }}>
                {zh ? '搜索海缆名称，或从以下推荐对比中快速开始' : 'Search for cables above, or pick a recommended comparison'}
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#4B5563', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>
              {zh ? '推荐对比' : 'Recommended Comparisons'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {RECOMMENDED_PAIRS.map((pair, i) => (
                <div key={i}
                  onClick={() => { setSlugA(pair.a.slug); setSearchA(pair.a.name); setSlugB(pair.b.slug); setSearchB(pair.b.name); }}
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.06)'; e.currentTarget.style.borderColor = 'rgba(42,157,143,0.2)'; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#2A9D8F' }}>{pair.a.name}</span>
                    <span style={{ fontSize: 10, color: '#374151', fontWeight: 700 }}>vs</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E9C46A' }}>{pair.b.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{zh ? pair.desc.zh : pair.desc.en}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 搜索输入块：标签 + 输入框 + 下拉建议，作为独立的垂直单元 ──────────
function SearchInputBlock({ label, color, value, onChange, suggestions, onSelect, zh }: {
  label: string; color: string; value: string;
  onChange: (v: string) => void;
  suggestions: any[];
  onSelect: (slug: string, name: string) => void;
  zh: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 1.5 }}>
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={zh ? '搜索海缆名称...' : 'Search cable name...'}
        style={{
          width: '100%', height: 44, borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: `1px solid ${color}40`,
          padding: '0 14px', color: '#EDF2F7', fontSize: 14, outline: 'none',
          transition: 'border-color 0.2s', boxSizing: 'border-box' as const,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = color)}
        onBlur={e => (e.currentTarget.style.borderColor = `${color}40`)}
      />
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          backgroundColor: 'rgba(13,27,42,0.98)', border: `1px solid ${color}30`,
          borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((c: any) => (
            <div key={c.id}
              onClick={() => onSelect(c.slug, c.name)}
              style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, color: '#EDF2F7', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = `${color}12`)}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span>{c.name}</span>
              <span style={{ fontSize: 10, color: '#4B5563' }}>{c.lengthKm ? `${c.lengthKm.toLocaleString()} km` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 对比数据行 ──────────────────────────────────────────────────────
function CompareRow({ label, a, b, winner, winnerLabel }: {
  label: string; a: any; b: any; winner?: 'a' | 'b'; winnerLabel?: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ padding: '11px 16px', fontSize: 13, color: '#EDF2F7', textAlign: 'right', backgroundColor: winner === 'a' ? 'rgba(42,157,143,0.06)' : 'transparent' }}>
        {a} {winner === 'a' && <span style={{ fontSize: 9, color: '#2A9D8F', marginLeft: 4 }}>{winnerLabel || '▲'}</span>}
      </div>
      <div style={{ padding: '11px 8px', fontSize: 11, color: '#6B7280', textAlign: 'center', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.02)' }}>
        {label}
      </div>
      <div style={{ padding: '11px 16px', fontSize: 13, color: '#EDF2F7', backgroundColor: winner === 'b' ? 'rgba(233,196,106,0.06)' : 'transparent' }}>
        {winner === 'b' && <span style={{ fontSize: 9, color: '#E9C46A', marginRight: 4 }}>{winnerLabel || '▲'}</span>} {b}
      </div>
    </div>
  );
}

// ── 风险因子条形图分解 ──────────────────────────────────────────────
function RiskBreakdown({ cable, color, zh }: { cable: CableData; color: string; zh: boolean }) {
  const factors = [
    { label: zh ? '冲突水域' : 'Conflict', score: cable.risk.scoreConflict },
    { label: zh ? '制裁风险' : 'Sanctions', score: cable.risk.scoreSanctions },
    { label: zh ? '军事活动' : 'Military', score: cable.risk.scoreMilitary },
    { label: zh ? '所有权' : 'Ownership', score: cable.risk.scoreOwnership },
    { label: zh ? '法律' : 'Legal', score: cable.risk.scoreLegal },
    { label: zh ? '历史记录' : 'Historical', score: cable.risk.scoreHistorical },
    { label: zh ? '近期事件' : 'Events', score: cable.risk.scoreEvents },
  ];
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: `1px solid ${color}20` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 14 }}>{cable.name}</div>
      {factors.map((f, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: '#9CA3AF' }}>{f.label}</span>
            <span style={{ color: '#D1D5DB', fontWeight: 600 }}>{f.score}</span>
          </div>
          <div style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{
              width: `${f.score}%`, height: '100%', borderRadius: 2,
              backgroundColor: f.score >= 70 ? '#EF4444' : f.score >= 40 ? '#F59E0B' : '#06D6A0',
              transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ComparePage() {
  return (
    <I18nProvider>
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
        <CompareContent />
      </Suspense>
    </I18nProvider>
  );
}

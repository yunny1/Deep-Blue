// src/app/compare/page.tsx
// 海缆对比工具 — 并排比较两条海缆的所有指标
// 访问路径: /compare?a=peace-cable&b=2africa

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
  risk: { scoreOverall: number; riskLevel: string; scoreConflict: number;
    scoreSanctions: number; scoreMilitary: number; scoreOwnership: number;
    scoreLegal: number; scoreHistorical: number; scoreEvents: number;
    conflictZones: string[]; };
}

interface CompareData {
  cableA: CableData; cableB: CableData;
  comparison: { commonCountries: string[]; commonCountryCount: number; };
}

const STATUS_COLORS: Record<string, string> = { IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A', PLANNED: '#3B82F6', DECOMMISSIONED: '#6B7280' };
const RISK_COLORS: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F97316', ELEVATED: '#F59E0B', MODERATE: '#3B82F6', LOW: '#06D6A0' };

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
  const { t, locale } = useTranslation();

  // 搜索建议
  const fetchSuggestions = (query: string, setter: (v: any[]) => void) => {
    if (query.length < 2) { setter([]); return; }
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(d => setter(d.cables || []))
      .catch(() => setter([]));
  };

  // 加载对比数据
  useEffect(() => {
    if (!slugA || !slugB) return;
    setLoading(true);
    fetch(`/api/compare?a=${slugA}&b=${slugB}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slugA, slugB]);

  const startCompare = () => {
    if (slugA && slugB) {
      router.push(`/compare?a=${slugA}&b=${slugB}`);
      setLoading(true);
      fetch(`/api/compare?a=${slugA}&b=${slugB}`)
        .then(r => r.json())
        .then(d => { if (!d.error) setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7', padding: '0' }}>
      {/* 导航栏 */}
      <nav style={{ height: 56, backgroundColor: 'rgba(13, 27, 42, 0.95)', borderBottom: '1px solid rgba(42, 157, 143, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #1E6091, #2A9D8F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>DB</div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 13, color: '#6B7280', padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {locale === 'zh' ? '海缆对比工具' : 'Cable Comparison'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 12, color: '#6B7280', textDecoration: 'none' }}>{locale === 'zh' ? '← 返回地图' : '← Back to Map'}</a>
          <LangSwitcher />
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        {/* 搜索区域 */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'flex-end' }}>
          <SearchInput label={locale === 'zh' ? '海缆 A' : 'Cable A'} value={searchA} onChange={(v) => { setSearchA(v); fetchSuggestions(v, setSuggestionsA); }}
            suggestions={suggestionsA} onSelect={(slug, name) => { setSlugA(slug); setSearchA(name); setSuggestionsA([]); }} color="#2A9D8F" />
          <div style={{ fontSize: 20, color: '#4B5563', paddingBottom: 8 }}>VS</div>
          <SearchInput label={locale === 'zh' ? '海缆 B' : 'Cable B'} value={searchB} onChange={(v) => { setSearchB(v); fetchSuggestions(v, setSuggestionsB); }}
            suggestions={suggestionsB} onSelect={(slug, name) => { setSlugB(slug); setSearchB(name); setSuggestionsB([]); }} color="#E9C46A" />
          <button onClick={startCompare} style={{
            padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
            backgroundColor: '#2A9D8F', color: 'white', fontWeight: 600, fontSize: 13, marginBottom: 0,
            opacity: slugA && slugB ? 1 : 0.4,
          }}>{locale === 'zh' ? '对比' : 'Compare'}</button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>{locale === 'zh' ? '正在加载对比数据...' : 'Loading comparison...'}</div>}

        {data && !loading && (
          <>
            {/* 名称头部 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 0, marginBottom: 24 }}>
              <div style={{ textAlign: 'center', padding: 16, backgroundColor: 'rgba(42,157,143,0.08)', borderRadius: '12px 0 0 12px', border: '1px solid rgba(42,157,143,0.2)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2A9D8F' }}>{data.cableA.name}</div>
                <div style={{ fontSize: 12, color: STATUS_COLORS[data.cableA.status], marginTop: 4 }}>{data.cableA.status.replace('_', ' ')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#4B5563', fontWeight: 700 }}>VS</div>
              <div style={{ textAlign: 'center', padding: 16, backgroundColor: 'rgba(233,196,106,0.08)', borderRadius: '0 12px 12px 0', border: '1px solid rgba(233,196,106,0.2)' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#E9C46A' }}>{data.cableB.name}</div>
                <div style={{ fontSize: 12, color: STATUS_COLORS[data.cableB.status], marginTop: 4 }}>{data.cableB.status.replace('_', ' ')}</div>
              </div>
            </div>

            {/* 对比表格 */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <CompareRow label={locale === 'zh' ? '长度' : 'Length'} a={data.cableA.lengthKm ? `${data.cableA.lengthKm.toLocaleString()} km` : '—'} b={data.cableB.lengthKm ? `${data.cableB.lengthKm.toLocaleString()} km` : '—'} winner={(data.cableA.lengthKm || 0) > (data.cableB.lengthKm || 0) ? 'a' : 'b'} />
              <CompareRow label={locale === 'zh' ? '投产日期' : 'RFS Date'} a={data.cableA.rfsDate ? new Date(data.cableA.rfsDate).getFullYear().toString() : '—'} b={data.cableB.rfsDate ? new Date(data.cableB.rfsDate).getFullYear().toString() : '—'} />
              <CompareRow label={locale === 'zh' ? '容量' : 'Capacity'} a={data.cableA.designCapacityTbps ? `${data.cableA.designCapacityTbps} Tbps` : '—'} b={data.cableB.designCapacityTbps ? `${data.cableB.designCapacityTbps} Tbps` : '—'} winner={!data.cableA.designCapacityTbps || !data.cableB.designCapacityTbps ? undefined : (data.cableA.designCapacityTbps > data.cableB.designCapacityTbps ? 'a' : 'b')} />
              <CompareRow label={locale === 'zh' ? '光纤对数' : 'Fiber Pairs'} a={data.cableA.fiberPairs ? String(data.cableA.fiberPairs) : '—'} b={data.cableB.fiberPairs ? String(data.cableB.fiberPairs) : '—'} />
              <CompareRow label={locale === 'zh' ? '建造商' : 'Vendor'} a={data.cableA.vendor || '—'} b={data.cableB.vendor || '—'} />
              <CompareRow label={locale === 'zh' ? '运营商数' : 'Owners'} a={String(data.cableA.ownerCount)} b={String(data.cableB.ownerCount)} winner={data.cableA.ownerCount > data.cableB.ownerCount ? 'a' : 'b'} winnerLabel={locale === 'zh' ? '更多元' : 'more diverse'} />
              <CompareRow label={locale === 'zh' ? '登陆站数' : 'Stations'} a={String(data.cableA.stationCount)} b={String(data.cableB.stationCount)} winner={data.cableA.stationCount > data.cableB.stationCount ? 'a' : 'b'} />
              <CompareRow label={locale === 'zh' ? '连接国家' : 'Countries'} a={String(data.cableA.countryCount)} b={String(data.cableB.countryCount)} winner={data.cableA.countryCount > data.cableB.countryCount ? 'a' : 'b'} />
              <CompareRow label={locale === 'zh' ? '风险评分' : 'Risk Score'}
                a={<span style={{ color: RISK_COLORS[data.cableA.risk.riskLevel] }}>{data.cableA.risk.scoreOverall}/100 ({data.cableA.risk.riskLevel})</span>}
                b={<span style={{ color: RISK_COLORS[data.cableB.risk.riskLevel] }}>{data.cableB.risk.scoreOverall}/100 ({data.cableB.risk.riskLevel})</span>}
                winner={data.cableA.risk.scoreOverall < data.cableB.risk.scoreOverall ? 'a' : 'b'}
                winnerLabel={locale === 'zh' ? '更安全' : 'safer'} />
            </div>

            {/* 风险因子对比雷达 */}
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <RiskBreakdown cable={data.cableA} color="#2A9D8F" locale={locale} />
              <RiskBreakdown cable={data.cableB} color="#E9C46A" locale={locale} />
            </div>

            {/* 共同国家 */}
            {data.comparison.commonCountryCount > 0 && (
              <div style={{ marginTop: 24, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                  {locale === 'zh' ? `共同连接的国家（${data.comparison.commonCountryCount}个）` : `Shared Countries (${data.comparison.commonCountryCount})`}
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

        {!data && !loading && (
          <div style={{ textAlign: 'center', padding: 80, color: '#4B5563' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚖️</div>
            <div style={{ fontSize: 16, color: '#6B7280' }}>
              {locale === 'zh' ? '选择两条海缆进行对比分析' : 'Select two cables to compare side by side'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 搜索输入框
function SearchInput({ label, value, onChange, suggestions, onSelect, color }: any) {
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Search cable name..."
        style={{ width: '100%', height: 40, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', border: `1px solid ${color}40`, padding: '0 12px', color: '#EDF2F7', fontSize: 13, outline: 'none' }} />
      {suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'rgba(13,27,42,0.97)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100, marginTop: 4 }}>
          {suggestions.map((c: any) => (
            <div key={c.id} onClick={() => onSelect(c.slug, c.name)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#EDF2F7', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = `${color}15`)} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              {c.name} <span style={{ fontSize: 10, color: '#6B7280' }}>{c.lengthKm ? `${c.lengthKm.toLocaleString()} km` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 对比行
function CompareRow({ label, a, b, winner, winnerLabel }: { label: string; a: any; b: any; winner?: 'a' | 'b'; winnerLabel?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 1fr', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ padding: '10px 16px', fontSize: 14, color: '#EDF2F7', textAlign: 'right', backgroundColor: winner === 'a' ? 'rgba(42,157,143,0.06)' : 'transparent' }}>
        {a} {winner === 'a' && <span style={{ fontSize: 9, color: '#2A9D8F', marginLeft: 4 }}>{winnerLabel || '▲'}</span>}
      </div>
      <div style={{ padding: '10px 8px', fontSize: 11, color: '#6B7280', textAlign: 'center', fontWeight: 600, backgroundColor: 'rgba(255,255,255,0.02)' }}>{label}</div>
      <div style={{ padding: '10px 16px', fontSize: 14, color: '#EDF2F7', backgroundColor: winner === 'b' ? 'rgba(233,196,106,0.06)' : 'transparent' }}>
        {winner === 'b' && <span style={{ fontSize: 9, color: '#E9C46A', marginRight: 4 }}>{winnerLabel || '▲'}</span>} {b}
      </div>
    </div>
  );
}

// 风险因子分解
function RiskBreakdown({ cable, color, locale }: { cable: CableData; color: string; locale: string }) {
  const factors = [
    { label: locale === 'zh' ? '冲突水域' : 'Conflict', score: cable.risk.scoreConflict },
    { label: locale === 'zh' ? '制裁风险' : 'Sanctions', score: cable.risk.scoreSanctions },
    { label: locale === 'zh' ? '军事活动' : 'Military', score: cable.risk.scoreMilitary },
    { label: locale === 'zh' ? '所有权' : 'Ownership', score: cable.risk.scoreOwnership },
    { label: locale === 'zh' ? '法律' : 'Legal', score: cable.risk.scoreLegal },
    { label: locale === 'zh' ? '历史' : 'Historical', score: cable.risk.scoreHistorical },
    { label: locale === 'zh' ? '事件' : 'Events', score: cable.risk.scoreEvents },
  ];
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: `1px solid ${color}20` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 12 }}>{cable.name}</div>
      {factors.map((f, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
            <span style={{ color: '#9CA3AF' }}>{f.label}</span>
            <span style={{ color: '#D1D5DB' }}>{f.score}</span>
          </div>
          <div style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ width: `${f.score}%`, height: '100%', borderRadius: 2, backgroundColor: f.score >= 70 ? '#EF4444' : f.score >= 40 ? '#F59E0B' : '#06D6A0' }} />
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

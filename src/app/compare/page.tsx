// src/app/compare/page.tsx
// 海缆对比工具 — 最终版
// 搜索区域用CSS Grid: gridTemplateColumns: '1fr 40px 1fr'
// VS在独立的40px格子里，物理上不可能和输入框重叠

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

const RECOMMENDED_PAIRS = [
  { a: { slug: 'peace-cable', name: 'PEACE Cable' }, b: { slug: '2africa', name: '2Africa' }, desc: { en: 'Two mega-cables connecting Africa, Asia & Europe', zh: '两条连接非洲、亚洲和欧洲的超级海缆' } },
  { a: { slug: 'marea', name: 'MAREA' }, b: { slug: 'dunant', name: 'Dunant' }, desc: { en: 'US-Europe cables: Meta vs Google', zh: '美欧海缆对比：Meta vs Google' } },
  { a: { slug: 'sea-me-we-6', name: 'SEA-ME-WE 6' }, b: { slug: 'sea-me-we-3', name: 'SEA-ME-WE 3' }, desc: { en: 'New vs old generation of SEA-ME-WE', zh: 'SEA-ME-WE系列新旧对比' } },
  { a: { slug: 'equiano', name: 'Equiano' }, b: { slug: 'ace', name: 'ACE' }, desc: { en: 'Google\'s Equiano vs consortium ACE along Africa', zh: 'Google Equiano vs 非洲西海岸联合体ACE' } },
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
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  const fetchSuggestions = (query: string, setter: (v: any[]) => void) => {
    if (query.length < 2) { setter([]); return; }
    fetch(`/api/search?q=${encodeURIComponent(query)}`).then(r => r.json()).then(d => setter(d.cables || [])).catch(() => setter([]));
  };

  useEffect(() => {
    if (!slugA || !slugB) return;
    setLoading(true);
    fetch(`/api/compare?a=${slugA}&b=${slugB}`).then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [slugA, slugB]);

  const startCompare = () => {
    if (slugA && slugB) {
      router.push(`/compare?a=${slugA}&b=${slugB}`);
      setLoading(true);
      fetch(`/api/compare?a=${slugA}&b=${slugB}`).then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false); }).catch(() => setLoading(false));
    }
  };

  const selectRecommended = (pair: typeof RECOMMENDED_PAIRS[0]) => {
    setSlugA(pair.a.slug); setSearchA(pair.a.name);
    setSlugB(pair.b.slug); setSearchB(pair.b.name);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>
      {/* 导航栏 */}
      <nav style={{ height: 56, backgroundColor: 'rgba(13, 27, 42, 0.95)', borderBottom: '1px solid rgba(42, 157, 143, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
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

        {/* ═══ 搜索区域：CSS Grid，三列 1fr | 40px | 1fr，不可能重叠 ═══ */}
        <div style={{ marginBottom: 24 }}>
          {/* 标签行 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 40px 1fr',
            gap: 0,
            marginBottom: 6,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              {zh ? '海缆 A' : 'Cable A'}
            </div>
            <div />
            <div style={{ fontSize: 11, fontWeight: 600, color: '#E9C46A', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              {zh ? '海缆 B' : 'Cable B'}
            </div>
          </div>

          {/* 输入行：grid保证VS在独立格子 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 40px 1fr',
            gap: 0,
            alignItems: 'center',
          }}>
            {/* A输入框 */}
            <div style={{ position: 'relative' }}>
              <input type="text" value={searchA}
                onChange={(e) => { setSearchA(e.target.value); fetchSuggestions(e.target.value, setSuggestionsA); }}
                placeholder={zh ? '搜索海缆...' : 'Search cable...'}
                style={{
                  width: '100%', height: 40, borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(42,157,143,0.3)',
                  padding: '0 12px', color: '#EDF2F7', fontSize: 13, outline: 'none',
                }}
              />
              {suggestionsA.length > 0 && (
                <div style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: 'rgba(13,27,42,0.97)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100 }}>
                  {suggestionsA.map((c: any) => (
                    <div key={c.id} onClick={() => { setSlugA(c.slug); setSearchA(c.name); setSuggestionsA([]); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#EDF2F7', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.1)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      {c.name} <span style={{ fontSize: 10, color: '#6B7280' }}>{c.lengthKm ? `${c.lengthKm.toLocaleString()} km` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VS标签：占独立的40px列 */}
            <div style={{ textAlign: 'center', fontSize: 14, color: '#4B5563', fontWeight: 700 }}>
              VS
            </div>

            {/* B输入框 */}
            <div style={{ position: 'relative' }}>
              <input type="text" value={searchB}
                onChange={(e) => { setSearchB(e.target.value); fetchSuggestions(e.target.value, setSuggestionsB); }}
                placeholder={zh ? '搜索海缆...' : 'Search cable...'}
                style={{
                  width: '100%', height: 40, borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(233,196,106,0.3)',
                  padding: '0 12px', color: '#EDF2F7', fontSize: 13, outline: 'none',
                }}
              />
              {suggestionsB.length > 0 && (
                <div style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: 'rgba(13,27,42,0.97)', border: '1px solid rgba(233,196,106,0.2)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100 }}>
                  {suggestionsB.map((c: any) => (
                    <div key={c.id} onClick={() => { setSlugB(c.slug); setSearchB(c.name); setSuggestionsB([]); }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: '#EDF2F7', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(233,196,106,0.08)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      {c.name} <span style={{ fontSize: 10, color: '#6B7280' }}>{c.lengthKm ? `${c.lengthKm.toLocaleString()} km` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 对比按钮：单独一行居中 */}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={startCompare} style={{
              padding: '10px 40px', borderRadius: 8, border: 'none', cursor: 'pointer',
              backgroundColor: slugA && slugB ? '#2A9D8F' : '#1A2744',
              color: slugA && slugB ? 'white' : '#4B5563',
              fontWeight: 600, fontSize: 14,
              transition: 'all 0.2s',
            }}>{zh ? '开始对比' : 'Compare'}</button>
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>{zh ? '正在加载对比数据...' : 'Loading comparison...'}</div>}

        {data && !loading && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 0, marginBottom: 24 }}>
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

            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <CompareRow label={zh ? '长度' : 'Length'} a={data.cableA.lengthKm ? `${data.cableA.lengthKm.toLocaleString()} km` : '—'} b={data.cableB.lengthKm ? `${data.cableB.lengthKm.toLocaleString()} km` : '—'} winner={(data.cableA.lengthKm || 0) > (data.cableB.lengthKm || 0) ? 'a' : 'b'} />
              <CompareRow label={zh ? '投产日期' : 'RFS Date'} a={data.cableA.rfsDate ? new Date(data.cableA.rfsDate).getFullYear().toString() : '—'} b={data.cableB.rfsDate ? new Date(data.cableB.rfsDate).getFullYear().toString() : '—'} />
              <CompareRow label={zh ? '容量' : 'Capacity'} a={data.cableA.designCapacityTbps ? `${data.cableA.designCapacityTbps} Tbps` : '—'} b={data.cableB.designCapacityTbps ? `${data.cableB.designCapacityTbps} Tbps` : '—'} winner={!data.cableA.designCapacityTbps || !data.cableB.designCapacityTbps ? undefined : (data.cableA.designCapacityTbps > data.cableB.designCapacityTbps ? 'a' : 'b')} />
              <CompareRow label={zh ? '光纤对数' : 'Fiber Pairs'} a={data.cableA.fiberPairs ? String(data.cableA.fiberPairs) : '—'} b={data.cableB.fiberPairs ? String(data.cableB.fiberPairs) : '—'} />
              <CompareRow label={zh ? '建造商' : 'Vendor'} a={data.cableA.vendor || '—'} b={data.cableB.vendor || '—'} />
              <CompareRow label={zh ? '运营商数' : 'Owners'} a={String(data.cableA.ownerCount)} b={String(data.cableB.ownerCount)} winner={data.cableA.ownerCount > data.cableB.ownerCount ? 'a' : 'b'} winnerLabel={zh ? '更多元' : 'diverse'} />
              <CompareRow label={zh ? '登陆站' : 'Stations'} a={String(data.cableA.stationCount)} b={String(data.cableB.stationCount)} winner={data.cableA.stationCount > data.cableB.stationCount ? 'a' : 'b'} />
              <CompareRow label={zh ? '国家' : 'Countries'} a={String(data.cableA.countryCount)} b={String(data.cableB.countryCount)} winner={data.cableA.countryCount > data.cableB.countryCount ? 'a' : 'b'} />
              <CompareRow label={zh ? '风险' : 'Risk'}
                a={<span style={{ color: RISK_COLORS[data.cableA.risk.riskLevel] }}>{data.cableA.risk.scoreOverall}/100</span>}
                b={<span style={{ color: RISK_COLORS[data.cableB.risk.riskLevel] }}>{data.cableB.risk.scoreOverall}/100</span>}
                winner={data.cableA.risk.scoreOverall < data.cableB.risk.scoreOverall ? 'a' : 'b'} winnerLabel={zh ? '更安全' : 'safer'} />
            </div>

            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <RiskBreakdown cable={data.cableA} color="#2A9D8F" zh={zh} />
              <RiskBreakdown cable={data.cableB} color="#E9C46A" zh={zh} />
            </div>

            {data.comparison.commonCountryCount > 0 && (
              <div style={{ marginTop: 24, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                  {zh ? `共同国家（${data.comparison.commonCountryCount}）` : `Shared (${data.comparison.commonCountryCount})`}
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

        {/* ═══ 推荐对比 ═══ */}
        {!data && !loading && (
          <div>
            <div style={{ textAlign: 'center', padding: '40px 0 24px' }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>⚖️</div>
              <div style={{ fontSize: 15, color: '#6B7280' }}>
                {zh ? '选择两条海缆，或从推荐中快速选择' : 'Select two cables, or pick from recommendations'}
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              {zh ? '推荐对比' : 'Recommended'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {RECOMMENDED_PAIRS.map((pair, i) => (
                <div key={i} onClick={() => selectRecommended(pair)}
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.06)'; e.currentTarget.style.borderColor = 'rgba(42,157,143,0.2)'; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#2A9D8F' }}>{pair.a.name}</span>
                    <span style={{ fontSize: 11, color: '#4B5563' }}>vs</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#E9C46A' }}>{pair.b.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{zh ? pair.desc.zh : pair.desc.en}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompareRow({ label, a, b, winner, winnerLabel }: { label: string; a: any; b: any; winner?: 'a' | 'b'; winnerLabel?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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

function RiskBreakdown({ cable, color, zh }: { cable: CableData; color: string; zh: boolean }) {
  const factors = [
    { label: zh ? '冲突水域' : 'Conflict', score: cable.risk.scoreConflict },
    { label: zh ? '制裁' : 'Sanctions', score: cable.risk.scoreSanctions },
    { label: zh ? '军事' : 'Military', score: cable.risk.scoreMilitary },
    { label: zh ? '所有权' : 'Ownership', score: cable.risk.scoreOwnership },
    { label: zh ? '法律' : 'Legal', score: cable.risk.scoreLegal },
    { label: zh ? '历史' : 'Historical', score: cable.risk.scoreHistorical },
    { label: zh ? '事件' : 'Events', score: cable.risk.scoreEvents },
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
            <div style={{ width: `${f.score}%`, height: '100%', borderRadius: 2, backgroundColor: f.score >= 70 ? '#EF4444' : f.score >= 40 ? '#F59E0B' : '#06D6A0', transition: 'width 0.5s ease' }} />
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

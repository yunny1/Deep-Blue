// src/app/simulate/page.tsx
// 延迟模拟器 — 模拟海缆断裂对全球互联网的影响
// 访问路径: /simulate?cable=peace-cable

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import SubPageHeader from '@/components/layout/SubPageHeader';

interface CountryImpact {
  countryCode: string; countryName: string; impactLevel: string;
  impactDescription: string; alternativeCables: number; alternativeNames: string[];
  addedLatencyMs: number; rerouteDescription: string;
}

interface SimData {
  cable: { name: string; slug: string; lengthKm: number | null; };
  simulation: { scenario: string; affectedCountries: number; criticalImpact: number; highImpact: number; countryImpacts: CountryImpact[]; averageLatencyIncrease: number; };
  summary: string;
}

const IMPACT_CONFIG: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  HIGH: { color: '#F97316', bg: 'rgba(249,115,22,0.08)' },
  MODERATE: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)' },
  LOW: { color: '#06D6A0', bg: 'rgba(6,214,160,0.06)' },
};

function SimulateContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<SimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(searchParams.get('cable') || '');
  const { locale } = useTranslation();
  // 翻译API返回的英文文本
  const tImpact = (level: string) => {
    if (locale !== 'zh') return level;
    const map: Record<string, string> = { CRITICAL: '严重', HIGH: '高', MODERATE: '中等', LOW: '低' };
    return map[level] || level;
  };
  const tDesc = (desc: string) => {
    if (locale !== 'zh') return desc;
    return desc
      .replace('No alternative submarine cables — complete isolation risk', '无替代海缆——存在完全隔离风险')
      .replace(/Only (\d+) alternative cable\(s\) — severe congestion expected/, '仅有 $1 条替代海缆——预计将严重拥塞')
      .replace(/(\d+) alternative cables available — traffic will be redistributed with some degradation/, '有 $1 条替代海缆可用——流量将重新分配，但会有一定程度降级')
      .replace(/(\d+) alternative cables provide good redundancy — minimal impact/, '有 $1 条替代海缆提供良好冗余——影响极小')
      .replace('Traffic rerouted via alternative submarine cables', '流量通过替代海缆重新路由')
      .replace('Traffic rerouted via significantly longer alternative paths', '流量通过明显更长的替代路径重新路由')
      .replace('Major rerouting required via satellite or distant cable systems', '需要通过卫星或远距离海缆系统进行重大重新路由');
  };
  const tSummary = (summary: string) => {
    if (locale !== 'zh') return summary;
    return summary
      .replace('CRITICAL:', '严重警告：').replace('would face potential isolation', '面临潜在隔离风险')
      .replace('HIGH IMPACT:', '高影响：').replace('would experience severe degradation', '将经历严重的网络降级')
      .replace('MODERATE:', '中等影响：').replace('Traffic would be redistributed across', '流量将在')
      .replace('countries with some latency increase', '个国家之间重新分配，延迟有所增加');
  };

  const fetchSuggestions = (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setSuggestions(d.cables || [])).catch(() => {});
  };

  useEffect(() => {
    if (!selectedSlug) return;
    setLoading(true);
    fetch(`/api/simulate?cable=${selectedSlug}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedSlug]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>
      <SubPageHeader
        badgeZh="分析工具"
        badgeEn="Analysis Tool"
        titleZh="断缆模拟器"
        titleEn="Outage Simulator"
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        {/* 搜索框 */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            {locale === 'zh' ? '选择一条海缆进行断缆模拟' : 'Select a cable to simulate failure'}
          </div>
          <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); fetchSuggestions(e.target.value); }}
            placeholder={locale === 'zh' ? '搜索海缆名称...' : 'Search cable name...'}
            style={{ width: '100%', height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(239,68,68,0.3)', padding: '0 16px', color: '#EDF2F7', fontSize: 14, outline: 'none' }} />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'rgba(13,27,42,0.97)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 100, marginTop: 4 }}>
              {suggestions.map((c: any) => (
                <div key={c.id} onClick={() => { setSelectedSlug(c.slug); setSearchQuery(c.name); setSuggestions([]); }}
                  style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13, color: '#EDF2F7', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)')} onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  {c.name} <span style={{ fontSize: 11, color: '#6B7280' }}>{c.lengthKm ? `${c.lengthKm.toLocaleString()} km` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>{locale === 'zh' ? '正在运行断缆模拟...' : 'Running outage simulation...'}</div>}

        {data && !loading && (
          <>
            {/* 场景描述 */}
            <div style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                {locale === 'zh' ? '模拟场景' : 'Simulation Scenario'}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#EDF2F7', marginBottom: 8 }}>{data.simulation.scenario}</div>
              <div style={{ fontSize: 13, color: '#F87171', lineHeight: 1.6 }}>{tSummary(data.summary)}</div>
            </div>

            {/* 影响统计 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              <StatCard label={locale === 'zh' ? '受影响国家' : 'Countries Affected'} value={data.simulation.affectedCountries} color="#F59E0B" />
              <StatCard label={locale === 'zh' ? '严重影响' : 'Critical Impact'} value={data.simulation.criticalImpact} color="#EF4444" />
              <StatCard label={locale === 'zh' ? '高影响' : 'High Impact'} value={data.simulation.highImpact} color="#F97316" />
              <StatCard label={locale === 'zh' ? '平均延迟增加' : 'Avg Latency Add'} value={`+${data.simulation.averageLatencyIncrease}ms`} color="#3B82F6" />
            </div>

            {/* 国家影响列表 */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                {locale === 'zh' ? '各国影响分析' : 'Country-by-Country Impact Analysis'}
              </div>
              {data.simulation.countryImpacts.map((country, i) => {
                const config = IMPACT_CONFIG[country.impactLevel] || IMPACT_CONFIG.MODERATE;
                return (
                  <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: `3px solid ${config.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7' }}>{country.countryName}</span>
                        <span style={{ fontSize: 10, color: '#4B5563' }}>({country.countryCode})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B' }}>+{country.addedLatencyMs}ms</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: config.bg, color: config.color }}>{tImpact(country.impactLevel)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, marginBottom: 6 }}>{tDesc(country.impactDescription)}</div>
                    {country.alternativeNames.length > 0 && (
                      <div style={{ fontSize: 10, color: '#4B5563' }}>
                        {locale === 'zh' ? '替代路由：' : 'Alternatives: '}{country.alternativeNames.join(', ')}
                        {country.alternativeCables > 5 && ` (+${country.alternativeCables - 5} more)`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 底部说明 */}
            <div style={{ marginTop: 16, fontSize: 10, color: '#4B5563', textAlign: 'center', lineHeight: 1.6 }}>
              {locale === 'zh'
                ? '此模拟基于公开的海缆路由数据和简化的延迟模型。实际影响取决于运营商的流量工程策略和网络冗余配置。'
                : 'This simulation is based on public cable route data and a simplified latency model. Actual impact depends on operator traffic engineering and network redundancy.'}
            </div>
          </>
        )}

        {!data && !loading && (
          <div style={{ textAlign: 'center', padding: 80, color: '#4B5563' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: 16, color: '#6B7280' }}>
              {locale === 'zh' ? '选择一条海缆，查看断裂后对全球互联网的影响' : 'Select a cable to simulate what happens if it fails'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 14, border: `1px solid ${color}20`, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function SimulatePage() {
  return (
    <I18nProvider>
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>Loading...</div>}>
        <SimulateContent />
      </Suspense>
    </I18nProvider>
  );
}

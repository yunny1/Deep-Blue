// src/components/panels/AiIntelPanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { SkeletonAiPanel } from '@/components/ui/Skeleton';

interface AiResult {
  title: string; source: string; pubDate: string; link: string;
  analysis: {
    isRelevant: boolean; relevanceScore: number; cableNames: string[];
    eventType: string; severity: number; affectedCountries: string[];
    summaryEn: string; summaryZh: string; estimatedDuration: string | null;
    serviceDisruption: boolean; confidence: number;
  };
}
interface AiData {
  timestamp: string; cached: boolean;
  stats?: { totalNewsScanned: number; preFiltered: number; aiAnalyzed: number; relevant: number; faults: number; disruptions: number };
  results: AiResult[];
}

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  FAULT: { color: '#EF4444', label: 'Fault' },
  NATURAL_DISASTER: { color: '#F97316', label: 'Disaster' },
  SABOTAGE: { color: '#EC4899', label: 'Sabotage' },
  CONSTRUCTION: { color: '#3B82F6', label: 'Construction' },
  REPAIR: { color: '#10B981', label: 'Repair' },
  POLICY: { color: '#8B5CF6', label: 'Policy' },
  GENERAL: { color: '#6B7280', label: 'General' },
};

export default function AiIntelPanel() {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const { showAiInsights, flyToCable } = useMapStore();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!showAiInsights || !isExpanded || data) return;
    fetch('/api/ai/analyze')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showAiInsights, isExpanded]);

  if (!showAiInsights) return null;
  if (!loading && !data) return null;

  const relevantResults = data?.results?.filter(r => r.analysis?.isRelevant) || [];

  return (
    <div style={{
      backgroundColor: 'rgba(10, 17, 34, 0.95)',
      backdropFilter: 'blur(16px)',
      border: `1px solid ${relevantResults.some(r => r.analysis.severity >= 4) ? 'rgba(239,68,68,0.3)' : 'rgba(139, 92, 246, 0.2)'}`,
      borderRadius: 'var(--radius-lg)',
      zIndex: 40,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-panel)',
      animation: 'fadeInDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{
        padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer',
        borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#8B5CF6', animation: 'pulse 2s infinite', boxShadow: '0 0 6px #8B5CF6' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{t('ai.intelTitle')}</span>
          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>MiniMax</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <div style={{ width: 12, height: 12, border: '1.5px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{relevantResults.length} alerts</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--duration-normal) ease' }}>▾</span>
        </div>
      </div>

      <div style={{
        maxHeight: isExpanded ? 500 : 0,
        overflow: 'hidden',
        transition: 'max-height var(--duration-slow) cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {loading ? <SkeletonAiPanel /> : data && (
          <div style={{ overflowY: 'auto', maxHeight: 500 }}>
            <div style={{ padding: '8px 14px', display: 'flex', gap: 12, justifyContent: 'center', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-muted)' }}>
              <span>{data.stats?.totalNewsScanned ?? 0} {t('ai.scanned')}</span>
              <span>{data.stats?.aiAnalyzed ?? 0} {t('ai.analyzed')}</span>
              <span ...>{relevantResults.length} {t('ai.relevant')}</span>
            </div>

            {relevantResults.map((item, i) => {
              const a = item.analysis;
              const ec = EVENT_CONFIG[a.eventType] || EVENT_CONFIG.GENERAL;
              const summary = locale === 'zh' ? a.summaryZh : a.summaryEn;
              return (
                <div key={i} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                  borderLeft: `3px solid ${ec.color}`,
                  animation: `fadeInUp 0.2s ease ${i * 0.05}s both`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: `${ec.color}15`, color: ec.color }}>{ec.label}</span>
                      {a.serviceDisruption && <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>DISRUPTION</span>}
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{a.confidence}% conf</span>
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
                    {[1, 2, 3, 4, 5].map(level => (
                      <div key={level} style={{
                        flex: 1, height: 3, borderRadius: 1,
                        backgroundColor: level <= a.severity
                          ? ['#475569','#3B82F6','#F59E0B','#F97316','#EF4444'][level - 1]
                          : 'var(--bg-raised)',
                        transition: 'background-color 0.3s',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 6 }}>{summary}</div>
                  {a.cableNames.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 6 }}>
                      {a.cableNames.map((name, j) => (
                        <span key={j}
                          onClick={() => flyToCable(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}
                          style={{ fontSize: 10, padding: '2px 6px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(42,157,143,0.1)', color: 'var(--accent-primary)', cursor: 'pointer', border: '1px solid var(--border-accent)', transition: 'all var(--duration-fast)' }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.2)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.1)')}
                        >{name}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>{a.affectedCountries.length > 0 ? `Affects: ${a.affectedCountries.join(', ')}` : item.source}</span>
                    {a.estimatedDuration && <span style={{ color: 'var(--accent-amber)' }}>~{a.estimatedDuration}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: '#2D4562', marginTop: 4 }}>
                    {new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {item.source}
                  </div>
                </div>
              );
            })}

            {(data.results?.length ?? 0) > relevantResults.length && (
              <div style={{ padding: '8px 14px', fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('ai.otherArticles', { count: (data.results?.length ?? 0) - relevantResults.length })}
              </div>
            )}
            <div style={{ padding: '8px 14px', fontSize: 9, color: '#2D4562', borderTop: '1px solid var(--border-subtle)', lineHeight: 1.5 }}>
              {t('ai.poweredBy')} · {data.cached ? t('ai.cached') : t('ai.fresh')} · {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

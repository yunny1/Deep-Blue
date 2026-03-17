// src/components/panels/AiIntelPanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

interface AiResult { title: string; source: string; pubDate: string; link: string; analysis: { isRelevant: boolean; relevanceScore: number; cableNames: string[]; eventType: string; severity: number; affectedCountries: string[]; summaryEn: string; summaryZh: string; estimatedDuration: string | null; serviceDisruption: boolean; confidence: number; }; }
interface AiData { timestamp: string; cached: boolean; stats: { totalNewsScanned: number; preFiltered: number; aiAnalyzed: number; relevant: number; faults: number; disruptions: number; }; results: AiResult[]; }

const EVENT_CONFIG: Record<string, { color: string; label: string }> = { FAULT: { color: '#EF4444', label: 'Fault' }, NATURAL_DISASTER: { color: '#F97316', label: 'Disaster' }, SABOTAGE: { color: '#EC4899', label: 'Sabotage' }, CONSTRUCTION: { color: '#3B82F6', label: 'Construction' }, REPAIR: { color: '#10B981', label: 'Repair' }, POLICY: { color: '#8B5CF6', label: 'Policy' }, GENERAL: { color: '#6B7280', label: 'General' } };
const SEVERITY_BARS = ['#4B5563', '#3B82F6', '#F59E0B', '#F97316', '#EF4444'];

export default function AiIntelPanel() {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const { showAiInsights, flyToCable } = useMapStore();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!showAiInsights) return;
    fetch('/api/ai/analyze').then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [showAiInsights]);

  if (!showAiInsights || loading || !data || data.results.length === 0) return null;
  const relevantResults = data.results.filter(r => r.analysis?.isRelevant);

  return (
    <div style={{ position: 'absolute', top: 72, right: 16, width: 300, backgroundColor: 'rgba(13, 27, 42, 0.93)', backdropFilter: 'blur(12px)', border: `1px solid ${relevantResults.some(r => r.analysis.severity >= 4) ? 'rgba(239,68,68,0.4)' : 'rgba(139, 92, 246, 0.3)'}`, borderRadius: 12, zIndex: 40, overflow: 'hidden' }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#8B5CF6', animation: 'pulse 2s infinite', boxShadow: '0 0 6px #8B5CF6' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#EDF2F7' }}>{t('ai.intelTitle')}</span>
          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#8B5CF6' }}>MiniMax</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#6B7280' }}>{relevantResults.length} alerts</span>
          <span style={{ fontSize: 14, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {isExpanded && (
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <div style={{ padding: '8px 14px', display: 'flex', gap: 12, justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 10, color: '#6B7280' }}>
            <span>{data.stats.totalNewsScanned} {t('ai.scanned')}</span>
            <span>{data.stats.aiAnalyzed} {t('ai.analyzed')}</span>
            <span style={{ color: relevantResults.length > 0 ? '#8B5CF6' : '#6B7280' }}>{relevantResults.length} {t('ai.relevant')}</span>
            {data.stats.disruptions > 0 && <span style={{ color: '#EF4444', fontWeight: 600 }}>{data.stats.disruptions} {t('ai.disruptions')}</span>}
          </div>

          {relevantResults.map((item, i) => {
            const a = item.analysis;
            const eventConfig = EVENT_CONFIG[a.eventType] || EVENT_CONFIG.GENERAL;
            // 根据当前语言选择中文或英文摘要
            const summary = locale === 'zh' ? a.summaryZh : a.summaryEn;

            return (
              <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', borderLeft: `3px solid ${eventConfig.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: `${eventConfig.color}20`, color: eventConfig.color }}>{eventConfig.label}</span>
                    {a.serviceDisruption && <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>DISRUPTION</span>}
                  </div>
                  <span style={{ fontSize: 9, color: '#4B5563' }}>{a.confidence}% conf</span>
                </div>
                <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map(level => (<div key={level} style={{ flex: 1, height: 3, borderRadius: 1, backgroundColor: level <= a.severity ? SEVERITY_BARS[level - 1] : 'rgba(255,255,255,0.06)' }} />))}
                </div>
                <div style={{ fontSize: 12, color: '#EDF2F7', lineHeight: 1.5, marginBottom: 6 }}>{summary}</div>
                {a.cableNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 6 }}>
                    {a.cableNames.map((name, j) => (
                      <span key={j} onClick={() => { const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); flyToCable(slug); }}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(42, 157, 143, 0.15)', color: '#2A9D8F', cursor: 'pointer', border: '1px solid rgba(42, 157, 143, 0.2)' }}>{name}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4B5563' }}>
                  <span>{a.affectedCountries.length > 0 ? `Affects: ${a.affectedCountries.join(', ')}` : item.source}</span>
                  {a.estimatedDuration && <span style={{ color: '#F59E0B' }}>~{a.estimatedDuration}</span>}
                </div>
                <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>{new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {item.source}</div>
              </div>
            );
          })}

          {data.results.length > relevantResults.length && (
            <div style={{ padding: '8px 14px', fontSize: 10, color: '#4B5563', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {t('ai.otherArticles', { count: data.results.length - relevantResults.length })}
            </div>
          )}
          <div style={{ padding: '8px 14px', fontSize: 9, color: '#4B5563', borderTop: '1px solid rgba(255,255,255,0.04)', lineHeight: 1.5 }}>
            {t('ai.poweredBy')} · {data.cached ? t('ai.cached') : t('ai.fresh')} · {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}

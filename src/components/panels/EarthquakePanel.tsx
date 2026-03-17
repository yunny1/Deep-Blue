// src/components/panels/EarthquakePanel.tsx
// 地震面板 — UI打磨版：骨架屏 + 平滑展开
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { SkeletonEarthquakeList } from '@/components/ui/Skeleton';

interface Earthquake { id: string; magnitude: number; place: string; time: string; tsunami: boolean; depth: number; severity: string; }
interface AffectedCable { cableId: string; cableName: string; cableSlug: string; distanceKm: number; riskLevel: string; }
interface AnalysisEvent { earthquakeId: string; magnitude: number; place: string; time: string; affectedCount: number; cables: AffectedCable[]; }
interface EarthquakeData { count: number; earthquakes: Earthquake[]; analysis?: { totalAffectedCables: number; events: AnalysisEvent[] }; }

const SEVERITY_COLORS: Record<string, string> = { critical: '#EF4444', major: '#F97316', moderate: '#F59E0B', minor: '#6B7280' };
const RISK_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F97316', LOW: '#F59E0B' };

export default function EarthquakePanel() {
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedQuake, setSelectedQuake] = useState<string | null>(null);
  const { flyToCable } = useMapStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetch('/api/earthquakes?analyze=true').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    const interval = setInterval(() => { fetch('/api/earthquakes?analyze=true').then(r => r.json()).then(setData).catch(() => {}); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const affectedCount = data?.analysis?.totalAffectedCables || 0;

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 16, width: 240,
      backgroundColor: 'rgba(10, 17, 34, 0.95)', backdropFilter: 'blur(16px)',
      border: `1px solid ${affectedCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-lg)', zIndex: 40, overflow: 'hidden',
      transition: 'border-color var(--duration-slow) ease',
      boxShadow: 'var(--shadow-panel)',
    }}>
      {/* 标题栏 */}
      <div onClick={() => setIsExpanded(!isExpanded)} style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
        borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
        transition: 'border-color var(--duration-fast) ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: affectedCount > 0 ? '#EF4444' : '#F59E0B', boxShadow: affectedCount > 0 ? '0 0 8px #EF4444' : 'none', animation: affectedCount > 0 ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{t('earthquake.title')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <div style={{ width: 12, height: 12, border: '1.5px solid var(--border-default)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: affectedCount > 0 ? '#EF4444' : 'var(--text-muted)' }}>{data?.count || 0} {t('earthquake.quakes')}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--duration-normal) ease' }}>▾</span>
        </div>
      </div>

      {/* 展开内容（带高度过渡） */}
      <div style={{
        maxHeight: isExpanded ? 350 : 0, overflow: 'hidden',
        transition: 'max-height var(--duration-slow) cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {loading ? <SkeletonEarthquakeList /> : data && (
          <div style={{ overflowY: 'auto', maxHeight: 350 }}>
            {affectedCount > 0 && (
              <div style={{ padding: '8px 14px', backgroundColor: 'rgba(239, 68, 68, 0.06)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: '#F87171', animation: 'fadeIn 0.3s ease' }}>
                {t('earthquake.cablesNear', { count: affectedCount })}
              </div>
            )}

            {data.analysis?.events && data.analysis.events.length > 0 && (
              <>
                <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase' as const, letterSpacing: 1 }}>{t('earthquake.affectingCables')}</div>
                {data.analysis.events.slice(0, 5).map((event, eventIdx) => (
                  <div key={event.earthquakeId} style={{ borderBottom: '1px solid var(--border-subtle)', animation: `fadeInUp 0.2s ease ${eventIdx * 0.05}s both` }}>
                    <div onClick={() => setSelectedQuake(selectedQuake === event.earthquakeId ? null : event.earthquakeId)}
                      style={{ padding: '8px 14px', cursor: 'pointer', transition: 'background-color var(--duration-fast)' }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.06)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: SEVERITY_COLORS[event.magnitude >= 7 ? 'critical' : event.magnitude >= 6 ? 'major' : 'moderate'] }}>M{event.magnitude.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{event.affectedCount} cable{event.affectedCount > 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{event.place}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(event.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    {/* 受影响海缆（带折叠动画） */}
                    <div style={{
                      maxHeight: selectedQuake === event.earthquakeId ? 200 : 0,
                      overflow: 'hidden',
                      transition: 'max-height var(--duration-slow) cubic-bezier(0.16, 1, 0.3, 1)',
                    }}>
                      <div style={{ padding: '0 14px 8px' }}>
                        {event.cables.map(cable => (
                          <div key={cable.cableId} onClick={() => flyToCable(cable.cableSlug)}
                            style={{ padding: '6px 10px', marginTop: 4, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-raised)', cursor: 'pointer', transition: 'background-color var(--duration-fast)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
                            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--bg-raised)')}>
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>{cable.cableName}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('earthquake.kmAway', { km: cable.distanceKm })}</div>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-sm)', backgroundColor: `${RISK_COLORS[cable.riskLevel]}15`, color: RISK_COLORS[cable.riskLevel] }}>{cable.riskLevel}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 1 }}>{t('earthquake.recent', { count: data.count })}</div>
            {data.earthquakes.slice(0, 8).map((eq, i) => (
              <div key={eq.id} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 11, animation: `fadeIn 0.2s ease ${i * 0.03}s both` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: SEVERITY_COLORS[eq.severity], fontWeight: 600 }}>M{eq.magnitude.toFixed(1)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('earthquake.kmDeep', { km: eq.depth.toFixed(0) })}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 1, fontSize: 10 }}>{eq.place}</div>
              </div>
            ))}
            <div style={{ padding: '8px 14px', fontSize: 9, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>{t('earthquake.source')}</div>
          </div>
        )}
      </div>
    </div>
  );
}

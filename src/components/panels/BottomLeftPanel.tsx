// src/components/panels/BottomLeftPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { SkeletonEarthquakeList } from '@/components/ui/Skeleton';

interface Earthquake {
  id: string; magnitude: number; place: string; time: string;
  tsunami: boolean; depth: number; severity: string;
  latitude?: number; longitude?: number;
}
interface AffectedCable { cableId: string; cableName: string; cableSlug: string; distanceKm: number; riskLevel: string; }
interface AnalysisEvent { earthquakeId: string; magnitude: number; place: string; time: string; affectedCount: number; cables: AffectedCable[]; }
interface EarthquakeData { count: number; earthquakes: Earthquake[]; analysis?: { totalAffectedCables: number; events: AnalysisEvent[] }; }
interface OutageEvent { id: string; description: string; affectedCountries: string[]; startDate: string; isOngoing: boolean; }
interface CloudflareData { status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED'; activeOutages: number; affectedCountries: string[]; events: OutageEvent[]; lastChecked: string; source: string; }

const SEVERITY_COLORS: Record<string, string> = { critical: '#EF4444', major: '#F97316', moderate: '#F59E0B', minor: '#6B7280' };
const RISK_COLORS: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F97316', LOW: '#F59E0B' };
const OUTAGE_CONFIG = {
  NORMAL:    { color: '#06D6A0', labelEn: 'Normal',    labelZh: '正常' },
  DEGRADED:  { color: '#F59E0B', labelEn: 'Degraded',  labelZh: '异常' },
  DISRUPTED: { color: '#EF4444', labelEn: 'Disrupted', labelZh: '中断' },
};

function timeAgo(iso: string, zh: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (zh) return d > 0 ? `${d}天前` : h > 0 ? `${h}小时前` : `${Math.max(1, m)}分钟前`;
  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : `${Math.max(1, m)}m ago`;
}

// ─── 地震子面板 ─────────────────────────────────────────────────
function EarthquakeSubPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedQuake, setSelectedQuake] = useState<string | null>(null);
  const { flyToCable, setEarthquakeHighlight, earthquakeHighlight } = useMapStore();

  useEffect(() => {
    fetch('/api/earthquakes?analyze=true')
      .then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    const interval = setInterval(() => {
      fetch('/api/earthquakes?analyze=true').then(r => r.json()).then(setData).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleQuakeClick = (event: AnalysisEvent) => {
    if (selectedQuake === event.earthquakeId) {
      // 再次点击：退出地震模式
      setSelectedQuake(null);
      setEarthquakeHighlight(null);
      return;
    }
    setSelectedQuake(event.earthquakeId);
    const raw = data?.earthquakes?.find(e => e.id === event.earthquakeId);
    if (!raw?.latitude || !raw?.longitude) return;
    setEarthquakeHighlight({
      lat: raw.latitude, lng: raw.longitude,
      magnitude: event.magnitude, place: event.place,
      affectedCables: event.cables.map(c => ({
        cableSlug: c.cableSlug, cableName: c.cableName,
        distanceKm: c.distanceKm, riskLevel: c.riskLevel as 'HIGH' | 'MEDIUM' | 'LOW',
      })),
    });
  };

  const affectedCount = data?.analysis?.totalAffectedCables || 0;
  const dotColor = affectedCount > 0 ? '#EF4444' : '#F59E0B';

  return (
    <div style={{
      backgroundColor: 'rgba(10,17,34,0.95)', backdropFilter: 'blur(16px)',
      border: `1px solid ${affectedCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(42,157,143,0.15)'}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', cursor: 'pointer',
        borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor, boxShadow: affectedCount > 0 ? `0 0 8px ${dotColor}` : 'none', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0' }}>{zh ? '地震活动' : 'Seismic Activity'}</span>
          {/* 地震模式激活时显示退出按钮 */}
          {earthquakeHighlight && (
            <span
              onClick={(e) => { e.stopPropagation(); setSelectedQuake(null); setEarthquakeHighlight(null); }}
              style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
            >
              {zh ? '退出' : 'Exit'} ✕
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <div style={{ width: 12, height: 12, border: '1.5px solid rgba(255,255,255,0.1)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: affectedCount > 0 ? '#EF4444' : '#6B7280' }}>
              {data?.count || 0} {zh ? '次' : 'quakes'}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </div>
      </div>

      <div style={{ maxHeight: isExpanded ? 320 : 0, overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
        {loading ? <SkeletonEarthquakeList /> : data && (
          <div style={{ overflowY: 'auto', maxHeight: 320 }}>
            {affectedCount > 0 && (
              <div style={{ padding: '8px 14px', backgroundColor: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#F87171' }}>
                {zh ? `${affectedCount} 条海缆受地震影响` : `${affectedCount} cable(s) near seismic activity`}
              </div>
            )}

            {(data.analysis?.events || []).length > 0 && (
              <>
                <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                  {zh ? '影响海缆' : 'Affecting cables'}
                </div>
                {(data.analysis?.events || []).slice(0, 5).map((event) => (
                  <div key={event.earthquakeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <div
                      onClick={() => handleQuakeClick(event)}
                      style={{
                        padding: '8px 14px', cursor: 'pointer',
                        backgroundColor: selectedQuake === event.earthquakeId ? 'rgba(239,68,68,0.08)' : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseOver={e => { if (selectedQuake !== event.earthquakeId) e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.04)'; }}
                      onMouseOut={e => { if (selectedQuake !== event.earthquakeId) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: SEVERITY_COLORS[event.magnitude >= 7 ? 'critical' : event.magnitude >= 6 ? 'major' : 'moderate'] }}>
                          M{event.magnitude.toFixed(1)}
                        </span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: '#6B7280' }}>{timeAgo(event.time, zh)}</span>
                          <span style={{ fontSize: 10, color: '#EF4444' }}>
                            {event.affectedCount} {zh ? '条海缆' : `cable${event.affectedCount > 1 ? 's' : ''}`}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{event.place}</div>
                      {selectedQuake === event.earthquakeId && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                          <span style={{ fontSize: 10, color: '#2A9D8F' }}>
                            🌐 {zh ? '已在地图显示影响范围' : 'Impact shown on map'}
                          </span>
                          <span
                            onClick={(e) => { e.stopPropagation(); setSelectedQuake(null); setEarthquakeHighlight(null); }}
                            style={{ fontSize: 9, color: '#EF4444', cursor: 'pointer', padding: '2px 7px', borderRadius: 4, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
                          >
                            {zh ? '退出' : 'Exit'} ✕
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ maxHeight: selectedQuake === event.earthquakeId ? 200 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                      <div style={{ padding: '0 14px 8px' }}>
                        {event.cables.map(cable => (
                          <div key={cable.cableId} onClick={() => flyToCable(cable.cableSlug)}
                            style={{ padding: '6px 10px', marginTop: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)')}
                            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)')}
                          >
                            <div>
                              <div style={{ fontSize: 11, color: '#E2E8F0', fontWeight: 500 }}>{cable.cableName}</div>
                              <div style={{ fontSize: 10, color: '#6B7280' }}>{cable.distanceKm} km {zh ? '外' : 'away'}</div>
                            </div>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, backgroundColor: `${RISK_COLORS[cable.riskLevel]}15`, color: RISK_COLORS[cable.riskLevel] }}>
                              {cable.riskLevel}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {(data.earthquakes || []).slice(0, 6).map((eq) => (
              <div key={eq.id} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: SEVERITY_COLORS[eq.severity], fontWeight: 600 }}>M{eq.magnitude.toFixed(1)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{eq.depth.toFixed(0)} km {zh ? '深' : 'deep'}</span>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{timeAgo(eq.time, zh)}</span>
                  </div>
                </div>
                <div style={{ color: '#6B7280', marginTop: 1, fontSize: 10 }}>{eq.place}</div>
              </div>
            ))}

            <div style={{ padding: '8px 14px', fontSize: 9, color: '#374151', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              {zh ? '来源：USGS · 每5分钟更新' : 'Source: USGS · Updates every 5min'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 互联网健康子面板 ───────────────────────────────────────────
function InternetHealthSubPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<CloudflareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/signals/cloudflare').then(r => r.json()).then((d: CloudflareData) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    };
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  coconst config = (data && OUTAGE_CONFIG[data.status]) || OUTAGE_CONFIG.NORMAL;;
  const hasOutage = data && data.activeOutages > 0;

  return (
    <div style={{ backgroundColor: 'rgba(10,17,34,0.95)', backdropFilter: 'blur(16px)', border: `1px solid ${hasOutage ? 'rgba(239,68,68,0.3)' : 'rgba(42,157,143,0.15)'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: config.color, boxShadow: hasOutage ? `0 0 8px ${config.color}` : 'none', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0' }}>{zh ? '光纤中断监测' : 'Fiber Outage Monitor'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <div style={{ width: 12, height: 12, border: '1.5px solid rgba(255,255,255,0.1)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: config.color, backgroundColor: `${config.color}15`, border: `1px solid ${config.color}40`, borderRadius: 4, padding: '1px 6px' }}>
              {zh ? config.labelZh : config.labelEn}{hasOutage && ` (${data.activeOutages})`}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </div>
      </div>

      <div style={{ maxHeight: isExpanded ? 280 : 0, overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ overflowY: 'auto', maxHeight: 280 }}>
          {!data || data.activeOutages === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
              {zh ? '✓ 当前无光纤中断事件' : '✓ No active fiber disruptions'}
            </div>
          ) : data.events.map((event, i) => (
            <div key={event.id || i} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <p style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5, margin: 0, flex: 1 }}>{event.description}</p>
                {event.isOngoing && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase' as const }}>{zh ? '进行中' : 'LIVE'}</span>}
              </div>
              {event.affectedCountries.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 4 }}>
                  {event.affectedCountries.slice(0, 5).map(cc => (
                    <span key={cc} style={{ fontSize: 10, color: '#94A3B8', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 3, padding: '1px 5px' }}>{cc}</span>
                  ))}
                  {event.affectedCountries.length > 5 && <span style={{ fontSize: 10, color: '#4B5563' }}>+{event.affectedCountries.length - 5}</span>}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#4B5563' }}>{timeAgo(event.startDate, zh)}</div>
            </div>
          ))}
          <div style={{ padding: '8px 14px', fontSize: 9, color: '#374151', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {zh ? '来源：Cloudflare Radar · 每5分钟更新' : 'Source: Cloudflare Radar · Updates every 5min'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────
export default function BottomLeftPanel() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  return (
    <div style={{ position: 'absolute', bottom: 20, left: 16, width: 260, zIndex: 40, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <EarthquakeSubPanel zh={zh} />
      <InternetHealthSubPanel zh={zh} />
    </div>
  );
}

// src/components/panels/EarthquakePanel.tsx
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { SkeletonEarthquakeList } from '@/components/ui/Skeleton';

interface Earthquake {
  id: string; magnitude: number; place: string; time: string;
  tsunami: boolean; depth: number; severity: string;
  latitude?: number; longitude?: number;  // ← 改这里，去掉 lat/lng
}
interface AffectedCable {
  cableId: string; cableName: string; cableSlug: string;
  distanceKm: number; riskLevel: string;
}
interface AnalysisEvent {
  earthquakeId: string; magnitude: number; place: string; time: string;
  affectedCount: number; cables: AffectedCable[];
  lat?: number; lng?: number;
}
interface EarthquakeData {
  count: number; earthquakes: Earthquake[];
  analysis?: { totalAffectedCables: number; events: AnalysisEvent[] };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444', major: '#F97316', moderate: '#F59E0B', minor: '#6B7280',
};
const RISK_COLORS: Record<string, string> = {
  HIGH: '#EF4444', MEDIUM: '#F97316', LOW: '#E9C46A',
};

// 时间格式化：X分钟前 / X小时前 / X天前
function timeAgo(isoString: string, zh: boolean): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);
  if (zh) {
    if (days > 0)    return `${days}天前`;
    if (hours > 0)   return `${hours}小时前`;
    return `${Math.max(1, minutes)}分钟前`;
  } else {
    if (days > 0)    return `${days}d ago`;
    if (hours > 0)   return `${hours}h ago`;
    return `${Math.max(1, minutes)}m ago`;
  }
}

export default function EarthquakePanel() {
  const [data, setData]               = useState<EarthquakeData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isExpanded, setIsExpanded]   = useState(false);
  const [selectedQuake, setSelectedQuake] = useState<string | null>(null);
  const { flyToCable, setEarthquakeHighlight, earthquakeHighlight } = useMapStore();
  const { t } = useTranslation();
  const zh = useMapStore.getState().colorMode !== undefined;

  useEffect(() => {
    fetch('/api/earthquakes?analyze=true')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const interval = setInterval(() => {
      fetch('/api/earthquakes?analyze=true').then(r => r.json()).then(setData).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const { locale } = useTranslation();
  const isZh = locale === 'zh';

  const affectedCount = data?.analysis?.totalAffectedCables || 0;

  const handleEarthquakeClick = (event: AnalysisEvent) => {
    const isSelected = selectedQuake === event.earthquakeId;
    if (isSelected) {
      // 再次点击：取消高亮
      setSelectedQuake(null);
      setEarthquakeHighlight(null);
      return;
    }
    setSelectedQuake(event.earthquakeId);

    // 从地震原始数据里找坐标
    const quakeRaw = data?.earthquakes?.find(e => e.id === event.earthquakeId);
    if (!quakeRaw?.latitude || !quakeRaw?.longitude) return;

    setEarthquakeHighlight({
      lat: quakeRaw.latitude,
      lng: quakeRaw.longitude,
      magnitude: event.magnitude,
      place: event.place,
      affectedCables: event.cables.map(c => ({
        cableSlug: c.cableSlug,
        cableName: c.cableName,
        distanceKm: c.distanceKm,
        riskLevel: c.riskLevel as 'HIGH' | 'MEDIUM' | 'LOW',
      })),
    });
  };

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 16, width: 240,
      backgroundColor: 'rgba(10,17,34,0.95)', backdropFilter: 'blur(16px)',
      border: `1px solid ${affectedCount > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border-default)'}`,
      borderRadius: 'var(--radius-lg)', zIndex: 40, overflow: 'hidden',
      boxShadow: 'var(--shadow-panel)',
    }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', cursor: 'pointer',
        borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: affectedCount > 0 ? '#EF4444' : '#F59E0B',
            boxShadow: affectedCount > 0 ? '0 0 8px #EF4444' : 'none',
            animation: affectedCount > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0' }}>
            {isZh ? '地震活动' : 'Seismic Activity'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? (
            <div style={{ width: 12, height: 12, border: '1.5px solid rgba(255,255,255,0.1)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, color: affectedCount > 0 ? '#EF4444' : '#6B7280' }}>
              {data?.count || 0} {isZh ? '次' : 'quakes'}
            </span>
          )}
          <span style={{ fontSize: 12, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </div>
      </div>

      <div style={{ maxHeight: isExpanded ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
        {loading ? <SkeletonEarthquakeList /> : data && (
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>

            {affectedCount > 0 && (
              <div style={{ padding: '8px 14px', backgroundColor: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#F87171' }}>
                {isZh ? `${affectedCount} 条海缆受地震影响` : `${affectedCount} cable(s) near seismic activity`}
              </div>
            )}

            {/* 有影响的地震事件 */}
            {(data.analysis?.events || []).slice(0, 5).map(event => (
              <div key={event.earthquakeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div
                  onClick={() => handleEarthquakeClick(event)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#6B7280' }}>
                        {timeAgo(event.time, isZh)}
                      </span>
                      <span style={{ fontSize: 10, color: affectedCount > 0 ? '#EF4444' : '#6B7280' }}>
                        {event.affectedCount} {isZh ? '条海缆' : `cable${event.affectedCount > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{event.place}</div>
                  {selectedQuake === event.earthquakeId && (
                    <div style={{ fontSize: 9, color: '#2A9D8F', marginTop: 4 }}>
                      {isZh ? '▶ 已在地图显示影响范围' : '▶ Showing impact radius on map'}
                    </div>
                  )}
                </div>

                {/* 受影响海缆列表 */}
                {selectedQuake === event.earthquakeId && (
                  <div style={{ padding: '0 14px 8px' }}>
                    {event.cables.map(cable => (
                      <div key={cable.cableId}
                        onClick={() => flyToCable(cable.cableSlug)}
                        style={{
                          padding: '6px 10px', marginTop: 4, borderRadius: 6,
                          backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: '#E2E8F0', fontWeight: 500 }}>{cable.cableName}</div>
                          <div style={{ fontSize: 10, color: '#6B7280' }}>{cable.distanceKm} km {isZh ? '外' : 'away'}</div>
                        </div>
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          backgroundColor: `${RISK_COLORS[cable.riskLevel]}15`,
                          color: RISK_COLORS[cable.riskLevel],
                        }}>
                          {cable.riskLevel}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 其余地震列表 */}
            {(data.earthquakes || []).slice(0, 8).map(eq => (
              <div key={eq.id} style={{ padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: SEVERITY_COLORS[eq.severity], fontWeight: 600 }}>M{eq.magnitude.toFixed(1)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{eq.depth.toFixed(0)} km {isZh ? '深' : 'deep'}</span>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>{timeAgo(eq.time, isZh)}</span>
                  </div>
                </div>
                <div style={{ color: '#6B7280', marginTop: 1, fontSize: 10 }}>{eq.place}</div>
              </div>
            ))}

            <div style={{ padding: '8px 14px', fontSize: 9, color: '#374151', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              {isZh ? '来源：USGS · 每5分钟更新' : 'Source: USGS · Updates every 5min'}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

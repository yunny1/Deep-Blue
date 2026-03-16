// src/components/panels/EarthquakePanel.tsx
// 地震预警面板 — 显示最近7天的地震及受影响的海缆
// 出现在地图右下角，点击地震条目可以飞行到震中位置

'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  tsunami: boolean;
  depth: number;
  latitude: number;
  longitude: number;
  severity: string;
  displaySize: number;
}

interface AffectedCable {
  cableId: string;
  cableName: string;
  cableSlug: string;
  distanceKm: number;
  riskLevel: string;
}

interface AnalysisEvent {
  earthquakeId: string;
  magnitude: number;
  place: string;
  time: string;
  affectedCount: number;
  cables: AffectedCable[];
}

interface EarthquakeData {
  count: number;
  earthquakes: Earthquake[];
  analysis?: {
    totalAffectedCables: number;
    events: AnalysisEvent[];
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  major: '#F97316',
  moderate: '#F59E0B',
  minor: '#6B7280',
};

const RISK_COLORS: Record<string, string> = {
  HIGH: '#EF4444',
  MEDIUM: '#F97316',
  LOW: '#F59E0B',
  NONE: '#6B7280',
};

export default function EarthquakePanel() {
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedQuake, setSelectedQuake] = useState<string | null>(null);
  const { flyToCable } = useMapStore();

  // 加载地震数据（含海缆影响分析）
  useEffect(() => {
    fetch('/api/earthquakes?analyze=true')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    // 每5分钟刷新一次（和USGS更新频率一致）
    const interval = setInterval(() => {
      fetch('/api/earthquakes?analyze=true')
        .then(r => r.json())
        .then(setData)
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (loading || !data) return null;

  // 统计有多少条海缆受影响
  const affectedCount = data.analysis?.totalAffectedCables || 0;
  const criticalQuakes = data.earthquakes.filter(e => e.magnitude >= 6).length;

  return (
    <div style={{
      position: 'absolute',
      bottom: 20, left: 16,
      width: 240,
      backgroundColor: 'rgba(13, 27, 42, 0.93)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${affectedCount > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(42, 157, 143, 0.2)'}`,
      borderRadius: 12,
      zIndex: 40,
      overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* 标题栏（可点击展开/折叠） */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* 地震图标 — 有高风险时脉冲动画 */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: affectedCount > 0 ? '#EF4444' : '#F59E0B',
            boxShadow: affectedCount > 0 ? '0 0 8px #EF4444' : 'none',
            animation: affectedCount > 0 ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#EDF2F7' }}>
            Seismic Activity
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: affectedCount > 0 ? '#EF4444' : '#6B7280',
          }}>
            {data.count} quakes
          </span>
          <span style={{
            fontSize: 14, color: '#6B7280',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>▾</span>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* 展开内容 */}
      {isExpanded && (
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          {/* 摘要统计 */}
          {affectedCount > 0 && (
            <div style={{
              padding: '8px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              fontSize: 11, color: '#F87171',
            }}>
              {affectedCount} cable{affectedCount > 1 ? 's' : ''} near seismic activity
              {criticalQuakes > 0 && (
                <span style={{ fontWeight: 600 }}> · {criticalQuakes} M6.0+</span>
              )}
            </div>
          )}

          {/* 有影响分析的地震列表 */}
          {data.analysis?.events && data.analysis.events.length > 0 && (
            <>
              <div style={{
                padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
                color: '#EF4444', textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>
                Affecting cables
              </div>
              {data.analysis.events.slice(0, 5).map(event => (
                <div key={event.earthquakeId} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <div
                    onClick={() => setSelectedQuake(
                      selectedQuake === event.earthquakeId ? null : event.earthquakeId
                    )}
                    style={{
                      padding: '8px 14px', cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: SEVERITY_COLORS[event.magnitude >= 7 ? 'critical' : event.magnitude >= 6 ? 'major' : 'moderate'],
                      }}>
                        M{event.magnitude.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 10, color: '#6B7280' }}>
                        {event.affectedCount} cable{event.affectedCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                      {event.place}
                    </div>
                    <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>
                      {new Date(event.time).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {/* 展开显示受影响的海缆列表 */}
                  {selectedQuake === event.earthquakeId && (
                    <div style={{ padding: '0 14px 8px' }}>
                      {event.cables.map(cable => (
                        <div
                          key={cable.cableId}
                          onClick={() => flyToCable(cable.cableSlug)}
                          style={{
                            padding: '6px 10px', marginTop: 4, borderRadius: 6,
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            cursor: 'pointer', transition: 'background-color 0.15s',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.12)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)')}
                        >
                          <div>
                            <div style={{ fontSize: 11, color: '#EDF2F7', fontWeight: 500 }}>
                              {cable.cableName}
                            </div>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>
                              {cable.distanceKm} km away
                            </div>
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                            backgroundColor: `${RISK_COLORS[cable.riskLevel]}20`,
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
            </>
          )}

          {/* 最近的地震列表（不影响海缆的） */}
          <div style={{
            padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
            color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: 1,
          }}>
            Recent M4.5+ ({data.count} total, 7 days)
          </div>
          {data.earthquakes.slice(0, 8).map(eq => (
            <div
              key={eq.id}
              style={{
                padding: '6px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
                fontSize: 11,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: SEVERITY_COLORS[eq.severity], fontWeight: 600 }}>
                  M{eq.magnitude.toFixed(1)}
                </span>
                <span style={{ color: '#4B5563', fontSize: 10 }}>
                  {eq.depth.toFixed(0)}km deep
                </span>
              </div>
              <div style={{ color: '#9CA3AF', marginTop: 1, fontSize: 10 }}>
                {eq.place}
              </div>
            </div>
          ))}

          {/* 数据来源标注 */}
          <div style={{
            padding: '8px 14px', fontSize: 9, color: '#4B5563',
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            Source: USGS Earthquake Hazards Program · Auto-refreshes every 5min
          </div>
        </div>
      )}
    </div>
  );
}

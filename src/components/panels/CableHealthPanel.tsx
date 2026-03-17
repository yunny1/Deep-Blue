// src/components/panels/CableHealthPanel.tsx
// 海缆健康监测面板 — 展示三源信号融合的结果
// 这是 Deep Blue 的核心差异化功能：在运营商公告之前感知海缆故障
// 每个推断都标注了置信度和信号来源，体现「事实/推断分离」原则

'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface Inference {
  cableId: string;
  cableName: string;
  cableSlug: string;
  healthStatus: string;
  confidencePct: number;
  signals: Array<{
    source: string;
    severity: string;
    detail: string;
    timestamp: string;
  }>;
  signalCount: number;
  sourceCount: number;
  summary: string;
}

interface FusionData {
  globalHealth: {
    totalCablesMonitored: number;
    cablesWithSignals: number;
    confirmed: number;
    likely: number;
    suspected: number;
    monitoring: number;
  };
  inferences: Inference[];
  signalSources: {
    news: { count: number; hasAnomaly: boolean };
    bgp: { count: number; hasAnomaly: boolean };
    traffic: { count: number; hasAnomaly: boolean };
  };
  timestamp: string;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  CONFIRMED: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', label: 'Confirmed', icon: '🔴' },
  LIKELY:    { color: '#F97316', bg: 'rgba(249,115,22,0.10)', label: 'Likely', icon: '🟠' },
  SUSPECTED: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Suspected', icon: '🟡' },
  MONITORING:{ color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Monitoring', icon: '🔵' },
  NORMAL:    { color: '#06D6A0', bg: 'rgba(6,214,160,0.08)', label: 'Normal', icon: '🟢' },
};

const SOURCE_CONFIG: Record<string, { color: string; label: string }> = {
  NEWS:    { color: '#8B5CF6', label: 'News' },
  BGP:     { color: '#3B82F6', label: 'BGP' },
  TRAFFIC: { color: '#F59E0B', label: 'Traffic' },
};

export default function CableHealthPanel() {
  const [data, setData] = useState<FusionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCable, setExpandedCable] = useState<string | null>(null);
  const { showAiInsights, flyToCable } = useMapStore();

  // 加载融合数据
  useEffect(() => {
    fetch('/api/signals/fusion')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    // 每5分钟刷新
    const interval = setInterval(() => {
      fetch('/api/signals/fusion')
        .then(r => r.json())
        .then(setData)
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // 如果AI推断开关关闭，不显示此面板
  if (!showAiInsights) return null;
  if (loading || !data) return null;

  const hasIssues = data.globalHealth.cablesWithSignals > 0;

  return (
    <div style={{
      position: 'absolute', top: 72, right: 240, width: 280,
      backgroundColor: 'rgba(13, 27, 42, 0.93)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${hasIssues ? 'rgba(249, 115, 22, 0.3)' : 'rgba(42, 157, 143, 0.2)'}`,
      borderRadius: 12,
      zIndex: 40, overflow: 'hidden',
    }}>
      {/* 标题栏 */}
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
          {/* AI推断标识（蓝色脉冲圆点，表示这是AI推断内容） */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: '#3B82F6',
            animation: 'pulse 2s infinite',
            boxShadow: '0 0 6px #3B82F6',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#EDF2F7' }}>
            Cable Health Monitor
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* AI标签 */}
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
            backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#3B82F6',
            letterSpacing: 0.5,
          }}>
            AI INFERRED
          </span>
          <span style={{
            fontSize: 14, color: '#6B7280',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>▾</span>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {isExpanded && (
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {/* 三个信号源状态指示器 */}
          <div style={{
            padding: '10px 14px',
            display: 'flex', gap: 8, justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {Object.entries(data.signalSources).map(([key, val]) => {
              const config = SOURCE_CONFIG[key.toUpperCase()] || { color: '#6B7280', label: key };
              return (
                <div key={key} style={{
                  flex: 1, textAlign: 'center', padding: '6px 0',
                  borderRadius: 6,
                  backgroundColor: val.hasAnomaly ? `${config.color}15` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${val.hasAnomaly ? `${config.color}40` : 'transparent'}`,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', margin: '0 auto 4px',
                    backgroundColor: val.hasAnomaly ? config.color : '#4B5563',
                    boxShadow: val.hasAnomaly ? `0 0 4px ${config.color}` : 'none',
                  }} />
                  <div style={{ fontSize: 10, fontWeight: 600, color: val.hasAnomaly ? config.color : '#6B7280' }}>
                    {config.label}
                  </div>
                  <div style={{ fontSize: 9, color: '#4B5563', marginTop: 1 }}>
                    {val.count} signal{val.count !== 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 全局健康摘要 */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              Global status
            </div>
            {hasIssues ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {data.globalHealth.confirmed > 0 && (
                  <StatusBadge count={data.globalHealth.confirmed} status="CONFIRMED" />
                )}
                {data.globalHealth.likely > 0 && (
                  <StatusBadge count={data.globalHealth.likely} status="LIKELY" />
                )}
                {data.globalHealth.suspected > 0 && (
                  <StatusBadge count={data.globalHealth.suspected} status="SUSPECTED" />
                )}
                {data.globalHealth.monitoring > 0 && (
                  <StatusBadge count={data.globalHealth.monitoring} status="MONITORING" />
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#06D6A0' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#06D6A0' }} />
                All {data.globalHealth.totalCablesMonitored} cables operating normally
              </div>
            )}
          </div>

          {/* 受影响海缆列表 */}
          {data.inferences.length > 0 && (
            <div style={{ padding: '8px 14px 4px' }}>
              <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                Cables with signals ({data.inferences.length})
              </div>
              {data.inferences.map(inf => {
                const config = STATUS_CONFIG[inf.healthStatus] || STATUS_CONFIG.NORMAL;
                const isOpen = expandedCable === inf.cableId;

                return (
                  <div key={inf.cableId} style={{
                    marginBottom: 6, borderRadius: 8, overflow: 'hidden',
                    border: `1px solid ${config.color}25`,
                    backgroundColor: config.bg,
                  }}>
                    {/* 海缆行 */}
                    <div
                      onClick={() => setExpandedCable(isOpen ? null : inf.cableId)}
                      style={{
                        padding: '8px 12px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: '#EDF2F7', fontWeight: 500 }}>
                          {inf.cableName}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                          {inf.summary}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <div style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          backgroundColor: `${config.color}20`, color: config.color,
                        }}>
                          {config.label}
                        </div>
                        <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>
                          {inf.confidencePct}% conf.
                        </div>
                      </div>
                    </div>

                    {/* 展开详情 */}
                    {isOpen && (
                      <div style={{
                        padding: '0 12px 10px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        {/* 信号来源列表 */}
                        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 8, marginBottom: 4, fontWeight: 600 }}>
                          Signals ({inf.signalCount} from {inf.sourceCount} source{inf.sourceCount > 1 ? 's' : ''})
                        </div>
                        {inf.signals.map((sig, i) => {
                          const sc = SOURCE_CONFIG[sig.source] || { color: '#6B7280', label: sig.source };
                          return (
                            <div key={i} style={{
                              padding: '4px 8px', marginBottom: 3, borderRadius: 4,
                              backgroundColor: 'rgba(0,0,0,0.15)',
                              fontSize: 10, display: 'flex', gap: 6, alignItems: 'flex-start',
                            }}>
                              <span style={{
                                fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                                backgroundColor: `${sc.color}25`, color: sc.color,
                                flexShrink: 0, marginTop: 1,
                              }}>
                                {sc.label}
                              </span>
                              <span style={{ color: '#9CA3AF', lineHeight: 1.4 }}>
                                {sig.detail.length > 80 ? sig.detail.slice(0, 80) + '...' : sig.detail}
                              </span>
                            </div>
                          );
                        })}

                        {/* 飞行到这条海缆按钮 */}
                        <button
                          onClick={() => flyToCable(inf.cableSlug)}
                          style={{
                            width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 6,
                            border: `1px solid ${config.color}40`,
                            backgroundColor: `${config.color}10`,
                            color: config.color, fontSize: 11, fontWeight: 500,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          Fly to {inf.cableName}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部说明 */}
          <div style={{
            padding: '8px 14px', fontSize: 9, color: '#4B5563',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            lineHeight: 1.5,
          }}>
            AI-inferred status based on 3 signal sources: news semantics, BGP routing, and traffic flow.
            Confidence increases when multiple independent sources corroborate.
            Updated {data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'just now'}.
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ count, status }: { count: number; status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.NORMAL;
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
      backgroundColor: config.bg, color: config.color,
      border: `1px solid ${config.color}30`,
    }}>
      {count} {config.label.toLowerCase()}
    </div>
  );
}

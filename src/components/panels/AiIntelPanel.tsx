// src/components/panels/AiIntelPanel.tsx
// AI情报面板 — 展示MiniMax深度分析的结果
// 每条新闻都有AI生成的结构化情报：海缆名称、事件类型、严重程度、中英双语摘要
// 这是真正的AI能力展示，不是关键词匹配

'use client';

import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

interface AiResult {
  title: string;
  source: string;
  pubDate: string;
  link: string;
  analysis: {
    isRelevant: boolean;
    relevanceScore: number;
    cableNames: string[];
    eventType: string;
    severity: number;
    affectedCountries: string[];
    summaryEn: string;
    summaryZh: string;
    estimatedDuration: string | null;
    serviceDisruption: boolean;
    confidence: number;
  };
}

interface AiData {
  timestamp: string;
  cached: boolean;
  stats: {
    totalNewsScanned: number;
    preFiltered: number;
    aiAnalyzed: number;
    relevant: number;
    faults: number;
    disruptions: number;
  };
  results: AiResult[];
  detectedCables: string[];
}

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  FAULT:            { color: '#EF4444', label: 'Fault' },
  NATURAL_DISASTER: { color: '#F97316', label: 'Disaster' },
  SABOTAGE:         { color: '#EC4899', label: 'Sabotage' },
  CONSTRUCTION:     { color: '#3B82F6', label: 'Construction' },
  REPAIR:           { color: '#10B981', label: 'Repair' },
  POLICY:           { color: '#8B5CF6', label: 'Policy' },
  GENERAL:          { color: '#6B7280', label: 'General' },
};

const SEVERITY_BARS = ['#4B5563', '#3B82F6', '#F59E0B', '#F97316', '#EF4444'];

export default function AiIntelPanel() {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showZh, setShowZh] = useState(false); // 中英文切换
  const { showAiInsights, flyToCable } = useMapStore();

  useEffect(() => {
    if (!showAiInsights) return;

    fetch('/api/ai/analyze')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showAiInsights]);

  if (!showAiInsights) return null;
  if (loading) return null;
  if (!data || data.results.length === 0) return null;

  const relevantResults = data.results.filter(r => r.analysis?.isRelevant);

  return (
    <div style={{
      position: 'absolute', top: 72, right: 16, width: 300,
      backgroundColor: 'rgba(13, 27, 42, 0.93)',
      backdropFilter: 'blur(12px)',
      border: `1px solid ${relevantResults.some(r => r.analysis.severity >= 4) ? 'rgba(239,68,68,0.4)' : 'rgba(139, 92, 246, 0.3)'}`,
      borderRadius: 12, zIndex: 40, overflow: 'hidden',
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
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: '#8B5CF6',
            animation: 'pulse 2s infinite',
            boxShadow: '0 0 6px #8B5CF6',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#EDF2F7' }}>
            AI Intelligence
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
            backgroundColor: 'rgba(139, 92, 246, 0.2)', color: '#8B5CF6',
          }}>
            MiniMax
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#6B7280' }}>
            {relevantResults.length} alerts
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
          {/* 统计摘要 */}
          <div style={{
            padding: '8px 14px', display: 'flex', gap: 12, justifyContent: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: 10, color: '#6B7280',
          }}>
            <span>{data.stats.totalNewsScanned} scanned</span>
            <span>{data.stats.aiAnalyzed} analyzed</span>
            <span style={{ color: relevantResults.length > 0 ? '#8B5CF6' : '#6B7280' }}>
              {relevantResults.length} relevant
            </span>
            {data.stats.disruptions > 0 && (
              <span style={{ color: '#EF4444', fontWeight: 600 }}>
                {data.stats.disruptions} disruptions
              </span>
            )}
          </div>

          {/* 中英文切换 */}
          <div style={{
            padding: '6px 14px', display: 'flex', gap: 4,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <button onClick={() => setShowZh(false)} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              backgroundColor: !showZh ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: !showZh ? '#8B5CF6' : '#6B7280',
            }}>EN</button>
            <button onClick={() => setShowZh(true)} style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              backgroundColor: showZh ? 'rgba(139,92,246,0.2)' : 'transparent',
              color: showZh ? '#8B5CF6' : '#6B7280',
            }}>中文</button>
          </div>

          {/* AI分析结果列表 */}
          {relevantResults.map((item, i) => {
            const a = item.analysis;
            const eventConfig = EVENT_CONFIG[a.eventType] || EVENT_CONFIG.GENERAL;

            return (
              <div key={i} style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                borderLeft: `3px solid ${eventConfig.color}`,
              }}>
                {/* 事件类型 + 严重程度 + 置信度 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                      backgroundColor: `${eventConfig.color}20`, color: eventConfig.color,
                    }}>
                      {eventConfig.label}
                    </span>
                    {a.serviceDisruption && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                        backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444',
                      }}>
                        DISRUPTION
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: '#4B5563' }}>
                    {a.confidence}% conf
                  </span>
                </div>

                {/* 严重程度进度条 */}
                <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map(level => (
                    <div key={level} style={{
                      flex: 1, height: 3, borderRadius: 1,
                      backgroundColor: level <= a.severity ? SEVERITY_BARS[level - 1] : 'rgba(255,255,255,0.06)',
                    }} />
                  ))}
                </div>

                {/* AI摘要（中英双语） */}
                <div style={{ fontSize: 12, color: '#EDF2F7', lineHeight: 1.5, marginBottom: 6 }}>
                  {showZh ? a.summaryZh : a.summaryEn}
                </div>

                {/* AI识别的海缆名称（可点击飞行） */}
                {a.cableNames.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 6 }}>
                    {a.cableNames.map((name, j) => (
                      <span
                        key={j}
                        onClick={() => {
                          // 将海缆名转为slug格式尝试飞行
                          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                          flyToCable(slug);
                        }}
                        style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          backgroundColor: 'rgba(42, 157, 143, 0.15)',
                          color: '#2A9D8F', cursor: 'pointer',
                          border: '1px solid rgba(42, 157, 143, 0.2)',
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                {/* 受影响国家 + 预计持续时间 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4B5563' }}>
                  <span>
                    {a.affectedCountries.length > 0
                      ? `Affects: ${a.affectedCountries.join(', ')}`
                      : item.source}
                  </span>
                  {a.estimatedDuration && (
                    <span style={{ color: '#F59E0B' }}>
                      ~{a.estimatedDuration}
                    </span>
                  )}
                </div>

                {/* 原文日期 */}
                <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>
                  {new Date(item.pubDate).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })} · {item.source}
                </div>
              </div>
            );
          })}

          {/* 非相关新闻折叠提示 */}
          {data.results.length > relevantResults.length && (
            <div style={{
              padding: '8px 14px', fontSize: 10, color: '#4B5563', textAlign: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              {data.results.length - relevantResults.length} other articles analyzed — not cable-related
            </div>
          )}

          {/* 底部信息 */}
          <div style={{
            padding: '8px 14px', fontSize: 9, color: '#4B5563',
            borderTop: '1px solid rgba(255,255,255,0.04)', lineHeight: 1.5,
          }}>
            Powered by MiniMax AI · {data.cached ? 'Cached result' : 'Fresh analysis'} · {new Date(data.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}

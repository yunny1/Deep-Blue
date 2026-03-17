// src/components/layout/InternetHealthIndicator.tsx
// 全球互联网健康指示器
//
// 显示位置：导航栏中间区域，紧挨搜索框左侧
// 视觉设计：呼吸脉冲圆点 + 状态文字胶囊，点击展开活跃中断列表
// 状态颜色：NORMAL=绿色 / DEGRADED=黄色 / DISRUPTED=红色
//
// 数据源：/api/signals/cloudflare（Cloudflare Radar）
// 刷新频率：每 5 分钟自动重新请求一次

'use client';

import { useEffect, useState, useRef } from 'react';
// 直接在组件里定义类型，避免跨边界引用 API Route
interface CloudflareHealthData {
  status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED';
  activeOutages: number;
  affectedCountries: string[];
  events: {
    id: string;
    description: string;
    affectedCountries: string[];
    startDate: string;
    isOngoing: boolean;
  }[];
  lastChecked: string;
  source: 'cloudflare_radar' | 'fallback';
}

// ── 状态配置表 ─────────────────────────────────────────────────
const STATUS_CONFIG = {
  NORMAL: {
    color: '#06D6A0',
    bg: 'rgba(6, 214, 160, 0.08)',
    border: 'rgba(6, 214, 160, 0.25)',
    glow: 'rgba(6, 214, 160, 0.4)',
    labelEn: 'Normal',
    labelZh: '正常',
    dotAnimation: 'pulse-green',
  },
  DEGRADED: {
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.08)',
    border: 'rgba(245, 158, 11, 0.3)',
    glow: 'rgba(245, 158, 11, 0.4)',
    labelEn: 'Degraded',
    labelZh: '异常',
    dotAnimation: 'pulse-yellow',
  },
  DISRUPTED: {
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.08)',
    border: 'rgba(239, 68, 68, 0.35)',
    glow: 'rgba(239, 68, 68, 0.5)',
    labelEn: 'Disrupted',
    labelZh: '中断',
    dotAnimation: 'pulse-red',
  },
} as const;

// 格式化时间：显示为"N 小时前"或"N 分钟前"
function timeAgo(isoString: string, locale: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (locale === 'zh') {
    if (hours > 0) return `${hours} 小时前`;
    return `${Math.max(1, minutes)} 分钟前`;
  }
  if (hours > 0) return `${hours}h ago`;
  return `${Math.max(1, minutes)}m ago`;
}

interface Props {
  locale?: string;
}

export default function InternetHealthIndicator({ locale = 'en' }: Props) {
  const [data, setData] = useState<CloudflareHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const zh = locale === 'zh';

  // 首次加载 + 每 5 分钟自动刷新
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/signals/cloudflare')
        .then(r => r.json())
        .then((d: CloudflareHealthData) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 点击外部时收起展开面板
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    if (expanded) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [expanded]);

  // 加载中：显示一个灰色占位胶囊，不影响导航栏布局
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        fontSize: 11, color: '#4B5563',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#374151' }} />
        {zh ? '检测中...' : 'Checking...'}
      </div>
    );
  }

  if (!data) return null;

  const config = STATUS_CONFIG[data.status];

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>

      {/* ── 胶囊状态按钮 ────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        title={zh ? '点击查看全球互联网健康状态详情' : 'Click to view global internet health details'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
          border: `1px solid ${expanded ? config.border : 'rgba(255,255,255,0.1)'}`,
          backgroundColor: expanded ? config.bg : 'rgba(255,255,255,0.04)',
          transition: 'all 0.2s',
          outline: 'none',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = config.border;
          e.currentTarget.style.backgroundColor = config.bg;
        }}
        onMouseLeave={e => {
          if (!expanded) {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)';
          }
        }}
      >
        {/* 呼吸脉冲圆点——DISRUPTED 时跳动更快，NORMAL 时缓慢呼吸 */}
        <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
          {/* 外圈扩散光晕 */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14, height: 14, borderRadius: '50%',
            backgroundColor: config.color,
            opacity: 0.25,
            animation: `radarPulse ${data.status === 'DISRUPTED' ? '1.2s' : '2.4s'} ease-out infinite`,
          }} />
          {/* 实心圆点 */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 7, height: 7, borderRadius: '50%',
            backgroundColor: config.color,
            boxShadow: `0 0 6px ${config.glow}`,
          }} />
        </div>

        {/* 文字部分 */}
        <span style={{ fontSize: 11, lineHeight: 1, userSelect: 'none' }}>
          <span style={{ color: '#6B7280', marginRight: 4 }}>
            {zh ? '互联网' : 'Internet'}
          </span>
          <span style={{ color: config.color, fontWeight: 600 }}>
            {zh ? config.labelZh : config.labelEn}
          </span>
        </span>

        {/* 有活跃中断时显示数量角标 */}
        {data.activeOutages > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: config.color,
            backgroundColor: config.bg,
            border: `1px solid ${config.border}`,
            borderRadius: 8, padding: '1px 5px',
            lineHeight: 1.4,
          }}>
            {data.activeOutages}
          </span>
        )}
      </button>

      {/* ── 展开详情面板 ─────────────────────────────────────── */}
      {expanded && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)',
          width: 320,
          backgroundColor: 'rgba(8, 14, 28, 0.98)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${config.border}`,
          borderRadius: 12,
          padding: 16,
          zIndex: 200,
          boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${config.glow}20`,
          animation: 'healthPanelIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>

          {/* 面板标题行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: config.color, boxShadow: `0 0 8px ${config.glow}` }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E2E8F0' }}>
                {zh ? '全球互联网健康' : 'Global Internet Health'}
              </span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: config.color,
              backgroundColor: config.bg,
              border: `1px solid ${config.border}`,
              borderRadius: 4, padding: '2px 7px',
            }}>
              {zh ? config.labelZh : config.labelEn}
            </span>
          </div>

          {/* 无中断时显示绿色确认信息 */}
          {data.activeOutages === 0 && (
            <div style={{
              backgroundColor: 'rgba(6, 214, 160, 0.06)',
              border: '1px solid rgba(6, 214, 160, 0.15)',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: '#94A3B8', lineHeight: 1.6,
            }}>
              {zh
                ? '✓ 未检测到活跃的互联网中断事件，全球海缆网络运行正常。'
                : '✓ No active internet disruptions detected. Global cable network operating normally.'
              }
            </div>
          )}

          {/* 活跃中断事件列表 */}
          {data.events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.events.map((event, i) => (
                <div key={event.id || i} style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  borderRadius: 8, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <p style={{ fontSize: 12, color: '#CBD5E1', lineHeight: 1.5, margin: 0, flex: 1 }}>
                      {event.description}
                    </p>
                    {event.isOngoing && (
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 700,
                        color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 3, padding: '1px 5px', letterSpacing: '0.05em',
                        textTransform: 'uppercase' as const,
                      }}>
                        {zh ? '进行中' : 'LIVE'}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* 受影响国家标签 */}
                    {event.affectedCountries.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                        {event.affectedCountries.slice(0, 4).map(cc => (
                          <span key={cc} style={{
                            fontSize: 10, color: '#64748B',
                            backgroundColor: 'rgba(100,116,139,0.1)',
                            border: '1px solid rgba(100,116,139,0.2)',
                            borderRadius: 3, padding: '1px 5px',
                          }}>{cc}</span>
                        ))}
                        {event.affectedCountries.length > 4 && (
                          <span style={{ fontSize: 10, color: '#475569' }}>
                            +{event.affectedCountries.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <span style={{ fontSize: 10, color: '#475569', flexShrink: 0, marginLeft: 8 }}>
                      {timeAgo(event.startDate, locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 底部署名和数据来源 */}
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 10, color: '#374151' }}>
              {zh ? '数据来源：Cloudflare Radar' : 'Source: Cloudflare Radar'}
            </span>
            <span style={{ fontSize: 10, color: '#374151' }}>
              {zh ? '每5分钟更新' : 'Updates every 5min'}
            </span>
          </div>
        </div>
      )}

      {/* 动画 keyframes */}
      <style>{`
        @keyframes radarPulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.35; }
          70% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes healthPanelIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

// src/components/mobile/MobileUI.tsx
// 移动端 UI — 底部导航栏 + 底部抽屉
// 设计思路：地图全屏，功能通过底部图标按钮呼出，一次只显示一个面板
// 包含：着色模式、筛选、地震、互联网健康、AI情报 五个功能入口

'use client';

import { useState, useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

// ── 类型定义 ────────────────────────────────────────────────────
type ActivePanel = 'color' | 'filter' | 'earthquake' | 'internet' | 'ai' | null;

// ── 地震数据类型 ─────────────────────────────────────────────────
interface Earthquake { id: string; magnitude: number; place: string; time: string; depth: number; severity: string; }
interface EarthquakeData { count: number; earthquakes: Earthquake[]; analysis?: { totalAffectedCables: number; events: any[] }; }
interface CloudflareData { status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED'; activeOutages: number; events: any[]; }
interface AiResult { title: string; source: string; pubDate: string; analysis: { isRelevant: boolean; eventType: string; severity: number; summaryZh: string; summaryEn: string; cableNames: string[]; }; }
interface AiData { results: AiResult[]; stats: { totalNewsScanned: number; relevant: number }; cached: boolean; timestamp: string; }

const STATUS_OPTIONS = [
  { key: 'IN_SERVICE',         label: '在役',  labelEn: 'In Service',       color: '#06D6A0' },
  { key: 'UNDER_CONSTRUCTION', label: '在建',  labelEn: 'Under Construction', color: '#E9C46A' },
  { key: 'PLANNED',            label: '规划中', labelEn: 'Planned',           color: '#3B82F6' },
  { key: 'DECOMMISSIONED',     label: '已退役', labelEn: 'Decommissioned',    color: '#6B7280' },
];

const COLOR_MODES = [
  { key: 'status',   labelZh: '状态',   labelEn: 'Status'   },
  { key: 'vendor',   labelZh: '建造商', labelEn: 'Builder'  },
  { key: 'operator', labelZh: '运营商', labelEn: 'Operator' },
  { key: 'year',     labelZh: '年代',   labelEn: 'Age'      },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444', major: '#F97316', moderate: '#F59E0B', minor: '#6B7280',
};

const OUTAGE_CONFIG = {
  NORMAL:    { color: '#06D6A0', labelZh: '正常',   labelEn: 'Normal'    },
  DEGRADED:  { color: '#F59E0B', labelZh: '异常',   labelEn: 'Degraded'  },
  DISRUPTED: { color: '#EF4444', labelZh: '中断',   labelEn: 'Disrupted' },
};

const EVENT_CONFIG: Record<string, { color: string; label: string }> = {
  FAULT:           { color: '#EF4444', label: 'Fault'        },
  NATURAL_DISASTER:{ color: '#F97316', label: 'Disaster'     },
  SABOTAGE:        { color: '#EC4899', label: 'Sabotage'     },
  CONSTRUCTION:    { color: '#3B82F6', label: 'Construction' },
  REPAIR:          { color: '#10B981', label: 'Repair'       },
  POLICY:          { color: '#8B5CF6', label: 'Policy'       },
  GENERAL:         { color: '#6B7280', label: 'General'      },
};

// ── 工具函数 ─────────────────────────────────────────────────────
function timeAgo(isoString: string, zh: boolean): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (zh) return hours > 0 ? `${hours}小时前` : `${Math.max(1, minutes)}分钟前`;
  return hours > 0 ? `${hours}h ago` : `${Math.max(1, minutes)}m ago`;
}

// ── 各面板内容组件 ────────────────────────────────────────────────

function ColorPanel({ zh }: { zh: boolean }) {
  const { colorMode, setColorMode } = useMapStore();
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {COLOR_MODES.map(mode => (
          <button key={mode.key} onClick={() => setColorMode(mode.key as any)} style={{
            padding: '14px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            backgroundColor: colorMode === mode.key ? 'rgba(42,157,143,0.25)' : 'rgba(255,255,255,0.06)',
            color: colorMode === mode.key ? '#2A9D8F' : '#9CA3AF',
            fontSize: 14, fontWeight: colorMode === mode.key ? 700 : 500,
            outline: colorMode === mode.key ? '2px solid rgba(42,157,143,0.4)' : '2px solid transparent',
            transition: 'all 0.2s',
          }}>
            {zh ? mode.labelZh : mode.labelEn}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({ zh }: { zh: boolean }) {
  const { filterStatuses, setFilterStatuses, filterYearRange, setFilterYearRange } = useMapStore();

  const toggleStatus = (key: string) => {
    const current = filterStatuses[key as keyof typeof filterStatuses] ?? true;
    // 至少保留一个开启状态，不允许全部关闭
    const activeCount = Object.values(filterStatuses).filter(Boolean).length;
    if (current && activeCount === 1) return;
    setFilterStatuses({ ...filterStatuses, [key]: !current });
  };

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 12,
        textTransform: 'uppercase', letterSpacing: 1 }}>
        {zh ? '运行状态' : 'Status'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {STATUS_OPTIONS.map(opt => {
          const active = filterStatuses[opt.key as keyof typeof filterStatuses] ?? true;
          return (
            <div key={opt.key} onClick={() => toggleStatus(opt.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderRadius: 10, cursor: 'pointer',
                backgroundColor: active ? `${opt.color}15` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? opt.color + '40' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.15s', }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: opt.color,
                boxShadow: active ? `0 0 8px ${opt.color}` : 'none', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: active ? '#EDF2F7' : '#6B7280', fontWeight: active ? 600 : 400 }}>
                {zh ? opt.label : opt.labelEn}
              </span>
              {active && <span style={{ marginLeft: 'auto', fontSize: 12, color: opt.color }}>✓</span>}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 12,
        textTransform: 'uppercase', letterSpacing: 1 }}>
        {zh ? '投产年份' : 'RFS Year Range'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="number" value={filterYearRange[0]}
          onChange={e => setFilterYearRange([parseInt(e.target.value) || 1990, filterYearRange[1]])}
          style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.06)', color: '#EDF2F7', fontSize: 16,
            textAlign: 'center', outline: 'none' }} />
        <span style={{ color: '#4B5563', fontSize: 14 }}>—</span>
        <input type="number" value={filterYearRange[1]}
          onChange={e => setFilterYearRange([filterYearRange[0], parseInt(e.target.value) || 2030])}
          style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.06)', color: '#EDF2F7', fontSize: 16,
            textAlign: 'center', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {[
          { label: zh ? '2020以后' : '2020+',    action: () => setFilterYearRange([2020, 2030]) },
          { label: zh ? '2010以前' : 'Pre-2010', action: () => setFilterYearRange([1990, 2009]) },
          { label: zh ? '全部年份' : 'All Years', action: () => { setFilterYearRange([1990, 2030]); setFilterStatuses({ IN_SERVICE: true, UNDER_CONSTRUCTION: true, PLANNED: true, DECOMMISSIONED: false }); } },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'rgba(255,255,255,0.04)', color: '#9CA3AF', fontSize: 12, cursor: 'pointer',
          }}>
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EarthquakePanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const { flyToCable } = useMapStore();

  useEffect(() => {
    fetch('/api/earthquakes?analyze=true')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(42,157,143,0.3)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      {zh ? '加载中...' : 'Loading...'}
    </div>
  );

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {data?.analysis && data.analysis.totalAffectedCables > 0 && (
        <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 12, fontSize: 13, color: '#F87171' }}>
          {zh ? `${data.analysis.totalAffectedCables} 条海缆附近有地震活动` : `${data.analysis.totalAffectedCables} cable(s) near seismic activity`}
        </div>
      )}
      {(data?.earthquakes || []).slice(0, 8).map(eq => (
        <div key={eq.id} style={{ padding: '12px 14px', marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: SEVERITY_COLORS[eq.severity] }}>M{eq.magnitude.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: '#4B5563' }}>{eq.depth.toFixed(0)} km {zh ? '深' : 'deep'}</span>
          </div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 4 }}>{eq.place}</div>
          <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>
            {new Date(eq.time).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 8 }}>
        {zh ? '来源：USGS · 每5分钟更新' : 'Source: USGS · Updates every 5min'}
      </div>
    </div>
  );
}

function InternetPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<CloudflareData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/signals/cloudflare')
      .then(r => r.json())
      .then((d: CloudflareData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(42,157,143,0.3)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      {zh ? '加载中...' : 'Loading...'}
    </div>
  );

  const config = data ? OUTAGE_CONFIG[data.status] : OUTAGE_CONFIG.NORMAL;

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', backgroundColor: `${config.color}12`, border: `1px solid ${config.color}30`, borderRadius: 12, marginBottom: 16 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: config.color, boxShadow: `0 0 8px ${config.color}`, animation: 'pulse 2s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: config.color }}>{zh ? config.labelZh : config.labelEn}</span>
        {data?.activeOutages ? <span style={{ marginLeft: 'auto', fontSize: 13, color: '#94A3B8' }}>{data.activeOutages} {zh ? '个中断事件' : 'outages'}</span> : null}
      </div>

      {!data?.activeOutages ? (
        <div style={{ padding: '16px', fontSize: 14, color: '#6B7280', lineHeight: 1.6, textAlign: 'center' }}>
          {zh ? '✓ 当前无互联网中断事件，全球网络运行正常' : '✓ No active disruptions. Global network operating normally.'}
        </div>
      ) : (
        (data?.events || []).map((event: any, i: number) => (
          <div key={event.id || i} style={{ padding: '12px 14px', marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.5, margin: 0, flex: 1 }}>{event.description}</p>
              {event.isOngoing && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3, padding: '2px 6px', textTransform: 'uppercase' as const }}>{zh ? '进行中' : 'LIVE'}</span>}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 4 }}>
              {(event.affectedCountries || []).slice(0, 5).map((cc: string) => (
                <span key={cc} style={{ fontSize: 11, color: '#94A3B8', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, padding: '2px 6px' }}>{cc}</span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#4B5563' }}>{timeAgo(event.startDate, zh)}</div>
          </div>
        ))
      )}
      <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 8 }}>
        {zh ? '来源：Cloudflare Radar · 每5分钟更新' : 'Source: Cloudflare Radar · Updates every 5min'}
      </div>
    </div>
  );
}

function AiPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showAiInsights, flyToCable } = useMapStore();

  useEffect(() => {
    if (!showAiInsights) return;
    fetch('/api/ai/analyze')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showAiInsights]);

  if (!showAiInsights) return (
    <div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
      {zh ? 'AI 洞察已关闭，请在设置中开启' : 'AI Insights is off. Enable it to see analysis.'}
    </div>
  );

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      {zh ? 'AI 正在分析最新新闻...' : 'AI analyzing latest news...'}
    </div>
  );

  const relevant = (data?.results || []).filter(r => r.analysis?.isRelevant);

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {data && (
        <div style={{ display: 'flex', gap: 16, padding: '10px 14px', backgroundColor: 'rgba(139,92,246,0.06)', borderRadius: 10, marginBottom: 14, fontSize: 12, color: '#94A3B8' }}>
          <span>{data.stats.totalNewsScanned} {zh ? '条扫描' : 'scanned'}</span>
          <span style={{ color: '#8B5CF6' }}>{relevant.length} {zh ? '条相关' : 'relevant'}</span>
          <span style={{ marginLeft: 'auto', color: '#4B5563' }}>{data.cached ? (zh ? '缓存' : 'cached') : (zh ? '新鲜' : 'fresh')}</span>
        </div>
      )}
      {relevant.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
          {zh ? '当前无海缆相关事件' : 'No cable-related events detected.'}
        </div>
      ) : (
        relevant.map((item, i) => {
          const a = item.analysis;
          const ec = EVENT_CONFIG[a.eventType] || EVENT_CONFIG.GENERAL;
          const summary = zh ? a.summaryZh : a.summaryEn;
          return (
            <div key={i} style={{ padding: '14px', marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${ec.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, backgroundColor: `${ec.color}15`, color: ec.color }}>{ec.label}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(l => (
                    <div key={l} style={{ width: 16, height: 3, borderRadius: 1, backgroundColor: l <= a.severity ? ['#475569','#3B82F6','#F59E0B','#F97316','#EF4444'][l-1] : 'rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6, margin: '0 0 8px' }}>{summary}</p>
              {a.cableNames.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                  {a.cableNames.map((name, j) => (
                    <span key={j} onClick={() => flyToCable(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.1)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.2)', cursor: 'pointer' }}>
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function MobileUI() {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const { colorMode, showAiInsights, toggleAiInsights, viewMode, setViewMode } = useMapStore();
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // 底部导航栏按钮配置
  const NAV_ITEMS: { id: ActivePanel; icon: string; labelZh: string; labelEn: string; badge?: string }[] = [
    { id: 'color',      icon: '🎨', labelZh: '着色', labelEn: 'Color'    },
    { id: 'filter',     icon: '🔧', labelZh: '筛选', labelEn: 'Filter'   },
    { id: 'earthquake', icon: '🌊', labelZh: '地震', labelEn: 'Seismic'  },
    { id: 'internet',   icon: '📡', labelZh: '网络', labelEn: 'Network'  },
    { id: 'ai',         icon: '🤖', labelZh: 'AI',   labelEn: 'AI'       },
  ];

  const PANEL_TITLES: Record<string, { zh: string; en: string }> = {
    color:      { zh: '着色模式', en: 'Color Mode'       },
    filter:     { zh: '筛选',     en: 'Filters'          },
    earthquake: { zh: '地震活动', en: 'Seismic Activity' },
    internet:   { zh: '互联网中断监测', en: 'Internet Outage Monitor' },
    ai:         { zh: 'AI 情报分析', en: 'AI Intelligence' },
  };

  const togglePanel = (id: ActivePanel) => {
    setActivePanel(prev => prev === id ? null : id);
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* 右上角浮动：视图切换按钮 */}
      <div style={{
        position: 'fixed', top: 60, right: 12, zIndex: 45,
        display: 'flex', gap: 6,
      }}>
        {[
          { key: '3d', label: '3D' },
          { key: '2d', label: '2D' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setViewMode(opt.key as '3d' | '2d')} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
            backgroundColor: viewMode === opt.key ? 'rgba(42,157,143,0.9)' : 'rgba(13,27,42,0.85)',
            color: viewMode === opt.key ? 'white' : '#9CA3AF',
            fontSize: 12, fontWeight: 600,
            backdropFilter: 'blur(12px)',
            border: `1px solid ${viewMode === opt.key ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 底部遮罩（点击关闭抽屉） */}
      {activePanel && (
        <div onClick={() => setActivePanel(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60,
        }} />
      )}

      {/* 底部抽屉 */}
      {activePanel && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 64,
          backgroundColor: 'rgba(10,17,34,0.98)', backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(42,157,143,0.2)',
          borderRadius: '20px 20px 0 0',
          zIndex: 70,
          maxHeight: '65vh', overflowY: 'auto',
          animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}>
          {/* 拖拽把手 */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* 面板标题 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 16px' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#EDF2F7' }}>
              {activePanel ? (zh ? PANEL_TITLES[activePanel].zh : PANEL_TITLES[activePanel].en) : ''}
            </span>
            <button onClick={() => setActivePanel(null)} style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', color: '#6B7280',
              width: 30, height: 30, borderRadius: 15, cursor: 'pointer', fontSize: 14,
            }}>✕</button>
          </div>

          {/* 面板内容 */}
          {activePanel === 'color'      && <ColorPanel zh={zh} />}
          {activePanel === 'filter'     && <FilterPanel zh={zh} />}
          {activePanel === 'earthquake' && <EarthquakePanel zh={zh} />}
          {activePanel === 'internet'   && <InternetPanel zh={zh} />}
          {activePanel === 'ai'         && <AiPanel zh={zh} />}
        </div>
      )}

      {/* 底部导航栏 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 64,
        backgroundColor: 'rgba(10,17,34,0.97)', backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(42,157,143,0.15)',
        display: 'flex', alignItems: 'center',
        zIndex: 80,
        paddingBottom: 'env(safe-area-inset-bottom)', // iPhone 底部安全区域
      }}>
        {NAV_ITEMS.map(item => {
          const isActive = activePanel === item.id;
          return (
            <button key={item.id} onClick={() => togglePanel(item.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, height: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1, filter: isActive ? 'none' : 'grayscale(0.3) opacity(0.7)' }}>
                {item.icon}
              </span>
              <span style={{ fontSize: 10, color: isActive ? '#2A9D8F' : '#6B7280', fontWeight: isActive ? 700 : 400, lineHeight: 1 }}>
                {zh ? item.labelZh : item.labelEn}
              </span>
              {isActive && (
                <div style={{ position: 'absolute', bottom: 0, width: 24, height: 2, backgroundColor: '#2A9D8F', borderRadius: 1 }} />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

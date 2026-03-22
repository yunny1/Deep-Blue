'use client';
// src/components/mobile/MobileUI.tsx
// v4：完全重写 — 图层联动筛选 + 地震地图联动 + 精美UI

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

// ── 类型 ─────────────────────────────────────────────────────────
type ActivePanel = 'layer' | 'earthquake' | 'internet' | 'ai' | null;

interface EarthquakeData {
  count: number;
  earthquakes: Array<{
    id: string; magnitude: number; place: string; time: string;
    depth: number; severity: string; latitude?: number; longitude?: number;
  }>;
  analysis?: {
    totalAffectedCables: number;
    events: Array<{
      earthquakeId: string; magnitude: number; place: string; time: string;
      affectedCount: number;
      cables: Array<{ cableId: string; cableName: string; cableSlug: string; distanceKm: number; riskLevel: string }>;
    }>;
  };
}

interface CloudflareData {
  status: 'NORMAL' | 'DEGRADED' | 'DISRUPTED';
  activeOutages: number;
  events: Array<{ id?: string; description: string; isOngoing?: boolean; startDate: string; affectedCountries?: string[] }>;
}

interface AiData {
  results?: Array<{
    title: string; source: string; pubDate: string;
    analysis: { isRelevant: boolean; eventType: string; severity: number; summaryZh: string; summaryEn: string; cableNames: string[] };
  }>;
  stats?: { totalNewsScanned: number; relevant: number };
  cached?: boolean;
}

// ── 颜色常量 ─────────────────────────────────────────────────────
const VENDOR_COLORS: Record<string, string> = {
  'ASN': '#3B82F6', 'SubCom': '#EF4444', 'NEC': '#F59E0B',
  'HMN Tech': '#10B981', 'Prysmian': '#8B5CF6', 'Ericsson': '#EC4899',
  'Xtera': '#06B6D4', 'Nexans': '#F97316', '__other__': '#6B7280',
};
const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6', DECOMMISSIONED: '#D97706',
};
const RISK_COLORS: Record<string, string> = {
  HIGH: '#EF4444', MEDIUM: '#F97316', LOW: '#E9C46A',
};
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444', major: '#F97316', moderate: '#F59E0B', minor: '#6B7280',
};

// ── 工具函数 ─────────────────────────────────────────────────────
function timeAgo(iso: string, zh: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (zh) return d > 0 ? `${d}天前` : h > 0 ? `${h}小时前` : `${Math.max(1, m)}分钟前`;
  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : `${Math.max(1, m)}m ago`;
}

// 数字动画 hook
function useAnimatedNumber(target: number): number {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    if (prev.current === target) return;
    prev.current = target;
    const from = val;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / 600, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return val;
}

function AnimatedNum({ n, color }: { n: number; color: string }) {
  const v = useAnimatedNumber(n);
  return <span style={{ fontWeight: 700, color }}>{v.toLocaleString()}</span>;
}

// ── 图层面板（颜色模式 + 联动筛选）────────────────────────────
function LayerPanel({ zh }: { zh: boolean }) {
  const {
    colorMode, setColorMode,
    filterStatuses, setFilterStatuses,
    filterYearRange, setFilterYearRange,
    filterVendors, setFilterVendors,
    filterOperators, setFilterOperators,
  } = useMapStore();

  const [options, setOptions] = useState<any>(null);
  const [crossOpen, setCrossOpen] = useState(false);
  const timerRef = useRef<any>(null);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    const active = Object.entries(filterStatuses).filter(([, v]) => v).map(([k]) => k);
    if (active.length < 4) p.set('statuses', active.join(','));
    if (filterVendors.length)   p.set('vendors', filterVendors.join(','));
    if (filterOperators.length) p.set('operators', filterOperators.join(','));
    p.set('yearMin', filterYearRange[0].toString());
    p.set('yearMax', filterYearRange[1].toString());
    return p.toString();
  }, [filterStatuses, filterVendors, filterOperators, filterYearRange]);

  useEffect(() => {
    fetch(`/api/cables/filter-options?${buildQuery()}`)
      .then(r => r.json()).then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetch(`/api/cables/filter-options?${buildQuery()}`)
        .then(r => r.json()).then(setOptions).catch(() => {});
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [filterStatuses, filterVendors, filterOperators, filterYearRange]);

  const STATUS_LABELS: Record<string, string> = {
    IN_SERVICE: zh ? '在役' : 'In Service',
    UNDER_CONSTRUCTION: zh ? '在建' : 'Building',
    PLANNED: zh ? '规划中' : 'Planned',
    DECOMMISSIONED: zh ? '已退役' : 'Retired',
  };
  const COLOR_MODES = [
    { key: 'status',   label: zh ? '状态'   : 'Status'   },
    { key: 'vendor',   label: zh ? '建造商' : 'Builder'  },
    { key: 'operator', label: zh ? '运营商' : 'Operator' },
    { key: 'year',     label: zh ? '年代'   : 'Age'      },
  ];

  const primaryItems: { key: string; label: string; color: string; count: number }[] = [];
  if (colorMode === 'status' && options?.statuses) {
    options.statuses.forEach((s: any) => primaryItems.push({ key: s.key, label: STATUS_LABELS[s.key] || s.key, color: STATUS_COLORS[s.key] || '#6B7280', count: s.count }));
  } else if (colorMode === 'vendor' && options?.vendors) {
    options.vendors.forEach((v: any) => primaryItems.push({ key: v.name, label: v.name === '__other__' ? (zh ? '其他' : 'Others') : v.name, color: VENDOR_COLORS[v.name] || '#6B7280', count: v.count }));
  } else if (colorMode === 'operator' && options?.operators) {
    options.operators.forEach((o: any) => primaryItems.push({ key: o.name, label: o.name === '__other__' ? (zh ? '其他' : 'Others') : o.name, color: '#06B6D4', count: o.count }));
  }

  const isActive = (key: string) => {
    if (colorMode === 'status')   return filterStatuses[key as keyof typeof filterStatuses] ?? true;
    if (colorMode === 'vendor')   return filterVendors.length === 0 || filterVendors.includes(key);
    if (colorMode === 'operator') return filterOperators.length === 0 || filterOperators.includes(key);
    return true;
  };

  const toggle = (key: string) => {
    if (colorMode === 'status') {
      const cur = filterStatuses[key as keyof typeof filterStatuses] ?? true;
      const cnt = Object.values(filterStatuses).filter(Boolean).length;
      if (cur && cnt === 1) return;
      setFilterStatuses({ ...filterStatuses, [key]: !cur });
    } else if (colorMode === 'vendor') {
      if (filterVendors.length === 0) setFilterVendors(primaryItems.map(i => i.key).filter(k => k !== key));
      else if (filterVendors.includes(key)) { const n = filterVendors.filter(v => v !== key); setFilterVendors(n.length ? n : []); }
      else setFilterVendors([...filterVendors, key]);
    } else if (colorMode === 'operator') {
      if (filterOperators.length === 0) setFilterOperators(primaryItems.map(i => i.key).filter(k => k !== key));
      else if (filterOperators.includes(key)) { const n = filterOperators.filter(o => o !== key); setFilterOperators(n.length ? n : []); }
      else setFilterOperators([...filterOperators, key]);
    }
  };

  const maxCount = options?.total || 1;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {/* 总量 */}
      {options?.total && (
        <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 13, color: '#6B7280' }}>
          {zh ? '显示' : 'Showing'} <AnimatedNum n={options.total} color="#2A9D8F" /> {zh ? '条海缆' : 'cables'}
        </div>
      )}

      {/* 着色模式 */}
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 10 }}>
        {zh ? '着色模式' : 'Color Mode'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {COLOR_MODES.map(opt => (
          <button key={opt.key} onClick={() => setColorMode(opt.key as any)} style={{
            padding: '12px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            borderRadius: 10, border: 'none', transition: 'all 0.2s',
            backgroundColor: colorMode === opt.key ? 'rgba(42,157,143,0.2)' : 'rgba(255,255,255,0.04)',
            color: colorMode === opt.key ? '#2A9D8F' : '#6B7280',
            outline: colorMode === opt.key ? '1.5px solid rgba(42,157,143,0.5)' : '1.5px solid transparent',
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* 年代模式：年份范围 */}
      {colorMode === 'year' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const, marginBottom: 10 }}>
            {zh ? '投产年份' : 'RFS Year'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input type="number" value={filterYearRange[0]} onChange={e => setFilterYearRange([parseInt(e.target.value)||1990, filterYearRange[1]])}
              style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', color: '#EDF2F7', fontSize: 15, textAlign: 'center', outline: 'none' }} />
            <span style={{ color: '#4B5563' }}>—</span>
            <input type="number" value={filterYearRange[1]} onChange={e => setFilterYearRange([filterYearRange[0], parseInt(e.target.value)||2030])}
              style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', color: '#EDF2F7', fontSize: 15, textAlign: 'center', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{l:'2020+',a:()=>setFilterYearRange([2020,2030])},{l:zh?'2010前':'Pre-2010',a:()=>setFilterYearRange([1990,2009])},{l:zh?'全部':'All',a:()=>setFilterYearRange([1990,2030])}]
              .map((b,i) => <button key={i} onClick={b.a} style={{ flex:1,padding:'10px 0',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',backgroundColor:'rgba(255,255,255,0.04)',color:'#9CA3AF',fontSize:12,cursor:'pointer' }}>{b.l}</button>)}
          </div>
        </div>
      )}

      {/* 主维度筛选列表 */}
      {colorMode !== 'year' && primaryItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
              {colorMode === 'status' ? (zh ? '运行状态' : 'Status') : colorMode === 'vendor' ? (zh ? '建造商' : 'Builder') : (zh ? '运营商' : 'Operator')}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {primaryItems.map(item => {
              const active = isActive(item.key);
              const pct = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              return (
                <div key={item.key} onClick={() => toggle(item.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 12, cursor: 'pointer',
                  backgroundColor: active ? `${item.color}12` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${active ? item.color + '35' : 'rgba(255,255,255,0.05)'}`,
                  opacity: active ? 1 : 0.4, transition: 'all 0.15s',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, boxShadow: active ? `0 0 8px ${item.color}` : 'none', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: active ? '#EDF2F7' : '#4B5563', flex: 1, fontWeight: active ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.label}</span>
                  {/* 进度条 */}
                  <div style={{ width: 48, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: item.color, borderRadius: 2, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                  <AnimatedNum n={item.count} color={active ? item.color : '#4B5563'} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 叠加筛选 */}
      <div onClick={() => setCrossOpen(!crossOpen)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
          ＋ {zh ? '叠加筛选' : 'More Filters'}
        </span>
        <span style={{ fontSize: 14, color: '#6B7280', transform: crossOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {crossOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          {/* 状态（非状态模式时显示）*/}
          {colorMode !== 'status' && (
            <div>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, marginBottom: 8 }}>{zh ? '状态' : 'Status'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {Object.entries({ IN_SERVICE: zh?'在役':'In Service', UNDER_CONSTRUCTION: zh?'在建':'Building', PLANNED: zh?'规划':'Planned', DECOMMISSIONED: zh?'退役':'Retired' }).map(([key, label]) => {
                  const active = filterStatuses[key as keyof typeof filterStatuses] ?? true;
                  const color = STATUS_COLORS[key];
                  const count = options?.statuses?.find((s: any) => s.key === key)?.count ?? 0;
                  return (
                    <div key={key} onClick={() => {
                      const cnt = Object.values(filterStatuses).filter(Boolean).length;
                      if (active && cnt === 1) return;
                      setFilterStatuses({ ...filterStatuses, [key]: !active });
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      backgroundColor: active ? `${color}15` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? color+'40' : 'rgba(255,255,255,0.06)'}`,
                      color: active ? '#EDF2F7' : '#4B5563', opacity: active ? 1 : 0.5,
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                      {label} <span style={{ color: active ? color : '#4B5563', fontWeight: 700 }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* 年份（非年代模式时显示）*/}
          {colorMode !== 'year' && (
            <div>
              <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 700, marginBottom: 8 }}>{zh ? '投产年份' : 'RFS Year'}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" value={filterYearRange[0]} onChange={e => setFilterYearRange([parseInt(e.target.value)||1990,filterYearRange[1]])}
                  style={{ flex:1,height:40,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',backgroundColor:'rgba(255,255,255,0.04)',color:'#D1D5DB',fontSize:13,textAlign:'center',outline:'none' }} />
                <span style={{ color: '#4B5563' }}>—</span>
                <input type="number" value={filterYearRange[1]} onChange={e => setFilterYearRange([filterYearRange[0],parseInt(e.target.value)||2030])}
                  style={{ flex:1,height:40,borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',backgroundColor:'rgba(255,255,255,0.04)',color:'#D1D5DB',fontSize:13,textAlign:'center',outline:'none' }} />
              </div>
            </div>
          )}
          {/* 重置 */}
          <button onClick={() => { setFilterYearRange([1990,2030]); setFilterStatuses({IN_SERVICE:true,UNDER_CONSTRUCTION:true,PLANNED:true,DECOMMISSIONED:false}); setFilterVendors([]); setFilterOperators([]); }}
            style={{ width:'100%',padding:'12px 0',borderRadius:10,border:'1px solid rgba(239,68,68,0.3)',backgroundColor:'rgba(239,68,68,0.06)',color:'#EF4444',fontSize:13,cursor:'pointer',fontWeight:600 }}>
            {zh ? '重置所有筛选' : 'Reset All Filters'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 地震面板 ─────────────────────────────────────────────────────
function EarthquakePanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<EarthquakeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { flyToCable, setEarthquakeHighlight } = useMapStore();

  useEffect(() => {
    fetch('/api/earthquakes?analyze=true').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleQuakeClick = (event: any) => {
    if (selectedId === event.earthquakeId) {
      setSelectedId(null);
      setEarthquakeHighlight(null);
      return;
    }
    setSelectedId(event.earthquakeId);
    const raw = data?.earthquakes?.find(e => e.id === event.earthquakeId);
    if (!raw?.latitude || !raw?.longitude) return;
    setEarthquakeHighlight({
      lat: raw.latitude, lng: raw.longitude,
      magnitude: event.magnitude, place: event.place,
      affectedCables: event.cables.map((c: any) => ({
        cableSlug: c.cableSlug, cableName: c.cableName,
        distanceKm: c.distanceKm, riskLevel: c.riskLevel,
      })),
    });
  };

  if (loading) return (
    <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      {zh ? '加载中...' : 'Loading...'}
    </div>
  );

  const affected = data?.analysis?.totalAffectedCables || 0;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {affected > 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 16, fontSize: 13, color: '#F87171', textAlign: 'center' }}>
          {zh ? `⚠️ ${affected} 条海缆受地震影响` : `⚠️ ${affected} cable(s) near seismic activity`}
        </div>
      )}

      {/* 有影响的事件 */}
      {(data?.analysis?.events || []).slice(0, 5).map(event => (
        <div key={event.earthquakeId} style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: `1px solid ${selectedId === event.earthquakeId ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'}`, transition: 'border-color 0.2s' }}>
          <div onClick={() => handleQuakeClick(event)} style={{
            padding: '14px 16px', cursor: 'pointer',
            backgroundColor: selectedId === event.earthquakeId ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: SEVERITY_COLORS[event.magnitude >= 7 ? 'critical' : event.magnitude >= 6 ? 'major' : 'moderate'] }}>
                M{event.magnitude.toFixed(1)}
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{timeAgo(event.time, zh)}</span>
                <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>{event.affectedCount} {zh ? '条缆' : 'cables'}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{event.place}</div>
            {selectedId === event.earthquakeId && (
              <div style={{ fontSize: 11, color: '#2A9D8F', marginTop: 6 }}>
                🌐 {zh ? '已在地图显示影响范围，点击海缆名称定位' : 'Impact shown on map — tap cable to locate'}
              </div>
            )}
          </div>
          {/* 受影响海缆 */}
          {selectedId === event.earthquakeId && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '8px 16px 12px' }}>
              {event.cables.map(cable => (
                <div key={cable.cableId} onClick={() => flyToCable(cable.cableSlug)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 8, marginTop: 6,
                  backgroundColor: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 500 }}>{cable.cableName}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{cable.distanceKm} km {zh ? '外' : 'away'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, backgroundColor: `${RISK_COLORS[cable.riskLevel]}15`, color: RISK_COLORS[cable.riskLevel] }}>
                    {cable.riskLevel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 其他地震 */}
      {(data?.earthquakes || []).slice(0, 8).map(eq => (
        <div key={eq.id} style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: SEVERITY_COLORS[eq.severity] }}>M{eq.magnitude.toFixed(1)}</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 10, color: '#4B5563' }}>{eq.depth.toFixed(0)}km {zh?'深':'deep'}</span>
              <span style={{ fontSize: 10, color: '#4B5563' }}>{timeAgo(eq.time, zh)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{eq.place}</div>
        </div>
      ))}

      <div style={{ textAlign: 'center', fontSize: 10, color: '#374151', marginTop: 12 }}>
        {zh ? '来源：USGS · 每5分钟更新' : 'Source: USGS · Updates every 5min'}
      </div>
    </div>
  );
}

// ── 互联网面板 ────────────────────────────────────────────────────
function InternetPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<CloudflareData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/signals/cloudflare').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const STATUS_CONFIG = { NORMAL: { color: '#06D6A0', label: zh?'正常':'Normal' }, DEGRADED: { color: '#F59E0B', label: zh?'异常':'Degraded' }, DISRUPTED: { color: '#EF4444', label: zh?'中断':'Disrupted' } };
  const cfg = data ? STATUS_CONFIG[data.status] : STATUS_CONFIG.NORMAL;

  if (loading) return <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6B7280' }}>{zh?'加载中...':'Loading...'}</div>;

  return (
    <div style={{ padding: '0 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderRadius: 14, backgroundColor: `${cfg.color}10`, border: `1px solid ${cfg.color}30`, marginBottom: 16 }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: cfg.color, boxShadow: `0 0 10px ${cfg.color}`, animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        {data?.activeOutages ? <span style={{ marginLeft: 'auto', fontSize: 13, color: '#94A3B8' }}>{data.activeOutages} {zh?'个中断':'outages'}</span> : null}
      </div>
      {!data?.activeOutages ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280', fontSize: 14, lineHeight: 1.7 }}>
          {zh ? '✓ 当前无互联网中断事件' : '✓ No active internet disruptions'}
        </div>
      ) : (data?.events || []).map((event, i) => (
        <div key={event.id || i} style={{ padding: '14px', borderRadius: 12, marginBottom: 8, backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.5, margin: 0, flex: 1 }}>{event.description}</p>
            {event.isOngoing && <span style={{ fontSize: 9, fontWeight: 700, color: '#EF4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3, padding: '2px 6px', marginLeft: 8, flexShrink: 0 }}>{zh?'进行中':'LIVE'}</span>}
          </div>
          <div style={{ fontSize: 11, color: '#4B5563' }}>{timeAgo(event.startDate, zh)}</div>
        </div>
      ))}
      <div style={{ textAlign: 'center', fontSize: 10, color: '#374151', marginTop: 12 }}>
        {zh ? '来源：Cloudflare Radar · 每5分钟更新' : 'Source: Cloudflare Radar · Updates every 5min'}
      </div>
    </div>
  );
}

// ── AI 面板 ───────────────────────────────────────────────────────
function AiPanel({ zh }: { zh: boolean }) {
  const [data, setData] = useState<AiData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showAiInsights, flyToCable } = useMapStore();

  useEffect(() => {
    if (!showAiInsights) return;
    fetch('/api/ai/analyze').then(r => r.json()).then(d => { if (!d.error) setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [showAiInsights]);

  const EVENT_COLORS: Record<string, string> = { FAULT: '#EF4444', NATURAL_DISASTER: '#F97316', CONSTRUCTION: '#3B82F6', REPAIR: '#10B981', GENERAL: '#6B7280' };

  if (!showAiInsights) return <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>{zh?'AI洞察已关闭':'AI Insights is off'}</div>;
  if (loading) return <div style={{ padding: '40px 16px', textAlign: 'center', color: '#6B7280' }}>
    <div style={{ width: 32, height: 32, border: '2.5px solid rgba(139,92,246,0.2)', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
    {zh?'AI分析中...':'Analyzing...'}
  </div>;

  const relevant = (data?.results || []).filter(r => r.analysis?.isRelevant);

  return (
    <div style={{ padding: '0 16px 24px' }}>
      {data?.stats && (
        <div style={{ display: 'flex', gap: 20, padding: '10px 14px', borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.06)', marginBottom: 16, justifyContent: 'center', fontSize: 12, color: '#94A3B8' }}>
          <span>{data.stats.totalNewsScanned} {zh?'条扫描':'scanned'}</span>
          <span style={{ color: '#8B5CF6', fontWeight: 700 }}>{relevant.length} {zh?'条相关':'relevant'}</span>
          <span style={{ color: '#4B5563' }}>{data.cached ? (zh?'缓存':'cached') : (zh?'新鲜':'fresh')}</span>
        </div>
      )}
      {relevant.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>{zh?'当前无海缆相关事件':'No cable events detected'}</div>
      ) : relevant.map((item, i) => {
        const a = item.analysis;
        const color = EVENT_COLORS[a.eventType] || '#6B7280';
        return (
          <div key={i} style={{ padding: '14px', borderRadius: 12, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, backgroundColor: `${color}15`, color }}>{a.eventType}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {[1,2,3,4,5].map(l => <div key={l} style={{ width: 18, height: 3, borderRadius: 1, backgroundColor: l <= a.severity ? ['#475569','#3B82F6','#F59E0B','#F97316','#EF4444'][l-1] : 'rgba(255,255,255,0.08)' }} />)}
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6, margin: '0 0 8px' }}>{zh ? a.summaryZh : a.summaryEn}</p>
            {a.cableNames.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                {a.cableNames.map((name, j) => (
                  <span key={j} onClick={() => flyToCable(name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(42,157,143,0.1)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.2)', cursor: 'pointer' }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function MobileUI() {
  const [active, setActive] = useState<ActivePanel>(null);
  const { viewMode, setViewMode, showAiInsights, toggleAiInsights } = useMapStore();
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const TABS: { id: ActivePanel; icon: string; labelZh: string; labelEn: string }[] = [
    { id: 'layer',      icon: '🗺',  labelZh: '图层', labelEn: 'Layers'  },
    { id: 'earthquake', icon: '🌊',  labelZh: '地震', labelEn: 'Seismic' },
    { id: 'internet',   icon: '📡',  labelZh: '网络', labelEn: 'Network' },
    { id: 'ai',         icon: '🤖',  labelZh: 'AI',   labelEn: 'AI'      },
  ];

  const TITLES: Record<string, string> = {
    layer:      zh ? '图层与筛选'         : 'Layers & Filters',
    earthquake: zh ? '地震活动'           : 'Seismic Activity',
    internet:   zh ? '互联网中断监测'     : 'Internet Monitor',
    ai:         zh ? 'AI 情报分析'        : 'AI Intelligence',
  };

  const toggle = (id: ActivePanel) => setActive(p => p === id ? null : id);

  return (
    <>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes slideUp { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }
      `}</style>

      {/* 3D/2D 切换 */}
      <div style={{ position: 'fixed', top: 60, right: 12, zIndex: 45, display: 'flex', gap: 6 }}>
        {[{k:'3d',l:'3D'},{k:'2d',l:'2D'}].map(opt => (
          <button key={opt.k} onClick={() => setViewMode(opt.k as any)} style={{
            padding: '7px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            backdropFilter: 'blur(12px)',
            backgroundColor: viewMode === opt.k ? 'rgba(42,157,143,0.9)' : 'rgba(8,16,32,0.85)',
            color: viewMode === opt.k ? 'white' : '#9CA3AF',
            border: `1px solid ${viewMode === opt.k ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
            boxShadow: viewMode === opt.k ? '0 0 16px rgba(42,157,143,0.4)' : 'none',
          }}>{opt.l}</button>
        ))}
      </div>

      {/* 背景遮罩 */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60, backdropFilter: 'blur(2px)' }} />
      )}

      {/* 底部抽屉 */}
      {active && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 72,
          backgroundColor: 'rgba(8,16,32,0.97)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(42,157,143,0.2)',
          borderRadius: '20px 20px 0 0',
          zIndex: 70,
          maxHeight: '68vh', overflowY: 'auto',
          animation: 'slideUp 0.28s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
        }}>
          {/* 把手 */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 8px' }}>
            <div style={{ width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>
          {/* 标题 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 16px 16px' }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#EDF2F7' }}>{active ? TITLES[active] : ''}</span>
            <button onClick={() => setActive(null)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
          {/* 内容 */}
          {active === 'layer'      && <LayerPanel zh={zh} />}
          {active === 'earthquake' && <EarthquakePanel zh={zh} />}
          {active === 'internet'   && <InternetPanel zh={zh} />}
          {active === 'ai'         && <AiPanel zh={zh} />}
        </div>
      )}

      {/* 底部导航栏 */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 72,
        backgroundColor: 'rgba(8,16,32,0.97)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(42,157,143,0.12)',
        display: 'flex', alignItems: 'center',
        zIndex: 80,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
      }}>
        {TABS.map(tab => {
          const isActive = active === tab.id;
          return (
            <button key={tab.id} onClick={() => toggle(tab.id)} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 5, height: '100%',
              background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
            }}>
              {/* 激活指示条 */}
              {isActive && (
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 28, height: 3, borderRadius: '0 0 3px 3px', backgroundColor: '#2A9D8F', boxShadow: '0 0 8px #2A9D8F' }} />
              )}
              <span style={{ fontSize: 22, lineHeight: 1, filter: isActive ? 'none' : 'grayscale(0.5) opacity(0.6)', transition: 'filter 0.2s' }}>
                {tab.icon}
              </span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? '#2A9D8F' : '#4B5563', lineHeight: 1, transition: 'color 0.2s' }}>
                {zh ? tab.labelZh : tab.labelEn}
              </span>
              {/* 激活发光 */}
              {isActive && (
                <div style={{ position: 'absolute', bottom: 8, width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2A9D8F', boxShadow: '0 0 8px #2A9D8F', animation: 'pulse 2s infinite' }} />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

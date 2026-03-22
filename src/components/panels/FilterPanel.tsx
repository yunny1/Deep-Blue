'use client';
// src/components/panels/FilterPanel.tsx
// v3：着色模式联动筛选 + 跨维度叠加 + 动画计数

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

// ── 数字滚动动画 hook ─────────────────────────────────────────────
function useAnimatedNumber(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const prevTarget = useRef(target);

  useEffect(() => {
    if (prevTarget.current === target) return;
    prevTarget.current = target;
    let startTime: number | null = null;
    const from = value;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);

  return value;
}

// 带动画的数字组件
function AnimatedCount({ count, color }: { count: number; color: string }) {
  const animated = useAnimatedNumber(count);
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>
      {animated.toLocaleString()}
    </span>
  );
}

// ── 颜色常量（与 ColorControlPanel 保持同步）────────────────────
const VENDOR_COLORS: Record<string, string> = {
  'ASN': '#3B82F6', 'SubCom': '#EF4444', 'NEC': '#F59E0B',
  'HMN Tech': '#10B981', 'Prysmian': '#8B5CF6', 'Ericsson': '#EC4899',
  'Xtera': '#06B6D4', 'Nexans': '#F97316', '__other__': '#6B7280',
};
const OPERATOR_COLORS: Record<string, string> = {
  'Google': '#34A853', 'Orange': '#FF7900', 'BT': '#6400AA',
  'Sparkle': '#E91E63', 'Vodafone': '#E60000', 'Meta': '#1877F2',
  'Telekom Malaysia': '#0054A6', 'Tata Communications': '#00BCD4',
  'Singtel': '#00BCD4', '__other__': '#6B7280',
};
const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6', DECOMMISSIONED: '#D97706',
};
const STATUS_LABELS: Record<string, string> = {
  IN_SERVICE: '在役', UNDER_CONSTRUCTION: '在建',
  PLANNED: '规划中', DECOMMISSIONED: '已退役',
};

// ── 进度条组件 ───────────────────────────────────────────────────
function CountBar({ count, maxCount, color }: { count: number; maxCount: number; color: string }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 2, transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function FilterPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [crossExpanded, setCrossExpanded] = useState(false);
  const [options, setOptions] = useState<any>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const {
    colorMode, setColorMode,
    filterStatuses, setFilterStatuses,
    filterYearRange, setFilterYearRange,
    filterVendors, setFilterVendors,
    filterOperators, setFilterOperators,
  } = useMapStore();
  const { t } = useTranslation();

  // 构建查询参数（当前已激活的跨维度过滤条件）
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    const activeStatuses = Object.entries(filterStatuses).filter(([, v]) => v).map(([k]) => k);
    if (activeStatuses.length < 4) params.set('statuses', activeStatuses.join(','));
    if (filterVendors.length > 0) params.set('vendors', filterVendors.join(','));
    if (filterOperators.length > 0) params.set('operators', filterOperators.join(','));
    params.set('yearMin', filterYearRange[0].toString());
    params.set('yearMax', filterYearRange[1].toString());
    return params.toString();
  }, [filterStatuses, filterVendors, filterOperators, filterYearRange]);

  // 拉取各维度计数
  useEffect(() => {
    if (!isExpanded) return;
    setLoadingOptions(true);
    const query = buildQueryParams();
    fetch(`/api/cables/filter-options?${query}`)
      .then(r => r.json())
      .then(d => { setOptions(d); setLoadingOptions(false); })
      .catch(() => setLoadingOptions(false));
  }, [isExpanded, buildQueryParams]);

  // 重新拉取（过滤条件变化后防抖 400ms）
  const timerRef = useRef<any>(null);
  useEffect(() => {
    if (!isExpanded || !options) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const query = buildQueryParams();
      fetch(`/api/cables/filter-options?${query}`)
        .then(r => r.json())
        .then(d => setOptions(d))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [filterStatuses, filterVendors, filterOperators, filterYearRange]);

  // ── 主维度选项（跟随 colorMode）──────────────────────────────
  const primaryItems: { key: string; label: string; color: string; count: number }[] = [];
  const maxCount = options?.total || 1;

  if (colorMode === 'status' && options?.statuses) {
    options.statuses.forEach((s: any) => {
      primaryItems.push({ key: s.key, label: STATUS_LABELS[s.key] || s.key, color: STATUS_COLORS[s.key] || '#6B7280', count: s.count });
    });
  } else if (colorMode === 'vendor' && options?.vendors) {
    options.vendors.forEach((v: any) => {
      primaryItems.push({ key: v.name, label: v.name === '__other__' ? '其他' : v.name, color: VENDOR_COLORS[v.name] || '#6B7280', count: v.count });
    });
  } else if (colorMode === 'operator' && options?.operators) {
    options.operators.forEach((o: any) => {
      primaryItems.push({ key: o.name, label: o.name === '__other__' ? '其他' : o.name, color: OPERATOR_COLORS[o.name] || '#6B7280', count: o.count });
    });
  } else if (colorMode === 'year') {
    // 年代模式主维度就是年份范围，不需要列表
  }

  // 判断某个主维度 key 是否激活
  const isPrimaryActive = (key: string): boolean => {
    if (colorMode === 'status') return filterStatuses[key as keyof typeof filterStatuses] ?? true;
    if (colorMode === 'vendor') return filterVendors.length === 0 || filterVendors.includes(key);
    if (colorMode === 'operator') return filterOperators.length === 0 || filterOperators.includes(key);
    return true;
  };

  // 切换主维度 key
  const togglePrimary = (key: string) => {
    if (colorMode === 'status') {
      const current = filterStatuses[key as keyof typeof filterStatuses] ?? true;
      const activeCount = Object.values(filterStatuses).filter(Boolean).length;
      if (current && activeCount === 1) return;
      setFilterStatuses({ ...filterStatuses, [key]: !current });
    } else if (colorMode === 'vendor') {
      if (filterVendors.length === 0) {
        // 全选状态 → 点击某个 = 只选它
        setFilterVendors(primaryItems.map(i => i.key).filter(k => k !== key));
      } else if (filterVendors.includes(key)) {
        const next = filterVendors.filter(v => v !== key);
        setFilterVendors(next.length === 0 ? [] : next);
      } else {
        setFilterVendors([...filterVendors, key]);
      }
    } else if (colorMode === 'operator') {
      if (filterOperators.length === 0) {
        setFilterOperators(primaryItems.map(i => i.key).filter(k => k !== key));
      } else if (filterOperators.includes(key)) {
        const next = filterOperators.filter(o => o !== key);
        setFilterOperators(next.length === 0 ? [] : next);
      } else {
        setFilterOperators([...filterOperators, key]);
      }
    }
  };

  // 活跃过滤条件数量（用于标题徽章）
  const activeFilterCount = [
    Object.values(filterStatuses).filter(v => !v).length > 0 ? 1 : 0,
    filterVendors.length > 0 ? 1 : 0,
    filterOperators.length > 0 ? 1 : 0,
    (filterYearRange[0] !== 1990 || filterYearRange[1] !== 2030) ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const COLOR_MODE_OPTIONS = [
    { key: 'status',   label: '状态' },
    { key: 'vendor',   label: '建造商' },
    { key: 'operator', label: '运营商' },
    { key: 'year',     label: '年代' },
  ];

  return (
    <div style={{ backgroundColor: 'rgba(13,27,42,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(42,157,143,0.2)', borderRadius: 12, width: 240, overflow: 'hidden', transition: 'all 0.3s ease' }}>

      {/* 标题栏 */}
      <div onClick={() => setIsExpanded(!isExpanded)} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔧</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            {t('filter.title')}
          </span>
          {activeFilterCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#E9C46A', backgroundColor: 'rgba(233,196,106,0.15)', border: '1px solid rgba(233,196,106,0.3)', borderRadius: 8, padding: '1px 6px' }}>
              {activeFilterCount} 项筛选
            </span>
          )}
        </div>
        <span style={{ fontSize: 14, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {isExpanded && (
        <div style={{ padding: '12px 14px' }}>

          {/* 着色模式选择器 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            着色模式
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 16 }}>
            {COLOR_MODE_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setColorMode(opt.key as any)} style={{
                padding: '7px 0', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                borderRadius: 6, border: 'none', transition: 'all 0.2s',
                backgroundColor: colorMode === opt.key ? 'rgba(42,157,143,0.25)' : 'rgba(255,255,255,0.04)',
                color: colorMode === opt.key ? '#2A9D8F' : '#9CA3AF',
                outline: colorMode === opt.key ? '1px solid rgba(42,157,143,0.4)' : '1px solid transparent',
              }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* 主维度筛选 */}
          {colorMode !== 'year' && (
            <>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                {colorMode === 'status' ? '运行状态' : colorMode === 'vendor' ? '建造商' : '运营商'}
                {options?.total != null && (
                  <span style={{ marginLeft: 6, color: '#4B5563', fontWeight: 400 }}>共 {options.total} 条</span>
                )}
              </div>

              {loadingOptions && !options ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: '#4B5563', fontSize: 11 }}>加载中...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                  {primaryItems.map(item => {
                    const active = isPrimaryActive(item.key);
                    return (
                      <div key={item.key} onClick={() => togglePrimary(item.key)} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                        borderRadius: 8, cursor: 'pointer',
                        backgroundColor: active ? `${item.color}12` : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${active ? item.color + '30' : 'rgba(255,255,255,0.05)'}`,
                        transition: 'all 0.15s', opacity: active ? 1 : 0.4,
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: item.color, boxShadow: active ? `0 0 5px ${item.color}` : 'none', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: active ? '#D1D5DB' : '#4B5563', flex: 1, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                        <CountBar count={item.count} maxCount={maxCount} color={item.color} />
                        <AnimatedCount count={item.count} color={active ? item.color : '#4B5563'} />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />

          {/* 叠加筛选 */}
          <div onClick={() => setCrossExpanded(!crossExpanded)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: crossExpanded ? 12 : 0 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
              ＋ 叠加筛选
            </span>
            <span style={{ fontSize: 12, color: '#6B7280', transform: crossExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
          </div>

          {crossExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* 跨维度：状态（当主维度不是状态时显示）*/}
              {colorMode !== 'status' && (
                <div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, fontWeight: 600 }}>状态</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => {
                      const active = filterStatuses[key as keyof typeof filterStatuses] ?? true;
                      const color = STATUS_COLORS[key];
                      const count = options?.statuses?.find((s: any) => s.key === key)?.count ?? 0;
                      return (
                        <div key={key} onClick={() => {
                          const activeCount = Object.values(filterStatuses).filter(Boolean).length;
                          if (active && activeCount === 1) return;
                          setFilterStatuses({ ...filterStatuses, [key]: !active });
                        }} style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px',
                          borderRadius: 6, cursor: 'pointer', fontSize: 10,
                          backgroundColor: active ? `${color}15` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                          color: active ? '#D1D5DB' : '#4B5563', opacity: active ? 1 : 0.5,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                          {label}
                          <span style={{ color: active ? color : '#4B5563', fontWeight: 700 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 跨维度：建造商（当主维度不是建造商时显示）*/}
              {colorMode !== 'vendor' && options?.vendors?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, fontWeight: 600 }}>
                    建造商
                    {filterVendors.length > 0 && (
                      <span onClick={() => setFilterVendors([])} style={{ marginLeft: 8, color: '#E9C46A', cursor: 'pointer', fontWeight: 400 }}>清除</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                    {options.vendors.slice(0, 8).map((v: any) => {
                      const active = filterVendors.length === 0 || filterVendors.includes(v.name);
                      const color = VENDOR_COLORS[v.name] || '#6B7280';
                      return (
                        <div key={v.name} onClick={() => {
                          if (filterVendors.length === 0) {
                            setFilterVendors(options.vendors.map((i: any) => i.name).filter((n: string) => n !== v.name));
                          } else if (filterVendors.includes(v.name)) {
                            const next = filterVendors.filter(n => n !== v.name);
                            setFilterVendors(next.length === 0 ? [] : next);
                          } else {
                            setFilterVendors([...filterVendors, v.name]);
                          }
                        }} style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                          borderRadius: 6, cursor: 'pointer', fontSize: 10,
                          backgroundColor: active ? `${color}15` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                          color: active ? '#D1D5DB' : '#4B5563', opacity: active ? 1 : 0.5,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                          {v.name === '__other__' ? '其他' : v.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 跨维度：年份范围（始终显示）*/}
              <div>
                <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, fontWeight: 600 }}>投产年份</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                  <input type="number" value={filterYearRange[0]}
                    onChange={e => setFilterYearRange([parseInt(e.target.value) || 1990, filterYearRange[1]])}
                    style={{ width: 58, height: 26, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB', fontSize: 11, textAlign: 'center', outline: 'none' }}
                  />
                  <span style={{ color: '#4B5563', fontSize: 11 }}>—</span>
                  <input type="number" value={filterYearRange[1]}
                    onChange={e => setFilterYearRange([filterYearRange[0], parseInt(e.target.value) || 2030])}
                    style={{ width: 58, height: 26, borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB', fontSize: 11, textAlign: 'center', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[
                    { label: '2020+', action: () => setFilterYearRange([2020, 2030]) },
                    { label: '<2010', action: () => setFilterYearRange([1990, 2009]) },
                    { label: '全部', action: () => { setFilterYearRange([1990, 2030]); setFilterStatuses({ IN_SERVICE: true, UNDER_CONSTRUCTION: true, PLANNED: true, DECOMMISSIONED: false }); setFilterVendors([]); setFilterOperators([]); } },
                  ].map((btn, i) => (
                    <button key={i} onClick={btn.action} style={{
                      flex: 1, padding: '5px 0', borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: 'rgba(255,255,255,0.03)', color: '#9CA3AF', fontSize: 10, cursor: 'pointer',
                    }}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

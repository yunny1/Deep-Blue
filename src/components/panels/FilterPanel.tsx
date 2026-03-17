// src/components/panels/FilterPanel.tsx
// 筛选面板 — 修复版
// 关键改动：
//   1. 状态从 useState 迁移到 mapStore，地图组件可以读取到筛选条件
//   2. 去掉组件内部的 position/top/left，由 page.tsx 统一管理位置
//   3. 宽度从 200px 调整为 220px

'use client';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { useState } from 'react';

const STATUS_OPTIONS = [
  { key: 'IN_SERVICE',          labelKey: 'color.inService',        color: '#06D6A0' },
  { key: 'UNDER_CONSTRUCTION',  labelKey: 'color.underConstruction', color: '#E9C46A' },
  { key: 'PLANNED',             labelKey: 'color.planned',           color: '#3B82F6' },
  { key: 'DECOMMISSIONED',      labelKey: 'color.decommissioned',    color: '#6B7280' },
];

export default function FilterPanel() {
  const [isExpanded, setIsExpanded] = useState(false);

  // 从 mapStore 读写筛选状态，地图组件会实时响应
  const { filterStatuses, setFilterStatuses, filterYearRange, setFilterYearRange } = useMapStore();
  const { t } = useTranslation();

  const toggleStatus = (status: string) => {
    if (filterStatuses.includes(status)) {
      // 至少保留一个选项，防止地图上什么都不显示
      if (filterStatuses.length === 1) return;
      setFilterStatuses(filterStatuses.filter(s => s !== status));
    } else {
      setFilterStatuses([...filterStatuses, status]);
    }
  };

  return (
    // 不再有 position/top/left，由 page.tsx 的底部右侧容器统一控制
    <div style={{
      backgroundColor: 'rgba(13,27,42,0.9)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42,157,143,0.2)', borderRadius: 12,
      width: 220, overflow: 'hidden', transition: 'all 0.3s ease',
    }}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={{
        padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', cursor: 'pointer',
        borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔧</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            {t('filter.title')}
          </span>
          {/* 显示当前有多少状态被过滤掉，给用户一个"筛选已生效"的提示 */}
          {filterStatuses.length < STATUS_OPTIONS.length && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#E9C46A', backgroundColor: 'rgba(233,196,106,0.15)', border: '1px solid rgba(233,196,106,0.3)', borderRadius: 8, padding: '1px 5px' }}>
              {filterStatuses.length}/{STATUS_OPTIONS.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: 14, color: '#6B7280', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {isExpanded && (
        <div style={{ padding: '12px 14px' }}>

          {/* 状态筛选 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            {t('filter.status')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {STATUS_OPTIONS.map(opt => {
              const active = filterStatuses.includes(opt.key);
              return (
                <label key={opt.key} onClick={() => toggleStatus(opt.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: active ? '#D1D5DB' : '#4B5563', transition: 'color 0.15s', userSelect: 'none' }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${active ? opt.color : '#4B5563'}`,
                    backgroundColor: active ? `${opt.color}30` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {active && <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: opt.color }} />}
                  </div>
                  <span>{t(opt.labelKey)}</span>
                </label>
              );
            })}
          </div>

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

          {/* 年份范围筛选 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            {t('filter.yearRange')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input type="number" value={filterYearRange[0]}
              onChange={e => setFilterYearRange([parseInt(e.target.value) || 1990, filterYearRange[1]])}
              style={{ width: 62, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB', fontSize: 12, textAlign: 'center', outline: 'none' }} />
            <span style={{ color: '#4B5563', fontSize: 12 }}>{t('filter.to')}</span>
            <input type="number" value={filterYearRange[1]}
              onChange={e => setFilterYearRange([filterYearRange[0], parseInt(e.target.value) || 2030])}
              style={{ width: 62, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB', fontSize: 12, textAlign: 'center', outline: 'none' }} />
          </div>

          {/* 快捷筛选按钮 */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
            {[
              { label: t('filter.new2020'),  action: () => setFilterYearRange([2020, 2030]) },
              { label: t('filter.aging'),    action: () => setFilterYearRange([1990, 2009]) },
              { label: t('filter.allYears'), action: () => { setFilterYearRange([1990, 2030]); setFilterStatuses(STATUS_OPTIONS.map(o => o.key)); } },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                padding: '4px 8px', fontSize: 10, borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)',
                color: '#9CA3AF', cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.15)'; e.currentTarget.style.color = '#2A9D8F'; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#9CA3AF'; }}>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

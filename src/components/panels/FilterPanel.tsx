// src/components/panels/FilterPanel.tsx
// 过滤面板 — 在颜色控制面板下方，让用户按条件筛选海缆
// 支持按状态、RFS年份范围筛选

'use client';

import { useState } from 'react';
import { useMapStore } from '@/stores/mapStore';

// 状态选项
const STATUS_OPTIONS = [
  { key: 'IN_SERVICE',         label: 'In Service',         color: '#06D6A0', count: 0 },
  { key: 'UNDER_CONSTRUCTION', label: 'Under Construction', color: '#E9C46A', count: 0 },
  { key: 'PLANNED',            label: 'Planned',            color: '#3B82F6', count: 0 },
  { key: 'DECOMMISSIONED',     label: 'Decommissioned',     color: '#6B7280', count: 0 },
];

export default function FilterPanel() {
  // 展开/折叠状态
  const [isExpanded, setIsExpanded] = useState(false);

  // 状态过滤（哪些状态被勾选）
  const [activeStatuses, setActiveStatuses] = useState<Set<string>>(
    new Set(['IN_SERVICE', 'UNDER_CONSTRUCTION', 'PLANNED'])
  );

  // 年份范围
  const [yearRange, setYearRange] = useState<[number, number]>([1990, 2030]);

  // 切换某个状态的勾选
  const toggleStatus = (status: string) => {
    setActiveStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  return (
    <div style={{
      position: 'absolute', top: 380, left: 16,
      backgroundColor: 'rgba(13, 27, 42, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.2)',
      borderRadius: 12, width: 200,
      zIndex: 40, overflow: 'hidden',
      transition: 'all 0.3s ease',
    }}>
      {/* 折叠标题栏 */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F',
          textTransform: 'uppercase' as const, letterSpacing: 1 }}>
          Filters
        </span>
        <span style={{
          fontSize: 14, color: '#6B7280',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>
          ▾
        </span>
      </div>

      {/* 可折叠的内容区 */}
      {isExpanded && (
        <div style={{ padding: '12px 16px' }}>
          {/* 状态过滤 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8,
            textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            Status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {STATUS_OPTIONS.map(opt => (
              <label
                key={opt.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontSize: 12,
                  color: activeStatuses.has(opt.key) ? '#D1D5DB' : '#4B5563',
                  transition: 'color 0.15s',
                }}
              >
                {/* 自定义复选框 */}
                <div
                  onClick={(e) => { e.preventDefault(); toggleStatus(opt.key); }}
                  style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `1.5px solid ${activeStatuses.has(opt.key) ? opt.color : '#4B5563'}`,
                    backgroundColor: activeStatuses.has(opt.key) ? `${opt.color}30` : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s', flexShrink: 0,
                  }}
                >
                  {activeStatuses.has(opt.key) && (
                    <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: opt.color }} />
                  )}
                </div>
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          {/* 分隔线 */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

          {/* RFS年份范围 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8,
            textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            RFS Year Range
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              value={yearRange[0]}
              onChange={e => setYearRange([parseInt(e.target.value) || 1990, yearRange[1]])}
              style={{
                width: 65, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB',
                fontSize: 12, textAlign: 'center', outline: 'none',
              }}
            />
            <span style={{ color: '#4B5563', fontSize: 12 }}>to</span>
            <input
              type="number"
              value={yearRange[1]}
              onChange={e => setYearRange([yearRange[0], parseInt(e.target.value) || 2030])}
              style={{
                width: 65, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                backgroundColor: 'rgba(255,255,255,0.04)', color: '#D1D5DB',
                fontSize: 12, textAlign: 'center', outline: 'none',
              }}
            />
          </div>

          {/* 分隔线 */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

          {/* 快捷筛选按钮 */}
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8,
            textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            Quick Filters
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {[
              { label: 'New (2020+)', action: () => setYearRange([2020, 2030]) },
              { label: 'Aging (<2010)', action: () => setYearRange([1990, 2009]) },
              { label: 'All Years', action: () => setYearRange([1990, 2030]) },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                style={{
                  padding: '4px 10px', fontSize: 10, borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.1)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: '#9CA3AF', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.15)'; e.currentTarget.style.color = '#2A9D8F'; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#9CA3AF'; }}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

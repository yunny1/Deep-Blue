// src/components/panels/ColorControlPanel.tsx
// 左侧颜色控制面板 — 切换海缆着色模式 + 图例展示
// 支持四种模式：按状态、按建造商、按运营商、按年代

'use client';

import { useMapStore } from '@/stores/mapStore';

// 四种颜色模式
type ColorMode = 'status' | 'vendor' | 'operator' | 'year';

const MODE_OPTIONS: { key: ColorMode; label: string; icon: string }[] = [
  { key: 'status',   label: 'Status',   icon: '●' },
  { key: 'vendor',   label: 'Builder',  icon: '🔧' },
  { key: 'operator', label: 'Operator', icon: '🏢' },
  { key: 'year',     label: 'Age',      icon: '📅' },
];

// 状态图例
const STATUS_LEGEND = [
  { label: 'In Service',         color: '#06D6A0' },
  { label: 'Under Construction', color: '#E9C46A' },
  { label: 'Planned',            color: '#3B82F6' },
  { label: 'Decommissioned',     color: '#6B7280' },
];

// 建造商图例（Top 8 + 其他）— 基于真实数据排名
const VENDOR_LEGEND = [
  { label: 'ASN (Nokia)',   color: '#3B82F6' },  // 蓝 - 163条
  { label: 'SubCom',        color: '#EF4444' },  // 红 - 85条
  { label: 'NEC',           color: '#F59E0B' },  // 琥珀 - 56条
  { label: 'HMN Tech',      color: '#10B981' },  // 绿 - 44条
  { label: 'Prysmian',      color: '#8B5CF6' },  // 紫 - 20条
  { label: 'Ericsson',      color: '#EC4899' },  // 粉 - 12条
  { label: 'Xtera',         color: '#06B6D4' },  // 青 - 11条
  { label: 'Nexans',        color: '#F97316' },  // 橙 - 10条
  { label: 'Others',         color: '#6B7280' },  // 灰
];

// 运营商图例（Top 8 + 其他）— 基于真实数据排名
const OPERATOR_LEGEND = [
  { label: 'Google',            color: '#34A853' },  // Google绿
  { label: 'Orange',            color: '#FF7900' },  // Orange橙
  { label: 'BT',                color: '#6400AA' },  // BT紫
  { label: 'Sparkle',           color: '#E91E63' },  // 粉红
  { label: 'Vodafone',          color: '#E60000' },  // Vodafone红
  { label: 'Meta',              color: '#1877F2' },  // Meta蓝
  { label: 'Telekom Malaysia',  color: '#0054A6' },  // 深蓝
  { label: 'Tata / Singtel',    color: '#00BCD4' },  // 青
  { label: 'Others',            color: '#6B7280' },  // 灰
];

// 年代图例
const YEAR_LEGEND = [
  { label: 'Before 2000',  color: '#6B7280' },  // 灰 - 老旧
  { label: '2000-2009',     color: '#F59E0B' },  // 琥珀 - 渐老
  { label: '2010-2019',     color: '#3B82F6' },  // 蓝 - 当代
  { label: '2020-2025',     color: '#10B981' },  // 绿 - 新建
  { label: '2026+',         color: '#8B5CF6' },  // 紫 - 规划中
];

// 根据当前模式选择图例
function getLegend(mode: ColorMode) {
  switch (mode) {
    case 'status':   return STATUS_LEGEND;
    case 'vendor':   return VENDOR_LEGEND;
    case 'operator': return OPERATOR_LEGEND;
    case 'year':     return YEAR_LEGEND;
  }
}

export default function ColorControlPanel() {
  const { colorMode, setColorMode } = useMapStore();
  const legend = getLegend(colorMode);

  return (
    <div style={{
      position: 'absolute', top: 72, left: 16,
      backgroundColor: 'rgba(13, 27, 42, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.2)',
      borderRadius: 12, padding: 16, width: 200,
      zIndex: 40,
    }}>
      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F', marginBottom: 10,
        textTransform: 'uppercase' as const, letterSpacing: 1 }}>
        Color by
      </div>

      {/* 模式切换按钮组 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        {MODE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setColorMode(opt.key)}
            style={{
              padding: '7px 0', fontSize: 11, fontWeight: 500, cursor: 'pointer',
              borderRadius: 6, border: 'none', transition: 'all 0.2s',
              backgroundColor: colorMode === opt.key
                ? 'rgba(42, 157, 143, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              color: colorMode === opt.key ? '#2A9D8F' : '#9CA3AF',
              outline: colorMode === opt.key
                ? '1px solid rgba(42, 157, 143, 0.4)' : '1px solid transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 分隔线 */}
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

      {/* 图例 */}
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 8,
        textTransform: 'uppercase' as const, letterSpacing: 1 }}>
        Legend
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {legend.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: item.color,
              boxShadow: `0 0 4px ${item.color}40`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: '#D1D5DB' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ 导出颜色映射供CesiumGlobe使用 ═══
// 建造商名称 → 颜色（归一化RGB）
export const VENDOR_COLOR_MAP: Record<string, [number, number, number, number]> = {
  'ASN':        [0.23, 0.51, 0.96, 0.8],
  'SubCom':     [0.94, 0.27, 0.27, 0.8],
  'NEC':        [0.96, 0.62, 0.04, 0.8],
  'HMN Tech':   [0.06, 0.73, 0.51, 0.8],
  'Prysmian':   [0.55, 0.36, 0.96, 0.8],
  'Ericsson':   [0.93, 0.29, 0.60, 0.8],
  'Xtera':      [0.02, 0.71, 0.83, 0.8],
  'Nexans':     [0.98, 0.45, 0.09, 0.8],
};
export const VENDOR_DEFAULT: [number, number, number, number] = [0.42, 0.42, 0.42, 0.4];

// 运营商名称 → 颜色
export const OPERATOR_COLOR_MAP: Record<string, [number, number, number, number]> = {
  'Google':           [0.20, 0.66, 0.33, 0.8],
  'Orange':           [1.00, 0.47, 0.00, 0.8],
  'BT':               [0.39, 0.00, 0.67, 0.8],
  'Sparkle':          [0.91, 0.12, 0.39, 0.8],
  'Vodafone':         [0.90, 0.00, 0.00, 0.8],
  'Meta':             [0.09, 0.47, 0.95, 0.8],
  'Telekom Malaysia': [0.00, 0.33, 0.65, 0.8],
  'Tata Communications': [0.00, 0.74, 0.83, 0.8],
  'Singtel':          [0.00, 0.74, 0.83, 0.8],
};
export const OPERATOR_DEFAULT: [number, number, number, number] = [0.42, 0.42, 0.42, 0.3];

// 年代 → 颜色
export function getYearColor(rfsYear: number | null): [number, number, number, number] {
  if (!rfsYear)       return [0.42, 0.42, 0.42, 0.3]; // 未知
  if (rfsYear < 2000) return [0.42, 0.42, 0.42, 0.5]; // 灰
  if (rfsYear < 2010) return [0.96, 0.62, 0.04, 0.7]; // 琥珀
  if (rfsYear < 2020) return [0.23, 0.51, 0.96, 0.7]; // 蓝
  if (rfsYear < 2026) return [0.06, 0.73, 0.51, 0.7]; // 绿
  return [0.55, 0.36, 0.96, 0.7]; // 紫
}

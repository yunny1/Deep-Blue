// src/components/layout/ViewModeToggle.tsx
// 视图切换按钮（3D地球 / 2D地图）
// 注意：这个组件不再自己定位，position/top/right 已移除
// 由 page.tsx 的右侧控制栏统一负责布局位置

'use client';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

export default function ViewModeToggle() {
  const { viewMode, setViewMode } = useMapStore();
  const { t } = useTranslation();

  return (
    <div style={{
      // ← 不再有 position/top/right，由父容器决定位置
      backgroundColor: 'rgba(13, 27, 42, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.2)',
      borderRadius: 8,
      padding: 4,
      display: 'flex',
      gap: 2,
      flexShrink: 0, // 不在 flex 容器里被压缩
    }}>
      {[
        { key: '3d' as const, label: t('viewMode.globe3d') },
        { key: '2d' as const, label: t('viewMode.map2d') },
      ].map(opt => (
        <button
          key={opt.key}
          onClick={() => setViewMode(opt.key)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundColor: viewMode === opt.key ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
            color: viewMode === opt.key ? '#2A9D8F' : '#6B7280',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

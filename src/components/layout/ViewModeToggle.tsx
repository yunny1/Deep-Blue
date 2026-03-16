// src/components/layout/ViewModeToggle.tsx
// 3D/2D 视图切换按钮 — 显示在地图右上角
// 让用户在CesiumJS 3D地球和MapLibre 2D平面之间切换

'use client';

import { useMapStore } from '@/stores/mapStore';

export default function ViewModeToggle() {
  const { viewMode, setViewMode } = useMapStore();

  return (
    <div style={{
      position: 'absolute', top: 72, right: 16,
      backgroundColor: 'rgba(13, 27, 42, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.2)',
      borderRadius: 8, padding: 4,
      display: 'flex', gap: 2,
      zIndex: 40,
    }}>
      <button
        onClick={() => setViewMode('3d')}
        style={{
          padding: '6px 14px', fontSize: 12, fontWeight: 600,
          borderRadius: 6, border: 'none', cursor: 'pointer',
          transition: 'all 0.2s',
          backgroundColor: viewMode === '3d' ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
          color: viewMode === '3d' ? '#2A9D8F' : '#6B7280',
        }}
      >
        3D Globe
      </button>
      <button
        onClick={() => setViewMode('2d')}
        style={{
          padding: '6px 14px', fontSize: 12, fontWeight: 600,
          borderRadius: 6, border: 'none', cursor: 'pointer',
          transition: 'all 0.2s',
          backgroundColor: viewMode === '2d' ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
          color: viewMode === '2d' ? '#2A9D8F' : '#6B7280',
        }}
      >
        2D Map
      </button>
    </div>
  );
}

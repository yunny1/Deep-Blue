// src/components/layout/ViewModeToggle.tsx
'use client';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

export default function ViewModeToggle() {
  const { viewMode, setViewMode } = useMapStore();
  const { t } = useTranslation();

  return (
    <div style={{
      position: 'absolute', top: 72, right: 16,
      backgroundColor: 'rgba(13, 27, 42, 0.9)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.2)',
      borderRadius: 8, padding: 4, display: 'flex', gap: 2, zIndex: 40,
    }}>
      {[
        { key: '3d' as const, label: t('viewMode.globe3d') },
        { key: '2d' as const, label: t('viewMode.map2d') },
      ].map(opt => (
        <button key={opt.key} onClick={() => setViewMode(opt.key)}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            borderRadius: 6, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            backgroundColor: viewMode === opt.key ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
            color: viewMode === opt.key ? '#2A9D8F' : '#6B7280',
          }}>{opt.label}</button>
      ))}
    </div>
  );
}

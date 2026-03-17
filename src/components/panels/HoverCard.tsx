// src/components/panels/HoverCard.tsx
'use client';
import { useTranslation } from '@/lib/i18n';

interface HoverCardProps {
  cable: { name: string; status: string; lengthKm: number | null; fiberPairs: number | null } | null;
  position: { x: number; y: number };
}

const STATUS_MAP: Record<string, { color: string; labelKey: string }> = {
  IN_SERVICE:         { color: '#06D6A0', labelKey: 'color.inService' },
  UNDER_CONSTRUCTION: { color: '#E9C46A', labelKey: 'color.underConstruction' },
  PLANNED:            { color: '#3B82F6', labelKey: 'color.planned' },
  DECOMMISSIONED:     { color: '#6B7280', labelKey: 'color.decommissioned' },
};

export default function HoverCard({ cable, position }: HoverCardProps) {
  const { t } = useTranslation();
  if (!cable) return null;
  const statusInfo = STATUS_MAP[cable.status] || STATUS_MAP.IN_SERVICE;

  return (
    <div style={{
      position: 'fixed', left: position.x + 16, top: position.y - 10,
      backgroundColor: 'rgba(27, 58, 92, 0.95)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(42, 157, 143, 0.3)', borderRadius: 10,
      padding: '12px 16px', minWidth: 220, maxWidth: 320, zIndex: 1000,
      pointerEvents: 'none', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7', marginBottom: 8 }}>{cable.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusInfo.color, boxShadow: `0 0 6px ${statusInfo.color}` }} />
        <span style={{ fontSize: 12, color: statusInfo.color, fontWeight: 500 }}>{t(statusInfo.labelKey)}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9CA3AF' }}>
        {cable.lengthKm && <span>{cable.lengthKm.toLocaleString()} km</span>}
        {cable.fiberPairs && <span>{cable.fiberPairs} {t('detail.fiberPairs').toLowerCase()}</span>}
      </div>
    </div>
  );
}

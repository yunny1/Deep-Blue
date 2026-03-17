// src/components/layout/AiToggle.tsx
'use client';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { getTooltip } from '@/lib/tooltips';
import Tooltip from '@/components/ui/Tooltip';

export default function AiToggle() {
  const { showAiInsights, toggleAiInsights } = useMapStore();
  const { t, locale } = useTranslation();

  return (
    <Tooltip content={getTooltip('aiInsights', locale)} position="bottom" maxWidth={300}>
      <button onClick={toggleAiInsights}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6,
          border: `1px solid ${showAiInsights ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.1)'}`,
          backgroundColor: showAiInsights ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.04)',
          color: showAiInsights ? '#3B82F6' : '#6B7280',
          cursor: 'pointer', transition: 'all 0.2s', fontSize: 11, fontWeight: 500,
        }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: showAiInsights ? '#3B82F6' : '#4B5563', boxShadow: showAiInsights ? '0 0 6px #3B82F6' : 'none', transition: 'all 0.2s' }} />
        {t('ai.toggle')} {showAiInsights ? t('ai.on') : t('ai.off')}
      </button>
    </Tooltip>
  );
}

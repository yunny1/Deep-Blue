// src/components/panels/ColorControlPanel.tsx
'use client';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { getTooltip } from '@/lib/tooltips';
import Tooltip from '@/components/ui/Tooltip';

type ColorMode = 'status' | 'vendor' | 'operator' | 'year';

const STATUS_LEGEND = [
  { labelKey: 'color.inService', color: '#06D6A0' }, { labelKey: 'color.underConstruction', color: '#E9C46A' },
  { labelKey: 'color.planned', color: '#3B82F6' }, { labelKey: 'color.decommissioned', color: '#6B7280' },
];
const VENDOR_LEGEND = [
  { label: 'ASN (Nokia)', color: '#3B82F6' }, { label: 'SubCom', color: '#EF4444' }, { label: 'NEC', color: '#F59E0B' },
  { label: 'HMN Tech', color: '#10B981' }, { label: 'Prysmian', color: '#8B5CF6' }, { label: 'Ericsson', color: '#EC4899' },
  { label: 'Xtera', color: '#06B6D4' }, { label: 'Nexans', color: '#F97316' }, { labelKey: 'color.others', color: '#6B7280' },
];
const OPERATOR_LEGEND = [
  { label: 'Google', color: '#34A853' }, { label: 'Orange', color: '#FF7900' }, { label: 'BT', color: '#6400AA' },
  { label: 'Sparkle', color: '#E91E63' }, { label: 'Vodafone', color: '#E60000' }, { label: 'Meta', color: '#1877F2' },
  { label: 'Telekom Malaysia', color: '#0054A6' }, { label: 'Tata / Singtel', color: '#00BCD4' }, { labelKey: 'color.others', color: '#6B7280' },
];
const YEAR_LEGEND = [
  { labelKey: 'color.before2000', color: '#6B7280' }, { label: '2000-2009', color: '#F59E0B' },
  { label: '2010-2019', color: '#3B82F6' }, { labelKey: 'color.new2020', color: '#10B981' }, { labelKey: 'color.future', color: '#8B5CF6' },
];

export default function ColorControlPanel() {
  const { colorMode, setColorMode } = useMapStore();
  const { t, locale } = useTranslation();

  const MODE_OPTIONS: { key: ColorMode; labelKey: string; tooltipKey: string }[] = [
    { key: 'status', labelKey: 'color.status', tooltipKey: 'colorStatus' },
    { key: 'vendor', labelKey: 'color.builder', tooltipKey: 'colorVendor' },
    { key: 'operator', labelKey: 'color.operator', tooltipKey: 'colorOperator' },
    { key: 'year', labelKey: 'color.age', tooltipKey: 'colorAge' },
  ];

  const legend = colorMode === 'status' ? STATUS_LEGEND : colorMode === 'vendor' ? VENDOR_LEGEND : colorMode === 'operator' ? OPERATOR_LEGEND : YEAR_LEGEND;

  return (
    <div style={{ position: 'absolute', top: 72, left: 16, backgroundColor: 'rgba(13, 27, 42, 0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(42, 157, 143, 0.2)', borderRadius: 12, padding: 16, width: 200, zIndex: 40 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#2A9D8F', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 1 }}>{t('color.title')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        {MODE_OPTIONS.map(opt => (
          <Tooltip key={opt.key} content={getTooltip(opt.tooltipKey, locale)} position="right" maxWidth={240}>
            <button onClick={() => setColorMode(opt.key)} style={{
              padding: '7px 0', fontSize: 11, fontWeight: 500, cursor: 'pointer', borderRadius: 6, border: 'none', transition: 'all 0.2s', width: '100%',
              backgroundColor: colorMode === opt.key ? 'rgba(42, 157, 143, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              color: colorMode === opt.key ? '#2A9D8F' : '#9CA3AF',
              outline: colorMode === opt.key ? '1px solid rgba(42, 157, 143, 0.4)' : '1px solid transparent',
            }}>{t(opt.labelKey)}</button>
          </Tooltip>
        ))}
      </div>
      <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 1 }}>{t('color.legend')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {legend.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color, boxShadow: `0 0 4px ${item.color}40`, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#D1D5DB' }}>{item.labelKey ? t(item.labelKey) : item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const VENDOR_COLOR_MAP: Record<string, [number, number, number, number]> = {
  'ASN': [0.23, 0.51, 0.96, 0.8], 'SubCom': [0.94, 0.27, 0.27, 0.8], 'NEC': [0.96, 0.62, 0.04, 0.8],
  'HMN Tech': [0.06, 0.73, 0.51, 0.8], 'Prysmian': [0.55, 0.36, 0.96, 0.8], 'Ericsson': [0.93, 0.29, 0.60, 0.8],
  'Xtera': [0.02, 0.71, 0.83, 0.8], 'Nexans': [0.98, 0.45, 0.09, 0.8],
};
export const VENDOR_DEFAULT: [number, number, number, number] = [0.42, 0.42, 0.42, 0.4];
export const OPERATOR_COLOR_MAP: Record<string, [number, number, number, number]> = {
  'Google': [0.20, 0.66, 0.33, 0.8], 'Orange': [1.00, 0.47, 0.00, 0.8], 'BT': [0.39, 0.00, 0.67, 0.8],
  'Sparkle': [0.91, 0.12, 0.39, 0.8], 'Vodafone': [0.90, 0.00, 0.00, 0.8], 'Meta': [0.09, 0.47, 0.95, 0.8],
  'Telekom Malaysia': [0.00, 0.33, 0.65, 0.8], 'Tata Communications': [0.00, 0.74, 0.83, 0.8], 'Singtel': [0.00, 0.74, 0.83, 0.8],
};
export const OPERATOR_DEFAULT: [number, number, number, number] = [0.42, 0.42, 0.42, 0.3];
export function getYearColor(rfsYear: number | null): [number, number, number, number] {
  if (!rfsYear) return [0.42, 0.42, 0.42, 0.3]; if (rfsYear < 2000) return [0.42, 0.42, 0.42, 0.5];
  if (rfsYear < 2010) return [0.96, 0.62, 0.04, 0.7]; if (rfsYear < 2020) return [0.23, 0.51, 0.96, 0.7];
  if (rfsYear < 2026) return [0.06, 0.73, 0.51, 0.7]; return [0.55, 0.36, 0.96, 0.7];
}

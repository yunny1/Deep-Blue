// src/components/panels/RiskScoreCard.tsx
// 风险评分卡片 — 带悬停解释提示
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';
import { getTooltip } from '@/lib/tooltips';
import Tooltip from '@/components/ui/Tooltip';

interface RiskData { risk: { scoreOverall: number; scoreConflict: number; scoreSanctions: number; scoreMilitary: number; scoreOwnership: number; scoreLegal: number; scoreHistorical: number; scoreEvents: number; riskLevel: string; conflictZones: string[]; sanctionedCountries: string[]; }; }
const RISK_COLORS: Record<string, string> = { CRITICAL: '#EF4444', HIGH: '#F97316', ELEVATED: '#F59E0B', MODERATE: '#3B82F6', LOW: '#06D6A0' };

export default function RiskScoreCard({ cableSlug }: { cableSlug: string }) {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showAiInsights } = useMapStore();
  const { t, locale } = useTranslation();

  useEffect(() => {
    if (!cableSlug) return; setLoading(true);
    fetch(`/api/risk?cable=${cableSlug}`).then(r => r.json()).then(d => { if (d.risk) setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [cableSlug]);

  if (!showAiInsights || loading || !data) return null;
  const { risk } = data;
  const riskColor = RISK_COLORS[risk.riskLevel] || '#6B7280';

  const FACTORS = [
    { key: 'scoreConflict', labelKey: 'risk.conflict', weight: '25%', tooltipKey: 'riskConflict' },
    { key: 'scoreSanctions', labelKey: 'risk.sanctions', weight: '20%', tooltipKey: 'riskSanctions' },
    { key: 'scoreMilitary', labelKey: 'risk.military', weight: '15%', tooltipKey: 'riskMilitary' },
    { key: 'scoreOwnership', labelKey: 'risk.ownership', weight: '15%', tooltipKey: 'riskOwnership' },
    { key: 'scoreLegal', labelKey: 'risk.legal', weight: '10%', tooltipKey: 'riskLegal' },
    { key: 'scoreHistorical', labelKey: 'risk.historical', weight: '10%', tooltipKey: 'riskHistorical' },
    { key: 'scoreEvents', labelKey: 'risk.events', weight: '5%', tooltipKey: 'riskEvents' },
  ];

  const riskLevelTooltipKey = `risk${risk.riskLevel.charAt(0) + risk.riskLevel.slice(1).toLowerCase()}`;

  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: 16, marginTop: 12, border: `1px solid ${riskColor}25` }}>
      {/* 标题 + 综合分数 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Tooltip content={getTooltip('riskOverall', locale)} position="bottom" maxWidth={300}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3B82F6', boxShadow: '0 0 4px #3B82F6' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#EDF2F7' }}>{t('risk.title')}</span>
            <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: 'rgba(59,130,246,0.2)', color: '#3B82F6' }}>AI</span>
            {/* 问号图标，提示用户可以悬停查看解释 */}
            <span style={{ fontSize: 10, color: '#4B5563', marginLeft: 2 }}>ⓘ</span>
          </div>
        </Tooltip>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: riskColor }}>{risk.scoreOverall}</span>
          <span style={{ fontSize: 10, color: '#6B7280' }}>/100</span>
        </div>
      </div>

      {/* 风险等级标签（带提示） */}
      <Tooltip content={getTooltip(riskLevelTooltipKey, locale)} position="bottom">
        <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, backgroundColor: `${riskColor}20`, color: riskColor, marginBottom: 12, cursor: 'help' }}>
          {risk.riskLevel} {t('risk.risk')} ⓘ
        </div>
      </Tooltip>

      {/* 7因子条形图（每个因子带悬停提示） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {FACTORS.map(factor => {
          const score = (risk as any)[factor.key] as number;
          const barColor = score >= 70 ? '#EF4444' : score >= 40 ? '#F59E0B' : '#06D6A0';
          return (
            <div key={factor.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                <Tooltip content={getTooltip(factor.tooltipKey, locale)} position="right" maxWidth={300}>
                  <span style={{ color: '#9CA3AF', cursor: 'help' }}>
                    {t(factor.labelKey)} <span style={{ color: '#4B5563' }}>({factor.weight})</span> ⓘ
                  </span>
                </Tooltip>
                <span style={{ color: '#D1D5DB', fontWeight: 600 }}>{score}</span>
              </div>
              <div style={{ width: '100%', height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <div style={{ width: `${score}%`, height: '100%', borderRadius: 2, backgroundColor: barColor, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {risk.conflictZones.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>{t('risk.conflictZones')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
            {risk.conflictZones.map((zone, i) => (<span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{zone}</span>))}
          </div>
        </div>
      )}
      {risk.sanctionedCountries.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>{t('risk.sanctionedCountries')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
            {risk.sanctionedCountries.map((cc, i) => (<span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#FB923C', border: '1px solid rgba(249, 115, 22, 0.2)' }}>{cc}</span>))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 9, color: '#4B5563', lineHeight: 1.4 }}>{t('risk.description')}</div>
    </div>
  );
}

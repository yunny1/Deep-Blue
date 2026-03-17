// src/components/layout/AiToggle.tsx
// AI推断内容开关 — 事实/推断分离原则的核心UI实现
// 开启时显示AI推断的海缆状态、风险预警等内容（蓝色脉冲标识）
// 关闭时只显示事实数据（来自TeleGeography等官方数据源）

'use client';

import { useMapStore } from '@/stores/mapStore';

export default function AiToggle() {
  const { showAiInsights, toggleAiInsights } = useMapStore();

  return (
    <button
      onClick={toggleAiInsights}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 6,
        border: `1px solid ${showAiInsights ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.1)'}`,
        backgroundColor: showAiInsights ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.04)',
        color: showAiInsights ? '#3B82F6' : '#6B7280',
        cursor: 'pointer', transition: 'all 0.2s',
        fontSize: 11, fontWeight: 500,
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        backgroundColor: showAiInsights ? '#3B82F6' : '#4B5563',
        boxShadow: showAiInsights ? '0 0 6px #3B82F6' : 'none',
        transition: 'all 0.2s',
      }} />
      AI Insights {showAiInsights ? 'ON' : 'OFF'}
    </button>
  );
}

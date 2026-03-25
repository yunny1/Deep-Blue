'use client';

import { useEffect, useState } from 'react';

// ─── 类型定义 ────────────────────────────────────────────

interface BRICSOverview {
  global: {
    totalCables: number;
    totalStations: number;
  };
  brics: {
    relatedCables: number;
    internalCables: number;
    memberInternalCables: number;
    stations: number;
    sovereigntyIndex: number;
    statusBreakdown: {
      active: number;
      underConstruction: number;
      planned: number;
      other: number;
    };
  };
}

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  /** 0-100 进度值（可选，显示小进度条） */
  progress?: number;
  accentColor?: string;
}

// ─── 单个统计卡片 ────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  progress,
  accentColor = '#D4AF37',
}: StatCardProps) {
  return (
    <div
      style={{
        background: 'rgba(26, 45, 74, 0.6)',
        border: '1px solid rgba(212, 175, 55, 0.15)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backdropFilter: 'blur(12px)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.4)';
        e.currentTarget.style.boxShadow =
          '0 0 20px rgba(212, 175, 55, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.15)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(212, 175, 55, 0.7)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '36px',
          fontWeight: 700,
          color: '#F0E6C8',
          lineHeight: 1.1,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
      {subtitle && (
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>
          {subtitle}
        </span>
      )}
      {progress !== undefined && (
        <div
          style={{
            marginTop: '4px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              borderRadius: '2px',
              background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
              transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export default function BRICSStatsCards() {
  const [data, setData] = useState<BRICSOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/overview')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(26, 45, 74, 0.4)',
              borderRadius: '12px',
              height: '140px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#EF4444',
          fontSize: '14px',
        }}
      >
        统计数据加载失败：{error ?? '未知错误'}
      </div>
    );
  }

  const { global, brics } = data;

  // 计算占比
  const cableShare =
    global.totalCables > 0
      ? ((brics.relatedCables / global.totalCables) * 100).toFixed(1)
      : '0';
  const stationShare =
    global.totalStations > 0
      ? ((brics.stations / global.totalStations) * 100).toFixed(1)
      : '0';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}
    >
      <StatCard
        label="BRICS 相关海缆"
        value={brics.relatedCables}
        subtitle={`占全球 ${cableShare}%（共 ${global.totalCables} 条）`}
        progress={parseFloat(cableShare)}
      />
      <StatCard
        label="BRICS 登陆站"
        value={brics.stations}
        subtitle={`占全球 ${stationShare}%（共 ${global.totalStations} 个）`}
        progress={parseFloat(stationShare)}
      />
      <StatCard
        label="内部互联海缆"
        value={brics.internalCables}
        subtitle={`两端均在 BRICS 国家（成员国间 ${brics.memberInternalCables} 条）`}
      />
      <StatCard
        label="数字主权指数"
        value={brics.sovereigntyIndex}
        subtitle="BRICS 内部互联 / BRICS 相关海缆比值"
        progress={brics.sovereigntyIndex}
        accentColor={
          brics.sovereigntyIndex >= 50
            ? '#22C55E'
            : brics.sovereigntyIndex >= 25
            ? '#F59E0B'
            : '#EF4444'
        }
      />
      <StatCard
        label="在役"
        value={brics.statusBreakdown.active}
        subtitle="Active"
        accentColor="#22C55E"
      />
      <StatCard
        label="建设中"
        value={brics.statusBreakdown.underConstruction}
        subtitle="Under Construction"
        accentColor="#3B82F6"
      />
    </div>
  );
}


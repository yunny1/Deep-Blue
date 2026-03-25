/**
 * /brics — BRICS+ 海缆战略仪表板
 *
 * Phase 1 内容：
 *   - Hero 标题区 + BRICS 五色条纹装饰
 *   - 核心统计卡片（BRICSStatsCards）
 *   - BRICS 专属地图（BRICSMap）— 金色高亮内部海缆
 *   - 数字主权矩阵（SovereigntyMatrix）— 11×11 直连分析
 */

import type { Metadata } from 'next';
import BRICSStatsCards from '@/components/brics/BRICSStatsCards';
import SovereigntyMatrix from '@/components/brics/SovereigntyMatrix';
import BRICSMap from '@/components/brics/BRICSMap';

export const metadata: Metadata = {
  title: 'BRICS+ Strategic Dashboard — Deep Blue',
  description:
    'Analyzing submarine cable infrastructure across BRICS+ nations: digital sovereignty, connectivity gaps, and investment opportunities.',
};

export default function BRICSPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0A1628',
        color: '#E8E0D0',
      }}
    >
      {/* ────────────────────────────────────────────────
       *  Hero 标题区
       * ──────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '48px 32px 36px',
          overflow: 'hidden',
        }}
      >
        {/* 五色条纹装饰（蓝红黄绿橙 — BRICS 创始五国标志色） */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            display: 'flex',
          }}
        >
          {['#0066B3', '#D32F2F', '#FFC107', '#388E3C', '#F57C00'].map(
            (color) => (
              <div
                key={color}
                style={{ flex: 1, background: color }}
              />
            )
          )}
        </div>

        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* 标签 */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: 'rgba(212, 175, 55, 0.08)',
              border: '1px solid rgba(212, 175, 55, 0.2)',
              borderRadius: '20px',
              marginBottom: '16px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#D4AF37',
              }}
            />
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: '#D4AF37',
                textTransform: 'uppercase',
              }}
            >
              Strategic Analysis
            </span>
          </div>

          {/* 标题 */}
          <h1
            style={{
              fontSize: 'clamp(28px, 4vw, 44px)',
              fontWeight: 800,
              lineHeight: 1.15,
              margin: '0 0 12px',
              color: '#F0E6C8',
              letterSpacing: '-0.02em',
            }}
          >
            BRICS+{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #D4AF37, #E8D48B)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              海缆战略
            </span>
            仪表板
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'rgba(255,255,255,0.45)',
              maxWidth: '700px',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            可视化金砖国家数字互联互通现状 — 覆盖 11 个成员国和 10 个伙伴国的海缆基础设施、
            数字主权评估和战略缺口分析。
          </p>
        </div>
      </section>

      {/* ────────────────────────────────────────────────
       *  主内容区
       * ──────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 32px 64px',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
        }}
      >
        {/* ── 核心统计卡片 ── */}
        <section>
          <SectionHeader
            title="核心指标"
            subtitle="BRICS+ 海缆基础设施概览"
          />
          <BRICSStatsCards />
        </section>

        {/* ── BRICS 地图 ── */}
        <section>
          <SectionHeader
            title="BRICS 海缆网络"
            subtitle="金色 = BRICS 内部互联 | 银色 = BRICS ↔ 外部 | 灰色 = 非 BRICS"
          />
          <BRICSMap height="550px" initialCenter={[60, 15]} initialZoom={2.2} />
        </section>

        {/* ── 数字主权矩阵 ── */}
        <section>
          <SectionHeader
            title="数字主权矩阵"
            subtitle="成员国间海缆直连分析 — 绿色直连 / 黄色 BRICS 中转 / 红色经非 BRICS / 灰色无连接"
          />
          <SovereigntyMatrix />
        </section>
      </div>
    </main>
  );
}

// ─── 区块标题组件 ────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#F0E6C8',
          margin: '0 0 4px',
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.35)',
          margin: 0,
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}


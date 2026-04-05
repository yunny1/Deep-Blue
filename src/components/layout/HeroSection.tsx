'use client';
// src/components/layout/HeroSection.tsx
//
// Deep Blue 主页全屏英雄落地区
//
// 视觉设计逻辑：
//   《观沧海》在此代表平台哲学，使用平台主色系（冷亮蓝白 + 青色辉光）
//   而非 BRICS 金色——金色是 BRICS 专属语义色，不应出现在主页开场。
//   辉光梯度：纯白光晕 → 平台青 #2A9D8F → 深海蓝 #1E6091，
//   完整使用 Deep Blue 现有色彩 DNA。
//
// 时间轴（9 秒）：
//   T=500ms   → 系统启动文字浮现
//   T=1300ms  → 诗句一："日月之行，若出其中；"
//   T=2700ms  → 诗句二："星汉灿烂，若出其里。"
//   T=3900ms  → 出处小字："—— 曹操《观沧海》"
//   T=5000ms  → 副标题统计行 + 进入系统按钮浮现
//   T=9000ms  → 自动消退；倒计时从 T=6000ms 开始

import { useEffect, useState, useCallback } from 'react';
import { useTranslation, type Locale } from '@/lib/i18n';

// ── 时间节点（毫秒） ──────────────────────────────────────────────────────────
const T_BOOT  =  500;
const T_LINE1 = 1300;
const T_LINE2 = 2700;
const T_ATTR  = 3900;
const T_CTA   = 5000;
const T_AUTO  = 9000;

// ── 诗词颜色系统 ──────────────────────────────────────────────────────────────
// 冷亮蓝白：月光照在海面上的质感，区别于 BRICS 金色
const POEM_COLOR = '#C8DCF0';
// 辉光梯度：从内向外依次经过平台三个蓝色层
const POEM_GLOW =
  '0 0 10px rgba(200,220,240,0.95),' +   // 紧贴字形的白色光晕
  '0 0 28px rgba(42,157,143,0.65),' +    // 平台青色 #2A9D8F
  '0 0 65px rgba(30,96,145,0.40),' +     // 深海蓝 #1E6091
  '0 0 120px rgba(10,40,80,0.20)';       // 近海底的幽暗蓝，几乎看不见

export default function HeroSection() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // phase：0=隐藏, 1=boot文字, 2=诗句一, 3=诗句二, 4=出处, 5=CTA, 6=消退中
  const [phase,     setPhase]     = useState(0);
  const [visible,   setVisible]   = useState(false);
  const [countdown, setCountdown] = useState(3);

  const dismiss = useCallback(() => {
    setPhase(6);
    setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem('db-hero-seen', '1'); } catch {}
    }, 650);
  }, []);

  useEffect(() => {
    try { if (sessionStorage.getItem('db-hero-seen')) return; } catch {}

    setVisible(true);
    const timers = [
      setTimeout(() => setPhase(1), T_BOOT),
      setTimeout(() => setPhase(2), T_LINE1),
      setTimeout(() => setPhase(3), T_LINE2),
      setTimeout(() => setPhase(4), T_ATTR),
      setTimeout(() => setPhase(5), T_CTA),
      setTimeout(() => dismiss(),   T_AUTO),
      // 倒计时 3→2→1，从第 6 秒起
      setTimeout(() => setCountdown(2), T_AUTO - 3000),
      setTimeout(() => setCountdown(1), T_AUTO - 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [dismiss]);

  if (!visible) return null;

  const fading = phase === 6;

  return (
    <div
      onClick={phase < 5 ? dismiss : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: '#05080A',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px',
        cursor: phase < 5 ? 'pointer' : 'default',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.65s ease',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        userSelect: 'none',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=DM+Sans:wght@400;500;600&display=swap');

        
        @keyframes poem-appear {
          from { opacity: 0; filter: blur(8px); }
          to   { opacity: 1; filter: blur(0px); }
        }

       
        @keyframes fade-gentle {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        
        @keyframes btn-breathe {
          0%,100% { box-shadow: 0 0 0 0 rgba(42,157,143,0); border-color: rgba(42,157,143,0.5); }
          50%     { box-shadow: 0 0 20px 4px rgba(42,157,143,0.25); border-color: rgba(42,157,143,0.9); }
        }

        
        @keyframes scan {
          0%   { left: -4px; opacity: 0.6; }
          80%  { opacity: 0.6; }
          100% { left: 100vw; opacity: 0; }
        }

       
        @keyframes dot-pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.2; }
        }
      `}</style>

      {/* ── 背景层：极细网格质感 ─────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(42,157,143,0.04) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(42,157,143,0.04) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
      }} />
      {/* 暗角渐变：聚焦中央 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #05080A 100%)',
      }} />
      {/* 扫光：营造系统扫描感 */}
      {phase >= 1 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: 2, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent, rgba(42,157,143,0.3), transparent)',
          animation: 'scan 4.5s linear infinite',
        }} />
      )}

      {/* ── 系统启动文字（顶部）─────────────────────────────────────── */}
      {phase >= 1 && (
        <div style={{
          position: 'absolute', top: 40, left: 0, right: 0,
          textAlign: 'center', pointerEvents: 'none',
          fontFamily: 'monospace', fontSize: 10,
          color: 'rgba(42,157,143,0.55)',
          letterSpacing: 2.5, textTransform: 'uppercase',
          animation: 'fade-gentle 1s ease forwards',
        }}>
          <span style={{ animation: 'dot-pulse 1.6s ease infinite' }}>●</span>
          {' '}DEEP BLUE INTELLIGENCE SYSTEM
          <div style={{
            fontSize: 9, marginTop: 6,
            color: 'rgba(42,157,143,0.28)',
            letterSpacing: 2,
          }}>
            SUBMARINE CABLE NETWORK MONITOR · GLOBAL FEED ACTIVE
          </div>
          {/* 进度条 */}
          <div style={{
            width: 240, height: 1, margin: '10px auto 0',
            backgroundColor: 'rgba(42,157,143,0.1)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', backgroundColor: '#2A9D8F',
              animation: `fade-gentle ${(T_AUTO - T_BOOT) / 1000}s linear forwards`,
              width: '0%',
              // 用 scaleX 模拟进度条填充——实际宽度靠 CSS animation 做不到，
              // 用 transform: scaleX 配合 transform-origin: left 实现
              transformOrigin: 'left',
              transform: 'scaleX(0)',
              transition: `transform ${(T_AUTO - T_BOOT) / 1000}s linear`,
            }} ref={el => {
              // 挂载后立即触发进度动画
              if (el) setTimeout(() => { el.style.transform = 'scaleX(1)'; }, 50);
            }} />
          </div>
        </div>
      )}

      {/* ── 诗词主体区域 ────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        maxWidth: 720,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>

        {/* 诗句一：日月之行，若出其中 */}
        <div style={{
          // 中文宋体降级栈
          fontFamily: '"STSong", "SimSun", "Source Han Serif SC", "Noto Serif SC", serif',
          fontSize: 'clamp(20px, 3.2vw, 44px)',
          fontWeight: 700,
          color: POEM_COLOR,
          textShadow: POEM_GLOW,
          letterSpacing: '0.22em',
          lineHeight: 1,
          marginBottom: '1.6em',
          // 出场动效：模糊收焦 + 字间距收紧
          opacity: 0,
          animation: phase >= 2
            ? 'poem-appear 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'none',
        }}>
          日月之行，若出其中；
        </div>

        {/* 诗句二：星汉灿烂，若出其里 */}
        <div style={{
          fontFamily: '"STSong", "SimSun", "Source Han Serif SC", "Noto Serif SC", serif',
          fontSize: 'clamp(20px, 3.2vw, 44px)',
          fontWeight: 700,
          color: POEM_COLOR,
          textShadow: POEM_GLOW,
          letterSpacing: '0.22em',
          lineHeight: 1,
          marginBottom: '2em',
          opacity: 0,
          // 比诗句一晚 1.4 秒出现，给第一句充分的沉淀时间
          animation: phase >= 3
            ? 'poem-appear 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'none',
        }}>
          星汉灿烂，若出其里。
        </div>

        {/* 出处：平台青色低透明度，不抢主角光彩 */}
        <div style={{
          fontFamily: '"STSong", "SimSun", serif',
          fontSize: 'clamp(11px, 1.1vw, 14px)',
          // 青色而非金色——属于平台色，不属于 BRICS
          color: 'rgba(42,157,143,0.55)',
          letterSpacing: '0.15em',
          marginBottom: '2.4em',
          opacity: 0,
          animation: phase >= 4
            ? 'fade-gentle 1.2s ease forwards'
            : 'none',
        }}>
          {zh
            ? '—— 曹操《观沧海》'
            : '—— Cao Cao · 《观沧海》· Gazing at the Sea'}
        </div>

        {/* 平台统计行：极低透明度，仅作数据锚点 */}
        <p style={{
          fontFamily: 'monospace',
          fontSize: 'clamp(9px, 0.95vw, 11px)',
          color: 'rgba(200,220,240,0.30)',
          letterSpacing: '0.1em',
          margin: '0 0 32px',
          lineHeight: 1.8,
          opacity: 0,
          pointerEvents: 'none',
          animation: phase >= 5 ? 'fade-gentle 1s ease forwards' : 'none',
        }}>
          {zh
            ? '全球 877 条海底光缆 · 实时主权情报 · AI 战略分析'
            : '877 cables monitored globally · Sovereignty intelligence · AI strategy'}
        </p>

        {/* 进入系统按钮：始终在 DOM 里占位，phase < 5 时 pointerEvents 关闭 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20,
          opacity: 0,
          pointerEvents: phase >= 5 ? 'auto' : 'none',
          animation: phase >= 5 ? 'fade-gentle 0.8s ease 0.3s forwards' : 'none',
        }}>
            <button
              onClick={dismiss}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '12px 30px', borderRadius: 3,
                backgroundColor: 'transparent',
                border: '1px solid rgba(42,157,143,0.5)',
                color: '#2A9D8F',
                fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: 2.5, textTransform: 'uppercase',
                // 呼吸光：边框和外发光交替强弱
                animation: 'btn-breathe 2.8s ease-in-out infinite',
                transition: 'background-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.12)';
                e.currentTarget.style.color = '#5FD4C4';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#2A9D8F';
              }}
            >
              {zh ? '进入系统' : 'Enter System'} →
            </button>

            {/* 倒计时 */}
            <span style={{
              fontFamily: 'monospace', fontSize: 10,
              color: 'rgba(200,220,240,0.22)',
              letterSpacing: 1.5,
            }}>
              {zh ? `${countdown}s 后自动进入` : `AUTO IN ${countdown}s`}
            </span>
          </div>
        
      </div>

      {/* ── 底部角标 ─────────────────────────────────────────────────── */}
      {phase >= 5 && (
        <div style={{
          position: 'absolute', bottom: 24, right: 28,
          fontFamily: 'monospace', fontSize: 9,
          color: 'rgba(255,255,255,0.07)',
          letterSpacing: 1.5,
          animation: 'fade-gentle 1s ease 0.5s forwards',
          opacity: 0,
        }}>
          DEEP-BLUE · OPEN SOURCE INTELLIGENCE
        </div>
      )}

      {/* Act 1-4 跳过提示 */}
      {phase >= 1 && phase < 5 && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 9,
          color: 'rgba(255,255,255,0.10)',
          letterSpacing: 1.5, pointerEvents: 'none',
          animation: 'fade-gentle 1s ease 1.5s forwards',
          opacity: 0,
        }}>
          {zh ? 'CLICK TO SKIP · 点击跳过' : 'CLICK ANYWHERE TO SKIP'}
        </div>
      )}
    </div>
  );
}

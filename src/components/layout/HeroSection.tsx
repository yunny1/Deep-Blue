'use client';
// src/components/layout/HeroSection.tsx
//
// 修复：Flash of Underlying Content（地图闪现）
//
// 根因分析：
//   原版用 useState(false) 初始化 visible，第一次渲染返回 null（组件不存在），
//   地图完全暴露。useEffect 在浏览器绘制之后才跑，把 visible 设为 true，
//   中间有几帧空窗期，用户看到地图闪了一下。
//
// 修复方案：
//   1. visible 类型改为 boolean | null
//      - null  = 还不知道（SSR 阶段 + 客户端水合前）→ 渲染纯黑占位遮罩
//      - false = 已看过英雄区（returning visitor）→ 返回 null，地图正常显示
//      - true  = 第一次访问（first visit）→ 显示英雄区动画
//
//   2. 用 useLayoutEffect 代替 useEffect 做初始化判断
//      useLayoutEffect 在 DOM 更新后、浏览器绘制前同步执行，
//      浏览器还没来得及画任何东西，我们就已经拿到了正确的状态。
//
//   3. 纯黑占位遮罩（visible === null 时渲染）
//      覆盖地图，给 useLayoutEffect 争取时间。
//      useLayoutEffect 运行完之后，浏览器才进行第一次绘制，
//      用户看到的直接是英雄区（or 地图，对于 returning visitor），
//      地图永远不会在英雄区之前露出来。

import { useEffect, useLayoutEffect, useState, useCallback } from 'react';
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
const POEM_GLOW =
  '0 0 10px rgba(200,220,240,0.95),' +
  '0 0 28px rgba(42,157,143,0.65),' +
  '0 0 65px rgba(30,96,145,0.40),' +
  '0 0 120px rgba(10,40,80,0.20)';

export default function HeroSection() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // null  → 尚未确定（SSR / 水合前）→ 显示纯黑遮罩盖住地图
  // false → 已看过，本次不显示
  // true  → 第一次访问，显示英雄区
  const [visible, setVisible] = useState<boolean | null>(null);

  // 动效阶段：0=初始, 1=boot, 2=诗句一, 3=诗句二, 4=出处, 5=CTA, 6=消退中
  const [phase,     setPhase]     = useState(0);
  const [countdown, setCountdown] = useState(3);

  const dismiss = useCallback(() => {
    setPhase(6);
    setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem('db-hero-seen', '1'); } catch {}
    }, 650);
  }, []);

  // ── useLayoutEffect：在浏览器绘制前同步决定 visible 状态 ────────────────
  // 这是修复闪现的核心。浏览器在这之后才会进行第一次绘制，
  // 所以用户看到的第一帧要么是英雄区（true），要么是普通地图（false）——
  // 绝不会是"地图 → 英雄区覆盖"这个顺序。
  useLayoutEffect(() => {
    try {
      setVisible(!sessionStorage.getItem('db-hero-seen'));
    } catch {
      // sessionStorage 不可用（隐私模式等），直接不显示英雄区，不影响主功能
      setVisible(false);
    }
  }, []);

  // ── useEffect：visible 确定为 true 后，启动动效时间轴 ───────────────────
  useEffect(() => {
    if (!visible) return; // false 或 null 都不启动

    const timers = [
      setTimeout(() => setPhase(1), T_BOOT),
      setTimeout(() => setPhase(2), T_LINE1),
      setTimeout(() => setPhase(3), T_LINE2),
      setTimeout(() => setPhase(4), T_ATTR),
      setTimeout(() => setPhase(5), T_CTA),
      setTimeout(() => dismiss(),   T_AUTO),
      setTimeout(() => setCountdown(2), T_AUTO - 3000),
      setTimeout(() => setCountdown(1), T_AUTO - 2000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [visible, dismiss]);

  // ── 状态路由 ─────────────────────────────────────────────────────────────

  // null：SSR 或水合前，渲染纯黑遮罩，防止地图在任何情况下先露出来
  if (visible === null) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: '#05080A',
      }} />
    );
  }

  // false：returning visitor，不渲染任何东西，地图正常显示
  if (!visible) return null;

  // true：first visit，渲染英雄区动画
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

        /* 诗句出场：模糊收焦，不参与 letter-spacing 动画（防 layout shift）*/
        @keyframes poem-appear {
          from { opacity: 0; filter: blur(8px); }
          to   { opacity: 1; filter: blur(0px); }
        }

        /* 次要元素通用淡入 */
        @keyframes fade-gentle {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* 进入系统按钮呼吸光 */
        @keyframes btn-breathe {
          0%,100% { box-shadow: 0 0 0 0 rgba(42,157,143,0); border-color: rgba(42,157,143,0.5); }
          50%     { box-shadow: 0 0 20px 4px rgba(42,157,143,0.25); border-color: rgba(42,157,143,0.9); }
        }

        /* 扫光线 */
        @keyframes scan {
          0%   { left: -4px; opacity: 0.6; }
          80%  { opacity: 0.6; }
          100% { left: 100vw; opacity: 0; }
        }

        /* 小圆点呼吸 */
        @keyframes dot-pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.2; }
        }
      `}</style>

      {/* ── 背景网格 ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(42,157,143,0.04) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(42,157,143,0.04) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
      }} />
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, #05080A 100%)',
      }} />

      {/* 扫光 */}
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
            color: 'rgba(42,157,143,0.28)', letterSpacing: 2,
          }}>
            SUBMARINE CABLE NETWORK MONITOR · GLOBAL FEED ACTIVE
          </div>
          {/* 进度条 */}
          <div style={{
            width: 240, height: 1, margin: '10px auto 0',
            backgroundColor: 'rgba(42,157,143,0.1)', overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%', backgroundColor: '#2A9D8F',
                transformOrigin: 'left', transform: 'scaleX(0)',
                transition: `transform ${(T_AUTO - T_BOOT) / 1000}s linear`,
              }}
              ref={el => { if (el) setTimeout(() => { el.style.transform = 'scaleX(1)'; }, 50); }}
            />
          </div>
        </div>
      )}

      {/* ── 诗词主体区域（始终在 DOM 中，靠 opacity/animation 控制可见性）── */}
      {/* 注意：统计行和按钮区不用条件渲染，防止插入时改变容器高度引发 layout shift */}
      <div style={{
        textAlign: 'center',
        maxWidth: 720,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>

        {/* 诗句一 */}
        <div style={{
          fontFamily: '"STSong", "SimSun", "Source Han Serif SC", "Noto Serif SC", serif',
          fontSize: 'clamp(20px, 3.2vw, 44px)',
          fontWeight: 700,
          color: POEM_COLOR,
          textShadow: POEM_GLOW,
          letterSpacing: '0.22em',
          lineHeight: 1,
          marginBottom: '1.6em',
          opacity: 0,
          animation: phase >= 2
            ? 'poem-appear 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'none',
        }}>
          日月之行，若出其中；
        </div>

        {/* 诗句二 */}
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
          animation: phase >= 3
            ? 'poem-appear 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'none',
        }}>
          星汉灿烂，若出其里。
        </div>

        {/* 出处 */}
        <div style={{
          fontFamily: '"STSong", "SimSun", serif',
          fontSize: 'clamp(11px, 1.1vw, 14px)',
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

        {/* 统计行：始终在 DOM 里占位，避免插入时引发 layout shift */}
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

        {/* 按钮区：始终在 DOM 里占位 */}
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

          <span style={{
            fontFamily: 'monospace', fontSize: 10,
            color: 'rgba(200,220,240,0.22)',
            letterSpacing: 1.5,
          }}>
            {zh ? `${countdown}s 后自动进入` : `AUTO IN ${countdown}s`}
          </span>
        </div>
      </div>

      {/* 底部角标 */}
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

      {/* 跳过提示 */}
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

'use client';
// src/components/layout/HeroSection.tsx
//
// 【深海星汉 · Abyssal Galaxy】开场动效
//
// 分镜执行机制：
//   此组件负责 UI 层（文字、战术边框、按钮），Cesium 层（光照、海缆发光、镜头）
//   通过 CustomEvent 'deep-blue-hero-phase' 由 CesiumGlobe.tsx 响应。
//   两个组件通过事件总线协同，互不直接引用——和 deep-blue-locale-changed 完全一样的模式。
//
// 时间轴总览（8 秒）：
//   T=0s      → 纯黑幕，HeroSection 挂载，派发 phase:1
//   T=0.4s    → "日月之行" 浮现（带金色辉光）
//   T=1.6s    → "星汉灿烂" 浮现
//   T=2.5s    → 黑幕渐透明，Cesium 地球浮现；派发 phase:2（开启大气光照）
//   T=5.0s    → 派发 phase:3（海缆切换发光材质，登陆站点亮）
//   T=7.0s    → 派发 phase:4（镜头飞行，战术边框亮起，打字机文案，按钮浮现）
//   T=8.0s    → 自动消退；派发 phase:0（Cesium 恢复正常渲染）

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';

// ─── 时间节点常量（毫秒） ────────────────────────────────────────────────────
const T_POETRY_L1  =  400;   // 第一句诗浮现
const T_POETRY_L2  = 1600;   // 第二句诗浮现
const T_GLOBE      = 2500;   // 黑幕开始退场，地球浮现；派发 phase:2
const T_CABLES     = 5000;   // 海缆发光；派发 phase:3
const T_TACTICAL   = 7000;   // 战术 UI 亮起；派发 phase:4
const T_AUTO       = 8000;   // 自动消退

// 向 CesiumGlobe 派发英雄阶段信号
function dispatchHeroPhase(phase: number) {
  window.dispatchEvent(new CustomEvent('deep-blue-hero-phase', { detail: { phase } }));
}

// ─── 打字机 Hook ─────────────────────────────────────────────────────────────
// 传入目标字符串，返回逐字显示的当前文本。
// speed：每个字符之间的间隔毫秒数
function useTypewriter(target: string, speed = 40, active = false): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) { setText(''); return; }
    setText('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setText(target.slice(0, i));
      if (i >= target.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [target, speed, active]);
  return text;
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function HeroSection() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // 阶段状态：控制各层的可见性和动效触发
  const [phase, setPhase]         = useState(0);
  const [visible, setVisible]     = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // 打字机文案（Act 4 出现）
  const typewriterZh = '全球 877 条海底光缆 · 实时主权情报 · AI 战略分析';
  const typewriterEn = '877 cables monitored globally · Sovereignty intelligence · AI-powered strategy';
  const typewriterText = useTypewriter(
    zh ? typewriterZh : typewriterEn,
    35,
    phase >= 4
  );

  // 消退逻辑
  const dismiss = useCallback(() => {
    if (dismissed) return;
    setDismissed(true);
    dispatchHeroPhase(0); // 通知 CesiumGlobe 恢复正常渲染
    setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem('db-hero-seen', '1'); } catch {}
    }, 700);
  }, [dismissed]);

  // 时间轴驱动
  useEffect(() => {
    try { if (sessionStorage.getItem('db-hero-seen')) return; } catch {}

    setVisible(true);
    dispatchHeroPhase(1); // phase 1：HeroSection 已挂载，告知 Cesium 进入待机

    const timers: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhase(1), T_POETRY_L1 - 50),

      setTimeout(() => {
        setPhase(2);
        dispatchHeroPhase(2); // 开启大气光照，晨昏线
      }, T_GLOBE),

      setTimeout(() => {
        setPhase(3);
        dispatchHeroPhase(3); // 海缆发光，登陆站点亮
      }, T_CABLES),

      setTimeout(() => {
        setPhase(4);
        dispatchHeroPhase(4); // 镜头飞行，战术 UI
      }, T_TACTICAL),

      setTimeout(() => dismiss(), T_AUTO),

      // 倒计时数字：从 T_TACTICAL 开始 3→2→1
      setTimeout(() => setCountdown(2), T_TACTICAL + 1000),
      setTimeout(() => setCountdown(1), T_TACTICAL + 2000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [dismiss]);

  if (!visible) return null;

  // ── 背景黑幕：Act 1 全黑，Act 2+ 渐渐透明以露出 Cesium 地球 ────────────
  // 关键：alpha 从 1.0 → 0.08，让地球透过来，同时保留边缘暗角
  const bgAlpha   = phase >= 2 ? 0.08 : 1.0;
  const isFading  = dismissed;                // 点击后整体消退

  // 诗句透明度：Act 1 全亮，Act 2 退居背景，Act 3+ 淡出
  const poetryOpacity = phase >= 3 ? 0 : phase >= 2 ? 0.18 : 1;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        // 整体消退动画（点击后触发）
        opacity: isFading ? 0 : 1,
        transition: 'opacity 0.7s ease',
        pointerEvents: isFading ? 'none' : 'auto',
        cursor: phase >= 4 ? 'default' : 'pointer',
        overflow: 'hidden',
      }}
      // Act 1-3 点击任意区域跳过；Act 4 以后只能点按钮
      onClick={phase < 4 ? dismiss : undefined}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=DM+Sans:wght@400;500;600&display=swap');

        /* 诗句淡入上浮 */
        @keyframes poetry-in {
          from { opacity:0; transform:translateY(18px) scale(0.98); filter:blur(4px); }
          to   { opacity:1; transform:translateY(0)    scale(1);    filter:blur(0px); }
        }
        /* 通用淡入 */
        @keyframes fade-in {
          from { opacity:0; }
          to   { opacity:1; }
        }
        /* 战术边框线段从角落延伸出来 */
        @keyframes bracket-h { from { width:0 }  to { width:40px } }
        @keyframes bracket-v { from { height:0 } to { height:40px } }
        /* 按钮呼吸光 */
        @keyframes btn-breathe {
          0%,100% { box-shadow: 0 0 16px rgba(42,157,143,0.3); }
          50%     { box-shadow: 0 0 32px rgba(42,157,143,0.6), 0 0 60px rgba(42,157,143,0.2); }
        }
        /* 扫光：战术感 */
        @keyframes scan-line {
          0%   { left:-4px; }
          100% { left:100vw; }
        }
        /* 小圆点呼吸 */
        @keyframes dot-pulse {
          0%,100% { opacity:1; }
          50%     { opacity:0.2; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════════════
          层 1：黑色背景——Act 1 全黑，Act 2+ 渐透明露出地球
         ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: `rgba(3,5,8,${bgAlpha})`,
        // Act 2 开始，用 2 秒的过渡让地球缓缓浮现
        transition: 'background-color 2s ease',
      }} />

      {/* 始终存在的暗角渐变——防止四角太亮，保持电影感 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 75% 65% at 50% 50%, transparent 35%, rgba(0,0,0,0.85) 100%)',
      }} />

      {/* 极细网格（背景质感）*/}
      {phase >= 1 && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(42,157,143,0.03) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(42,157,143,0.03) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          opacity: phase >= 2 ? 0.6 : 1,
          transition: 'opacity 2s ease',
        }} />
      )}

      {/* 扫光线——Act 1-3 */}
      {phase >= 1 && phase < 4 && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: 3, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent, rgba(42,157,143,0.25), transparent)',
          animation: 'scan-line 4s linear infinite',
        }} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          层 2：诗句——Act 1 全亮，Act 2 退居背景，Act 3 淡出
         ══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        opacity: poetryOpacity,
        transition: 'opacity 1.8s ease',
      }}>
        {/* 第一句：日月之行，若出其中 */}
        {phase >= 1 && (
          <div style={{
            fontFamily: '"Noto Serif SC", "Source Han Serif", "SimSun", serif',
            fontSize: 'clamp(22px, 3.5vw, 40px)',
            fontWeight: 700,
            // 暗金色辉光，仿佛从深海透出的光
            color: '#D4AF37',
            textShadow:
              '0 0 20px rgba(212,175,55,0.9),' +
              '0 0 50px rgba(212,175,55,0.5),' +
              '0 0 100px rgba(212,175,55,0.25)',
            letterSpacing: '0.25em',
            marginBottom: '1.2em',
            lineHeight: 1,
            animation: 'poetry-in 1.4s cubic-bezier(0.16,1,0.3,1) forwards',
          }}>
            日月之行，若出其中；
          </div>
        )}

        {/* 第二句：星汉灿烂，若出其里 */}
        {phase >= 1 && (
          <div style={{
            fontFamily: '"Noto Serif SC", "Source Han Serif", "SimSun", serif',
            fontSize: 'clamp(22px, 3.5vw, 40px)',
            fontWeight: 700,
            color: '#D4AF37',
            textShadow:
              '0 0 20px rgba(212,175,55,0.9),' +
              '0 0 50px rgba(212,175,55,0.5),' +
              '0 0 100px rgba(212,175,55,0.25)',
            letterSpacing: '0.25em',
            lineHeight: 1,
            // 第二句延迟 1.2 秒后出现（T_POETRY_L2 - T_POETRY_L1 = 1200ms）
            opacity: 0,
            animation: 'poetry-in 1.4s cubic-bezier(0.16,1,0.3,1) 1.2s forwards',
          }}>
            星汉灿烂，若出其里。
          </div>
        )}

        {/* 出处小字 */}
        {phase >= 1 && (
          <div style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: 'rgba(212,175,55,0.3)',
            letterSpacing: '0.2em',
            marginTop: '2em',
            opacity: 0,
            animation: 'fade-in 1s ease 2.2s forwards',
          }}>
            — 曹操《观沧海》·  DEEP BLUE INTELLIGENCE
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          层 3：战术 UI（Act 4 亮起）
          包含：战术边框、系统状态行、打字机文案、进入按钮
         ══════════════════════════════════════════════════════════════════════ */}
      {phase >= 4 && (
        <>
          {/* 战术边框：四个角的"L"形支架 */}
          {(['topleft', 'topright', 'bottomleft', 'bottomright'] as const).map(corner => {
            const isTop    = corner.startsWith('top');
            const isLeft   = corner.endsWith('left');
            return (
              <div key={corner} style={{
                position: 'absolute',
                top:    isTop    ? 24 : undefined,
                bottom: !isTop   ? 24 : undefined,
                left:   isLeft   ? 24 : undefined,
                right:  !isLeft  ? 24 : undefined,
                width: 40, height: 40,
                pointerEvents: 'none',
              }}>
                {/* 水平线段 */}
                <div style={{
                  position: 'absolute',
                  top:    isTop    ? 0 : undefined,
                  bottom: !isTop   ? 0 : undefined,
                  left:   isLeft   ? 0 : undefined,
                  right:  !isLeft  ? 0 : undefined,
                  height: 2,
                  backgroundColor: '#2A9D8F',
                  boxShadow: '0 0 6px rgba(42,157,143,0.8)',
                  animation: 'bracket-h 0.4s ease forwards',
                  width: 0,
                }} />
                {/* 垂直线段 */}
                <div style={{
                  position: 'absolute',
                  top:    isTop    ? 0 : undefined,
                  bottom: !isTop   ? 0 : undefined,
                  left:   isLeft   ? 0 : undefined,
                  right:  !isLeft  ? 0 : undefined,
                  width: 2,
                  backgroundColor: '#2A9D8F',
                  boxShadow: '0 0 6px rgba(42,157,143,0.8)',
                  animation: 'bracket-v 0.4s ease 0.1s forwards',
                  height: 0,
                }} />
              </div>
            );
          })}

          {/* 顶部系统状态行 */}
          <div style={{
            position: 'absolute', top: 32, left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'monospace', fontSize: 10,
            color: 'rgba(42,157,143,0.7)',
            letterSpacing: 2.5, textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            animation: 'fade-in 0.6s ease 0.3s forwards',
            opacity: 0, pointerEvents: 'none',
          }}>
            <span style={{ animation: 'dot-pulse 1.4s infinite' }}>●</span>
            {' '}DEEP BLUE INTELLIGENCE — SYSTEM ACTIVE
          </div>

          {/* 中央主标题区：大标题 + 打字机文案 */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            paddingBottom: '22vh', // 下移到屏幕下半段，避免遮挡地球视觉重心
            pointerEvents: 'none',
          }}>
            {/* 大标题 */}
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(36px, 5.5vw, 72px)',
              fontWeight: 800,
              color: '#F0E6C8',
              lineHeight: 1.08,
              margin: '0 0 16px',
              letterSpacing: '-0.02em',
              textAlign: 'center',
              textShadow: '0 2px 40px rgba(0,0,0,0.8)',
              animation: 'poetry-in 1s cubic-bezier(0.16,1,0.3,1) forwards',
            }}>
              {zh
                ? <>谁控制着连接，<br />谁就控制着<em style={{ fontStyle:'italic', color:'#D4AF37' }}>信息流动</em></>
                : <>Whoever controls the connection,<br />
                   <em style={{ fontStyle:'italic', color:'#D4AF37' }}>controls the flow.</em>
                  </>
              }
            </h1>

            {/* 打字机文案 */}
            <p style={{
              fontFamily: 'monospace',
              fontSize: 'clamp(10px, 1.2vw, 13px)',
              color: 'rgba(240,230,200,0.55)',
              letterSpacing: '0.08em',
              margin: '0 0 36px',
              minHeight: '1.4em',
              textAlign: 'center',
            }}>
              {typewriterText}
              <span style={{ animation: 'dot-pulse 0.8s infinite' }}>_</span>
            </p>

            {/* 进入系统按钮（呼吸光，等待点击）*/}
            <button
              onClick={dismiss}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                padding: '14px 36px', borderRadius: 3,
                backgroundColor: 'transparent',
                border: '1px solid #2A9D8F',
                color: '#2A9D8F',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: 2.5, textTransform: 'uppercase',
                animation: 'btn-breathe 2.5s ease-in-out infinite, fade-in 0.8s ease 0.5s forwards',
                opacity: 0,
                pointerEvents: 'auto',
                transition: 'background-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.15)';
                e.currentTarget.style.color = '#5FD4C4';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#2A9D8F';
              }}
            >
              {zh ? '进入系统' : 'Enter System'} →
            </button>
          </div>

          {/* 倒计时 + 跳过提示（右下角）*/}
          <div style={{
            position: 'absolute', bottom: 28, right: 32,
            fontFamily: 'monospace', fontSize: 10,
            color: 'rgba(240,230,200,0.2)',
            letterSpacing: 1.5, textAlign: 'right',
            pointerEvents: 'none',
            animation: 'fade-in 0.8s ease 0.6s forwards',
            opacity: 0,
          }}>
            <div>{zh ? `${countdown}s 后自动进入` : `AUTO-ENTER IN ${countdown}s`}</div>
          </div>

          {/* 左下角文件编号 */}
          <div style={{
            position: 'absolute', bottom: 28, left: 32,
            fontFamily: 'monospace', fontSize: 9,
            color: 'rgba(255,255,255,0.08)',
            letterSpacing: 1.5, pointerEvents: 'none',
            animation: 'fade-in 1s ease 0.8s forwards',
            opacity: 0,
          }}>
            {`DEEP-BLUE-${new Date().getFullYear()} · OPEN SOURCE INTELLIGENCE`}
          </div>
        </>
      )}

      {/* Act 1-3 的跳过提示（左下角小字）*/}
      {phase < 4 && phase >= 1 && (
        <div style={{
          position: 'absolute', bottom: 28, left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 9,
          color: 'rgba(255,255,255,0.12)',
          letterSpacing: 1.5,
          pointerEvents: 'none',
          animation: 'fade-in 1s ease 1s forwards',
          opacity: 0,
        }}>
          {zh ? '点击任意区域跳过 · CLICK TO SKIP' : 'CLICK ANYWHERE TO SKIP'}
        </div>
      )}
    </div>
  );
}

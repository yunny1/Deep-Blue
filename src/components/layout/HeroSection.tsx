'use client';
// src/components/layout/HeroSection.tsx
//
// 主页全屏英雄落地区 — "情报系统启动"视觉叙事
//
// 工作原理：
//   - 使用 sessionStorage 控制每次会话只显示一次，不会每次导航都弹出
//   - 分四个阶段渐进显示内容（系统启动文字 → 大标题 → CTA → 自动消退）
//   - 悬浮在最顶层（z-index: 200），Cesium 在背后正常加载，消退后无缝衔接
//   - 纯 CSS animation，无额外依赖
//
// 设计逻辑：
//   - Cesium 地球本来就需要 3-5 秒加载，这个英雄区把等待时间转化为叙事时间
//   - 4.5 秒自动消退，用户也可以随时点击"进入系统"立即跳过
//   - 背景网格 + 扫光线条传递"情报系统扫描"的视觉语言

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '@/lib/i18n';

// 各阶段从挂载起开始计时（毫秒）
const T_BOOT    = 400;   // 开机状态文字出现
const T_TITLE   = 1400;  // 大标题浮现
const T_CTA     = 2400;  // 按钮和统计出现
const T_AUTO    = 4800;  // 自动消退触发

export default function HeroSection() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  const [visible,   setVisible]   = useState(false);
  const [phase,     setPhase]     = useState(0);   // 1=boot 2=title 3=cta 4=fading
  const [countdown, setCountdown] = useState(3);
  const [docId,     setDocId]     = useState('');

  // 生成当天的"文件编号"——纯装饰，传递情报文件的视觉语言
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setDocId(`INTEL-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-DB`);
  }, []);

  const dismiss = useCallback(() => {
    setPhase(4);
    // 0.6s 消退动画后真正卸载，并记录到 sessionStorage 避免重复显示
    setTimeout(() => {
      setVisible(false);
      try { sessionStorage.setItem('db-hero-seen', '1'); } catch {}
    }, 600);
  }, []);

  useEffect(() => {
    // 每次浏览器 tab 会话只显示一次
    try { if (sessionStorage.getItem('db-hero-seen')) return; } catch {}

    setVisible(true);
    const timers = [
      setTimeout(() => setPhase(1), T_BOOT),
      setTimeout(() => setPhase(2), T_TITLE),
      setTimeout(() => setPhase(3), T_CTA),
      setTimeout(() => dismiss(),   T_AUTO),
      // 倒计时数字：3 → 2 → 1
      setTimeout(() => setCountdown(2), T_AUTO - 2000),
      setTimeout(() => setCountdown(1), T_AUTO - 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [dismiss]);

  if (!visible) return null;

  const fading = phase === 4;

  return (
    <div
      onClick={dismiss}  // 点击任意区域也可以跳过
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: '#05080A',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px',
        cursor: 'pointer',
        // 主消退动画
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.6s ease',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        userSelect: 'none',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=DM+Sans:wght@400;500;600&display=swap');

        /* 内容淡入上浮 */
        @keyframes db-up {
          from { opacity:0; transform:translateY(20px); }
          to   { opacity:1; transform:translateY(0); }
        }
        /* 纯淡入 */
        @keyframes db-in {
          from { opacity:0; }
          to   { opacity:1; }
        }
        /* 扫光从左到右 */
        @keyframes db-scan {
          0%   { left: -4px; }
          100% { left: 100vw; }
        }
        /* 进度条 */
        @keyframes db-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
        /* 小圆点呼吸 */
        @keyframes db-pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.25; }
        }
      `}</style>

      {/* ── 背景装饰层 ────────────────────────────────────────────── */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>

        {/* 细网格：传递"坐标系/监控网络"感 */}
        <div style={{
          position:'absolute', inset:0,
          backgroundImage:
            'linear-gradient(rgba(42,157,143,0.045) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(42,157,143,0.045) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

        {/* 角落渐变：聚焦中央 */}
        <div style={{
          position:'absolute', inset:0,
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, #05080A 100%)',
        }} />

        {/* 扫光线：系统扫描感 */}
        {phase >= 1 && (
          <div style={{
            position:'absolute', top:0, bottom:0, width:3,
            background: 'linear-gradient(180deg, transparent 0%, rgba(42,157,143,0.35) 50%, transparent 100%)',
            animation: 'db-scan 3.5s linear infinite',
          }} />
        )}
      </div>

      {/* ── 系统启动文字 ──────────────────────────────────────────── */}
      <div style={{
        fontFamily: 'monospace',
        fontSize: 11,
        color: 'rgba(42,157,143,0.65)',
        letterSpacing: 2.5,
        textTransform: 'uppercase',
        marginBottom: 52,
        textAlign: 'center',
        // Phase 1 触发淡入
        opacity: phase >= 1 ? 1 : 0,
        animation: phase >= 1 ? 'db-in 0.9s ease forwards' : 'none',
      }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ animation: 'db-pulse 1.6s ease infinite' }}>●</span>
          {' '}DEEP BLUE INTELLIGENCE SYSTEM
        </div>
        <div style={{
          color: 'rgba(42,157,143,0.3)',
          fontSize: 9,
          letterSpacing: 2,
          marginBottom: 14,
        }}>
          SUBMARINE CABLE NETWORK MONITOR · GLOBAL FEED ACTIVE
        </div>

        {/* 加载进度条——视觉上"确认系统正在启动" */}
        <div style={{
          height: 1,
          backgroundColor: 'rgba(42,157,143,0.12)',
          width: 280,
          margin: '0 auto',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            backgroundColor: '#2A9D8F',
            animation: phase >= 1
              ? `db-bar ${(T_AUTO - T_BOOT) / 1000}s linear forwards`
              : 'none',
          }} />
        </div>
      </div>

      {/* ── 主标题 ────────────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        maxWidth: 820,
        opacity: phase >= 2 ? 1 : 0,
        animation: phase >= 2
          ? 'db-up 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          : 'none',
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          // clamp: 手机 40px，宽屏最大 88px
          fontSize: 'clamp(40px, 7vw, 88px)',
          fontWeight: 800,
          color: '#F0E6C8',
          lineHeight: 1.08,
          margin: '0 0 20px',
          letterSpacing: '-0.02em',
        }}>
          {zh ? (
            <>谁控制着连接，<br />谁就控制着<em style={{ fontStyle:'italic', color:'#D4AF37' }}>信息流动</em></>
          ) : (
            <>Whoever controls<br />the connection,{' '}
              <em style={{ fontStyle:'italic', color:'#D4AF37' }}>controls the flow.</em>
            </>
          )}
        </h1>

        {/* 副标题：小字高对比度 */}
        <p style={{
          fontSize: 'clamp(12px, 1.4vw, 15px)',
          color: 'rgba(240,230,200,0.38)',
          fontWeight: 400,
          margin: 0,
          letterSpacing: '0.07em',
          lineHeight: 1.6,
        }}>
          {zh
            ? '全球 877 条海底光缆 · 实时主权情报 · AI 战略分析'
            : '877 cables monitored globally · Real-time sovereignty intelligence · AI-powered strategy'}
        </p>
      </div>

      {/* ── CTA 按钮区 ────────────────────────────────────────────── */}
      <div style={{
        marginTop: 52,
        display: 'flex', alignItems: 'center', gap: 24,
        opacity: phase >= 3 ? 1 : 0,
        animation: phase >= 3 ? 'db-up 0.7s ease forwards' : 'none',
      }}>
        <button
          onClick={e => { e.stopPropagation(); dismiss(); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '13px 32px',
            borderRadius: 3,
            backgroundColor: '#2A9D8F',
            border: 'none',
            color: '#05080A',
            fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 2,
            textTransform: 'uppercase',
            transition: 'background-color 0.2s',
            boxShadow: '0 0 24px rgba(42,157,143,0.3)',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3CC4B0')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2A9D8F')}
        >
          {zh ? '进入系统' : 'Enter System'} →
        </button>

        {/* 倒计时提示 */}
        <span style={{
          fontSize: 10,
          color: 'rgba(240,230,200,0.2)',
          fontFamily: 'monospace',
          letterSpacing: 1.5,
        }}>
          {zh ? `${countdown}s 后自动进入` : `AUTO-ENTER IN ${countdown}s`}
        </span>
      </div>

      {/* ── 底部角标（文件编号）────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 24, right: 32,
        fontSize: 9,
        color: 'rgba(255,255,255,0.08)',
        fontFamily: 'monospace',
        letterSpacing: 1.5,
        opacity: phase >= 3 ? 1 : 0,
        animation: phase >= 3 ? 'db-in 1s ease forwards' : 'none',
      }}>
        {docId} · UNCLASSIFIED · OPEN SOURCE INTELLIGENCE
      </div>

      {/* ── 左下角提示"点击任意区域跳过" ─────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 24, left: 32,
        fontSize: 9,
        color: 'rgba(255,255,255,0.12)',
        fontFamily: 'monospace',
        letterSpacing: 1,
        opacity: phase >= 3 ? 1 : 0,
        animation: phase >= 3 ? 'db-in 1s ease forwards' : 'none',
      }}>
        {zh ? '点击任意区域跳过' : 'CLICK ANYWHERE TO SKIP'}
      </div>
    </div>
  );
}

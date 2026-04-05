'use client';
// src/components/layout/SubPageHeader.tsx
//
// 子页面统一头部组件 — Phase 1 视觉升级
//
// 变化：
//   · 标题字号从 clamp(24px,3.5vw,40px) 升级到 clamp(32px,4.5vw,56px)
//   · 主文字从纯白 #EDF2F7 换为奶油暖白 #F0E6C8（整站温度感统一）
//   · 背景暗化并轻微暖化，更接近"情报文件"深色调
//   · 标题下方新增"文件编号行"：日期 + 标识符，等宽字体，极低对比度
//   · 语言切换机制保持不变：通过 useTranslation context 全页面生效

import { useEffect, useState } from 'react';
import { useTranslation, type Locale } from '@/lib/i18n';

interface SubPageHeaderProps {
  badgeZh: string;
  badgeEn: string;
  titleZh: string;
  titleEn: string;
}

export default function SubPageHeader({ badgeZh, badgeEn, titleZh, titleEn }: SubPageHeaderProps) {
  const { locale, setLocale } = useTranslation();
  const zh = locale === 'zh';

  // 动态生成"文件编号"行：纯装饰，传递情报文件的视觉语言
  const [docRef, setDocRef] = useState('');
  useEffect(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setDocRef(
      `DB-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())} · DEEP BLUE INTELLIGENCE · OPEN SOURCE`
    );
  }, []);

  const handleToggle = () => {
    const next: Locale = zh ? 'en' : 'zh';
    // 1. 更新 React context → 触发所有 useTranslation() 消费者重新渲染
    setLocale(next);
    // 2. 写 localStorage → 供不能用 hook 的地图组件读取
    localStorage.setItem('deep-blue-locale', next);
    // 3. 广播事件 → 通知 CesiumGlobe / MapLibre2D / BRICSMap 刷新标注
    window.dispatchEvent(new Event('deep-blue-locale-changed'));
  };

  return (
    <div style={{
      // 背景比原来更深、微暖，营造"情报文件"的深色感
      backgroundColor: 'rgba(5, 8, 12, 0.99)',
      borderBottom: '1px solid rgba(42,157,143,0.12)',
      padding: '32px 32px 28px',
    }}>

      {/* 顶部操作栏：badge 左，返回地图 + 语言切换 右 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>

        {/* Badge：dot + 标签，配色与正文的奶油色呼应 */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 9,
          padding: '6px 16px', borderRadius: 20,
          background: 'rgba(42,157,143,0.07)',
          border: '1px solid rgba(42,157,143,0.18)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#2A9D8F',
            boxShadow: '0 0 8px rgba(42,157,143,0.65)',
            display: 'inline-block',
            // 呼吸动效：表示"系统在线"
            animation: 'subhdr-pulse 2.4s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 10, color: 'rgba(42,157,143,0.85)',
            letterSpacing: '.12em', textTransform: 'uppercase' as const,
            fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            {zh ? badgeZh : badgeEn}
          </span>
        </div>

        {/* 右侧操作区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 20,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(240,230,200,0.6)',
            fontSize: 12, fontWeight: 500,
            textDecoration: 'none', transition: 'all 0.18s',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            letterSpacing: '0.03em',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
              e.currentTarget.style.color = 'rgba(240,230,200,0.85)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'rgba(240,230,200,0.6)';
            }}
          >
            ← {zh ? '返回地图' : 'Back to Map'}
          </a>
          <button
            onClick={handleToggle}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
              background: 'rgba(42,157,143,0.09)',
              border: '1px solid rgba(42,157,143,0.25)',
              color: '#2A9D8F',
              fontSize: 12, fontWeight: 600,
              transition: 'all 0.18s',
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,157,143,0.18)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,157,143,0.09)';
            }}
          >
            {zh ? '🌐 EN' : '🌐 中文'}
          </button>
        </div>
      </div>

      {/* 页面大标题：字号大幅提升，奶油暖白 */}
      <h1 style={{
        fontFamily: "'Playfair Display', 'Georgia', serif",
        // clamp：手机 32px，宽屏最大 56px
        fontSize: 'clamp(32px, 4.5vw, 56px)',
        fontWeight: 800,
        // 奶油暖白代替纯白，全站温度感统一
        color: '#F0E6C8',
        margin: '0 0 10px',
        lineHeight: 1.08,
        letterSpacing: '-0.02em',
      }}>
        {zh ? titleZh : titleEn}
      </h1>

      {/* 文件编号行：等宽字体，极低对比度，装饰性 */}
      {docRef && (
        <div style={{
          fontFamily: 'monospace',
          fontSize: 9,
          color: 'rgba(240,230,200,0.12)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          marginTop: 2,
        }}>
          {docRef}
        </div>
      )}

      {/* badge 呼吸动效的全局 keyframe */}
      <style>{`
        @keyframes subhdr-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 8px rgba(42,157,143,0.65); }
          50%       { opacity:0.5; box-shadow: 0 0 4px rgba(42,157,143,0.2); }
        }
      `}</style>
    </div>
  );
}

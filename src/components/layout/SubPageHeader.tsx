'use client';
// src/components/layout/SubPageHeader.tsx
// 分析工具子页面的统一头部组件
// 设计参考自主权网络 header 风格：badge 左、返回地图 + 语言切换 右、大标题 h1
// 无五色条（仅 BRICS 战略页面有五色条）

import { useState, useCallback } from 'react';

interface SubPageHeaderProps {
  badgeZh: string;
  badgeEn: string;
  titleZh: string;
  titleEn: string;
}

export default function SubPageHeader({ badgeZh, badgeEn, titleZh, titleEn }: SubPageHeaderProps) {
  // 独立语言状态：读 localStorage 初始值，toggle 时写回并广播给 I18nProvider
  // 与 SovereignNetworkAtlas / BRICSDashboard 保持完全一致的模式
  const [isZh, setIsZh] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? (localStorage.getItem('deep-blue-locale') ?? 'zh') === 'zh'
      : true
  );

  const toggleLang = useCallback(() => {
    setIsZh(prev => {
      const next = !prev;
      localStorage.setItem('deep-blue-locale', next ? 'zh' : 'en');
      // 广播给页面内其他监听语言变化的组件（含 I18nProvider）
      window.dispatchEvent(new Event('deep-blue-locale-changed'));
      return next;
    });
  }, []);

  return (
    <div style={{
      backgroundColor: 'rgba(10,17,34,0.98)',
      borderBottom: '1px solid rgba(42,157,143,0.15)',
      padding: '28px 32px 24px',
    }}>
      {/* 顶部一行：badge 左，返回地图 + 语言切换 右 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 20,
          background: 'rgba(42,157,143,0.08)', border: '1px solid rgba(42,157,143,0.2)',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: '#2A9D8F', boxShadow: '0 0 8px rgba(42,157,143,0.7)',
            display: 'inline-block',
          }} />
          <span style={{
            fontSize: 11, color: '#2A9D8F',
            letterSpacing: '.1em', textTransform: 'uppercase' as const, fontWeight: 600,
          }}>
            {isZh ? badgeZh : badgeEn}
          </span>
        </div>

        {/* 右侧操作区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 20,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500,
            textDecoration: 'none', transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            ← {isZh ? '返回地图' : 'Back to Map'}
          </a>
          <button
            onClick={toggleLang}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              background: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.3)',
              color: '#2A9D8F', fontSize: 12, fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,157,143,0.18)')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(42,157,143,0.1)')}
          >
            {isZh ? '🌐 EN' : '🌐 中文'}
          </button>
        </div>
      </div>

      {/* 页面大标题 */}
      <h1 style={{
        fontSize: 'clamp(24px,3.5vw,40px)', fontWeight: 800,
        color: '#EDF2F7', margin: 0, lineHeight: 1.1,
        fontFamily: "'Playfair Display', 'Georgia', serif",
      }}>
        {isZh ? titleZh : titleEn}
      </h1>
    </div>
  );
}

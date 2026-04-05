'use client';
// src/components/layout/SubPageHeader.tsx
// 分析工具子页面的统一头部组件
// 语言切换机制与 LangSwitcher 完全一致：
//   - 通过 useTranslation() 拿 locale + setLocale（更新 I18nProvider context）
//   - 额外写 localStorage + 派发事件，通知地图组件（CesiumGlobe / MapLibre2D 等）
//   - 这样页面内所有用 useTranslation() 的组件都会随 context 更新而重新渲染

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

  const handleToggle = () => {
    const next: Locale = zh ? 'en' : 'zh';
    // 1. 更新 React context → 触发所有 useTranslation() 消费者重新渲染
    setLocale(next);
    // 2. 写 localStorage → 供不能用 hook 的地图组件读取（与 LangSwitcher 保持一致）
    localStorage.setItem('deep-blue-locale', next);
    // 3. 派发事件 → 通知 CesiumGlobe / MapLibre2D / BRICSMap 刷新标注
    window.dispatchEvent(new Event('deep-blue-locale-changed'));
  };

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
            {zh ? badgeZh : badgeEn}
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
            ← {zh ? '返回地图' : 'Back to Map'}
          </a>
          <button
            onClick={handleToggle}
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
            {zh ? '🌐 EN' : '🌐 中文'}
          </button>
        </div>
      </div>

      {/* 页面大标题 */}
      <h1 style={{
        fontSize: 'clamp(24px,3.5vw,40px)', fontWeight: 800,
        color: '#EDF2F7', margin: 0, lineHeight: 1.1,
        fontFamily: "'Playfair Display', 'Georgia', serif",
      }}>
        {zh ? titleZh : titleEn}
      </h1>
    </div>
  );
}

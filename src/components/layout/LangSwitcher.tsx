// src/components/layout/LangSwitcher.tsx
// 语言切换按钮 — 一键切换中英文
// 显示在导航栏中，当前语言高亮

'use client';

import { useTranslation, type Locale } from '@/lib/i18n';

export default function LangSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <div style={{
      display: 'flex', gap: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      borderRadius: 6, padding: 2,
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      <button
        onClick={() => setLocale('en')}
        style={{
          padding: '4px 8px', fontSize: 11, fontWeight: 600,
          borderRadius: 4, border: 'none', cursor: 'pointer',
          transition: 'all 0.2s',
          backgroundColor: locale === 'en' ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
          color: locale === 'en' ? '#2A9D8F' : '#6B7280',
        }}
      >
        EN
      </button>
      <button
        onClick={() => setLocale('zh')}
        style={{
          padding: '4px 8px', fontSize: 11, fontWeight: 600,
          borderRadius: 4, border: 'none', cursor: 'pointer',
          transition: 'all 0.2s',
          backgroundColor: locale === 'zh' ? 'rgba(42, 157, 143, 0.25)' : 'transparent',
          color: locale === 'zh' ? '#2A9D8F' : '#6B7280',
        }}
      >
        中文
      </button>
    </div>
  );
}

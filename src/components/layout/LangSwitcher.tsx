// src/components/layout/LangSwitcher.tsx
// 语言切换按钮 — 一键切换中英文
// 修复：切换时同时向地图组件广播 'deep-blue-locale-changed' 事件
// 地图组件（MapLibre2D / CesiumGlobe / BRICSMap）监听此事件来刷新标注文字

'use client';

import { useTranslation, type Locale } from '@/lib/i18n';

export default function LangSwitcher() {
  const { locale, setLocale } = useTranslation();

  const handleSwitch = (newLocale: Locale) => {
    // 1. 更新 React 上下文（影响所有用 useTranslation 的 UI 组件）
    setLocale(newLocale);

    // 2. 同步写入 localStorage（地图组件从这里读取，因为它们不能用 hook）
    //    注意：如果 setLocale 内部已经写了 localStorage，这行是幂等的，无害
    localStorage.setItem('deep-blue-locale', newLocale);

    // 3. 广播自定义事件，通知所有动态加载的地图组件刷新标注
    //    MapLibre2D、CesiumGlobe、BRICSMap 都在监听这个事件
    window.dispatchEvent(new Event('deep-blue-locale-changed'));
  };

  return (
    <div style={{
      display: 'flex', gap: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      borderRadius: 6, padding: 2,
      border: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      <button
        onClick={() => handleSwitch('en')}
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
        onClick={() => handleSwitch('zh')}
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

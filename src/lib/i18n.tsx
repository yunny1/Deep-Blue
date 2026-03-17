// src/lib/i18n.tsx
// 轻量级国际化系统 — 基于React Context，无需复杂的路由配置
// 支持中英文切换，翻译文件存储在 src/i18n/ 目录下
// 使用方式：const { t, locale, setLocale } = useTranslation();

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from '@/i18n/en.json';
import zh from '@/i18n/zh.json';

// 支持的语言
export type Locale = 'en' | 'zh';

// 翻译字典类型
type TranslationDict = typeof en;

const dictionaries: Record<Locale, TranslationDict> = { en, zh };

// 语言名称映射（用于显示）
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
};

// Context 类型
interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

// 深度获取嵌套对象的值（支持 "nav.title" 这样的点号路径）
function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) return undefined;
    current = current[key];
  }
  return typeof current === 'string' ? current : undefined;
}

// Provider 组件
export function I18nProvider({ children }: { children: React.ReactNode }) {
  // 从localStorage读取上次选择的语言，默认英文
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  // 挂载后再读取保存的语言，避免服务端/客户端渲染不匹配
  useEffect(() => {
    const saved = localStorage.getItem('deep-blue-locale') as Locale;
    if (saved && dictionaries[saved]) {
      setLocaleState(saved);
    } else {
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('zh')) {
        setLocaleState('zh');
      }
    }
    setMounted(true);
  }, []);

  // 切换语言时保存到localStorage
  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('deep-blue-locale', newLocale);
    // 同时更新HTML的lang属性
    document.documentElement.lang = newLocale;
  }, []);

  // 翻译函数
  // 支持参数替换：t('earthquake.cablesNear', { count: 5 }) → "5 条海缆位于地震影响范围内"
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[locale];
    let value = getNestedValue(dict, key);

    // 如果当前语言找不到，回退到英文
    if (value === undefined) {
      value = getNestedValue(dictionaries.en, key);
    }

    // 如果还找不到，返回key本身
    if (value === undefined) return key;

    // 参数替换：把 {count} 替换为实际值
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
    }

    return value;
  }, [locale]);

  // 挂载前用一个空的占位，避免服务端/客户端渲染不匹配
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: 'en', setLocale, t }}>
        <div suppressHydrationWarning>{children}</div>
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// Hook
export function useTranslation() {
  return useContext(I18nContext);
}

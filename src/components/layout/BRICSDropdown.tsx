'use client';
// src/components/layout/BRICSDropdown.tsx
// 合并入口：金砖五色图标 → 下拉展开"战略分析"和"自主权网络"两个入口
// 替代原来的 AnalysisMenu + BRICSNavButton + sovereign-network 链接三件套

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

// BRICS 五国色，与 SovereignNetworkAtlas 的 FLAGS 保持一致
const BRICS_COLORS = ['#0066B3', '#D32F2F', '#FFC107', '#388E3C', '#F57C00'];

const ITEMS = [
  {
    href: '/brics',
    icon: '📊',
    labelZh: '战略分析',
    labelEn: 'Strategic Analysis',
    descZh: '金砖主权安全评分与路径分析',
    descEn: 'BRICS sovereignty scoring & path analysis',
  },
  {
    href: '/sovereign-network',
    icon: '🌐',
    labelZh: '自主权网络',
    labelEn: 'Sovereign Network',
    descZh: '金砖可用通信路径图谱',
    descEn: 'BRICS communication path atlas',
  },
];

export default function BRICSDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  // 点击外部关闭
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>

      {/* 触发按钮：五色点阵 + 标签 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6,
          border: `1px solid ${isOpen ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'}`,
          backgroundColor: isOpen ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)',
          color: isOpen ? '#D4AF37' : '#9CA3AF',
          cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.2s',
        }}
      >
        {/* 五色点阵 */}
        <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {BRICS_COLORS.map(c => (
            <span key={c} style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: c }} />
          ))}
        </span>
        {zh ? '金砖分析' : 'BRICS'}
        <span style={{ fontSize: 8 }}>▾</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          backgroundColor: 'rgba(13,27,42,0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10,
          width: 220, zIndex: 200, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* 顶部五色装饰条 */}
          <div style={{ display: 'flex', height: 3 }}>
            {BRICS_COLORS.map(c => <div key={c} style={{ flex: 1, backgroundColor: c }} />)}
          </div>

          {ITEMS.map(item => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', textDecoration: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                transition: 'background-color 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(212,175,55,0.08)')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 12, color: '#EDF2F7', fontWeight: 500 }}>
                  {zh ? item.labelZh : item.labelEn}
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                  {zh ? item.descZh : item.descEn}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

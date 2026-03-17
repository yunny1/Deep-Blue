// src/components/layout/AnalysisMenu.tsx
// 高级分析工具菜单 — 导航栏中的下拉菜单
// 链接到海缆对比、断缆模拟、网络拓扑等分析页面

'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

const TOOLS = [
  { href: '/compare', icon: '⚖️', labelEn: 'Cable Comparison', labelZh: '海缆对比', descEn: 'Side-by-side analysis', descZh: '并排对比两条海缆' },
  { href: '/simulate', icon: '⚡', labelEn: 'Outage Simulator', labelZh: '断缆模拟', descEn: 'Simulate cable failure impact', descZh: '模拟海缆断裂后的影响' },
  { href: '/topology', icon: '🌐', labelEn: 'Network Topology', labelZh: '网络拓扑', descEn: 'Abstract connectivity graph', descZh: '国家间连接关系图' },
];

export default function AnalysisMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { locale } = useTranslation();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '5px 10px', borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.1)',
        backgroundColor: isOpen ? 'rgba(42,157,143,0.12)' : 'rgba(255,255,255,0.04)',
        color: isOpen ? '#2A9D8F' : '#9CA3AF',
        cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.2s',
      }}>
        📊 {locale === 'zh' ? '分析工具' : 'Analysis'} <span style={{ fontSize: 8, marginLeft: 2 }}>▾</span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          backgroundColor: 'rgba(13, 27, 42, 0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(42, 157, 143, 0.2)', borderRadius: 10,
          width: 220, zIndex: 200, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}>
          {TOOLS.map(tool => (
            <a key={tool.href} href={tool.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', textDecoration: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                transition: 'background-color 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.08)')}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => setIsOpen(false)}>
              <span style={{ fontSize: 18 }}>{tool.icon}</span>
              <div>
                <div style={{ fontSize: 12, color: '#EDF2F7', fontWeight: 500 }}>
                  {locale === 'zh' ? tool.labelZh : tool.labelEn}
                </div>
                <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                  {locale === 'zh' ? tool.descZh : tool.descEn}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

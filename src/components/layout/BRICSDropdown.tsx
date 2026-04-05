'use client';
// src/components/layout/BRICSDropdown.tsx
// 金砖五色图标 → 分组下拉菜单
// 分组一：金砖战略（仪表盘 + 自主权网络）
// 分组二：分析工具（恢复原 AnalysisMenu 的四个入口）

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

const BRICS_COLORS = ['#0066B3', '#D32F2F', '#FFC107', '#388E3C', '#F57C00'];

// 分组一：金砖战略页面
const BRICS_ITEMS = [
  {
    href: '/brics',
    icon: '📊',
    labelZh: '战略分析',
    labelEn: 'Strategic Analysis',
    descZh: '主权评分、缺口分析与投资机会',
    descEn: 'Sovereignty scoring, gap & investment analysis',
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

// 分组二：分析工具（原 AnalysisMenu 的四个入口，保持不变）
const TOOL_ITEMS = [
  {
    href: '/compare',
    icon: '⚖️',
    labelZh: '海缆对比',
    labelEn: 'Cable Comparison',
    descZh: '并排对比两条海缆',
    descEn: 'Side-by-side analysis',
  },
  {
    href: '/simulate',
    icon: '⚡',
    labelZh: '断缆模拟',
    labelEn: 'Outage Simulator',
    descZh: '模拟断缆后的影响',
    descEn: 'Simulate cable failure impact',
  },
  {
    href: '/topology',
    icon: '🕸️',
    labelZh: '网络拓扑',
    labelEn: 'Network Topology',
    descZh: '国家间连接关系图',
    descEn: 'Abstract connectivity graph',
  },
  {
    href: '/country',
    icon: '🌏',
    labelZh: '国家分析',
    labelEn: 'Country Analysis',
    descZh: '按国家查看海缆并导出',
    descEn: 'Cables by country with export',
  },
];

function MenuItem({ item, zh, onClose }: { item: typeof BRICS_ITEMS[0]; zh: boolean; onClose: () => void }) {
  return (
    <a
      href={item.href}
      onClick={onClose}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', textDecoration: 'none',
        transition: 'background-color 0.15s',
      }}
      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(212,175,55,0.08)')}
      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <span style={{ fontSize: 16 }}>{item.icon}</span>
      <div>
        <div style={{ fontSize: 12, color: '#EDF2F7', fontWeight: 500 }}>
          {zh ? item.labelZh : item.labelEn}
        </div>
        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
          {zh ? item.descZh : item.descEn}
        </div>
      </div>
    </a>
  );
}

export default function BRICSDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const close = () => setIsOpen(false);

  return (
    <div ref={ref} style={{ position: 'relative' }}>

      {/* 触发按钮：仅五色点阵，无文字 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={zh ? '金砖分析 & 工具' : 'BRICS Analysis & Tools'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '5px 8px', borderRadius: 6,
          border: `1px solid ${isOpen ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)'}`,
          backgroundColor: isOpen ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.04)',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        {BRICS_COLORS.map(c => (
          <span key={c} style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: c, display: 'block' }} />
        ))}
        <span style={{ fontSize: 8, color: isOpen ? '#D4AF37' : '#9CA3AF', marginLeft: 2 }}>▾</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6,
          backgroundColor: 'rgba(13,27,42,0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10,
          width: 230, zIndex: 200, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* 顶部五色装饰条 */}
          <div style={{ display: 'flex', height: 3 }}>
            {BRICS_COLORS.map(c => <div key={c} style={{ flex: 1, backgroundColor: c }} />)}
          </div>

          {/* 分组一：金砖战略 */}
          <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#6B7280', letterSpacing: 1, textTransform: 'uppercase' }}>
            {zh ? '金砖战略' : 'BRICS Strategy'}
          </div>
          {BRICS_ITEMS.map(item => <MenuItem key={item.href} item={item} zh={zh} onClose={close} />)}

          {/* 分隔线 */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />

          {/* 分组二：分析工具 */}
          <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, color: '#6B7280', letterSpacing: 1, textTransform: 'uppercase' }}>
            {zh ? '分析工具' : 'Analysis Tools'}
          </div>
          {TOOL_ITEMS.map(item => <MenuItem key={item.href} item={item} zh={zh} onClose={close} />)}

          <div style={{ height: 6 }} />
        </div>
      )}
    </div>
  );
}

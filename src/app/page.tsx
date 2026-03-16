// src/app/page.tsx
// Deep Blue 首页 - 整合3D地球 + 悬停卡片 + 详情面板 + 导航栏 + 统计
// 这是用户看到的主页面

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import HoverCard from '@/components/panels/HoverCard';
import CableDetailPanel from '@/components/panels/CableDetailPanel';
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';
import SearchBox from '@/components/layout/SearchBox';

// 动态导入CesiumGlobe（禁用SSR）
const CesiumGlobe = dynamic(
  () => import('@/components/map/CesiumGlobe'),
  { ssr: false }
);

// 统计数据类型
interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { setSelectedCable, selectedCableId } = useMapStore();

  // 悬停卡片状态
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // 获取统计数据
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(console.error);
  }, []);

  // 悬停回调
  const handleHover = useCallback((cable: CableHoverInfo | null, position: { x: number; y: number }) => {
    setHoverCable(cable);
    setHoverPos(position);
  }, []);

  // 点击回调
  const handleClick = useCallback((cableSlug: string | null) => {
    setSelectedCable(cableSlug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 顶部导航栏 ═══ */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 56,
        backgroundColor: 'rgba(13, 27, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42, 157, 143, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1E6091, #2A9D8F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: 'white',
          }}>
            DB
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Submarine Cable Intelligence
            </div>
          </div>
        </div>

        {/* 搜索框 */}
         <SearchBox />

        {/* 右侧统计 */}
        <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
          {stats ? (
            <>
              <StatBadge number={stats.cables.inService} label="In Service" color="#06D6A0" />
              <StatBadge number={stats.cables.underConstruction} label="Building" color="#E9C46A" />
              <StatBadge number={stats.cables.planned} label="Planned" color="#3B82F6" />
              <StatBadge number={stats.landingStations} label="Stations" color="#2A9D8F" />
            </>
          ) : (
            <span style={{ color: '#6B7280' }}>Loading...</span>
          )}
        </div>
      </nav>

      {/* ═══ 3D地球（带交互） ═══ */}
      <CesiumGlobe
        onHover={handleHover}
        onClick={handleClick}
      />

      {/* ═══ 悬停预览卡片 ═══ */}
      <HoverCard cable={hoverCable} position={hoverPos} />

      {/* ═══ 右侧详情面板 ═══ */}
      <CableDetailPanel />
    </div>
  );
}

// 导航栏中的统计徽章组件
function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>
        {number}
      </div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

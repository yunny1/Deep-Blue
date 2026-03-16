// src/app/page.tsx
// Deep Blue 首页 — Phase 1 完整版
// 整合：3D/2D地图切换 + 搜索 + 悬停卡片 + 详情面板 + 颜色控制 + 过滤 + 响应式

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import HoverCard from '@/components/panels/HoverCard';
import CableDetailPanel from '@/components/panels/CableDetailPanel';
import ColorControlPanel from '@/components/panels/ColorControlPanel';
import FilterPanel from '@/components/panels/FilterPanel';
import SearchBox from '@/components/layout/SearchBox';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';

// 动态导入两个地图组件（都禁用SSR）
const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D = dynamic(() => import('@/components/map/MapLibre2D'), { ssr: false });

interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { viewMode, setSelectedCable } = useMapStore();
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  // 检测窗口宽度（用于响应式布局）
  const [windowWidth, setWindowWidth] = useState(1280);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isTablet = windowWidth >= 768 && windowWidth < 1280;

  // 获取统计数据
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const handleHover = useCallback((cable: CableHoverInfo | null, position: { x: number; y: number }) => {
    // 移动端不显示悬停卡片（没有鼠标悬停的概念）
    if (isMobile) return;
    setHoverCable(cable);
    setHoverPos(position);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
    setSelectedCable(slug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 顶部导航栏 ═══ */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13, 27, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42, 157, 143, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px', zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          <div style={{
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1E6091, #2A9D8F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? 11 : 14, fontWeight: 700, color: 'white',
          }}>DB</div>
          <div>
            <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            {!isMobile && (
              <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
                Submarine Cable Intelligence
              </div>
            )}
          </div>
        </div>

        {/* 搜索框（移动端隐藏，用户可以通过其他方式搜索） */}
        {!isMobile && <SearchBox />}

        {/* 右侧统计（平板和移动端精简） */}
        <div style={{ display: 'flex', gap: isMobile ? 12 : 24, fontSize: 12 }}>
          {stats ? (
            <>
              <StatBadge number={stats.cables.total} label={isMobile ? 'Total' : 'Cables'} color="#2A9D8F" />
              {!isMobile && (
                <>
                  <StatBadge number={stats.cables.inService} label="In Service" color="#06D6A0" />
                  <StatBadge number={stats.cables.underConstruction} label="Building" color="#E9C46A" />
                </>
              )}
              <StatBadge number={stats.landingStations} label="Stations" color="#2A9D8F" />
            </>
          ) : <span style={{ color: '#6B7280' }}>Loading...</span>}
        </div>
      </nav>

      {/* ═══ 地图区域（根据viewMode显示3D或2D） ═══ */}
      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      {/* ═══ 3D/2D 切换按钮（右上角） ═══ */}
      <ViewModeToggle />

      {/* ═══ 左侧面板区域（桌面端显示） ═══ */}
      {!isMobile && (
        <>
          <ColorControlPanel />
          <FilterPanel />
        </>
      )}

      {/* ═══ 悬停卡片（桌面端显示） ═══ */}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      {/* ═══ 详情面板 ═══ */}
      <CableDetailPanel />

      {/* ═══ 移动端底部搜索栏（替代顶部搜索框） ═══ */}
      {isMobile && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: 'rgba(13, 27, 42, 0.95)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(42, 157, 143, 0.2)',
          padding: '8px 12px', zIndex: 50,
        }}>
          <SearchBox />
        </div>
      )}
    </div>
  );
}

// 导航栏统计徽章
function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

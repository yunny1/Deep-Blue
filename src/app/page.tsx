// src/app/page.tsx
// Deep Blue 首页 — 最终版
// 导航栏用CSS Grid三列：左Logo固定 | 中搜索固定 | 右工具+统计固定
// 三列互不干扰，任何屏幕宽度都不会重叠

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import HoverCard from '@/components/panels/HoverCard';
import CableDetailPanel from '@/components/panels/CableDetailPanel';
import ColorControlPanel from '@/components/panels/ColorControlPanel';
import FilterPanel from '@/components/panels/FilterPanel';
import EarthquakePanel from '@/components/panels/EarthquakePanel';
import AiIntelPanel from '@/components/panels/AiIntelPanel';
import NewsTicker from '@/components/dashboard/NewsTicker';
import SearchBox from '@/components/layout/SearchBox';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import AiToggle from '@/components/layout/AiToggle';
import LangSwitcher from '@/components/layout/LangSwitcher';
import AnalysisMenu from '@/components/layout/AnalysisMenu';
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';
import InternetHealthIndicator from '@/components/layout/InternetHealthIndicator';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D = dynamic(() => import('@/components/map/MapLibre2D'), { ssr: false });

interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

function HomeContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { viewMode, setSelectedCable } = useMapStore();
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const { t, locale } = useTranslation();

  const [windowWidth, setWindowWidth] = useState(1280);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const handleHover = useCallback((cable: CableHoverInfo | null, pos: { x: number; y: number }) => {
    if (isMobile) return;
    setHoverCable(cable); setHoverPos(pos);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
    setSelectedCable(slug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 导航栏：CSS Grid 三列，互不干扰 ═══ */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isMobile ? 48 : 52,
        backgroundColor: 'rgba(13, 27, 42, 0.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42, 157, 143, 0.15)',
        zIndex: 50,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr auto' : 'auto 1fr auto',
        alignItems: 'center',
        padding: isMobile ? '0 12px' : '0 16px',
        gap: 12,
      }}>
        {/* 第一列：Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/icons/deep-blue-icon.png" alt="Deep Blue" style={{ width: 28, height: 28, borderRadius: 5 }} />
          {!isMobile && <span style={{ fontSize: 14, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>}
        </div>

        {/* 第二列：搜索框居中（占据中间所有剩余空间，但搜索框自身max-width限制） */}
        {!isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 320 }}>
              <SearchBox />
            </div>
          </div>
        )}

        {/* 第三列：工具按钮 + 统计 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
          {!isMobile && (
            <>
              <AiToggle />
              <AnalysisMenu />
              <LangSwitcher />
              <div style={{ width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 2px' }} />
            </>
          )}
          {stats && stats.cables ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14 }}>
              <MiniStat value={stats.cables.total || 0} label={t('nav.cables')} color="#2A9D8F" />
              {!isMobile && <MiniStat value={stats.cables.inService || 0} label={t('nav.inService')} color="#06D6A0" />}
              {!isMobile && <MiniStat value={stats.landingStations || 0} label={t('nav.stations')} color="#3B82F6" />}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: '#6B7280' }}>...</span>
          )}
        </div>
      </nav>

      {/* ═══ 新闻滚动条 ═══ */}
      {!isMobile && <NewsTicker />}

      {/* ═══ 地图 ═══ */}
      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      {/* ═══ 3D/2D切换 ═══ */}
      <ViewModeToggle />

      {/* ═══ 左侧面板 ═══ */}
      {!isMobile && (
        <>
          <ColorControlPanel />
          <FilterPanel />
        </>
      )}

      {/* ═══ AI情报面板 ═══ */}
      {!isMobile && (
        <div style={{ position: 'absolute', top: 92, right: 16, zIndex: 41 }}>
          <InternetHealthIndicator locale={locale} />
        </div>
      )}
      {!isMobile && <AiIntelPanel />}

      {/* ═══ 地震预警面板 ═══ */}
      <EarthquakePanel />

      {/* ═══ 悬停卡片 ═══ */}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      {/* ═══ 详情面板 ═══ */}
      <CableDetailPanel />

      {/* ═══ 移动端底部搜索 ═══ */}
      {isMobile && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: 'rgba(13, 27, 42, 0.95)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(42, 157, 143, 0.2)',
          padding: '8px 12px', zIndex: 50,
        }}>
          <SearchBox />
        </div>
      )}

      {/* ═══ 署名 ═══ */}
      <div style={{ position: 'absolute', bottom: 4, right: 16, fontSize: 10, color: '#3D5A80', zIndex: 10 }}>
        by Jiangyun
      </div>
    </div>
  );
}

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', lineHeight: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 8, color: '#6B7280', marginTop: 1 }}>{label}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  );
}

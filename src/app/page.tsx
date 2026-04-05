// src/app/page.tsx
// 改动（相对上一版本）：
// 1. 自主权网络按钮：移除独立 fontFamily 覆盖，与导航栏其他按钮字体一致
// 2. 自主权网络按钮：根据 locale 显示中英文（Sovereign Network / 自主权网络）
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import HoverCard from '@/components/panels/HoverCard';
import CableDetailPanel from '@/components/panels/CableDetailPanel';
import ColorControlPanel from '@/components/panels/ColorControlPanel';
import FilterPanel from '@/components/panels/FilterPanel';
import BottomLeftPanel from '@/components/panels/BottomLeftPanel';
import AiIntelPanel from '@/components/panels/AiIntelPanel';
import NewsTicker from '@/components/dashboard/NewsTicker';
import SearchBox from '@/components/layout/SearchBox';
import ViewModeToggle from '@/components/layout/ViewModeToggle';
import AiToggle from '@/components/layout/AiToggle';
import LangSwitcher from '@/components/layout/LangSwitcher';
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';
import BRICSDropdown from '@/components/layout/BRICSDropdown';
import HeroSection from '@/components/layout/HeroSection';
import MobileUI from '@/components/mobile/MobileUI';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D  = dynamic(() => import('@/components/map/MapLibre2D'),  { ssr: false });

const PANEL_W = 440;

interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

function HomeContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { viewMode, setSelectedCable, selectedCableId } = useMapStore();
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos]     = useState({ x: 0, y: 0 });
  const { t, locale } = useTranslation();
  const zh = locale === 'zh';

  const [windowWidth, setWindowWidth] = useState(1280);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = windowWidth < 768;

  const panelOpen = !!selectedCableId && !isMobile;

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const handleHover = useCallback((cable: CableHoverInfo | null, pos: { x: number; y: number }) => {
    if (isMobile) return;
    setHoverCable(cable);
    setHoverPos(pos);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
    setHoverCable(null);
    if (slug !== null) {
      setSelectedCable(slug);
    }
  }, [setSelectedCable]);

  const handleGlobeTransitionEnd = useCallback(() => {
    window.dispatchEvent(new Event('resize'));
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* 全屏英雄落地区：每次 session 首次进入时显示，覆盖在最顶层 */}
      <HeroSection />

      {/* ── 导航栏

      {/* ── 导航栏 ── */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13,27,42,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 20px',
        zIndex: 50,
      }}>
        {/* 左：Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexShrink: 0 }}>
          <img src="/icons/deep-blue-icon.png" alt="Deep Blue"
            style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            {!isMobile && (
              <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
                {t('nav.subtitle')}
              </div>
            )}
          </div>
        </div>

        {/* 中：SearchBox 绝对居中 */}
        {!isMobile && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 280 }}>
            <SearchBox />
          </div>
        )}

        {/* 右：分析工具 + 统计 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          {!isMobile && (
            <>
              <BRICSDropdown />
              <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </>
          )}
          {stats?.cables ? (
            <>
              <StatBadge number={stats.cables.total || 0}
                label={isMobile ? t('nav.total') : t('nav.cables')} color="#2A9D8F" />
              {!isMobile && (
                <StatBadge number={stats.cables.inService || 0} label={t('nav.inService')} color="#06D6A0" />
              )}
              <StatBadge number={stats.landingStations || 0} label={t('nav.stations')} color="#2A9D8F" />
            </>
          ) : <span style={{ fontSize: 12, color: '#6B7280' }}>{t('nav.loading')}</span>}
        </div>
      </nav>

      {!isMobile && <NewsTicker />}

      {/* ── Globe 容器 ── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: panelOpen ? `calc(100% - ${PANEL_W}px)` : '100%',
          transition: 'width 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
        onTransitionEnd={handleGlobeTransitionEnd}
      >
        {viewMode === '3d' ? (
          <CesiumGlobe onHover={handleHover} onClick={handleClick} />
        ) : (
          <MapLibre2D onHover={handleHover} onClick={handleClick} />
        )}
      </div>

      {/* ── 右侧控制面板 ── */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16, zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, overflow: 'visible',
          transform: panelOpen ? `translateX(-${PANEL_W}px)` : 'none',
          transition: 'transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ViewModeToggle />
            <AiToggle />
          </div>
          <AiIntelPanel />
        </div>
      )}

      {!isMobile && <ColorControlPanel />}

      {!isMobile && (
        <div style={{
          position: 'absolute', bottom: 160, right: 16, zIndex: 40,
          transform: panelOpen ? `translateX(-${PANEL_W}px)` : 'none',
          transition: 'transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <FilterPanel />
        </div>
      )}

      {!isMobile && (
        <div style={{
          position: 'absolute', bottom: 100, right: 16, zIndex: 40,
          transform: panelOpen ? `translateX(-${PANEL_W}px)` : 'none',
          transition: 'transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          <LangSwitcher />
        </div>
      )}

      {!isMobile && <BottomLeftPanel />}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      <CableDetailPanel />

      {!isMobile && (
        <div style={{ position: 'absolute', bottom: 10, right: 16, fontSize: 10, color: '#1E3A5F', zIndex: 10, userSelect: 'none', letterSpacing: 0.5 }}>
          by Jiang Yun
        </div>
      )}

      <a href="/admin" style={{
        position: 'fixed', bottom: 60, right: 16, zIndex: 100,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', fontSize: 14, opacity: 0.4,
      }} title="管理后台">🔒</a>

      {isMobile && <MobileUI />}
    </div>
  );
}

export default function HomePage() {
  return <I18nProvider><HomeContent /></I18nProvider>;
}

function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

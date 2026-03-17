// src/app/page.tsx
// Deep Blue 首页 — 中英双语国际化版本
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
import type { CableHoverInfo } from '@/components/map/CesiumGlobe';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D = dynamic(() => import('@/components/map/MapLibre2D'), { ssr: false });

interface Stats {
  cables: { total: number; inService: number; underConstruction: number; planned: number };
  landingStations: number;
  countries: number;
}

// 主页面内容（需要在I18nProvider内部才能使用useTranslation）
function HomeContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const { viewMode, setSelectedCable } = useMapStore();
  const [hoverCable, setHoverCable] = useState<CableHoverInfo | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const { t } = useTranslation();

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
      {/* ═══ 顶部导航栏 ═══ */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13, 27, 42, 0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42, 157, 143, 0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px', zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          <div style={{
            width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1E6091, #2A9D8F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? 11 : 14, fontWeight: 700, color: 'white',
          }}>DB</div>
          <div>
            <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>DEEP BLUE</div>
            {!isMobile && <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>{t('nav.subtitle')}</div>}
          </div>
        </div>

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SearchBox />
            <AiToggle />
            <LangSwitcher />
          </div>
        )}

        <div style={{ display: 'flex', gap: isMobile ? 12 : 24, fontSize: 12 }}>
          {stats && stats.cables ? (
            <>
              <StatBadge number={stats.cables.total || 0} label={isMobile ? t('nav.total') : t('nav.cables')} color="#2A9D8F" />
              {!isMobile && <>
                <StatBadge number={stats.cables.inService || 0} label={t('nav.inService')} color="#06D6A0" />
                <StatBadge number={stats.cables.underConstruction || 0} label={t('nav.building')} color="#E9C46A" />
              </>}
              <StatBadge number={stats.landingStations || 0} label={t('nav.stations')} color="#2A9D8F" />
            </>
          ) : <span style={{ color: '#6B7280' }}>{t('nav.loading')}</span>}
        </div>
      </nav>

      {!isMobile && <NewsTicker />}

      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      <ViewModeToggle />

      {!isMobile && <>
        <ColorControlPanel />
        <FilterPanel />
      </>}

      {!isMobile && <AiIntelPanel />}

      <EarthquakePanel />

      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      <CableDetailPanel />

      {isMobile && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: 'rgba(13, 27, 42, 0.95)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(42, 157, 143, 0.2)',
          padding: '8px 12px', zIndex: 50,
        }}><SearchBox /></div>
      )}
    </div>
  );
}

// 根组件：用I18nProvider包裹整个页面
export default function HomePage() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  );
}

function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// src/app/page.tsx
// Deep Blue 首页
// 导航栏：Logo | SearchBox(绝对居中) | AnalysisMenu + 统计数字
// LangSwitcher 移到右下角浮动元素，不再占用导航栏空间
// ColorControlPanel: top:96（组件内部已改）
// FilterPanel: bottom:160，往上移，右侧
// BottomLeftPanel: 左下角，bottom:20

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
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
import AnalysisMenu from '@/components/layout/AnalysisMenu';
import MobileUI from '@/components/mobile/MobileUI';

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
    setHoverCable(cable);
    setHoverPos(pos);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
    setHoverCable(null);
    setSelectedCable(slug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 顶部导航栏 ═══
          最简布局：
          左侧  → Logo（固定宽度）
          中间  → SearchBox（absolute居中，只有这一个元素，280px不可能溢出）
          右侧  → AnalysisMenu + 分隔线 + 统计数字
          LangSwitcher 已移出导航栏，放到右下角 */}
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

        {/* 中：SearchBox 单独居中，宽280px，两侧各延伸140px，不会碰到任何东西 */}
        {!isMobile && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 280,
          }}>
            <SearchBox />
          </div>
        )}

        {/* 右：分析工具 + 统计数字（LangSwitcher 已移走） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          {!isMobile && (
            <>
              <AnalysisMenu />
              <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </>
          )}
          {stats && stats.cables ? (
            <>
              <StatBadge number={stats.cables.total || 0}
                label={isMobile ? t('nav.total') : t('nav.cables')} color="#2A9D8F" />
              {!isMobile && <>
                <StatBadge number={stats.cables.inService || 0}   label={t('nav.inService')} color="#06D6A0" />
                <StatBadge number={stats.cables.underConstruction || 0} label={t('nav.building')} color="#E9C46A" />
              </>}
              <StatBadge number={stats.landingStations || 0} label={t('nav.stations')} color="#2A9D8F" />
            </>
          ) : <span style={{ fontSize: 12, color: '#6B7280' }}>{t('nav.loading')}</span>}
        </div>
      </nav>

      {/* 新闻滚动条 */}
      {!isMobile && <NewsTicker />}

      {/* 地图 */}
      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      {/* ═══ 右侧控制栏 top=96 ═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16,
          zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, overflow: 'visible',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ViewModeToggle />
            <AiToggle />
          </div>
          <AiIntelPanel />
        </div>
      )}

      {/* 左侧：着色模式（top在组件内改为96） */}
      {!isMobile && <ColorControlPanel />}

      {/* ═══ 右下角：筛选面板（往上移到bottom:160，展开向上，不遮挡署名）═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: 160,
          right: 16,
          zIndex: 40,
        }}>
          <FilterPanel />
        </div>
      )}

      {/* ═══ 右下角：语言切换（从导航栏移出，独立悬浮）═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: 100,
          right: 16,
          zIndex: 40,
        }}>
          <LangSwitcher />
        </div>
      )}

      {/* 左下角：地震 + 互联网健康 */}
      {!isMobile && <BottomLeftPanel />}

      {/* 悬停卡片 */}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      {/* 海缆详情面板 */}
      <CableDetailPanel />

      {/* 右下角署名 */}
      {!isMobile && (
        <div style={{
          position: 'absolute', bottom: 10, right: 16,
          fontSize: 10, color: '#1E3A5F',
          zIndex: 10, userSelect: 'none', letterSpacing: 0.5,
        }}>
          by Jiang Yun
        </div>
      )}
      <a href="/admin" style={{
        position: 'fixed', bottom: 60, right: 16, zIndex: 100,
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none', fontSize: 14,
        opacity: 0.4,
      }} title="管理后台">
        🔒
      </a>

      {/* 移动端：底部导航栏 + 所有功能抽屉 */}
      {isMobile && <MobileUI />}
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

function StatBadge({ number, label, color }: { number: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

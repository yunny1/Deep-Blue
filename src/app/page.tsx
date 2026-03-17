// src/app/page.tsx
// Deep Blue 首页
// 导航栏修复：中间区域改为 position:absolute 绝对居中
// 彻底解决左/右内容宽度变化导致中间区域被挤压重叠的问题

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
          布局方案：左右两端用普通 flex，中间用 position:absolute 绝对居中。
          这样左右两侧的宽度完全不影响中间区域，永远不会挤压重叠。
          这是 GitHub/Vercel/Linear 等产品导航栏的标准做法。 */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13,27,42,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        // 只用来对齐左右两端，中间不参与 flex 布局
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 24px',
        zIndex: 50,
      }}>

        {/* 左侧：logo，固定宽度不压缩 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexShrink: 0 }}>
          <img src="/icons/deep-blue-icon.png" alt="Deep Blue"
            style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: isMobile ? 13 : 16, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            {!isMobile && (
              <div style={{ fontSize: 9, color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase' as const }}>
                {t('nav.subtitle')}
              </div>
            )}
          </div>
        </div>

        {/* 中间：搜索 + 分析工具 + 语言切换
            关键：position:absolute + left:50% + translateX(-50%)
            完全脱离 flex 流，独立浮在导航栏正中央
            左右两侧无论多宽，它都不受影响 */}
        {!isMobile && (
          <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 8,
            // 给中间区域一个最大宽度，防止它延伸到左右区域上方
            maxWidth: 520,
          }}>
            <div style={{ width: 260 }}>
              <SearchBox />
            </div>
            <AnalysisMenu />
            <LangSwitcher />
          </div>
        )}

        {/* 右侧：统计数字，固定宽度不压缩 */}
        <div style={{ display: 'flex', gap: isMobile ? 12 : 24, fontSize: 12, flexShrink: 0 }}>
          {stats && stats.cables ? (
            <>
              <StatBadge number={stats.cables.total || 0}
                label={isMobile ? t('nav.total') : t('nav.cables')} color="#2A9D8F" />
              {!isMobile && <>
                <StatBadge number={stats.cables.inService || 0}
                  label={t('nav.inService')} color="#06D6A0" />
                <StatBadge number={stats.cables.underConstruction || 0}
                  label={t('nav.building')} color="#E9C46A" />
              </>}
              <StatBadge number={stats.landingStations || 0}
                label={t('nav.stations')} color="#2A9D8F" />
            </>
          ) : <span style={{ color: '#6B7280' }}>{t('nav.loading')}</span>}
        </div>
      </nav>

      {/* 新闻滚动条 */}
      {!isMobile && <NewsTicker />}

      {/* 地图主体 */}
      {viewMode === '3d' ? (
        <CesiumGlobe onHover={handleHover} onClick={handleClick} />
      ) : (
        <MapLibre2D onHover={handleHover} onClick={handleClick} />
      )}

      {/* ═══ 右侧控制栏 ═══
          top = 导航56 + NewsTicker32 + 间距8 = 96px */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16,
          zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300,
          overflow: 'visible',
        }}>
          {/* 第一行：视图切换 + AI开关 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ViewModeToggle />
            <AiToggle />
          </div>

          {/* 第二行：AI情报面板 */}
          <AiIntelPanel />
        </div>
      )}

      {/* 左侧面板：着色控制 + 筛选 */}
      {!isMobile && <>
        <ColorControlPanel />
        <FilterPanel />
      </>}

      {/* 左下角事件监控栏：地震 + 互联网健康 */}
      {!isMobile && <BottomLeftPanel />}

      {/* 悬停卡片 */}
      {!isMobile && <HoverCard cable={hoverCable} position={hoverPos} />}

      {/* 海缆详情面板 */}
      <CableDetailPanel />

      {/* 右下角署名 */}
      {!isMobile && (
        <div style={{
          position: 'absolute', bottom: 12, right: 16,
          fontSize: 10, color: '#2D4562',
          zIndex: 10, userSelect: 'none', letterSpacing: 0.5,
        }}>
          by Jiang Yun
        </div>
      )}

      {/* 移动端底部搜索栏 */}
      {isMobile && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: 'rgba(13,27,42,0.95)', backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(42,157,143,0.2)',
          padding: '8px 12px', zIndex: 50,
        }}>
          <SearchBox />
        </div>
      )}
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
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

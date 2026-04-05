// src/app/page.tsx  — 完整替换版本
// 改动：
// 1. Globe 在详情面板打开时向左平移，保证地球处于可见区域中央
// 2. 面板打开时 Globe 仍可交互（拖拽/点击切换海缆）
// 3. 使用 width 而非 transform，确保 Cesium 坐标系正确
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
import AnalysisMenu from '@/components/layout/AnalysisMenu';
import BRICSNavButton from '@/components/layout/BRICSNavButton';
import MobileUI from '@/components/mobile/MobileUI';

const CesiumGlobe = dynamic(() => import('@/components/map/CesiumGlobe'), { ssr: false });
const MapLibre2D  = dynamic(() => import('@/components/map/MapLibre2D'),  { ssr: false });

// 右侧详情面板的宽度（需与 CableDetailPanel 内部宽度一致）
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
  const { t } = useTranslation();

  const [windowWidth, setWindowWidth] = useState(1280);
  useEffect(() => {
    setWindowWidth(window.innerWidth);
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const isMobile = windowWidth < 768;

  // 面板是否展开（有选中海缆就展开）
  const panelOpen = !!selectedCableId && !isMobile;

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  // 鼠标悬停（hover 坐标需要相对于 globe 容器，不需要额外修正）
  const handleHover = useCallback((cable: CableHoverInfo | null, pos: { x: number; y: number }) => {
    if (isMobile) return;
    setHoverCable(cable);
    setHoverPos(pos);
  }, [isMobile]);

  const handleClick = useCallback((slug: string | null) => {
  setHoverCable(null);
  // slug 为 null 表示点击了地球空白区域或拖拽结束，不关闭面板
  // 面板只能通过自身的关闭按钮（X）来关闭
  if (slug !== null) {
    setSelectedCable(slug);
  }
  }, [setSelectedCable]);

  // Globe 宽度过渡结束后触发 window resize，让 Cesium 更新坐标系
  // 否则 Cesium 仍按旧 canvas 大小计算 hover/click 位置
  const handleGlobeTransitionEnd = useCallback(() => {
    window.dispatchEvent(new Event('resize'));
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ── 导航栏（z:50，始终在最上层）── */}
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
              <AnalysisMenu />
              <BRICSNavButton />
              
              <a href="/sovereign-network" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', background: 'rgba(212,175,55,.08)',
                border: '1px solid rgba(212,175,55,.25)', borderRadius: 6,
                fontSize: 11, fontWeight: 500, color: '#D4AF37',
                textDecoration: 'none', transition: 'all .2s',
              }}>

                自主权网络
              </a>
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

      {/* ── Globe 容器：面板打开时缩窄，向左"腾出"面板空间 ── */}
      {/* width 从 100% 过渡到 calc(100% - PANEL_W)，Cesium 会自动适应新宽度 */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          // 面板打开时 Globe 占左侧空间，关闭时全宽
          width: panelOpen ? `calc(100% - ${PANEL_W}px)` : '100%',
          // 平滑过渡，cubic-bezier 与 CableDetailPanel 的动画保持一致
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

      {/* ── 右侧控制面板（叠在 Globe 上方，不影响 Globe 左侧可交互区域）── */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16, zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, overflow: 'visible',
          // 面板打开时这些控件也向左偏移，避免被 CableDetailPanel 遮住
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

      {/* CableDetailPanel 自己管理定位和滑入/滑出动画（原有逻辑保留）*/}
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

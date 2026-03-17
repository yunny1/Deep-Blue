// src/app/page.tsx
// Deep Blue 首页 — 导航栏终极修复版
//
// 导航栏布局方案（彻底解决重叠）：
//   左侧：Logo（固定宽度 ~160px）
//   中间：SearchBox 单独绝对居中（width: 280px，不含其他按钮，不可能溢出）
//   右侧：AnalysisMenu + LangSwitcher + 统计数字（全部在右侧 flex 区域）
//
// 其他改动：
//   - FilterPanel 移到右下角（ColorControlPanel 保留左侧）
//   - BottomLeftPanel 管理地震 + 互联网健康
//   - 点击海缆时 hoverCable 立即清空

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

  // 点击时先清除悬停卡片，再打开详情面板
  const handleClick = useCallback((slug: string | null) => {
    setHoverCable(null);
    setSelectedCable(slug);
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* ═══ 顶部导航栏 ═══
          三区分离法：左右用 flex space-between，中间用 absolute 居中。
          中间只放 SearchBox（280px），不含任何其他按钮。
          AnalysisMenu 和 LangSwitcher 移至右侧 flex 区域，彻底消除溢出风险。 */}
      <nav style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: isMobile ? 48 : 56,
        backgroundColor: 'rgba(13,27,42,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 12px' : '0 20px',
        zIndex: 50,
      }}>

        {/* 左：Logo，固定不压缩 */}
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

        {/* 中：SearchBox 单独绝对居中
            宽度 280px，half=140px，不会碰到任何东西 */}
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

        {/* 右：分析工具 + 语言切换 + 统计数字
            AnalysisMenu 和 LangSwitcher 从中间移到这里 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, flexShrink: 0 }}>
          {!isMobile && (
            <>
              <AnalysisMenu />
              <LangSwitcher />
              {/* 细分隔线 */}
              <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            </>
          )}
          {/* 统计数字 */}
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
          ) : <span style={{ fontSize: 12, color: '#6B7280' }}>{t('nav.loading')}</span>}
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

      {/* ═══ 右侧控制栏（top = 56+32+8 = 96px）═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: 96, right: 16,
          zIndex: 45,
          display: 'flex', flexDirection: 'column', gap: 8,
          width: 300, overflow: 'visible',
        }}>
          {/* 第一行：视图切换 + AI 开关 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <ViewModeToggle />
            <AiToggle />
          </div>
          {/* 第二行：AI 情报面板 */}
          <AiIntelPanel />
        </div>
      )}

      {/* 左侧：着色模式面板 */}
      {!isMobile && <ColorControlPanel />}

      {/* ═══ 右下角：筛选面板
          位置：bottom 从下往上算，预留 BottomLeftPanel 的高度（约 100px）+间距
          由于 FilterPanel 展开方向向上，不会遮挡左下角 BottomLeftPanel ═══ */}
      {!isMobile && (
        <div style={{
          position: 'absolute',
          bottom: 28,   // 距底部 28px，和右下角署名留出距离
          right: 16,
          zIndex: 40,
        }}>
          <FilterPanel />
        </div>
      )}

      {/* 左下角事件监控栏：地震 + 互联网健康 */}
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
      <div style={{ fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: 9, color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

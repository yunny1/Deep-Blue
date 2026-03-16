// src/app/page.tsx
// Deep Blue 首页
// 显示3D地球 + 顶部导航栏 + 统计卡片

'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// 动态导入CesiumGlobe（禁用SSR，因为CesiumJS需要浏览器环境）
// 这样Next.js在服务端渲染时不会尝试加载CesiumJS（它会报错）
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

  // 页面加载时获取统计数据
  useEffect(() => {
    fetch('/api/stats')
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(console.error);
  }, []);

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
        {/* 左侧：Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #1E6091, #2A9D8F)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'white',
          }}>
            DB
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#EDF2F7', lineHeight: 1.2 }}>
              DEEP BLUE
            </div>
            <div style={{ fontSize: 10, color: '#6B7280', letterSpacing: 1 }}>
              SUBMARINE CABLE INTELLIGENCE
            </div>
          </div>
        </div>

        {/* 中间：搜索框（Phase 1后半段实现功能，现在先放个壳） */}
        <div style={{
          width: 360, height: 36, borderRadius: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.07)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex', alignItems: 'center', padding: '0 12px',
          color: '#6B7280', fontSize: 13,
        }}>
          Search cables, stations, countries...
        </div>

        {/* 右侧：统计数字 */}
        <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#6B7280' }}>
          {stats ? (
            <>
              <div>
                <span style={{ color: '#2A9D8F', fontWeight: 700, fontSize: 16 }}>
                  {stats.cables.total}
                </span>{' '}
                cables
              </div>
              <div>
                <span style={{ color: '#2A9D8F', fontWeight: 700, fontSize: 16 }}>
                  {stats.landingStations}
                </span>{' '}
                stations
              </div>
              <div>
                <span style={{ color: '#2A9D8F', fontWeight: 700, fontSize: 16 }}>
                  {stats.countries}
                </span>{' '}
                countries
              </div>
            </>
          ) : (
            <span>Loading...</span>
          )}
        </div>
      </nav>

      {/* ═══ 3D地球（占满全屏） ═══ */}
      <CesiumGlobe />
    </div>
  );
}

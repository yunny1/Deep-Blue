// src/components/layout/SearchBox.tsx
// 全局搜索框组件 — 顶部导航栏中的搜索入口
// 实时搜索海缆、登陆站和国家，结果以下拉列表形式展示

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';

// 搜索结果类型定义
interface SearchResults {
  cables: Array<{ id: string; name: string; slug: string; status: string; lengthKm: number | null }>;
  stations: Array<{ id: string; name: string; countryCode: string }>;
  countries: Array<{ code: string; nameEn: string; _count: { landingStations: number } }>;
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0',
  UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6',
  DECOMMISSIONED: '#6B7280',
};

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { setSelectedCable } = useMapStore();

  // 防抖搜索：用户停止输入300ms后才发起请求（避免每敲一个字母都发请求）
  useEffect(() => {
    if (query.length < 2) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          setResults(data);
          setIsOpen(data.total > 0);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // 点击搜索结果外部时关闭下拉列表
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 点击海缆结果：打开详情面板
  const handleCableClick = useCallback((slug: string) => {
    setSelectedCable(slug);
    setIsOpen(false);
    setQuery('');
  }, [setSelectedCable]);

  return (
    <div style={{ position: 'relative', width: 360 }}>
      {/* 搜索输入框 */}
      <input
        ref={inputRef}
        type="text"
        placeholder="Search cables, stations, countries..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results && results.total > 0) setIsOpen(true); }}
        style={{
          width: '100%', height: 36, borderRadius: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.07)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0 12px 0 36px',
          color: '#EDF2F7', fontSize: 13,
          outline: 'none',
          transition: 'border-color 0.2s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.borderColor = 'rgba(42, 157, 143, 0.4)')}
        onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)')}
      />

      {/* 搜索图标 */}
      <div style={{
        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
        fontSize: 14, color: '#6B7280', pointerEvents: 'none',
      }}>
        🔍
      </div>

      {/* 加载指示器 */}
      {loading && (
        <div style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          width: 14, height: 14, border: '2px solid rgba(42, 157, 143, 0.3)',
          borderTopColor: '#2A9D8F', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      )}

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>

      {/* 搜索结果下拉列表 */}
      {isOpen && results && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute', top: 42, left: 0, right: 0,
            backgroundColor: 'rgba(13, 27, 42, 0.97)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(42, 157, 143, 0.2)',
            borderRadius: 10,
            maxHeight: 420, overflowY: 'auto',
            zIndex: 200,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* 海缆结果 */}
          {results.cables.length > 0 && (
            <div>
              <div style={{
                padding: '10px 14px 6px', fontSize: 10, fontWeight: 600,
                color: '#2A9D8F', textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>
                Cables ({results.cables.length})
              </div>
              {results.cables.map(cable => (
                <div
                  key={cable.id}
                  onClick={() => handleCableClick(cable.slug)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(42, 157, 143, 0.1)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>
                      {cable.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                      {cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : ''}
                    </div>
                  </div>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: STATUS_COLORS[cable.status] || '#6B7280',
                    boxShadow: `0 0 4px ${STATUS_COLORS[cable.status] || '#6B7280'}`,
                  }} />
                </div>
              ))}
            </div>
          )}

          {/* 登陆站结果 */}
          {results.stations.length > 0 && (
            <div>
              <div style={{
                padding: '10px 14px 6px', fontSize: 10, fontWeight: 600,
                color: '#E9C46A', textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>
                Landing Stations ({results.stations.length})
              </div>
              {results.stations.map(station => (
                <div
                  key={station.id}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(233, 196, 106, 0.08)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ fontSize: 13, color: '#EDF2F7' }}>{station.name}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{station.countryCode}</div>
                </div>
              ))}
            </div>
          )}

          {/* 国家结果 */}
          {results.countries.length > 0 && (
            <div>
              <div style={{
                padding: '10px 14px 6px', fontSize: 10, fontWeight: 600,
                color: '#3B82F6', textTransform: 'uppercase' as const, letterSpacing: 1,
              }}>
                Countries ({results.countries.length})
              </div>
              {results.countries.map(country => (
                <div
                  key={country.code}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: '#EDF2F7' }}>{country.nameEn}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>
                      {country._count.landingStations} stations
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 无结果 */}
          {results.total === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

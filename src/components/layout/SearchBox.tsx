// src/components/layout/SearchBox.tsx
// 修复：
//   1. 旋转图标上下跳动 — keyframes 同时定义 from 和 to，保持 translateY(-50%) 不变
//   2. 模糊搜索 — 服务端已支持，前端最小字符数从 2 降到 1
//   3. 推荐海缆 — 搜索框聚焦时（无输入）显示热门/最新海缆列表

'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

interface SearchResults {
  cables: Array<{ id: string; name: string; slug: string; status: string; lengthKm: number | null }>;
  stations: Array<{ id: string; name: string; countryCode: string }>;
  countries: Array<{ code: string; nameEn: string; _count: { landingStations: number } }>;
  total: number;
}

// 推荐海缆（输入框为空时展示，给用户一个"从这里开始"的入口）
interface RecommendedCable {
  slug: string;
  name: string;
  status: string;
  lengthKm: number | null;
  reason: string; // 为什么推荐这条海缆
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
  const [recommendations, setRecommendations] = useState<RecommendedCable[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { flyToCable } = useMapStore();
  const { t } = useTranslation();

  // 搜索查询（输入长度 >= 1 时触发）
  useEffect(() => {
    if (query.length < 1) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          setResults(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 250); // 250ms 防抖，比原来的 300ms 快一点，手感更好
    return () => clearTimeout(timer);
  }, [query]);

  // 加载推荐海缆（组件挂载时一次性获取，不重复请求）
  useEffect(() => {
    fetch('/api/search/recommendations')
      .then(r => r.json())
      .then(data => setRecommendations(data.cables || []))
      .catch(() => {}); // 失败静默处理，推荐不是必须功能
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCableClick = useCallback((slug: string) => {
    flyToCable(slug);
    setIsOpen(false);
    setIsFocused(false);
    setQuery('');
  }, [flyToCable]);

  // 决定是否展示下拉：有搜索结果，或者聚焦且有推荐
  const showDropdown = isOpen && (
    (query.length >= 1 && results && results.total > 0) ||
    (query.length === 0 && isFocused && recommendations.length > 0)
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* 搜索输入框 */}
      <input
        ref={inputRef}
        type="text"
        placeholder={t('nav.search')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.length >= 1) setIsOpen(true);
        }}
        onFocus={() => {
          setIsFocused(true);
          // 聚焦时：有结果就展开结果，没结果就展开推荐
          if (query.length >= 1 && results && results.total > 0) setIsOpen(true);
          else if (query.length === 0 && recommendations.length > 0) setIsOpen(true);
        }}
        style={{
          width: '100%', height: 34, borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.07)',
          border: `1px solid ${isFocused ? 'rgba(42,157,143,0.4)' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: isFocused ? '0 0 0 2px rgba(42,157,143,0.1)' : 'none',
          padding: '0 12px 0 34px',
          color: '#EDF2F7', fontSize: 13, outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
      />

      {/* 搜索图标 */}
      <div style={{
        position: 'absolute', left: 11, top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 13, color: '#6B7280', pointerEvents: 'none',
      }}>
        🔍
      </div>

      {/* 加载旋转圈
          修复：keyframes 同时定义 from 和 to，确保 translateY(-50%) 在整个动画中不变，
          消除上下跳动的视觉 bug */}
      {loading && (
        <div style={{
          position: 'absolute', right: 10, top: '50%',
          transform: 'translateY(-50%)',
          width: 12, height: 12,
          border: '1.5px solid rgba(42,157,143,0.3)',
          borderTopColor: '#2A9D8F',
          borderRadius: '50%',
          animation: 'searchSpin 0.8s linear infinite',
        }} />
      )}

      {/* 修复后的 keyframes：from 和 to 都写明 translateY(-50%)，浏览器不会在循环时跳变 */}
      <style>{`
        @keyframes searchSpin {
          from { transform: translateY(-50%) rotate(0deg);   }
          to   { transform: translateY(-50%) rotate(360deg); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* 下拉面板 */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute', top: 40, left: 0, right: 0,
            minWidth: 320,
            backgroundColor: 'rgba(13,27,42,0.97)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(42,157,143,0.2)', borderRadius: 10,
            maxHeight: 400, overflowY: 'auto',
            zIndex: 200,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            animation: 'fadeInDown 0.15s ease',
          }}
        >

          {/* ── 推荐（query 为空时显示）──────────────────────────── */}
          {query.length === 0 && recommendations.length > 0 && (
            <div>
              <div style={{
                padding: '8px 14px 4px',
                fontSize: 10, fontWeight: 600, color: '#6B7280',
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                ⭐ Recommended
              </div>
              {recommendations.map(cable => (
                <div
                  key={cable.slug}
                  onClick={() => handleCableClick(cable.slug)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.1)')}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{cable.name}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{cable.reason}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      backgroundColor: STATUS_COLORS[cable.status] || '#6B7280',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── 搜索结果 ─────────────────────────────────────────── */}
          {query.length >= 1 && results && (
            <>
              {/* 海缆结果 */}
              {results.cables.length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 10, fontWeight: 600, color: '#2A9D8F',
                    textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {t('search.cables')} ({results.cables.length})
                  </div>
                  {results.cables.map(cable => (
                    <div
                      key={cable.id}
                      onClick={() => handleCableClick(cable.slug)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(42,157,143,0.1)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div>
                        <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{cable.name}</div>
                        <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                          {cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: '#4B5563' }}>{t('search.flyTo')}</span>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          backgroundColor: STATUS_COLORS[cable.status] || '#6B7280',
                          boxShadow: `0 0 4px ${STATUS_COLORS[cable.status] || '#6B7280'}`,
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 登陆站结果 */}
              {results.stations.length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 10, fontWeight: 600, color: '#E9C46A',
                    textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {t('search.stations')} ({results.stations.length})
                  </div>
                  {results.stations.map(station => (
                    <div
                      key={station.id}
                      style={{
                        padding: '9px 14px', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(233,196,106,0.08)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 12, color: '#EDF2F7' }}>{station.name}</div>
                      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{station.countryCode}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 国家结果 */}
              {results.countries.length > 0 && (
                <div>
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 10, fontWeight: 600, color: '#3B82F6',
                    textTransform: 'uppercase', letterSpacing: 1,
                  }}>
                    {t('search.countries')} ({results.countries.length})
                  </div>
                  {results.countries.map(country => (
                    <div
                      key={country.code}
                      style={{
                        padding: '9px 14px', cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.08)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: '#EDF2F7' }}>{country.nameEn}</span>
                        <span style={{ fontSize: 10, color: '#6B7280' }}>
                          {country._count.landingStations} stations
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 无结果 */}
              {results.total === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
                  {t('search.noResults')} &ldquo;{query}&rdquo;
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

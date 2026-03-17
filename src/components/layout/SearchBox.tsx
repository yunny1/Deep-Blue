// src/components/layout/SearchBox.tsx
// 修复：宽度自适应 + 模糊搜索支持
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

const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0', UNDER_CONSTRUCTION: '#E9C46A', PLANNED: '#3B82F6', DECOMMISSIONED: '#6B7280',
};

export default function SearchBox() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { flyToCable } = useMapStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (query.length < 2) { setResults(null); setIsOpen(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => { setResults(data); setIsOpen(data.total > 0); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCableClick = useCallback((slug: string) => {
    flyToCable(slug); setIsOpen(false); setQuery('');
  }, [flyToCable]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input ref={inputRef} type="text" placeholder={t('nav.search')} value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results && results.total > 0) setIsOpen(true); }}
        style={{
          width: '100%', height: 34, borderRadius: 8,
          backgroundColor: 'rgba(255, 255, 255, 0.07)', border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '0 12px 0 34px', color: '#EDF2F7', fontSize: 12, outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        onFocusCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(42, 157, 143, 0.4)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(42,157,143,0.1)'; }}
        onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
      />
      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#6B7280', pointerEvents: 'none' }}>🔍</div>
      {loading && <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, border: '1.5px solid rgba(42,157,143,0.3)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}

      {isOpen && results && (
        <div ref={dropdownRef} style={{
          position: 'absolute', top: 40, left: 0, right: 0, minWidth: 320,
          backgroundColor: 'rgba(13, 27, 42, 0.97)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(42, 157, 143, 0.2)', borderRadius: 10,
          maxHeight: 400, overflowY: 'auto', zIndex: 200, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
          animation: 'fadeInDown 0.15s ease',
        }}>
          {results.cables.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: '#2A9D8F', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                {t('search.cables')} ({results.cables.length})
              </div>
              {results.cables.map(cable => (
                <div key={cable.id} onClick={() => handleCableClick(cable.slug)}
                  style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(42, 157, 143, 0.1)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div>
                    <div style={{ fontSize: 13, color: '#EDF2F7', fontWeight: 500 }}>{cable.name}</div>
                    <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, color: '#4B5563' }}>{t('search.flyTo')}</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: STATUS_COLORS[cable.status] || '#6B7280' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {results.stations.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: '#E9C46A', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                {t('search.stations')} ({results.stations.length})
              </div>
              {results.stations.map(station => (
                <div key={station.id} style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(233, 196, 106, 0.08)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div style={{ fontSize: 12, color: '#EDF2F7' }}>{station.name}</div>
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{station.countryCode}</div>
                </div>
              ))}
            </div>
          )}
          {results.countries.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                {t('search.countries')} ({results.countries.length})
              </div>
              {results.countries.map(country => (
                <div key={country.code} style={{ padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background-color 0.15s' }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)')}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#EDF2F7' }}>{country.nameEn}</span>
                    <span style={{ fontSize: 10, color: '#6B7280' }}>{country._count.landingStations} stations</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {results.total === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: '#6B7280', fontSize: 12 }}>
              {t('search.noResults')} &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

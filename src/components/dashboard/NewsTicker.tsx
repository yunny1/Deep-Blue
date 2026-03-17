// src/components/dashboard/NewsTicker.tsx
'use client';
import { useEffect, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { useTranslation } from '@/lib/i18n';

interface NewsItem { title: string; link: string; pubDate: string; source: string; eventCategory: string; matchedCables: Array<{ slug: string; name: string }>; }
const CATEGORY_COLORS: Record<string, string> = { EQUIPMENT_FAULT: '#EF4444', NATURAL_DISASTER: '#F97316', POLITICAL: '#EC4899', CONSTRUCTION: '#3B82F6', REPAIR: '#10B981', GENERAL: '#6B7280' };
const CATEGORY_LABELS: Record<string, string> = { EQUIPMENT_FAULT: 'FAULT', NATURAL_DISASTER: 'HAZARD', POLITICAL: 'SECURITY', CONSTRUCTION: 'NEW', REPAIR: 'REPAIR', GENERAL: 'NEWS' };

export default function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const { flyToCable } = useMapStore();
  const { t } = useTranslation();

  useEffect(() => {
    fetch('/api/news?limit=20').then(r => r.json()).then(data => setNews(data.news || [])).catch(() => {});
    const interval = setInterval(() => { fetch('/api/news?limit=20').then(r => r.json()).then(data => setNews(data.news || [])).catch(() => {}); }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (news.length === 0 || !isVisible) return null;

  return (
    <div style={{ position: 'absolute', top: 56, left: 0, right: 0, height: 32, backgroundColor: 'rgba(13, 27, 42, 0.75)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(42, 157, 143, 0.1)', display: 'flex', alignItems: 'center', zIndex: 45, overflow: 'hidden' }}>
      <div style={{ padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(42, 157, 143, 0.1)', borderRight: '1px solid rgba(42, 157, 143, 0.15)', flexShrink: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2A9D8F', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: '#2A9D8F', letterSpacing: 1 }}>{t('ticker.live')}</span>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } } @keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', gap: 40, whiteSpace: 'nowrap' as const, animation: `scroll ${news.length * 8}s linear infinite` }}>
          {[...news, ...news].map((item, i) => (
            <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: item.matchedCables.length > 0 ? 'pointer' : 'default' }}
              onClick={() => { if (item.matchedCables.length > 0) flyToCable(item.matchedCables[0].slug); else if (item.link) window.open(item.link, '_blank'); }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, backgroundColor: `${CATEGORY_COLORS[item.eventCategory] || '#6B7280'}20`, color: CATEGORY_COLORS[item.eventCategory] || '#6B7280', letterSpacing: 0.5 }}>{CATEGORY_LABELS[item.eventCategory] || 'NEWS'}</span>
              <span style={{ fontSize: 12, color: '#D1D5DB' }}>{item.title.length > 80 ? item.title.slice(0, 80) + '...' : item.title}</span>
              {item.matchedCables.length > 0 && <span style={{ fontSize: 10, color: '#2A9D8F', fontWeight: 500 }}>[{item.matchedCables.map(c => c.name).join(', ')}]</span>}
              <span style={{ fontSize: 10, color: '#4B5563' }}>{item.source} · {new Date(item.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => setIsVisible(false)} style={{ padding: '0 10px', height: '100%', border: 'none', backgroundColor: 'transparent', color: '#4B5563', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
    </div>
  );
}

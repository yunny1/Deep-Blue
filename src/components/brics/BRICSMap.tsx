'use client';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';

interface Props { height?: string; }

export default function BRICSMap({ height = '560px' }: Props) {
  const { tb, isZh } = useBRICS();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ internal: number; related: number; other: number } | null>(null);
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [60, 15], zoom: 2.2,
      attributionControl: false, fadeDuration: 0,
    });
    mapRef.current = map;

    map.on('load', async () => {
      try {
        // Fetch BRICS classification + all cables with geo
        const [ovRes, cablesRes] = await Promise.all([
          fetch('/api/brics/overview'),
          fetch('/api/cables?geo=true'),
        ]);
        const ovData = await ovRes.json();
        const cablesRaw = await cablesRes.json();
        const cables = Array.isArray(cablesRaw) ? cablesRaw : cablesRaw.cables || [];

        const internalSlugs = new Set<string>(ovData.internalCableSlugs || []);
        const relatedSlugs = new Set<string>(ovData.relatedCableSlugs || []);

        const internalF: GeoJSON.Feature[] = [];
        const relatedF: GeoJSON.Feature[] = [];
        const otherF: GeoJSON.Feature[] = [];

        for (const cable of cables) {
          const geom = cable.routeGeojson || cable.route_geojson;
          if (!geom?.coordinates || !geom.type) continue;

          const geometry: GeoJSON.Geometry = geom.type === 'MultiLineString'
            ? { type: 'MultiLineString', coordinates: geom.coordinates }
            : { type: 'LineString', coordinates: geom.coordinates };

          const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: { slug: cable.slug, name: cable.name, status: cable.status },
            geometry,
          };

          if (internalSlugs.has(cable.slug)) internalF.push(feature);
          else if (relatedSlugs.has(cable.slug)) relatedF.push(feature);
          else otherF.push(feature);
        }

        setStats({ internal: internalF.length, related: relatedF.length, other: otherF.length });

        // Non-BRICS cables — dark gray
        map.addSource('c-other', { type: 'geojson', data: { type: 'FeatureCollection', features: otherF } });
        map.addLayer({ id: 'l-other', type: 'line', source: 'c-other', paint: { 'line-color': '#2A2F3A', 'line-width': 0.7, 'line-opacity': 0.2 } });

        // BRICS ↔ External — silver
        map.addSource('c-related', { type: 'geojson', data: { type: 'FeatureCollection', features: relatedF } });
        map.addLayer({ id: 'l-related', type: 'line', source: 'c-related', paint: { 'line-color': C.silver, 'line-width': 1.1, 'line-opacity': 0.45 } });

        // BRICS Internal — gold glow
        map.addSource('c-internal', { type: 'geojson', data: { type: 'FeatureCollection', features: internalF } });
        map.addLayer({ id: 'l-internal-glow', type: 'line', source: 'c-internal', paint: { 'line-color': C.gold, 'line-width': 7, 'line-opacity': 0.12, 'line-blur': 4 } });
        map.addLayer({ id: 'l-internal', type: 'line', source: 'c-internal', paint: { 'line-color': C.gold, 'line-width': 2, 'line-opacity': 0.9 } });

        // BRICS country labels
        const labelFeatures: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return { type: 'Feature', properties: { code, name: isZh ? m?.nameZh : m?.name }, geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] } };
        });
        map.addSource('brics-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: labelFeatures } });
        map.addLayer({ id: 'brics-dots', type: 'circle', source: 'brics-labels', paint: { 'circle-radius': 4, 'circle-color': C.gold, 'circle-opacity': 0.7, 'circle-stroke-color': C.goldDark, 'circle-stroke-width': 1 } });
        map.addLayer({ id: 'brics-text', type: 'symbol', source: 'brics-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': C.goldLight, 'text-halo-color': C.navy, 'text-halo-width': 1.5 } });

        // Hover popup
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'brics-popup' });
        for (const lid of ['l-internal', 'l-related']) {
          map.on('mouseenter', lid, e => { map.getCanvas().style.cursor = 'pointer'; const p = e.features?.[0]?.properties; if (p?.name) popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;font-weight:600;color:#F0E6C8">${p.name}</div>`).addTo(map); });
          map.on('mouseleave', lid, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
        }
      } catch (err) { console.error('[BRICSMap]', err); } finally { setLoading(false); }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [isZh]);

  // 2D/Globe toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded()) return;
    try {
      if (mapMode === '3d') (map as any).setProjection?.('globe');
      else (map as any).setProjection?.('mercator');
    } catch {}
  }, [mapMode]);

  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden' }}>
      <div ref={containerRef} style={{ width:'100%', height, borderRadius:14, border:`1px solid ${C.gold}12` }} />

      {loading && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10,22,40,0.8)', borderRadius:14, zIndex:10 }}>
          <span style={{ color:C.goldLight, fontSize:14 }}>{tb('map.loading')}</span>
        </div>
      )}

      {/* 2D/3D Toggle */}
      <div style={{ position:'absolute', top:12, left:12, display:'flex', gap:2, background:'rgba(10,22,40,0.85)', backdropFilter:'blur(8px)', borderRadius:8, padding:3, border:`1px solid ${C.gold}15`, zIndex:5 }}>
        {(['2d', '3d'] as const).map(mode => (
          <button key={mode} onClick={() => setMapMode(mode)} style={{ padding:'5px 14px', fontSize:11, fontWeight:600, borderRadius:6, border:'none', cursor:'pointer', transition:'all 0.2s', background: mapMode === mode ? `${C.gold}25` : 'transparent', color: mapMode === mode ? C.gold : '#6B7280' }}>
            {mode === '3d' ? tb('map.3d') : tb('map.2d')}
          </button>
        ))}
      </div>

      {/* Legend */}
      {stats && (
        <div style={{ position:'absolute', bottom:12, right:12, background:'rgba(10,22,40,0.85)', backdropFilter:'blur(8px)', borderRadius:8, padding:'10px 14px', fontSize:11, color:'rgba(255,255,255,0.5)', display:'flex', flexDirection:'column', gap:4, border:`1px solid ${C.gold}12`, zIndex:5 }}>
          {[
            { color: C.gold, label: tb('map.internal'), n: stats.internal, glow: true },
            { color: C.silver, label: tb('map.related'), n: stats.related },
            { color: '#2A2F3A', label: tb('map.other'), n: stats.other },
          ].map(({ color, label, n, glow }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:18, height:3, background:color, borderRadius:1, boxShadow: glow ? `0 0 6px ${color}44` : 'none' }} />
              {label} ({n})
            </div>
          ))}
        </div>
      )}

      <style>{`
        .brics-popup .maplibregl-popup-content { background:rgba(15,29,50,0.95); border:1px solid ${C.gold}25; border-radius:6px; padding:6px 10px; box-shadow:0 4px 16px rgba(0,0,0,0.4); }
        .brics-popup .maplibregl-popup-tip { border-top-color:rgba(15,29,50,0.95); }
      `}</style>
    </div>
  );
}

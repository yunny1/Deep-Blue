// src/components/map/MapLibre2D.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStore } from '@/stores/mapStore';
import {
  VENDOR_COLOR_MAP, VENDOR_DEFAULT,
  OPERATOR_COLOR_MAP, OPERATOR_DEFAULT,
  getYearColor,
} from '@/components/panels/ColorControlPanel';

export interface CableHoverInfo { name: string; status: string; lengthKm: number | null; fiberPairs: number | null; }
interface MapLibre2DProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableSlug: string | null) => void;
}

const STATUS_HEX: Record<string, string> = {
  IN_SERVICE:         '#06D6A0',
  UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED:            '#3B82F6',
  DECOMMISSIONED:     '#D97706',
};

function rgbaToHex(rgba: [number, number, number, number]): string {
  return `#${Math.round(rgba[0]*255).toString(16).padStart(2,'0')}${Math.round(rgba[1]*255).toString(16).padStart(2,'0')}${Math.round(rgba[2]*255).toString(16).padStart(2,'0')}`;
}

function getCableHexColor(mode: string, status: string, vendorName: string | null, ownerNames: string[], rfsYear: number | null): string {
  switch (mode) {
    case 'vendor':   return rgbaToHex(vendorName && VENDOR_COLOR_MAP[vendorName] ? VENDOR_COLOR_MAP[vendorName] : VENDOR_DEFAULT);
    case 'operator': for (const n of ownerNames) { if (OPERATOR_COLOR_MAP[n]) return rgbaToHex(OPERATOR_COLOR_MAP[n]); } return rgbaToHex(OPERATOR_DEFAULT);
    case 'year':     return rgbaToHex(getYearColor(rfsYear));
    default:         return STATUS_HEX[status] || STATUS_HEX.IN_SERVICE;
  }
}

export default function MapLibre2D({ onHover, onClick }: MapLibre2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats]     = useState({ total: 0, rendered: 0 });
  const cablesDataRef   = useRef<any[]>([]);

  const {
    colorMode,
    flyToSlug, flyToCounter, clearFlyTo,
    filterStatuses, filterYearRange,
    filterVendors, filterOperators,
  } = useMapStore();

  // 判断某条海缆是否可见
  const isCableVisible = useCallback((cable: any): boolean => {
    const statusMatch   = filterStatuses[cable.status as keyof typeof filterStatuses] ?? true;
    const rfsYear       = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
    const yearMatch     = !rfsYear || (rfsYear >= filterYearRange[0] && rfsYear <= filterYearRange[1]);
    const vendorName    = cable.vendor?.name || '__other__';
    const vendorMatch   = filterVendors.length === 0 || filterVendors.includes(vendorName);
    const ownerNames    = cable.owners?.map((o: any) => o.company.name) || [];
    const operatorMatch = filterOperators.length === 0 || ownerNames.some((n: string) => filterOperators.includes(n));
    return statusMatch && yearMatch && vendorMatch && operatorMatch;
  }, [filterStatuses, filterYearRange, filterVendors, filterOperators]);

  // ── 初始化地图 ────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: { 'carto-dark': { type: 'raster', tiles: ['https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; CartoDB' } },
        layers: [{ id: 'carto-layer', type: 'raster', source: 'carto-dark' }],
      },
      center: [110, 20], zoom: 2, maxZoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', async () => {
      try {
        const response = await fetch('/api/cables?geo=true&details=true');
        const data = await response.json();
        const cables = data.cables || [];
        cablesDataRef.current = cables;
        let renderedCount = 0;

        for (const cable of cables) {
          if (!cable.routeGeojson) continue;
          const vendorName = cable.vendor?.name || null;
          const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
          const rfsYear    = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
          const color      = getCableHexColor('status', cable.status, vendorName, ownerNames, rfsYear);
          const visible    = filterStatuses[cable.status as keyof typeof filterStatuses] ?? true;
          const sourceId   = `cable-${cable.slug}`;
          const layerId    = `cable-layer-${cable.slug}`;

          try {
            map.addSource(sourceId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: { name: cable.name, slug: cable.slug, status: cable.status, lengthKm: cable.lengthKm, fiberPairs: cable.fiberPairs, vendor: vendorName, owners: ownerNames.join(','), rfsYear, isApproximateRoute: cable.isApproximateRoute || false },
                geometry: cable.routeGeojson,
              },
            });

            // v9: 近似路由用虚线渲染，真实路由用实线
            const isApprox = cable.isApproximateRoute || false;

            map.addLayer({
              id: layerId, type: 'line', source: sourceId,
              layout: {
                ...(isApprox ? { 'line-cap': 'round' as const } : {}),
              },
              paint: {
                'line-color': color,
                'line-width': isApprox ? 1.2 : 1.5,
                'line-opacity': visible ? (isApprox ? 0.5 : 0.7) : 0,
                ...(isApprox ? { 'line-dasharray': [3, 3] } : {}),
              },
            });

            map.on('mouseenter', layerId, (e) => {
              map.getCanvas().style.cursor = 'pointer';
              map.setPaintProperty(layerId, 'line-width', 4);
              map.setPaintProperty(layerId, 'line-color', '#ffffff');
              map.setPaintProperty(layerId, 'line-opacity', 1);
              if (onHover && e.features?.[0]) {
                const p = e.features[0].properties;
                onHover({ name: p?.name || 'Unknown', status: p?.status || 'IN_SERVICE', lengthKm: p?.lengthKm || null, fiberPairs: p?.fiberPairs || null }, { x: e.point.x, y: e.point.y });
              }
            });
            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
              const cm = useMapStore.getState().colorMode;
              const c  = getCableHexColor(cm, cable.status, vendorName, ownerNames, rfsYear);
              const isApproxRestore = cable.isApproximateRoute || false;
              map.setPaintProperty(layerId, 'line-width', isApproxRestore ? 1.2 : 1.5);
              map.setPaintProperty(layerId, 'line-color', c);
              map.setPaintProperty(layerId, 'line-opacity', isApproxRestore ? 0.5 : 0.7);
              if (onHover) onHover(null, { x: 0, y: 0 });
            });
            map.on('click', layerId, () => { if (onClick) onClick(cable.slug); });
            renderedCount++;
          } catch (e) {}
        }
        setStats({ total: cables.length, rendered: renderedCount });
      } catch (error) { console.error('Failed to load cables:', error); }
      setLoading(false);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── 颜色模式切换 ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const cable of cablesDataRef.current) {
      if (!cable.routeGeojson) continue;
      const layerId    = `cable-layer-${cable.slug}`;
      const vendorName = cable.vendor?.name || null;
      const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
      const rfsYear    = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
      const color      = getCableHexColor(colorMode, cable.status, vendorName, ownerNames, rfsYear);
      try { if (map.getLayer(layerId)) map.setPaintProperty(layerId, 'line-color', color); } catch (e) {}
    }
  }, [colorMode]);

  // ── 筛选条件变化：显示/隐藏 ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    for (const cable of cablesDataRef.current) {
      if (!cable.routeGeojson) continue;
      const layerId = `cable-layer-${cable.slug}`;
      const isApproxFilter = cable.isApproximateRoute || false;
      try {
        if (map.getLayer(layerId)) {
          const vis = isCableVisible(cable);
          map.setPaintProperty(layerId, 'line-opacity', vis ? (isApproxFilter ? 0.5 : 0.7) : 0);
        }
      } catch (e) {}
    }
  }, [filterStatuses, filterYearRange, filterVendors, filterOperators, isCableVisible]);

  // ── 飞行指令 ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToSlug) return;
    const cable = cablesDataRef.current.find(c => c.slug === flyToSlug);
    if (!cable?.routeGeojson) { clearFlyTo(); return; }

    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    const coords = cable.routeGeojson.type === 'MultiLineString'
      ? cable.routeGeojson.coordinates.flat()
      : cable.routeGeojson.coordinates || [];
    for (const c of coords) {
      if (c[0] < minLon) minLon = c[0]; if (c[0] > maxLon) maxLon = c[0];
      if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
    }

    if (minLon < maxLon) {
      const layerId = `cable-layer-${cable.slug}`;
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'line-width', 4);
        map.setPaintProperty(layerId, 'line-color', '#ffffff');
        map.setPaintProperty(layerId, 'line-opacity', 1);
      }
      map.fitBounds([[minLon - 2, minLat - 2], [maxLon + 2, maxLat + 2]], { duration: 2000, padding: 60 });
      setTimeout(() => {
        const cm         = useMapStore.getState().colorMode;
        const vendorName = cable.vendor?.name || null;
        const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
        const rfsYear    = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
        const color      = getCableHexColor(cm, cable.status, vendorName, ownerNames, rfsYear);
        try {
          if (map.getLayer(layerId)) {
            map.setPaintProperty(layerId, 'line-width', 1.5);
            map.setPaintProperty(layerId, 'line-color', color);
            map.setPaintProperty(layerId, 'line-opacity', 0.7);
          }
        } catch (e) {}
      }, 5000);
    }
    clearFlyTo();
  }, [flyToSlug, flyToCounter, clearFlyTo]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,4,8,0.9)', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 13, color: '#2A9D8F', letterSpacing: 2 }}>Loading 2D map...</div>
          {stats.total > 0 && <div style={{ fontSize: 11, color: '#4B5563' }}>{stats.rendered} / {stats.total} cables rendered</div>}
        </div>
      )}
    </div>
  );
}

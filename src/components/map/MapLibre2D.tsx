// src/components/map/MapLibre2D.tsx
// 2D平面地图组件 — 使用MapLibre GL JS渲染
// 当用户切换到2D模式时，替代CesiumJS的3D地球显示
// 优势：缩放到区域级别时操作更精确、性能更好

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

// 和CesiumGlobe共享同一个hover info类型
export interface CableHoverInfo {
  name: string;
  status: string;
  lengthKm: number | null;
  fiberPairs: number | null;
}

interface MapLibre2DProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableSlug: string | null) => void;
}

// 状态 → 颜色（hex格式，MapLibre用hex而不是RGB数组）
const STATUS_HEX: Record<string, string> = {
  IN_SERVICE: '#06D6A0',
  UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6',
  DECOMMISSIONED: '#6B7280',
};

// RGBA数组 → hex字符串
function rgbaToHex(rgba: [number, number, number, number]): string {
  const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function getCableHexColor(
  mode: string, status: string, vendorName: string | null,
  ownerNames: string[], rfsYear: number | null
): string {
  switch (mode) {
    case 'vendor':
      return rgbaToHex(vendorName && VENDOR_COLOR_MAP[vendorName] ? VENDOR_COLOR_MAP[vendorName] : VENDOR_DEFAULT);
    case 'operator':
      for (const name of ownerNames) {
        if (OPERATOR_COLOR_MAP[name]) return rgbaToHex(OPERATOR_COLOR_MAP[name]);
      }
      return rgbaToHex(OPERATOR_DEFAULT);
    case 'year':
      return rgbaToHex(getYearColor(rfsYear));
    default:
      return STATUS_HEX[status] || STATUS_HEX.IN_SERVICE;
  }
}

export default function MapLibre2D({ onHover, onClick }: MapLibre2DProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, rendered: 0 });
  const { colorMode, flyToSlug, flyToCounter, clearFlyTo, setSelectedCable } = useMapStore();
  const cablesDataRef = useRef<any[]>([]);

  // 初始化地图
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // 创建MapLibre地图实例，使用暗色底图
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{
          id: 'osm-layer',
          type: 'raster',
          source: 'osm-tiles',
          paint: {
            // 让底图变暗，营造Deep Blue的暗色风格
            'raster-brightness-max': 0.35,
            'raster-saturation': -0.5,
          },
        }],
      },
      center: [110, 20],
      zoom: 2,
      maxZoom: 12,
    });

    // 添加缩放控件
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', async () => {
      // 加载海缆数据
      try {
        const response = await fetch('/api/cables?geo=true&details=true');
        const data = await response.json();
        const cables = data.cables || [];
        cablesDataRef.current = cables;

        let renderedCount = 0;

        // 将每条海缆作为一个独立的GeoJSON source + layer添加
        // 这样可以单独控制每条海缆的颜色
        for (const cable of cables) {
          if (!cable.routeGeojson) continue;

          const vendorName = cable.vendor?.name || null;
          const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
          const rfsYear = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
          const color = getCableHexColor('status', cable.status, vendorName, ownerNames, rfsYear);

          const sourceId = `cable-${cable.slug}`;
          const layerId = `cable-layer-${cable.slug}`;

          try {
            map.addSource(sourceId, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {
                  name: cable.name,
                  slug: cable.slug,
                  status: cable.status,
                  lengthKm: cable.lengthKm,
                  fiberPairs: cable.fiberPairs,
                  vendor: vendorName,
                  owners: ownerNames.join(','),
                  rfsYear: rfsYear,
                },
                geometry: cable.routeGeojson,
              },
            });

            map.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': color,
                'line-width': 1.5,
                'line-opacity': 0.7,
              },
            });

            // 鼠标悬停效果
            map.on('mouseenter', layerId, (e) => {
              map.getCanvas().style.cursor = 'pointer';
              // 加粗高亮
              map.setPaintProperty(layerId, 'line-width', 4);
              map.setPaintProperty(layerId, 'line-color', '#ffffff');
              map.setPaintProperty(layerId, 'line-opacity', 1);

              if (onHover && e.features && e.features[0]) {
                const props = e.features[0].properties;
                onHover({
                  name: props?.name || 'Unknown',
                  status: props?.status || 'IN_SERVICE',
                  lengthKm: props?.lengthKm || null,
                  fiberPairs: props?.fiberPairs || null,
                }, { x: e.point.x, y: e.point.y });
              }
            });

            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = '';
              // 恢复原始样式
              const currentMode = useMapStore.getState().colorMode;
              const c = getCableHexColor(currentMode, cable.status, vendorName, ownerNames, rfsYear);
              map.setPaintProperty(layerId, 'line-width', 1.5);
              map.setPaintProperty(layerId, 'line-color', c);
              map.setPaintProperty(layerId, 'line-opacity', 0.7);
              if (onHover) onHover(null, { x: 0, y: 0 });
            });

            // 点击事件
            map.on('click', layerId, () => {
              if (onClick) onClick(cable.slug);
            });

            renderedCount++;
          } catch (e) { /* skip */ }
        }

        setStats({ total: cables.length, rendered: renderedCount });
      } catch (error) {
        console.error('Failed to load cables for 2D map:', error);
      }
      setLoading(false);
    });

    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // 监听颜色模式变化，重新着色所有海缆
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    for (const cable of cablesDataRef.current) {
      if (!cable.routeGeojson) continue;
      const layerId = `cable-layer-${cable.slug}`;
      const vendorName = cable.vendor?.name || null;
      const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
      const rfsYear = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
      const color = getCableHexColor(colorMode, cable.status, vendorName, ownerNames, rfsYear);

      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-color', color);
        }
      } catch (e) {}
    }
  }, [colorMode]);

  // 监听飞行指令
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToSlug) return;

    // 找到目标海缆的地理范围
    const cable = cablesDataRef.current.find(c => c.slug === flyToSlug);
    if (!cable || !cable.routeGeojson) { clearFlyTo(); return; }

    // 计算bounding box
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    const coords = cable.routeGeojson.type === 'MultiLineString'
      ? cable.routeGeojson.coordinates.flat()
      : cable.routeGeojson.coordinates || [];

    for (const c of coords) {
      if (c[0] < minLon) minLon = c[0];
      if (c[0] > maxLon) maxLon = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[1] > maxLat) maxLat = c[1];
    }

    if (minLon < maxLon) {
      // 高亮目标海缆
      const layerId = `cable-layer-${cable.slug}`;
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'line-width', 4);
        map.setPaintProperty(layerId, 'line-color', '#ffffff');
        map.setPaintProperty(layerId, 'line-opacity', 1);
      }

      // 飞行到目标区域
      map.fitBounds(
        [[minLon - 2, minLat - 2], [maxLon + 2, maxLat + 2]],
        { duration: 2000, padding: 60 }
      );

      // 8秒后恢复
      setTimeout(() => {
        const currentMode = useMapStore.getState().colorMode;
        const vendorName = cable.vendor?.name || null;
        const ownerNames = cable.owners?.map((o: any) => o.company.name) || [];
        const rfsYear = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
        const color = getCableHexColor(currentMode, cable.status, vendorName, ownerNames, rfsYear);
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'line-width', 1.5);
          map.setPaintProperty(layerId, 'line-color', color);
          map.setPaintProperty(layerId, 'line-opacity', 0.7);
        }
      }, 8000);
    }

    clearFlyTo();
  }, [flyToSlug, flyToCounter, clearFlyTo]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(13, 27, 42, 0.9)', zIndex: 100,
        }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(42,157,143,0.3)',
            borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#EDF2F7', marginTop: 16, fontSize: 14 }}>Loading 2D cable map...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && (
        <div style={{
          position: 'absolute', bottom: 20, right: 20,
          backgroundColor: 'rgba(27,58,92,0.85)', backdropFilter: 'blur(8px)',
          padding: '10px 14px', borderRadius: 8, color: '#EDF2F7', fontSize: 11, zIndex: 10,
          border: '1px solid rgba(42,157,143,0.3)',
        }}>
          <span style={{ color: '#2A9D8F', fontWeight: 600 }}>DEEP BLUE</span>
          <span style={{ color: '#6B7280', marginLeft: 8 }}>{stats.rendered} cables · 2D mode</span>
        </div>
      )}
    </div>
  );
}

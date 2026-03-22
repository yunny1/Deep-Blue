// src/components/map/CesiumGlobe.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  VENDOR_COLOR_MAP, VENDOR_DEFAULT,
  OPERATOR_COLOR_MAP, OPERATOR_DEFAULT,
  getYearColor,
} from '@/components/panels/ColorControlPanel';

interface Cable {
  id: string; name: string; slug: string; status: string;
  lengthKm: number | null; fiberPairs: number | null;
  rfsDate: string | null; routeGeojson: any;
  vendor: { name: string } | null;
  owners: Array<{ company: { name: string } }>;
}

const STATUS_COLORS: Record<string, [number, number, number, number]> = {
  IN_SERVICE:         [0.02, 0.84, 0.63, 0.7],
  UNDER_CONSTRUCTION: [0.91, 0.77, 0.42, 0.7],
  PLANNED:            [0.23, 0.51, 0.96, 0.5],
  DECOMMISSIONED:     [0.85, 0.47, 0.02, 0.7],
};
const DIM_ALPHA = 0.08;

export interface CableHoverInfo { name: string; status: string; lengthKm: number | null; fiberPairs: number | null; }

interface CesiumGlobeProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableSlug: string | null) => void;
}

function getCableColor(
  mode: string, status: string,
  vendorName: string | null, ownerNames: string[], rfsYear: number | null
): [number, number, number, number] {
  switch (mode) {
    case 'vendor':   return vendorName && VENDOR_COLOR_MAP[vendorName] ? VENDOR_COLOR_MAP[vendorName] : VENDOR_DEFAULT;
    case 'operator': for (const n of ownerNames) { if (OPERATOR_COLOR_MAP[n]) return OPERATOR_COLOR_MAP[n]; } return OPERATOR_DEFAULT;
    case 'year':     return getYearColor(rfsYear);
    default:         return STATUS_COLORS[status] || STATUS_COLORS.IN_SERVICE;
  }
}

export default function CesiumGlobe({ onHover, onClick }: CesiumGlobeProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const viewerRef       = useRef<any>(null);
  const cesiumRef       = useRef<any>(null);
  const entityMetaRef   = useRef<Map<any, { slug: string; status: string; vendor: string | null; owners: string[]; rfsYear: number | null }>>(new Map());
  const entitiesMapRef  = useRef<Map<string, any[]>>(new Map());
  const allEntitiesRef  = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats]     = useState({ total: 0, rendered: 0 });

  const {
    flyToSlug, flyToCounter, clearFlyTo,
    colorMode,
    filterStatuses, filterYearRange,
    filterVendors, filterOperators,
    searchHighlightSlugs, searchHoverSlug,
  } = useMapStore();

  // ── 初始化 Cesium ─────────────────────────────────────────────
  useEffect(() => {
    async function initCesium() {
      const Cesium = await import('cesium');
      cesiumRef.current = Cesium;
      (window as any).CESIUM_BASE_URL = '/cesium';
      if (viewerRef.current || !containerRef.current) return;

      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false, timeline: false, fullscreenButton: false,
        vrButton: false, geocoder: false, homeButton: false,
        sceneModePicker: false, baseLayerPicker: false,
        navigationHelpButton: false, infoBox: false, selectionIndicator: false,
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
            credit: 'CartoDB', maximumLevel: 12,
          })
        ),
      });

      if (viewer.scene.globe) {
        viewer.scene.globe.baseColor = new Cesium.Color(0.03, 0.05, 0.09, 1.0);
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
      }
      viewer.scene.backgroundColor = new Cesium.Color(0.03, 0.04, 0.08, 1.0);
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
        viewer.scene.skyAtmosphere.hueShift = -0.05;
        viewer.scene.skyAtmosphere.saturationShift = -0.3;
        viewer.scene.skyAtmosphere.brightnessShift = -0.3;
      }
      if (viewer.scene.sun)  viewer.scene.sun.show  = false;
      if (viewer.scene.moon) viewer.scene.moon.show = false;
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(110, 20, 20000000) });
      viewerRef.current = viewer;

      // 加载海缆
      try {
        const response = await fetch('/api/cables?geo=true&details=true');
        const data = await response.json();
        const cables: Cable[] = data.cables || [];
        setStats({ total: cables.length, rendered: 0 });
        let renderedCount = 0;
        const entitiesMap = new Map<string, any[]>();
        const allEntities: any[] = [];
        const entityMeta  = new Map();

        for (const cable of cables) {
          if (!cable.routeGeojson) continue;
          const vendorName = cable.vendor?.name || null;
          const ownerNames = cable.owners?.map(o => o.company.name) || [];
          const rfsYear    = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
          const colorArr   = getCableColor('status', cable.status, vendorName, ownerNames, rfsYear);
          const color      = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);

          try {
            const geometry = cable.routeGeojson;
            const lines = geometry.type === 'MultiLineString' ? geometry.coordinates
                        : geometry.type === 'LineString'      ? [geometry.coordinates]
                        : [];
            const cableEntities: any[] = [];
            for (const line of lines) {
              const positions: number[] = [];
              for (const coord of line) { positions.push(coord[0], coord[1]); }
              if (positions.length >= 4) {
                const entity = viewer.entities.add({
                  name: cable.name,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(positions),
                    width: 1.5, material: color, clampToGround: false,
                  },
                  properties: new Cesium.PropertyBag({
                    cableId: cable.id, cableSlug: cable.slug,
                    status: cable.status, lengthKm: cable.lengthKm, fiberPairs: cable.fiberPairs,
                  }),
                });
                cableEntities.push(entity);
                allEntities.push(entity);
                entityMeta.set(entity, { slug: cable.slug, status: cable.status, vendor: vendorName, owners: ownerNames, rfsYear });
              }
            }
            if (cableEntities.length > 0) entitiesMap.set(cable.slug, cableEntities);
            renderedCount++;
          } catch (e) {}
        }

        entitiesMapRef.current = entitiesMap;
        allEntitiesRef.current = allEntities;
        entityMetaRef.current  = entityMeta;
        setStats({ total: cables.length, rendered: renderedCount });
      } catch (error) { console.error('Failed to load cable data:', error); }

      // 鼠标交互
      if (!viewer || !viewer.scene) { setLoading(false); return; }
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      let lastHovered: any = null, lastMaterial: any = null;

      handler.setInputAction((m: any) => {
        if (lastHovered && lastMaterial) {
          try { lastHovered.polyline.material = lastMaterial; lastHovered.polyline.width = new Cesium.ConstantProperty(1.5); } catch (e) {}
          lastHovered = null; lastMaterial = null;
        }
        const picked = viewer.scene.pick(m.endPosition);
        if (Cesium.defined(picked) && picked.id?.polyline) {
          const e = picked.id;
          lastMaterial = e.polyline.material; lastHovered = e;
          e.polyline.material = new Cesium.Color(1, 1, 1, 1);
          e.polyline.width = new Cesium.ConstantProperty(3);
          if (onHover && e.properties) {
            onHover({
              name: e.name || 'Unknown',
              status: e.properties.status?.getValue() || 'IN_SERVICE',
              lengthKm: e.properties.lengthKm?.getValue() || null,
              fiberPairs: e.properties.fiberPairs?.getValue() || null,
            }, { x: m.endPosition.x, y: m.endPosition.y });
          }
          viewer.scene.canvas.style.cursor = 'pointer';
        } else {
          if (onHover) onHover(null, { x: 0, y: 0 });
          viewer.scene.canvas.style.cursor = 'default';
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction((c: any) => {
        const picked = viewer.scene.pick(c.position);
        if (Cesium.defined(picked) && picked.id?.properties) {
          const slug = picked.id.properties.cableSlug?.getValue();
          if (slug && onClick) onClick(slug);
        } else { if (onClick) onClick(null); }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      setLoading(false);
    }
    initCesium();
    return () => { if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null; } };
  }, []);

  // ── 颜色模式切换 ──────────────────────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || allEntitiesRef.current.length === 0) return;
    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;
      const colorArr = getCableColor(colorMode, meta.status, meta.vendor, meta.owners, meta.rfsYear);
      try { entity.polyline.material = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]); entity.polyline.width = new Cesium.ConstantProperty(1.5); } catch (e) {}
    }
  }, [colorMode]);

  // ── 筛选条件变化：显示/隐藏 ──────────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || allEntitiesRef.current.length === 0) return;

    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;

      const statusMatch  = filterStatuses[meta.status as keyof typeof filterStatuses] ?? true;
      const rfsYear      = meta.rfsYear;
      const yearMatch    = !rfsYear || (rfsYear >= filterYearRange[0] && rfsYear <= filterYearRange[1]);
      const vendorMatch  = filterVendors.length === 0 || filterVendors.includes(meta.vendor || '__other__');
      const operatorMatch = filterOperators.length === 0 || meta.owners.some(o => filterOperators.includes(o));
      const visible      = statusMatch && yearMatch && vendorMatch && operatorMatch;

      try {
        if (visible) {
          const colorArr = getCableColor(colorMode, meta.status, meta.vendor, meta.owners, meta.rfsYear);
          entity.polyline.material = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);
          entity.polyline.width = new Cesium.ConstantProperty(1.5);
          (entity as any).show = true;
        } else {
          (entity as any).show = false;
        }
      } catch (e) {}
    }
  }, [filterStatuses, filterYearRange, filterVendors, filterOperators, colorMode]);

  // ── 搜索高亮 ─────────────────────────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || allEntitiesRef.current.length === 0) return;

    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;

      if (searchHoverSlug) {
        if (meta.slug === searchHoverSlug) {
          entity.polyline.material = new Cesium.Color(1, 1, 1, 1);
          entity.polyline.width = new Cesium.ConstantProperty(4);
        } else {
          entity.polyline.material = new Cesium.Color(1, 1, 1, DIM_ALPHA);
          entity.polyline.width = new Cesium.ConstantProperty(0.5);
        }
      } else if (searchHighlightSlugs.length > 0) {
        if (searchHighlightSlugs.includes(meta.slug)) {
          entity.polyline.material = new Cesium.Color(1, 1, 1, 0.9);
          entity.polyline.width = new Cesium.ConstantProperty(3);
        } else {
          entity.polyline.material = new Cesium.Color(1, 1, 1, DIM_ALPHA);
          entity.polyline.width = new Cesium.ConstantProperty(0.5);
        }
      } else {
        const colorArr = getCableColor(colorMode, meta.status, meta.vendor, meta.owners, meta.rfsYear);
        entity.polyline.material = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);
        entity.polyline.width = new Cesium.ConstantProperty(1.5);
      }
    }
  }, [searchHighlightSlugs, searchHoverSlug, colorMode]);

  // ── 飞行指令 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!flyToSlug || !viewerRef.current) return;
    async function performFlyTo() {
      const Cesium = cesiumRef.current; const viewer = viewerRef.current;
      if (!Cesium || !viewer) return;
      const targetEntities = entitiesMapRef.current.get(flyToSlug!);
      if (!targetEntities || targetEntities.length === 0) { clearFlyTo(); return; }

      for (const entity of allEntitiesRef.current) {
        if (!targetEntities.includes(entity)) {
          try { entity.polyline.material = new Cesium.Color(0.3, 0.3, 0.3, DIM_ALPHA); entity.polyline.width = new Cesium.ConstantProperty(0.5); } catch (e) {}
        }
      }
      for (const entity of targetEntities) {
        try { entity.polyline.material = new Cesium.Color(1, 1, 1, 1); entity.polyline.width = new Cesium.ConstantProperty(4); } catch (e) {}
      }

      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      for (const entity of targetEntities) {
        try {
          const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now());
          if (!positions) continue;
          for (const pos of positions) {
            const c = Cesium.Cartographic.fromCartesian(pos);
            const lon = Cesium.Math.toDegrees(c.longitude);
            const lat = Cesium.Math.toDegrees(c.latitude);
            if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
          }
        } catch (e) {}
      }

      if (minLon < maxLon && minLat < maxLat) {
        const lp = (maxLon - minLon) * 0.3 + 2, ap = (maxLat - minLat) * 0.3 + 2;
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(minLon - lp, minLat - ap, maxLon + lp, maxLat + ap),
          duration: 2.0, easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        });
      }

      setTimeout(() => {
        const currentMode = useMapStore.getState().colorMode;
        for (const entity of allEntitiesRef.current) {
          const meta = entityMetaRef.current.get(entity); if (!meta) continue;
          const colorArr = getCableColor(currentMode, meta.status, meta.vendor, meta.owners, meta.rfsYear);
          try { entity.polyline.material = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]); entity.polyline.width = new Cesium.ConstantProperty(1.5); } catch (e) {}
        }
      }, 8000);
      clearFlyTo();
    }
    performFlyTo();
  }, [flyToSlug, flyToCounter, clearFlyTo]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(3, 4, 8, 0.9)', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 13, color: '#2A9D8F', letterSpacing: 2 }}>Loading global submarine cable network...</div>
          {stats.total > 0 && <div style={{ fontSize: 11, color: '#4B5563' }}>{stats.rendered} / {stats.total} cables rendered</div>}
        </div>
      )}
    </div>
  );
}

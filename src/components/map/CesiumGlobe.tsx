// src/components/map/CesiumGlobe.tsx
// 3D地球 — 恢复正常布局 + 深色无标注底图

'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  VENDOR_COLOR_MAP, VENDOR_DEFAULT,
  OPERATOR_COLOR_MAP, OPERATOR_DEFAULT,
  getYearColor,
} from '@/components/panels/ColorControlPanel';
import { splitAtAntimeridian } from '@/lib/antimeridian';

interface Cable {
  id: string; name: string; slug: string; status: string;
  lengthKm: number | null; fiberPairs: number | null;
  rfsDate: string | null; routeGeojson: any;
  vendor: { name: string } | null;
  owners: Array<{ company: { name: string } }>;
}

const STATUS_COLORS: Record<string, [number, number, number, number]> = {
  IN_SERVICE: [0.02, 0.84, 0.63, 0.7], UNDER_CONSTRUCTION: [0.91, 0.77, 0.42, 0.7],
  PLANNED: [0.23, 0.51, 0.96, 0.5], DECOMMISSIONED: [0.42, 0.42, 0.42, 0.4],
};
const DIM_ALPHA = 0.08;

export interface CableHoverInfo { name: string; status: string; lengthKm: number | null; fiberPairs: number | null; }

interface CesiumGlobeProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableSlug: string | null) => void;
}

function getCableColor(mode: string, status: string, vendorName: string | null, ownerNames: string[], rfsYear: number | null): [number, number, number, number] {
  switch (mode) {
    case 'vendor': return vendorName && VENDOR_COLOR_MAP[vendorName] ? VENDOR_COLOR_MAP[vendorName] : VENDOR_DEFAULT;
    case 'operator': for (const n of ownerNames) { if (OPERATOR_COLOR_MAP[n]) return OPERATOR_COLOR_MAP[n]; } return OPERATOR_DEFAULT;
    case 'year': return getYearColor(rfsYear);
    default: return STATUS_COLORS[status] || STATUS_COLORS.IN_SERVICE;
  }
}

export default function CesiumGlobe({ onHover, onClick }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const cesiumRef = useRef<any>(null);
  const entityMetaRef = useRef<Map<any, { slug: string; status: string; vendor: string | null; owners: string[]; rfsYear: number | null; }>>(new Map());
  const entitiesMapRef = useRef<Map<string, any[]>>(new Map());
  const allEntitiesRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, rendered: 0 });
  const { flyToSlug, flyToCounter, clearFlyTo, colorMode, filterStatuses, filterYearRange } = useMapStore();

  // 监听筛选条件变化，通过 show 属性控制海缆显示/隐藏
  useEffect(() => {
    if (!viewerRef.current) return;
    for (const [slug, entities] of entitiesMapRef.current) {
      if (entities.length === 0) continue;
      const meta = entityMetaRef.current.get(entities[0]);
      if (!meta) continue;
      const statusMatch = filterStatuses.includes(meta.status);
      const yearMatch = !meta.rfsYear ||
        (meta.rfsYear >= filterYearRange[0] && meta.rfsYear <= filterYearRange[1]);
      const visible = statusMatch && yearMatch;
      for (const entity of entities) {
        entity.show = visible;
      }
    }
  }, [filterStatuses, filterYearRange]);

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
        // 深色无标注底图（不包含国家名称、国界线，避免领土争议）
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
            credit: 'CartoDB',
            maximumLevel: 12,
          })
        ),
      });

      // 深色地球视觉风格
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
      if (viewer.scene.sun) viewer.scene.sun.show = false;
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
        const entityMeta = new Map();

        for (const cable of cables) {
          if (!cable.routeGeojson) continue;
          const vendorName = cable.vendor?.name || null;
          const ownerNames = cable.owners?.map(o => o.company.name) || [];
          const rfsYear = cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null;
          const colorArr = getCableColor('status', cable.status, vendorName, ownerNames, rfsYear);
          const color = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);

          try {
            const geometry = cable.routeGeojson;
            const rawLines = geometry.type === 'MultiLineString' ? geometry.coordinates : geometry.type === 'LineString' ? [geometry.coordinates] : [];
            // 在反子午线处拆分每条折线，防止 Cesium 在 180° 经线两侧的点之间画出错误弧线
            const lines = rawLines.flatMap((line: number[][]) => splitAtAntimeridian(line));
            const cableEntities: any[] = [];
            for (const line of lines) {
              const positions: number[] = [];
              for (const coord of line) { positions.push(coord[0], coord[1]); }
              if (positions.length >= 4) {
                const entity = viewer.entities.add({
                  name: cable.name,
                  polyline: { positions: Cesium.Cartesian3.fromDegreesArray(positions), width: 1.5, material: color, clampToGround: false },
                  properties: new Cesium.PropertyBag({ cableId: cable.id, cableSlug: cable.slug, status: cable.status, lengthKm: cable.lengthKm, fiberPairs: cable.fiberPairs }),
                });
                cableEntities.push(entity); allEntities.push(entity);
                entityMeta.set(entity, { slug: cable.slug, status: cable.status, vendor: vendorName, owners: ownerNames, rfsYear });
              }
            }
            if (cableEntities.length > 0) entitiesMap.set(cable.slug, cableEntities);
            renderedCount++;
          } catch (e) {}
        }
        entitiesMapRef.current = entitiesMap;
        allEntitiesRef.current = allEntities;
        entityMetaRef.current = entityMeta;
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
            onHover({ name: e.name || 'Unknown', status: e.properties.status?.getValue() || 'IN_SERVICE', lengthKm: e.properties.lengthKm?.getValue() || null, fiberPairs: e.properties.fiberPairs?.getValue() || null }, { x: m.endPosition.x, y: m.endPosition.y });
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

  // 颜色模式切换
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

  // 飞行指令
  useEffect(() => {
    if (!flyToSlug || !viewerRef.current) return;
    async function performFlyTo() {
      const Cesium = cesiumRef.current; const viewer = viewerRef.current;
      if (!Cesium || !viewer) return;
      const targetEntities = entitiesMapRef.current.get(flyToSlug!);
      if (!targetEntities || targetEntities.length === 0) { clearFlyTo(); return; }
      for (const entity of allEntitiesRef.current) {
        if (!targetEntities.includes(entity)) { try { entity.polyline.material = new Cesium.Color(0.3, 0.3, 0.3, DIM_ALPHA); entity.polyline.width = new Cesium.ConstantProperty(0.5); } catch (e) {} }
      }
      for (const entity of targetEntities) { try { entity.polyline.material = new Cesium.Color(1, 1, 1, 1); entity.polyline.width = new Cesium.ConstantProperty(4); } catch (e) {} }
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      for (const entity of targetEntities) {
        try {
          const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now());
          if (!positions) continue;
          for (const pos of positions) { const c = Cesium.Cartographic.fromCartesian(pos); const lon = Cesium.Math.toDegrees(c.longitude); const lat = Cesium.Math.toDegrees(c.latitude); if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
        } catch (e) {}
      }
      if (minLon < maxLon && minLat < maxLat) {
        const lp = (maxLon - minLon) * 0.3 + 2, ap = (maxLat - minLat) * 0.3 + 2;
        viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(minLon - lp, minLat - ap, maxLon + lp, maxLat + ap), duration: 2.0, easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT });
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
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(13, 27, 42, 0.9)', zIndex: 100,
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(42,157,143,0.3)',
            borderTopColor: '#2A9D8F', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: '#EDF2F7', marginTop: 16, fontSize: 14 }}>
            Loading global submarine cable network...
          </p>
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
          <span style={{ color: '#6B7280', marginLeft: 8 }}>{stats.rendered} cables rendered</span>
        </div>
      )}
    </div>
  );
}

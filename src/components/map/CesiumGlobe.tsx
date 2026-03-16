// src/components/map/CesiumGlobe.tsx
// Deep Blue 核心组件 —— 3D地球仪（带交互功能）
// 支持：海缆路由渲染、鼠标悬停高亮、点击选中、颜色编码切换

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';

// 海缆数据类型
interface Cable {
  id: string;
  name: string;
  slug: string;
  status: string;
  lengthKm: number | null;
  fiberPairs: number | null;
  routeGeojson: any;
}

// 颜色方案：按状态着色
const STATUS_COLORS: Record<string, [number, number, number, number]> = {
  IN_SERVICE:         [0.02, 0.84, 0.63, 0.7],  // 青绿
  UNDER_CONSTRUCTION: [0.91, 0.77, 0.42, 0.7],  // 琥珀
  PLANNED:            [0.23, 0.51, 0.96, 0.5],  // 蓝
  DECOMMISSIONED:     [0.42, 0.42, 0.42, 0.4],  // 灰
};

// 高亮色（悬停时）
const HIGHLIGHT_COLOR: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0];

// 从onHover/onClick回调中传出的海缆信息
export interface CableHoverInfo {
  name: string;
  status: string;
  lengthKm: number | null;
  fiberPairs: number | null;
}

interface CesiumGlobeProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableId: string | null) => void;
}

export default function CesiumGlobe({ onHover, onClick }: CesiumGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const cablesRef = useRef<Cable[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, rendered: 0 });
  const { colorMode } = useMapStore();

  useEffect(() => {
    async function initCesium() {
      const Cesium = await import('cesium');
      (window as any).CESIUM_BASE_URL = '/cesium';

      if (viewerRef.current || !containerRef.current) return;

      // 创建Viewer（使用OpenStreetMap免费底图）
      const viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.OpenStreetMapImageryProvider({
            url: 'https://tile.openstreetmap.org/',
          })
        ),
      });

      // 初始视角：亚太地区
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(110, 20, 20000000),
      });

      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
      if (viewer.scene.globe) viewer.scene.globe.enableLighting = false;

      viewerRef.current = viewer;

      // ═══ 加载海缆数据 ═══
      try {
        const response = await fetch('/api/cables?geo=true');
        const data = await response.json();
        const cables: Cable[] = data.cables || [];
        cablesRef.current = cables;

        setStats({ total: cables.length, rendered: 0 });
        let renderedCount = 0;

        for (const cable of cables) {
          if (!cable.routeGeojson) continue;

          const colorArr = STATUS_COLORS[cable.status] || STATUS_COLORS.IN_SERVICE;
          const color = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);

          try {
            const geometry = cable.routeGeojson;
            const lines = geometry.type === 'MultiLineString'
              ? geometry.coordinates
              : geometry.type === 'LineString'
                ? [geometry.coordinates]
                : [];

            for (const line of lines) {
              const positions: number[] = [];
              for (const coord of line) {
                positions.push(coord[0], coord[1]);
              }
              if (positions.length >= 4) {
                viewer.entities.add({
                  name: cable.name,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(positions),
                    width: 1.5,
                    material: color,
                    clampToGround: false,
                  },
                  properties: new Cesium.PropertyBag({
                    cableId: cable.id,
                    cableSlug: cable.slug,
                    status: cable.status,
                    lengthKm: cable.lengthKm,
                    fiberPairs: cable.fiberPairs,
                  }),
                });
              }
            }
            renderedCount++;
          } catch (e) {
            // 跳过无法解析的数据
          }
        }

        setStats({ total: cables.length, rendered: renderedCount });
      } catch (error) {
        console.error('Failed to load cable data:', error);
      }

      // ═══ 鼠标悬停事件 ═══
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      let lastHoveredEntity: any = null;
      let lastOriginalColor: any = null;

      handler.setInputAction((movement: any) => {
        const picked = viewer.scene.pick(movement.endPosition);

        // 恢复上一个悬停实体的颜色
        if (lastHoveredEntity && lastOriginalColor) {
          try {
            if (lastHoveredEntity.polyline) {
              lastHoveredEntity.polyline.material = lastOriginalColor;
              lastHoveredEntity.polyline.width = new Cesium.ConstantProperty(1.5);
            }
          } catch (e) {}
          lastHoveredEntity = null;
          lastOriginalColor = null;
        }

        if (Cesium.defined(picked) && picked.id && picked.id.polyline) {
          const entity = picked.id;

          // 保存原始颜色，设置高亮
          lastOriginalColor = entity.polyline.material;
          lastHoveredEntity = entity;
          entity.polyline.material = new Cesium.Color(
            HIGHLIGHT_COLOR[0], HIGHLIGHT_COLOR[1],
            HIGHLIGHT_COLOR[2], HIGHLIGHT_COLOR[3]
          );
          entity.polyline.width = new Cesium.ConstantProperty(3);

          // 通知父组件显示HoverCard
          if (onHover && entity.properties) {
            onHover({
              name: entity.name || 'Unknown',
              status: entity.properties.status?.getValue() || 'IN_SERVICE',
              lengthKm: entity.properties.lengthKm?.getValue() || null,
              fiberPairs: entity.properties.fiberPairs?.getValue() || null,
            }, {
              x: movement.endPosition.x,
              y: movement.endPosition.y,
            });
          }

          // 改变鼠标样式
          viewer.scene.canvas.style.cursor = 'pointer';
        } else {
          // 没有悬停在任何海缆上
          if (onHover) onHover(null, { x: 0, y: 0 });
          viewer.scene.canvas.style.cursor = 'default';
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // ═══ 鼠标点击事件 ═══
      handler.setInputAction((click: any) => {
        const picked = viewer.scene.pick(click.position);

        if (Cesium.defined(picked) && picked.id && picked.id.properties) {
          const slug = picked.id.properties.cableSlug?.getValue();
          if (slug && onClick) {
            onClick(slug);
          }
        } else {
          // 点击空白处关闭详情面板
          if (onClick) onClick(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      setLoading(false);
    }

    initCesium();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 加载中 */}
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(13, 27, 42, 0.9)', zIndex: 100,
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(42, 157, 143, 0.3)',
            borderTopColor: '#2A9D8F', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <p style={{ color: '#EDF2F7', marginTop: 16, fontSize: 14 }}>
            Loading global submarine cable network...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* 左下角信息 */}
      {!loading && (
        <div style={{
          position: 'absolute', bottom: 20, left: 20,
          backgroundColor: 'rgba(27, 58, 92, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '12px 16px', borderRadius: 8,
          color: '#EDF2F7', fontSize: 12, zIndex: 10,
          border: '1px solid rgba(42, 157, 143, 0.3)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#2A9D8F' }}>DEEP BLUE</div>
          <div>Cables rendered: {stats.rendered} / {stats.total}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11 }}>
            <span><span style={{ color: '#06D6A0' }}>●</span> In service</span>
            <span><span style={{ color: '#E9C46A' }}>●</span> Building</span>
            <span><span style={{ color: '#3B82F6' }}>●</span> Planned</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#6B7280' }}>
            Hover to preview · Click for details
          </div>
        </div>
      )}
    </div>
  );
}

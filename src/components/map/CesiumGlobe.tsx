// src/components/map/CesiumGlobe.tsx
// Deep Blue 的核心组件 —— 3D地球仪
// 加载CesiumJS，渲染地球，加载所有海缆路由线

'use client'; // 告诉Next.js这是一个客户端组件（需要浏览器API）

import { useEffect, useRef, useState } from 'react';

// 海缆数据类型
interface Cable {
  id: string;
  name: string;
  slug: string;
  status: string;
  lengthKm: number | null;
  routeGeojson: any;
}

// 根据海缆状态返回对应颜色
function getStatusColor(status: string): [number, number, number, number] {
  switch (status) {
    case 'IN_SERVICE':         return [0.02, 0.84, 0.63, 0.8];  // 青绿色
    case 'UNDER_CONSTRUCTION': return [0.91, 0.77, 0.42, 0.8];  // 琥珀色
    case 'PLANNED':            return [0.23, 0.51, 0.96, 0.6];  // 蓝色
    default:                   return [0.42, 0.42, 0.42, 0.5];  // 灰色
  }
}

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, rendered: 0 });

  useEffect(() => {
    // CesiumJS 非常大（~3MB），必须动态导入，不能在服务端渲染
    async function initCesium() {
      // 动态导入CesiumJS
      const Cesium = await import('cesium');

      // 设置CesiumJS的全局配置
      (window as any).CESIUM_BASE_URL = '/cesium';

      // 如果已经初始化过了，不要重复创建（React Strict Mode会调用两次）
      if (viewerRef.current || !containerRef.current) return;

      // 创建3D地球查看器
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

      // 设置初始视角：从太空俯瞰亚太地区
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(110, 20, 20000000), // 经度, 纬度, 高度(米)
      });

      // 设置地球大气层效果
      if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
      if (viewer.scene.globe) viewer.scene.globe.enableLighting = false;// 关闭日照效果（保持全球统一亮度）

      viewerRef.current = viewer;

      // 从API加载海缆数据
      try {
        const response = await fetch('/api/cables?geo=true');
        const data = await response.json();
        const cables: Cable[] = data.cables || [];

        setStats({ total: cables.length, rendered: 0 });
        let renderedCount = 0;

        // 逐条渲染海缆路由线到地球上
        for (const cable of cables) {
          if (!cable.routeGeojson) continue;

          const color = getStatusColor(cable.status);
          const cesiumColor = new Cesium.Color(color[0], color[1], color[2], color[3]);

          try {
            // GeoJSON可能包含多条线段（MultiLineString）
            const geometry = cable.routeGeojson;

            if (geometry.type === 'MultiLineString') {
              // 海缆路由通常是MultiLineString（多段折线）
              for (const line of geometry.coordinates) {
                const positions: number[] = [];
                for (const coord of line) {
                  positions.push(coord[0], coord[1]); // [经度, 纬度]
                }
                if (positions.length >= 4) { // 至少需要2个点
                  viewer.entities.add({
                    name: cable.name,
                    polyline: {
                      positions: Cesium.Cartesian3.fromDegreesArray(positions),
                      width: 1.5,
                      material: cesiumColor,
                      clampToGround: false, // 不贴地，让线浮在海面上方一点
                    },
                    properties: {
                      cableId: cable.id,
                      status: cable.status,
                      lengthKm: cable.lengthKm,
                    },
                  });
                }
              }
            } else if (geometry.type === 'LineString') {
              // 单条线段
              const positions: number[] = [];
              for (const coord of geometry.coordinates) {
                positions.push(coord[0], coord[1]);
              }
              if (positions.length >= 4) {
                viewer.entities.add({
                  name: cable.name,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(positions),
                    width: 1.5,
                    material: cesiumColor,
                    clampToGround: false,
                  },
                  properties: {
                    cableId: cable.id,
                    status: cable.status,
                    lengthKm: cable.lengthKm,
                  },
                });
              }
            }

            renderedCount++;
          } catch (e) {
            // 跳过无法解析的GeoJSON数据
          }
        }

        setStats({ total: cables.length, rendered: renderedCount });
      } catch (error) {
        console.error('Failed to load cable data:', error);
      }

      setLoading(false);
    }

    initCesium();

    // 组件卸载时销毁Cesium Viewer（释放内存）
    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* CesiumJS渲染容器 */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 加载中指示器 */}
      {loading && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(13, 27, 42, 0.9)',
          zIndex: 100,
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

      {/* 左下角统计信息 */}
      {!loading && (
        <div style={{
          position: 'absolute', bottom: 20, left: 20,
          backgroundColor: 'rgba(27, 58, 92, 0.85)',
          backdropFilter: 'blur(8px)',
          padding: '12px 16px', borderRadius: 8,
          color: '#EDF2F7', fontSize: 12, zIndex: 10,
          border: '1px solid rgba(42, 157, 143, 0.3)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#2A9D8F' }}>
            DEEP BLUE
          </div>
          <div>Cables rendered: {stats.rendered} / {stats.total}</div>
          <div style={{ marginTop: 4, display: 'flex', gap: 12, fontSize: 11 }}>
            <span><span style={{ color: '#06D6A0' }}>●</span> In service</span>
            <span><span style={{ color: '#E9C46A' }}>●</span> Under construction</span>
            <span><span style={{ color: '#3B82F6' }}>●</span> Planned</span>
          </div>
        </div>
      )}
    </div>
  );
}

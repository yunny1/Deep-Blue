// src/components/map/CesiumGlobe.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { COUNTRY_LABELS, getLabelText } from '@/lib/country-labels';
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
  isApproximateRoute?: boolean;  // v9: 大圆弧近似路由
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

// 地震风险等级颜色（与 UI 整体配色一致）
const QUAKE_RISK_COLORS: Record<string, [number, number, number, number]> = {
  HIGH:   [0.94, 0.27, 0.27, 0.9],  // #EF4444
  MEDIUM: [0.98, 0.45, 0.09, 0.85], // #F97316
  LOW:    [0.91, 0.77, 0.42, 0.75], // #E9C46A
};

export interface CableHoverInfo { name: string; status: string; lengthKm: number | null; fiberPairs: number | null; }
interface CesiumGlobeProps {
  onHover?: (cable: CableHoverInfo | null, position: { x: number; y: number }) => void;
  onClick?: (cableSlug: string | null) => void;
}

function getCableColor(mode: string, status: string, vendorName: string | null, ownerNames: string[], rfsYear: number | null): [number, number, number, number] {
  switch (mode) {
    case 'vendor':   return vendorName && VENDOR_COLOR_MAP[vendorName] ? VENDOR_COLOR_MAP[vendorName] : VENDOR_DEFAULT;
    case 'operator': for (const n of ownerNames) { if (OPERATOR_COLOR_MAP[n]) return OPERATOR_COLOR_MAP[n]; } return OPERATOR_DEFAULT;
    case 'year':     return getYearColor(rfsYear);
    default:         return STATUS_COLORS[status] || STATUS_COLORS.IN_SERVICE;
  }
}

export default function CesiumGlobe({ onHover, onClick }: CesiumGlobeProps) {

  // v9: Helper — 恢复海缆正常材质（区分虚线近似路由和实线真实路由）
  function restoreCableMaterial(Cesium: any, entity: any, meta: any, cm: string) {
    const colorArr = getCableColor(cm, meta.status, meta.vendor, meta.owners, meta.rfsYear);
    try {
      if (meta.isApprox) {
        entity.polyline.material = new Cesium.PolylineDashMaterialProperty({
          color: new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3] * 0.7),
          dashLength: 16,
        });
        entity.polyline.width = new Cesium.ConstantProperty(1.2);
      } else {
        entity.polyline.material = new Cesium.Color(colorArr[0], colorArr[1], colorArr[2], colorArr[3]);
        entity.polyline.width = new Cesium.ConstantProperty(1.5);
      }
    } catch (e) {}
  }
  const containerRef   = useRef<HTMLDivElement>(null);
  const viewerRef      = useRef<any>(null);
  const cesiumRef      = useRef<any>(null);
  const entityMetaRef  = useRef<Map<any, { slug: string; status: string; vendor: string | null; owners: string[]; rfsYear: number | null; isApprox: boolean }>>(new Map());
  const entitiesMapRef = useRef<Map<string, any[]>>(new Map());
  const allEntitiesRef = useRef<any[]>([]);
  const quakeRippleRef = useRef<any[]>([]);
  const quakeAnimRef   = useRef<any>(null);
  // 当前高亮的海缆信息，用组件级 ref 存储
  // 这样 useEffect（监听面板关闭）也能访问到，而不只是 initCesium 闭包内部
  const lastHoveredRef     = useRef<any>(null);
  const lastHoveredSlugRef = useRef<string | null>(null);
  // flyTo 하이라이트 중인 slug 추적 (검색 effect가 덮어쓰지 않도록)
  const flyHighlightRef    = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [stats, setStats]     = useState({ total: 0, rendered: 0 });

  const {
    flyToSlug, flyToCounter, clearFlyTo,
    colorMode,
    filterStatuses, filterYearRange,
    filterVendors, filterOperators,
    searchHighlightSlugs, searchHoverSlug,
    earthquakeHighlight,
    selectedCableId,
  } = useMapStore();

  // ── 初始化 ────────────────────────────────────────────────────
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

    // 在 viewer.camera.setView(...) 之前插入：
    const locale = localStorage.getItem('deep-blue-locale');

    COUNTRY_LABELS.forEach((label) => {
      const maxDist = label.importance === 1
        ? 15_000_000   // 大国：远距离可见
        : label.importance === 2
        ? 8_000_000    // 中等国家：中距离可见
        : 4_000_000;   // 小国/岛国：只有放大才可见

      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(label.lng, label.lat),
       label: {
        text: getLabelText(label, locale),
        // ✅ 字体调大，按重要性分级
        font: label.importance === 1 ? '15px sans-serif'
            : label.importance === 2 ? '13px sans-serif'
            : '11px sans-serif',
        fillColor: label.type === 'ocean'
          ? Cesium.Color.fromCssColorString('#1E6091')
          : Cesium.Color.fromCssColorString('#6B8DB5'),
        outlineColor: Cesium.Color.fromCssColorString('#0a0f1a'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, maxDist),
        scaleByDistance: new Cesium.NearFarScalar(1_000_000, 1.2, 15_000_000, 0.6),
        // ✅ 删掉 disableDepthTestDistance，让地球自然遮挡背面标注
      },
      });
    });
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(110, 20, 20000000) });
      viewerRef.current = viewer;

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
                // v9: 近似路由用虚线材质，真实路由用实线
                const isApprox = cable.isApproximateRoute || false;
                const material = isApprox
                  ? new Cesium.PolylineDashMaterialProperty({
                      color: new Cesium.Color(color.red, color.green, color.blue, color.alpha * 0.7),
                      dashLength: 16,
                    })
                  : color;

                const entity = viewer.entities.add({
                  name: cable.name,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(positions),
                    width: isApprox ? 1.2 : 1.5,
                    material,
                    clampToGround: false,
                  },
                  properties: new Cesium.PropertyBag({
                    cableId: cable.id, cableSlug: cable.slug, status: cable.status,
                    lengthKm: cable.lengthKm, fiberPairs: cable.fiberPairs,
                    isApproximateRoute: isApprox,
                  }),
                });
                cableEntities.push(entity);
                allEntities.push(entity);
                entityMeta.set(entity, { slug: cable.slug, status: cable.status, vendor: vendorName, owners: ownerNames, rfsYear, isApprox: cable.isApproximateRoute || false });
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

      // ── MOUSE_MOVE ───────────────────────────────────────────────────────
      // 规则：悬浮只负责"第一次触发高亮"。
      // 一旦某条缆被高亮，鼠标移到其他缆上不会改变高亮。
      // 高亮只有两种方式清除：点击别的缆、或点击关闭按钮。
      handler.setInputAction((m: any) => {
        const picked = viewer.scene.pick(m.endPosition);

        if (Cesium.defined(picked) && picked.id?.polyline) {
          const e    = picked.id;
          const slug = entityMetaRef.current.get(e)?.slug ?? null;

          // 如果当前已经有高亮缆，悬浮不做任何切换，只更新 cursor 和 hover 信息卡
          if (lastHoveredSlugRef.current !== null) {
            viewer.scene.canvas.style.cursor = 'pointer';
            if (onHover && e.properties) {
              onHover({
                name: e.name || 'Unknown',
                status: e.properties.status?.getValue() || 'IN_SERVICE',
                lengthKm: e.properties.lengthKm?.getValue() || null,
                fiberPairs: e.properties.fiberPairs?.getValue() || null,
              }, { x: m.endPosition.x, y: m.endPosition.y });
            }
            return; // ← 关键：已有高亮时直接返回，不做任何高亮变更
          }

          // 没有高亮时，悬浮触发第一次高亮
          if (slug && slug !== lastHoveredSlugRef.current) {
            lastHoveredRef.current     = e;
            lastHoveredSlugRef.current = slug;
            const siblings = entitiesMapRef.current.get(slug) || [];
            for (const sibling of siblings) {
              try {
                sibling.polyline.material = new Cesium.Color(1, 1, 1, 1);
                sibling.polyline.width    = new Cesium.ConstantProperty(3);
              } catch {}
            }
          }

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
          // 鼠标移到空白区域：只重置 cursor 和 hover 卡，不影响高亮
          if (onHover) onHover(null, { x: 0, y: 0 });
          viewer.scene.canvas.style.cursor = 'default';
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // ── LEFT_CLICK ───────────────────────────────────────────────────────
      // 点击缆：将高亮切换到被点击的缆，然后打开详情面板
      // 点击空白：关闭面板（面板关闭会触发 useEffect 清除高亮）
      handler.setInputAction((c: any) => {
        const picked = viewer.scene.pick(c.position);
        if (Cesium.defined(picked) && picked.id?.properties) {
          const slug = picked.id.properties.cableSlug?.getValue();
          if (!slug) return;

          // 如果点击的是和当前高亮不同的缆，先恢复旧缆，再高亮新缆
          if (lastHoveredSlugRef.current && lastHoveredSlugRef.current !== slug) {
            const oldSiblings = entitiesMapRef.current.get(lastHoveredSlugRef.current) || [];
            for (const sibling of oldSiblings) {
              const meta = entityMetaRef.current.get(sibling);
              if (!meta) continue;
              try { restoreCableMaterial(Cesium, sibling, meta, useMapStore.getState().colorMode); } catch {}
            }
          }

          // 高亮被点击的缆
          lastHoveredRef.current     = picked.id;
          lastHoveredSlugRef.current = slug;
          const newSiblings = entitiesMapRef.current.get(slug) || [];
          for (const sibling of newSiblings) {
            try {
              sibling.polyline.material = new Cesium.Color(1, 1, 1, 1);
              sibling.polyline.width    = new Cesium.ConstantProperty(3);
            } catch {}
          }

          if (onClick) onClick(slug);
        } else {
          // 点击空白：关闭面板（selectedCableId → null → useEffect 清除高亮）
          if (onClick) onClick(null);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      setLoading(false);
    }
    initCesium();
    return () => { if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null; } };
  }, []);

  // ── 面板关闭时清除高亮 ─────────────────────────────────────────
  // 当用户点击 CableDetailPanel 的关闭按钮时，selectedCableId 变为 null。
  // 此时恢复被高亮的那条缆的正常材质，完成"关闭面板 → 清除高亮"这个退出路径。
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || selectedCableId !== null) return;
    const slug = lastHoveredSlugRef.current;
    if (!slug) return;
    const siblings = entitiesMapRef.current.get(slug) || [];
    for (const sibling of siblings) {
      const meta = entityMetaRef.current.get(sibling);
      if (!meta) continue;
      try { restoreCableMaterial(Cesium, sibling, meta, colorMode); } catch {}
    }
    lastHoveredRef.current     = null;
    lastHoveredSlugRef.current = null;
  }, [selectedCableId, colorMode]);

  // ── 颜色模式切换 ──────────────────────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || allEntitiesRef.current.length === 0) return;
    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;
      try { restoreCableMaterial(Cesium, entity, meta, colorMode); } catch (e) {}
    }
  }, [colorMode]);

  // ── 筛选条件变化 ─────────────────────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    if (!Cesium || allEntitiesRef.current.length === 0) return;
    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;
      const statusMatch   = filterStatuses[meta.status as keyof typeof filterStatuses] ?? true;
      const yearMatch     = !meta.rfsYear || (meta.rfsYear >= filterYearRange[0] && meta.rfsYear <= filterYearRange[1]);
      const vendorMatch   = filterVendors.length === 0   || filterVendors.includes(meta.vendor || '__other__');
      const operatorMatch = filterOperators.length === 0 || meta.owners.some(o => filterOperators.includes(o));
      const visible       = statusMatch && yearMatch && vendorMatch && operatorMatch;
      try {
        if (visible) {
          restoreCableMaterial(Cesium, entity, meta, colorMode);
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
    const flySlug = flyHighlightRef.current;   // flyTo 正在高亮的缆，跳过不干预
    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;
      // flyTo 高亮保护：当 flyTo 正在高亮某条缆时，搜索 effect 不覆盖它
      if (flySlug && meta.slug === flySlug) continue;
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
        restoreCableMaterial(Cesium, entity, meta, colorMode);
      }
    }
  }, [searchHighlightSlugs, searchHoverSlug, colorMode]);

  // ── 地震高亮：扩散圆 + 海缆染色 ─────────────────────────────
  useEffect(() => {
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!Cesium || !viewer) return;

    // 清除旧的扩散圆
    clearTimeout(quakeAnimRef.current);
    for (const e of quakeRippleRef.current) {
      try { viewer.entities.remove(e); } catch {}
    }
    quakeRippleRef.current = [];

    if (!earthquakeHighlight) {
      // 恢复海缆原色
      for (const entity of allEntitiesRef.current) {
        const meta = entityMetaRef.current.get(entity);
        if (!meta || !entity.polyline) continue;
        restoreCableMaterial(Cesium, entity, meta, colorMode);
      }
      return;
    }

    const { lat, lng, magnitude, affectedCables } = earthquakeHighlight;

    // 飞到震中
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lng, lat, 3000000 + magnitude * 500000),
      duration: 2.0,
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });

    // 震中标记点
    const epicenter = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lng, lat),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#EF4444'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    quakeRippleRef.current.push(epicenter);

    // 扩散圆动画：3个圆依次扩散，模拟地震波
    // 半径基于震级：M5 → 200km，M6 → 400km，M7 → 700km
    const maxRadiusMeters = Math.pow(10, magnitude - 3) * 1000;

    let frame = 0;
    const totalFrames = 120; // 约4秒（30fps）
    const rippleEntities: any[] = [];

    // 创建3个扩散圆
    for (let ring = 0; ring < 3; ring++) {
      const delay = ring * 0.33; // 错开1/3周期
      const ripple = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lng, lat),
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(() => {
            const t = ((frame / totalFrames + delay) % 1);
            return maxRadiusMeters * t;
          }, false),
          semiMinorAxis: new Cesium.CallbackProperty(() => {
            const t = ((frame / totalFrames + delay) % 1);
            return maxRadiusMeters * t;
          }, false),
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              const t = ((frame / totalFrames + delay) % 1);
              const alpha = (1 - t) * 0.4; // 越扩越透明
              return Cesium.Color.fromCssColorString('#EF4444').withAlpha(alpha);
            }, false)
          ),
          outline: true,
          outlineColor: new Cesium.CallbackProperty(() => {
            const t = ((frame / totalFrames + delay) % 1);
            const alpha = (1 - t) * 0.8;
            return Cesium.Color.fromCssColorString('#EF4444').withAlpha(alpha);
          }, false),
          outlineWidth: 2,
          height: 0,
        },
      });
      rippleEntities.push(ripple);
      quakeRippleRef.current.push(ripple);
    }

    // 动画循环
    const animate = () => {
      frame = (frame + 1) % totalFrames;
      quakeAnimRef.current = setTimeout(animate, 33); // ~30fps
    };
    quakeAnimRef.current = setTimeout(animate, 33);

    // 海缆染色：受影响的按风险等级染色，不受影响的暗化
    const affectedSlugs = new Set(affectedCables.map(c => c.cableSlug));
    const slugToRisk = new Map(affectedCables.map(c => [c.cableSlug, c.riskLevel]));

    for (const entity of allEntitiesRef.current) {
      const meta = entityMetaRef.current.get(entity);
      if (!meta || !entity.polyline) continue;
      try {
        if (affectedSlugs.has(meta.slug)) {
          const risk     = slugToRisk.get(meta.slug) || 'LOW';
          const riskColor = QUAKE_RISK_COLORS[risk];
          entity.polyline.material = new Cesium.Color(riskColor[0], riskColor[1], riskColor[2], riskColor[3]);
          entity.polyline.width    = new Cesium.ConstantProperty(risk === 'HIGH' ? 4 : risk === 'MEDIUM' ? 3 : 2);
        } else {
          entity.polyline.material = new Cesium.Color(1, 1, 1, DIM_ALPHA);
          entity.polyline.width    = new Cesium.ConstantProperty(0.5);
        }
      } catch (e) {}
    }

    return () => {
      clearTimeout(quakeAnimRef.current);
    };
  }, [earthquakeHighlight]);

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
      // 记录当前 flyTo 高亮的 slug，防止搜索 effect 在 clearFlyTo 触发重渲染时覆盖高亮
      flyHighlightRef.current = flyToSlug!;
      for (const entity of targetEntities) {
        try { entity.polyline.material = new Cesium.Color(1, 1, 1, 1); entity.polyline.width = new Cesium.ConstantProperty(4); } catch (e) {}
      }

      // ── Bug Fix 1: 反子午线安全的 bbox 计算 ──────────────────────────────────
      // 旧方案用 Cartographic 把经度归一化到 -180~180，跨太平洋缆（如 MYUS）的
      // minLon=-124°(Oregon) maxLon=144°(Guam)，Rectangle 被解释为向东穿越大西洋。
      // 新方案：连续经度追踪，每个点相对前一个点做 ±360 调整，保持路线连续性。
      let prevLon: number | null = null;
      let cMinLon = Infinity, cMaxLon = -Infinity, minLat = 90, maxLat = -90;
      for (const entity of targetEntities) {
        try {
          const positions = entity.polyline.positions.getValue(Cesium.JulianDate.now());
          if (!positions) continue;
          for (const pos of positions) {
            const cart = Cesium.Cartographic.fromCartesian(pos);
            let lon = Cesium.Math.toDegrees(cart.longitude);
            const lat = Cesium.Math.toDegrees(cart.latitude);
            // 调整经度使其与前一个点差值 ≤ 180°（跨子午线时不回绕）
            if (prevLon !== null) {
              while (lon - prevLon >  180) lon -= 360;
              while (prevLon - lon >  180) lon += 360;
            }
            prevLon = lon;
            if (lon < cMinLon) cMinLon = lon; if (lon > cMaxLon) cMaxLon = lon;
            if (lat < minLat) minLat = lat;   if (lat > maxLat) maxLat = lat;
          }
        } catch (e) {}
      }

      if (isFinite(cMinLon) && minLat < maxLat) {
        let centerLon = (cMinLon + cMaxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        const lonSpan = cMaxLon - cMinLon;
        const latSpan = maxLat - minLat;
        // 根据跨度估算所需高度（最小 800km，最大 15000km）
        const spanKm = Math.max(lonSpan * 111 * Math.cos(centerLat * Math.PI / 180), latSpan * 111);
        const altitude = Math.min(Math.max(spanKm * 1500, 800000), 15000000);
        // 把连续经度归回 [-180, 180]
        while (centerLon >  180) centerLon -= 360;
        while (centerLon < -180) centerLon += 360;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, altitude),
          duration: 2.0, easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        });
      }

      // ── 8秒后恢复：优先保留搜索高亮，无搜索则恢复原色 ──────────────────────
      setTimeout(() => {
        flyHighlightRef.current = null;   // 解除 flyTo 高亮保护
        const { searchHighlightSlugs: hlSlugs, searchHoverSlug: hvSlug, colorMode: cm } = useMapStore.getState();
        for (const entity of allEntitiesRef.current) {
          const meta = entityMetaRef.current.get(entity);
          if (!meta || !entity.polyline) continue;
          try {
            if (hvSlug) {
              entity.polyline.material = new Cesium.Color(1,1,1, meta.slug === hvSlug ? 1 : DIM_ALPHA);
              entity.polyline.width    = new Cesium.ConstantProperty(meta.slug === hvSlug ? 4 : 0.5);
            } else if (hlSlugs.length > 0) {
              entity.polyline.material = new Cesium.Color(1,1,1, hlSlugs.includes(meta.slug) ? 0.9 : DIM_ALPHA);
              entity.polyline.width    = new Cesium.ConstantProperty(hlSlugs.includes(meta.slug) ? 3 : 0.5);
            } else {
              restoreCableMaterial(cesiumRef.current, entity, meta, cm);
            }
          } catch (e) {}
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
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,4,8,0.9)', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(42,157,143,0.2)', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 13, color: '#2A9D8F', letterSpacing: 2 }}>Loading global submarine cable network...</div>
          {stats.total > 0 && <div style={{ fontSize: 11, color: '#4B5563' }}>{stats.rendered} / {stats.total} cables rendered</div>}
        </div>
      )}
    </div>
  );
}

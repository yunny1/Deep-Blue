'use client';

/**
 * BRICSMap — BRICS 专属地图图层
 *
 * 设计思路：
 *   不重新创建 MapLibre 实例，而是作为 overlay 层叠加在已有地图上。
 *   如果在独立的 /brics 页面使用，则自行初始化 MapLibre。
 *
 * 功能：
 *   1. 加载所有海缆 GeoJSON，按 BRICS 分类着色
 *   2. BRICS 内部海缆 → 金色发光
 *   3. BRICS → 非 BRICS 海缆 → 银色
 *   4. 非 BRICS 海缆 → 暗灰，降低透明度
 *   5. BRICS 成员国领土金色半透明填充（使用 Natural Earth GeoJSON）
 *
 * 依赖：maplibre-gl（项目已有）
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS,
  BRICS_ALL,
  BRICS_COUNTRY_META,
  BRICS_COLORS,
} from '@/lib/brics-constants';

// ─── 类型 ────────────────────────────────────────────────

interface CableGeoFeature {
  slug: string;
  name: string;
  countries: string[];
  /** 路由坐标 */
  coordinates: [number, number][];
  /** 是否 BRICS 内部 */
  bricsInternal: boolean;
  /** 是否 BRICS 相关 */
  bricsRelated: boolean;
}

interface BRICSMapProps {
  /** 地图容器高度 */
  height?: string;
  /** 初始缩放 */
  initialZoom?: number;
  /** 初始中心 */
  initialCenter?: [number, number];
  /** 地图底图样式 URL（默认使用深色底图） */
  mapStyle?: string;
}

// ─── BRICS 国家 ISO alpha-2 → Natural Earth 属性名映射 ──
//    Natural Earth GeoJSON 通常用 ISO_A2 或 ISO_A2_EH 字段

const BRICS_ALL_SET = new Set<string>(BRICS_ALL);
const BRICS_MEMBER_SET = new Set<string>(BRICS_MEMBERS);

// ─── 主组件 ──────────────────────────────────────────────

export default function BRICSMap({
  height = '600px',
  initialZoom = 2,
  initialCenter = [60, 20],
  mapStyle,
}: BRICSMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    internal: number;
    related: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ── 初始化地图 ──────────────────────────────────
    const map = new maplibregl.Map({
      container: containerRef.current,
      // 深色底图。如果项目有自定义样式则替换此 URL
      style: mapStyle || 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
      fadeDuration: 0,
    });

    mapRef.current = map;

    map.on('load', async () => {
      try {
        // ── 1. 加载海缆数据 ────────────────────────
        const res = await fetch('/api/cables?includeRoutes=true');
        if (!res.ok) throw new Error(`Cables API: ${res.status}`);
        const cables = await res.json();

        // 分类海缆
        let internalCount = 0;
        let relatedCount = 0;

        const internalFeatures: GeoJSON.Feature[] = [];
        const relatedFeatures: GeoJSON.Feature[] = [];
        const otherFeatures: GeoJSON.Feature[] = [];

        for (const cable of cables) {
          // 国家代码：从 landing stations 的 countryCode 聚合
          const countries: string[] = (cable.countries || cable.countryCodes || []).map(
            (c: string) => c.toUpperCase()
          );

          // routeGeojson 是 GeoJSON geometry: { type: 'LineString'|'MultiLineString', coordinates }
          const geom = cable.routeGeojson;
          if (!geom?.coordinates || !geom.type) continue;

          // 统一为 GeoJSON geometry，支持 LineString 和 MultiLineString
          const geometry: GeoJSON.Geometry =
            geom.type === 'MultiLineString'
              ? { type: 'MultiLineString', coordinates: geom.coordinates }
              : { type: 'LineString', coordinates: geom.coordinates };

          // 基本有效性检查
          const coordsFlat =
            geom.type === 'MultiLineString'
              ? (geom.coordinates as number[][][]).flat()
              : (geom.coordinates as number[][]);
          if (coordsFlat.length < 2) continue;

          const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: {
              slug: cable.slug,
              name: cable.name,
              status: cable.status,
            },
            geometry,
          };

          const allBRICS = countries.length >= 2 && countries.every((c: string) => BRICS_ALL_SET.has(c));
          const anyBRICS = countries.some((c: string) => BRICS_ALL_SET.has(c));

          if (allBRICS) {
            internalFeatures.push(feature);
            internalCount++;
          } else if (anyBRICS) {
            relatedFeatures.push(feature);
            relatedCount++;
          } else {
            otherFeatures.push(feature);
          }
        }

        setStats({
          internal: internalCount,
          related: relatedCount,
          total: cables.length,
        });

        // ── 2. 添加海缆图层 ────────────────────────

        // 非 BRICS 海缆 — 暗灰
        map.addSource('cables-other', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: otherFeatures },
        });
        map.addLayer({
          id: 'cables-other-line',
          type: 'line',
          source: 'cables-other',
          paint: {
            'line-color': '#3A3F4A',
            'line-width': 0.8,
            'line-opacity': 0.25,
          },
        });

        // BRICS → 非 BRICS 海缆 — 银色
        map.addSource('cables-related', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: relatedFeatures },
        });
        map.addLayer({
          id: 'cables-related-line',
          type: 'line',
          source: 'cables-related',
          paint: {
            'line-color': BRICS_COLORS.silver,
            'line-width': 1.2,
            'line-opacity': 0.5,
          },
        });

        // BRICS 内部海缆 — 金色发光（双层：外层模糊 + 内层清晰）
        map.addSource('cables-internal', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: internalFeatures },
        });
        // 外层发光
        map.addLayer({
          id: 'cables-internal-glow',
          type: 'line',
          source: 'cables-internal',
          paint: {
            'line-color': BRICS_COLORS.gold,
            'line-width': 6,
            'line-opacity': 0.15,
            'line-blur': 4,
          },
        });
        // 内层线条
        map.addLayer({
          id: 'cables-internal-line',
          type: 'line',
          source: 'cables-internal',
          paint: {
            'line-color': BRICS_COLORS.gold,
            'line-width': 1.8,
            'line-opacity': 0.85,
          },
        });

        // ── 3. BRICS 成员国标注点 ───────────────────
        const labelFeatures: GeoJSON.Feature[] = BRICS_MEMBERS.map((code) => {
          const meta = BRICS_COUNTRY_META[code];
          return {
            type: 'Feature',
            properties: {
              code,
              name: meta?.nameZh ?? code,
            },
            geometry: {
              type: 'Point',
              coordinates: meta?.center ?? [0, 0],
            },
          };
        });

        map.addSource('brics-labels', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: labelFeatures },
        });

        // 标注圆点
        map.addLayer({
          id: 'brics-label-dot',
          type: 'circle',
          source: 'brics-labels',
          paint: {
            'circle-radius': 5,
            'circle-color': BRICS_COLORS.gold,
            'circle-opacity': 0.7,
            'circle-stroke-color': BRICS_COLORS.goldDark,
            'circle-stroke-width': 1,
          },
        });

        // 国家名称
        map.addLayer({
          id: 'brics-label-text',
          type: 'symbol',
          source: 'brics-labels',
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': BRICS_COLORS.goldLight,
            'text-halo-color': BRICS_COLORS.navy,
            'text-halo-width': 1.5,
          },
        });

        // ── 4. 交互：hover 高亮海缆名称 ────────────
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          className: 'brics-popup',
        });

        for (const layerId of ['cables-internal-line', 'cables-related-line']) {
          map.on('mouseenter', layerId, (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const props = e.features?.[0]?.properties;
            if (props?.name) {
              popup
                .setLngLat(e.lngLat)
                .setHTML(
                  `<div style="font-size:12px;font-weight:600;color:#F0E6C8">${props.name}</div>`
                )
                .addTo(map);
            }
          });
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
          });
        }
      } catch (err) {
        console.error('[BRICSMap] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
      {/* 地图容器 */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          borderRadius: '12px',
          border: '1px solid rgba(212, 175, 55, 0.12)',
        }}
      />

      {/* 加载指示器 */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10, 22, 40, 0.8)',
            borderRadius: '12px',
            zIndex: 10,
          }}
        >
          <span style={{ color: BRICS_COLORS.goldLight, fontSize: '14px' }}>
            正在加载 BRICS 海缆数据…
          </span>
        </div>
      )}

      {/* 右下角图层图例 */}
      {stats && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            background: 'rgba(10, 22, 40, 0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            border: '1px solid rgba(212, 175, 55, 0.12)',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: BRICS_COLORS.gold,
                borderRadius: '1px',
                boxShadow: `0 0 6px ${BRICS_COLORS.gold}44`,
              }}
            />
            BRICS 内部 ({stats.internal})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: BRICS_COLORS.silver,
                borderRadius: '1px',
              }}
            />
            BRICS ↔ 外部 ({stats.related})
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '18px',
                height: '3px',
                background: '#3A3F4A',
                borderRadius: '1px',
              }}
            />
            非 BRICS ({stats.total - stats.internal - stats.related})
          </div>
        </div>
      )}

      {/* 全局样式：popup */}
      <style>{`
        .brics-popup .maplibregl-popup-content {
          background: rgba(15, 29, 50, 0.95);
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 6px;
          padding: 6px 10px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .brics-popup .maplibregl-popup-tip {
          border-top-color: rgba(15, 29, 50, 0.95);
        }
      `}</style>
    </div>
  );
}


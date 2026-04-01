'use client';
// src/components/sovereign/SovereignNetworkMap.tsx
//
// 修复点：
// 1. 加载状态改为 React state 控制（不再依赖 DOM 操作），更可靠
// 2. API 失败时仍显示地图（只是没有海缆路由），不会永远卡在"加载中"
// 3. 流光动画圆点沿真实路径移动
// 4. 默认无动画，仅选中后激活

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import { riskColor, type SovereignRoute } from '@/lib/sovereign-routes';

interface CableData {
  slug: string;
  name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
}
interface ApiResponse {
  cables: CableData[];
  nameIndex: Record<string, string>;
}
interface Props {
  height?: string;
  routes: SovereignRoute[];
  selectedRouteId: string | null;
  onRouteSelect: (id: string | null) => void;
}

function flattenCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][];
  if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
  return [];
}

function computeBbox(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]);
  const lats  = coords.map(c => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

function sampleCoords(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords;
  return Array.from({ length: n }, (_, i) =>
    coords[Math.floor((i / (n - 1)) * (coords.length - 1))]
  );
}

function resolveCables(
  cablesStr: string,
  bySlug: Map<string, CableData>,
  nameIndex: Record<string, string>
): CableData[] {
  const result: CableData[] = [];
  const seen = new Set<string>();
  for (const raw of cablesStr.split(' | ')) {
    const name = raw.trim();
    // 尝试多种匹配策略：完整名、去括号、括号内缩写、首词
    const keys = [
      name.toLowerCase(),
      name.replace(/\s*\([^)]+\)/g, '').trim().toLowerCase(),
      ...Array.from(name.matchAll(/\(([^)]+)\)/g)).map(m => m[1].toLowerCase()),
      name.split(/[\s(]/)[0].toLowerCase(),
    ];
    for (const key of keys) {
      const slug = nameIndex[key];
      if (slug && !seen.has(slug)) {
        const cable = bySlug.get(slug);
        if (cable) { result.push(cable); seen.add(slug); break; }
      }
    }
  }
  return result;
}

export default function SovereignNetworkMap({ height = '540px', routes, selectedRouteId, onRouteSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const apiRef       = useRef<ApiResponse | null>(null);
  const bySlug       = useRef<Map<string, CableData>>(new Map());
  const animIdRef    = useRef<number | null>(null);
  const mapReadyRef  = useRef(false);

  // 用 React state 控制加载状态，彻底告别 DOM 操作
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [apiError,  setApiError]  = useState<string | null>(null);

  // ── 停止流光动画 ─────────────────────────────────────────────────────────
  const stopAnim = useCallback(() => {
    if (animIdRef.current !== null) {
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = null;
    }
    const map = mapRef.current;
    if (map?.getSource('sv-dot')) {
      (map.getSource('sv-dot') as maplibregl.GeoJSONSource).setData(
        { type: 'FeatureCollection', features: [] }
      );
    }
  }, []);

  // ── 启动流光动画（沿路径坐标匀速移动发光圆点）──────────────────────────
  const startAnim = useCallback((coords: [number, number][], color: string) => {
    stopAnim();
    if (!coords.length || !mapRef.current) return;
    let idx = 0;
    const tick = () => {
      const map = mapRef.current;
      if (!map?.getSource('sv-dot')) return;
      idx = (idx + 2) % coords.length; // +2 控制速度，数字越大越快
      (map.getSource('sv-dot') as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Point', coordinates: coords[idx] },
      });
      animIdRef.current = requestAnimationFrame(tick);
    };
    animIdRef.current = requestAnimationFrame(tick);
  }, [stopAnim]);

  // ── 地图初始化（只跑一次）────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      // 与 BRICSMap 完全相同的底图
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [80, 20],
      zoom: 2.4,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', async () => {
      // ── 初始化所有图层（先建好，数据后填）──────────────────────────────

      // 背景：所有主权海缆（暗色）
      map.addSource('sv-all', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sv-all-line', type: 'line', source: 'sv-all',
        paint: { 'line-color': '#1a3a6a', 'line-width': 0.8, 'line-opacity': 0.5 } });

      // 选中路径（glow + 主体）
      map.addSource('sv-sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sv-sel-glow', type: 'line', source: 'sv-sel',
        paint: { 'line-color': ['get', 'rc'], 'line-width': 10, 'line-opacity': 0.2, 'line-blur': 4 } });
      map.addLayer({ id: 'sv-sel-line', type: 'line', source: 'sv-sel',
        paint: { 'line-color': ['get', 'rc'], 'line-width': 2.8, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'sv-sel-hit', type: 'line', source: 'sv-sel',
        paint: { 'line-color': 'transparent', 'line-width': 16, 'line-opacity': 0 } });

      // 流光圆点（仅选中时有数据）
      map.addSource('sv-dot', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sv-dot-glow', type: 'circle', source: 'sv-dot',
        paint: { 'circle-radius': 14, 'circle-color': ['get', 'color'], 'circle-opacity': 0.2, 'circle-blur': 1 } });
      map.addLayer({ id: 'sv-dot-core', type: 'circle', source: 'sv-dot',
        paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-opacity': 0.95,
          'circle-stroke-color': 'white', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.8 } });

      // 金砖成员国（金色，与 BRICSMap 完全一致）
      const memberFeats: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => ({
        type: 'Feature',
        properties: { code, name: BRICS_COUNTRY_META[code]?.nameZh ?? code },
        geometry: { type: 'Point', coordinates: BRICS_COUNTRY_META[code]?.center ?? [0, 0] },
      }));
      map.addSource('bm', { type: 'geojson', data: { type: 'FeatureCollection', features: memberFeats } });
      map.addLayer({ id: 'bm-dot', type: 'circle', source: 'bm',
        paint: { 'circle-radius': 6, 'circle-color': C.gold, 'circle-opacity': 0.85,
          'circle-stroke-color': C.goldDark, 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'bm-text', type: 'symbol', source: 'bm',
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4],
          'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': C.goldLight, 'text-halo-color': '#040f1e', 'text-halo-width': 1.5 } });

      // 金砖伙伴国（蓝色）
      const partnerFeats: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => ({
        type: 'Feature',
        properties: { code, name: BRICS_COUNTRY_META[code]?.nameZh ?? code },
        geometry: { type: 'Point', coordinates: BRICS_COUNTRY_META[code]?.center ?? [0, 0] },
      }));
      map.addSource('bp', { type: 'geojson', data: { type: 'FeatureCollection', features: partnerFeats } });
      map.addLayer({ id: 'bp-dot', type: 'circle', source: 'bp',
        paint: { 'circle-radius': 4.5, 'circle-color': '#60A5FA', 'circle-opacity': 0.8,
          'circle-stroke-color': '#3B82F6', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'bp-text', type: 'symbol', source: 'bp',
        layout: { 'text-field': ['get', 'name'], 'text-size': 9, 'text-offset': [0, 1.3],
          'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': '#93C5FD', 'text-halo-color': '#040f1e', 'text-halo-width': 1.2 } });

      // 点击已选中路径 → 取消选中
      map.on('click', 'sv-sel-hit', () => onRouteSelect(null));
      map.on('mouseenter', 'sv-sel-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sv-sel-hit', () => { map.getCanvas().style.cursor = ''; });

      mapReadyRef.current = true;

      // ── 异步拉取海缆数据（失败不影响地图显示）──────────────────────────
      try {
        const res = await fetch('/api/sovereign-network');
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data: ApiResponse = await res.json();
        apiRef.current = data;
        data.cables.forEach(c => bySlug.current.set(c.slug, c));

        // 填入背景海缆
        const allFeats: GeoJSON.Feature[] = data.cables
          .filter(c => c.routeGeojson)
          .map(c => ({ type: 'Feature', properties: { slug: c.slug }, geometry: c.routeGeojson! }));
        (map.getSource('sv-all') as maplibregl.GeoJSONSource).setData(
          { type: 'FeatureCollection', features: allFeats }
        );
        setLoadState('ready');
      } catch (e) {
        // API 失败：地图正常显示，只是没有海缆路线
        console.warn('[SovereignNetworkMap] API failed:', e);
        setApiError('海缆路由数据加载失败，请检查 /api/sovereign-network 接口是否已部署');
        setLoadState('ready'); // 地图本身已就绪，不阻塞
      }
    });

    map.on('error', (e) => {
      console.error('[SovereignNetworkMap] map error', e);
      setLoadState('error');
    });

    return () => {
      stopAnim();
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 响应选中路径 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (!selectedRouteId) {
      // 取消选中：清空选中层，停止动画，恢复背景亮度
      stopAnim();
      (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData(
        { type: 'FeatureCollection', features: [] }
      );
      if (map.getLayer('sv-all-line')) map.setPaintProperty('sv-all-line', 'line-opacity', 0.5);
      return;
    }

    const route = routes.find(r => r.id === selectedRouteId);
    if (!route || !apiRef.current) return;

    const cables = resolveCables(route.cables, bySlug.current, apiRef.current.nameIndex);
    const scores = route.riskScores.split(' | ').map(Number);
    let allCoords: [number, number][] = [];
    let maxRiskScore = 0;

    const selFeats: GeoJSON.Feature[] = cables.map((cable, i) => {
      const score = scores[i] ?? route.maxRisk;
      if (score > maxRiskScore) maxRiskScore = score;
      if (cable.routeGeojson) allCoords = allCoords.concat(flattenCoords(cable.routeGeojson));
      return {
        type: 'Feature',
        properties: { slug: cable.slug, rc: riskColor(score) },
        geometry: cable.routeGeojson ?? { type: 'LineString', coordinates: [] },
      };
    });

    // 更新选中层
    (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData(
      { type: 'FeatureCollection', features: selFeats }
    );
    // 压暗背景
    if (map.getLayer('sv-all-line')) map.setPaintProperty('sv-all-line', 'line-opacity', 0.12);

    // 飞到路径范围
    if (allCoords.length) {
      const bbox = computeBbox(allCoords);
      if (bbox) map.fitBounds(bbox, { padding: 80, duration: 900, maxZoom: 7 });
    }

    // 启动流光动画（采样 400 点保证速度均匀）
    startAnim(sampleCoords(allCoords, 400), riskColor(maxRiskScore));

  }, [selectedRouteId, routes, stopAnim, startAnim]);

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 加载遮罩（React state 驱动，不再依赖 DOM 操作）*/}
      {loadState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,15,30,.88)', borderRadius: 14, zIndex: 10,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid rgba(212,175,55,.2)',
              borderTop: `2px solid ${C.gold}`, borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
            <span style={{ color: C.goldLight, fontSize: 13, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              正在加载底图…
            </span>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(4,15,30,.88)', borderRadius: 14, zIndex: 10,
        }}>
          <span style={{ color: '#f87171', fontSize: 13 }}>底图加载失败，请检查网络后刷新</span>
        </div>
      )}

      {/* API 错误提示（地图仍可用，只是无海缆路线）*/}
      {apiError && loadState === 'ready' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(120,20,20,.9)', border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 8, padding: '7px 14px', zIndex: 8, maxWidth: 420,
        }}>
          <span style={{ fontSize: 11, color: '#fca5a5', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            ⚠ {apiError}
          </span>
        </div>
      )}

      {/* 右下角图例 */}
      {loadState === 'ready' && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(10,22,40,.9)', backdropFilter: 'blur(8px)',
          borderRadius: 8, padding: '10px 14px',
          border: `1px solid ${C.gold}12`, zIndex: 5,
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          {[
            { color: C.gold,     dot: true,  label: '金砖成员国' },
            { color: '#60A5FA',  dot: true,  label: '金砖伙伴国' },
            { color: '#1a3a6a',  dot: false, label: '主权可用海缆' },
          ].map(({ color, dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              {dot
                ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}70`, flexShrink: 0 }} />
                : <span style={{ width: 18, height: 3, background: color, borderRadius: 1, flexShrink: 0 }} />}
              {label}
            </div>
          ))}
        </div>
      )}

      {/* MapLibre 导航控件样式 */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { background: rgba(10,22,40,.9) !important; border: 1px solid ${C.gold}15 !important; border-radius: 8px !important; }
        .maplibregl-ctrl-group button { background: transparent !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.1) !important; }
      `}</style>
    </div>
  );
}

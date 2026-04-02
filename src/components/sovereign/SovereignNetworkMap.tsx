'use client';
// src/components/sovereign/SovereignNetworkMap.tsx
//
// v3 核心改进：
// 1. 脉冲动画：用 MapLibre 多圈圆扩散代替移动点，视觉更清晰
// 2. 中转节点标注（灰色小点 + 名称）显示在地图上
// 3. 点击海缆弧线 → 弹出悬浮详情窗口
// 4. 点击空白 → 关闭悬浮窗
// 5. React state 控制加载状态（不依赖 DOM 操作）

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META,
  BRICS_COLORS as C,
} from '@/lib/brics-constants';
import { riskColor, safetyCfg, type SovereignRoute } from '@/lib/sovereign-routes';

// ── 中转节点（不在 BRICS 成员/伙伴中，但出现在路径里）──────────────────────
const TRANSIT_NODES: Record<string, [number, number]> = {
  '新加坡': [103.8, 1.35],
  '日本':   [138.5, 36.2],
  '菲律宾': [122.0, 12.8],
  '韩国':   [127.8, 36.5],
  '喀麦隆': [12.3,  3.9],
  '塞舌尔': [55.5, -4.7],
  '索马里': [46.2,  5.2],
  '坦桑尼亚':[35.0, -6.4],
  '也门':   [48.5, 15.6],
};

interface CableData {
  slug: string; name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
}
interface ApiResponse { cables: CableData[]; nameIndex: Record<string, string>; }

// 弹窗信息结构
export interface CablePopupInfo {
  x: number; y: number;
  cables: Array<{ name: string; slug: string; score: number; color: string }>;
  route: SovereignRoute;
}

interface Props {
  height?: string;
  routes: SovereignRoute[];
  selectedRouteId: string | null;
  onRouteSelect: (id: string | null) => void;
  onPopup?: (info: CablePopupInfo | null) => void;
}

function flattenCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][];
  if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
  return [];
}

function computeBbox(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}

function resolveCables(
  cablesStr: string,
  bySlug: Map<string, CableData>,
  nameIndex: Record<string, string>
): CableData[] {
  const result: CableData[] = []; const seen = new Set<string>();
  for (const raw of cablesStr.split(' | ')) {
    const name = raw.trim();
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

export default function SovereignNetworkMap({
  height = '540px', routes, selectedRouteId, onRouteSelect, onPopup,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const apiRef       = useRef<ApiResponse | null>(null);
  const bySlug       = useRef<Map<string, CableData>>(new Map());
  const pulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapReadyRef  = useRef(false);

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [apiError,  setApiError]  = useState<string | null>(null);

  // ── 停止脉冲动画 ────────────────────────────────────────────────────────
  const stopPulse = useCallback(() => {
    if (pulseTimerRef.current) { clearInterval(pulseTimerRef.current); pulseTimerRef.current = null; }
    const map = mapRef.current;
    if (!map) return;
    ['sv-pulse-1','sv-pulse-2','sv-pulse-3'].forEach(id => {
      if (map.getSource(id)) {
        (map.getSource(id) as maplibregl.GeoJSONSource).setData(
          { type: 'FeatureCollection', features: [] }
        );
      }
    });
  }, []);

  // ── 脉冲动画：在路径关键节点上做雷达扩散圆圈 ──────────────────────────
  // 原理：取路径各段的中点坐标，在这些点上做三个时序错开的圆圈
  // 圆圈半径和透明度通过定时器驱动，产生扩散消失的脉冲感
  const startPulse = useCallback((keyPoints: [number, number][], color: string) => {
    stopPulse();
    if (!keyPoints.length || !mapRef.current) return;

    const map = mapRef.current;
    const makeFeats = (pts: [number, number][]): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: pts.map(p => ({
        type: 'Feature', properties: { color },
        geometry: { type: 'Point', coordinates: p },
      })),
    });

    // 初始填入数据
    ['sv-pulse-1','sv-pulse-2','sv-pulse-3'].forEach(id => {
      if (map.getSource(id)) {
        (map.getSource(id) as maplibregl.GeoJSONSource).setData(makeFeats(keyPoints));
      }
    });

    // 三个圆圈的半径和透明度按时间偏移动画
    // 使用 MapLibre 的 setPaintProperty 驱动半径缩放
    let t = 0;
    pulseTimerRef.current = setInterval(() => {
      const map2 = mapRef.current;
      if (!map2) return;
      t += 0.05;
      // 三圈时序错开 1/3 周期，产生连续脉冲感
      [
        { id: 'sv-pulse-1', phase: 0 },
        { id: 'sv-pulse-2', phase: Math.PI * 2 / 3 },
        { id: 'sv-pulse-3', phase: Math.PI * 4 / 3 },
      ].forEach(({ id, phase }) => {
        const s = (Math.sin(t + phase) + 1) / 2; // 0~1 正弦波
        const radius = 8 + s * 22;               // 8~30px
        const opacity = 0.7 * (1 - s * 0.85);    // 淡出
        if (map2.getLayer(id + '-ring')) {
          map2.setPaintProperty(id + '-ring', 'circle-radius', radius);
          map2.setPaintProperty(id + '-ring', 'circle-opacity', opacity);
        }
      });
    }, 40); // ~25fps，流畅且不耗性能
  }, [stopPulse]);

  // ── 地图初始化 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [80, 20], zoom: 2.4, attributionControl: false, fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', async () => {
      // ── 背景海缆层 ────────────────────────────────────────────────────
      map.addSource('sv-all', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sv-all-line', type: 'line', source: 'sv-all',
        paint: { 'line-color': '#1a3a6a', 'line-width': 0.8, 'line-opacity': 0.5 } });

      // ── 选中路径层（glow + 主体 + 命中区）────────────────────────────
      map.addSource('sv-sel', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'sv-sel-glow', type: 'line', source: 'sv-sel',
        paint: { 'line-color': ['get', 'rc'], 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 5 } });
      map.addLayer({ id: 'sv-sel-line', type: 'line', source: 'sv-sel',
        paint: { 'line-color': ['get', 'rc'], 'line-width': 2.5, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'sv-sel-hit', type: 'line', source: 'sv-sel',
        paint: { 'line-color': 'transparent', 'line-width': 18, 'line-opacity': 0 } });

      // ── 三组脉冲圈（每组一个 source + 两层：内核点 + 扩散圈）─────────
      ['sv-pulse-1','sv-pulse-2','sv-pulse-3'].forEach(id => {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        // 内核实心小点
        map.addLayer({ id: id + '-dot', type: 'circle', source: id,
          paint: {
            'circle-radius': 4,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.95,
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.7,
          },
        });
        // 扩散外圈（半径和透明度由定时器驱动）
        map.addLayer({ id: id + '-ring', type: 'circle', source: id,
          paint: {
            'circle-radius': 8,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.4,
            'circle-blur': 0.6,
          },
        });
      });

      // ── 金砖成员国节点（与 BRICSMap 完全一致）────────────────────────
      const memberFeats: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => ({
        type: 'Feature',
        properties: { code, name: BRICS_COUNTRY_META[code]?.nameZh ?? code },
        geometry: { type: 'Point', coordinates: BRICS_COUNTRY_META[code]?.center ?? [0, 0] },
      }));
      map.addSource('bm', { type: 'geojson', data: { type: 'FeatureCollection', features: memberFeats } });
      map.addLayer({ id: 'bm-dot', type: 'circle', source: 'bm',
        paint: { 'circle-radius': 6, 'circle-color': C.gold, 'circle-opacity': 0.88,
          'circle-stroke-color': C.goldDark, 'circle-stroke-width': 1.5 } });
      map.addLayer({ id: 'bm-text', type: 'symbol', source: 'bm',
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4],
          'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
        paint: { 'text-color': C.goldLight, 'text-halo-color': '#040f1e', 'text-halo-width': 1.5 } });

      // ── 金砖伙伴国节点 ────────────────────────────────────────────────
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

      // ── 中转节点（灰色小点 + 名称，仅在选中路径后才有意义）────────────
      const transitFeats: GeoJSON.Feature[] = Object.entries(TRANSIT_NODES).map(([name, coord]) => ({
        type: 'Feature',
        properties: { name },
        geometry: { type: 'Point', coordinates: coord },
      }));
      map.addSource('transit', { type: 'geojson', data: { type: 'FeatureCollection', features: transitFeats } });
      map.addLayer({ id: 'transit-dot', type: 'circle', source: 'transit',
        paint: { 'circle-radius': 3.5, 'circle-color': '#64748b', 'circle-opacity': 0.7,
          'circle-stroke-color': '#475569', 'circle-stroke-width': 1 } });
      map.addLayer({ id: 'transit-text', type: 'symbol', source: 'transit',
        layout: { 'text-field': ['get', 'name'], 'text-size': 9, 'text-offset': [0, 1.2],
          'text-anchor': 'top', 'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'] },
        paint: { 'text-color': '#94a3b8', 'text-halo-color': '#040f1e', 'text-halo-width': 1 } });

      // ── 交互：点击已高亮海缆 ─────────────────────────────────────────
      map.on('click', 'sv-sel-hit', (e) => {
        if (!e.features?.length) return;
        const slug = e.features[0].properties?.slug;
        const route = routes.find(r => r.id === selectedRouteId);
        if (route && apiRef.current && onPopup) {
          const cables = resolveCables(route.cables, bySlug.current, apiRef.current.nameIndex);
          const scores = route.riskScores.split(' | ').map(Number);
          onPopup({
            x: e.point.x, y: e.point.y,
            cables: cables.map((c, i) => ({
              name: c.name, slug: c.slug,
              score: scores[i] ?? route.maxRisk,
              color: riskColor(scores[i] ?? route.maxRisk),
            })),
            route,
          });
        }
      });

      // 点击空白 → 取消选中 + 关闭弹窗
      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ['sv-sel-hit', 'bm-dot', 'bp-dot'],
        });
        if (!features.length) {
          onRouteSelect(null);
          onPopup?.(null);
        }
      });

      map.on('mouseenter', 'sv-sel-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sv-sel-hit', () => { map.getCanvas().style.cursor = ''; });

      mapReadyRef.current = true;

      // ── 加载海缆数据 ─────────────────────────────────────────────────
      try {
        const res = await fetch('/api/sovereign-network');
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        const data: ApiResponse = await res.json();
        apiRef.current = data;
        data.cables.forEach(c => bySlug.current.set(c.slug, c));

        const allFeats: GeoJSON.Feature[] = data.cables
          .filter(c => c.routeGeojson)
          .map(c => ({ type: 'Feature', properties: { slug: c.slug, name: c.name }, geometry: c.routeGeojson! }));
        (map.getSource('sv-all') as maplibregl.GeoJSONSource).setData(
          { type: 'FeatureCollection', features: allFeats }
        );
        setLoadState('ready');
      } catch (e) {
        console.warn('[SovereignNetworkMap] Cable API failed:', e);
        setApiError('海缆路由数据加载失败，请确认 /api/sovereign-network 已部署');
        setLoadState('ready'); // 地图本身正常显示
      }
    });

    map.on('error', () => setLoadState('error'));

    return () => {
      stopPulse();
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
      stopPulse();
      (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer('sv-all-line')) map.setPaintProperty('sv-all-line', 'line-opacity', 0.5);
      return;
    }

    const route = routes.find(r => r.id === selectedRouteId);
    if (!route || !apiRef.current) return;

    const cables = resolveCables(route.cables, bySlug.current, apiRef.current.nameIndex);
    const scores = route.riskScores.split(' | ').map(Number);
    let allCoords: [number, number][] = [];
    let maxScore = 0;

    const selFeats: GeoJSON.Feature[] = cables.map((c, i) => {
      const score = scores[i] ?? route.maxRisk;
      if (score > maxScore) maxScore = score;
      if (c.routeGeojson) allCoords = allCoords.concat(flattenCoords(c.routeGeojson));
      return {
        type: 'Feature',
        properties: { slug: c.slug, name: c.name, rc: riskColor(score), score },
        geometry: c.routeGeojson ?? { type: 'LineString', coordinates: [] },
      };
    });

    (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: selFeats });
    if (map.getLayer('sv-all-line')) map.setPaintProperty('sv-all-line', 'line-opacity', 0.1);

    // 飞到路径范围
    if (allCoords.length) {
      const bbox = computeBbox(allCoords);
      if (bbox) map.fitBounds(bbox, { padding: 90, duration: 900, maxZoom: 7 });
    }

    // 取路径各段中点作为脉冲位置（让脉冲沿路径节点分布，而非单点）
    const pulsePoints: [number, number][] = route.nodes
      .map(name => TRANSIT_NODES[name] ?? (BRICS_COUNTRY_META[name]?.center as [number, number] | undefined))
      .filter((p): p is [number, number] => !!p);

    // 如果没有节点坐标，取坐标序列的等分采样点
    const pts = pulsePoints.length >= 2
      ? pulsePoints
      : allCoords.filter((_, i) => i % Math.max(1, Math.floor(allCoords.length / 5)) === 0).slice(0, 6);

    startPulse(pts, riskColor(maxScore));
  }, [selectedRouteId, routes, stopPulse, startPulse]);

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 加载遮罩 */}
      {loadState === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(4,15,30,.88)', borderRadius: 14, zIndex: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 28, height: 28, border: '2px solid rgba(212,175,55,.2)',
              borderTop: `2px solid ${C.gold}`, borderRadius: '50%', margin: '0 auto 10px',
              animation: 'sv-spin .8s linear infinite' }} />
            <span style={{ color: C.goldLight, fontSize: 13, fontFamily: "'DM Sans',system-ui,sans-serif" }}>
              正在加载底图…
            </span>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(4,15,30,.88)', borderRadius: 14, zIndex: 10 }}>
          <span style={{ color: '#f87171', fontSize: 13 }}>底图加载失败，请检查网络后刷新</span>
        </div>
      )}

      {/* API 错误提示条（不阻塞地图）*/}
      {apiError && loadState === 'ready' && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(80,10,10,.92)', border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 8, padding: '6px 14px', zIndex: 8, maxWidth: 400 }}>
          <span style={{ fontSize: 11, color: '#fca5a5', fontFamily: "'DM Sans',system-ui,sans-serif" }}>
            ⚠ {apiError}
          </span>
        </div>
      )}

      {/* 图例 */}
      {loadState === 'ready' && (
        <div style={{ position: 'absolute', bottom: 12, right: 12,
          background: 'rgba(10,22,40,.9)', backdropFilter: 'blur(8px)',
          borderRadius: 8, padding: '10px 14px', border: `1px solid ${C.gold}12`, zIndex: 5,
          display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { color: C.gold,     dot: true,  label: '金砖成员国' },
            { color: '#60A5FA',  dot: true,  label: '金砖伙伴国' },
            { color: '#64748b',  dot: true,  label: '中转节点' },
            { color: '#1a3a6a',  dot: false, label: '主权可用海缆' },
          ].map(({ color, dot, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              {dot
                ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: color,
                    boxShadow: `0 0 6px ${color}70`, flexShrink: 0 }} />
                : <span style={{ width: 18, height: 3, background: color, borderRadius: 1, flexShrink: 0 }} />}
              {label}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes sv-spin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group {
          background: rgba(10,22,40,.9) !important;
          border: 1px solid ${C.gold}15 !important;
          border-radius: 8px !important;
        }
        .maplibregl-ctrl-group button { background: transparent !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.1) !important; }
      `}</style>
    </div>
  );
}

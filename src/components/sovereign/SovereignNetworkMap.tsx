'use client';
// src/components/sovereign/SovereignNetworkMap.tsx
//
// 基于 MapLibre GL JS 的自主权网络地图组件，与 BRICSMap 共享同一套技术栈和视觉语言。
//
// 核心设计决策：
// 1. 使用 dark-matter-nolabels 底图（与 BRICSMap 一致）
// 2. 真实海缆路由（从 /api/sovereign-network 加载，连接登陆站而非内陆坐标）
// 3. 默认无动画，仅在选中路径后激活（流光点 + glow）
// 4. 选中时自动缩放到路径 bbox
// 5. 可缩放/平移（MapLibre 原生支持）

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META } from '@/lib/brics-constants';
import { BRICS_COLORS as C } from '@/lib/brics-constants';
import { riskColor, type SovereignRoute } from '@/lib/sovereign-routes';

// ── 类型定义 ──────────────────────────────────────────────────────────────────
interface CableData {
  slug: string;
  name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
}

interface ApiResponse {
  cables: CableData[];
  nameIndex: Record<string, string>; // lowercase display name → slug
}

interface HoverInfo {
  x: number;
  y: number;
  routeId: string;
  routeName: string;
  maxRisk: number;
  avgRisk: number;
  path: string;
  safety: string;
}

interface Props {
  height?: string;
  routes: SovereignRoute[];           // 所有路径（用于侧边栏联动）
  selectedRouteId: string | null;     // 当前选中的路径 ID
  onRouteSelect: (id: string | null) => void;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

// 将 LineString 或 MultiLineString 展平为坐标数组
function flattenCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][];
  if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
  return [];
}

// 计算坐标数组的 bounding box
function computeBbox(coords: [number, number][]): [number, number, number, number] | null {
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

// 在坐标序列中按固定步数采样（用于动画速度均匀化）
function sampleCoords(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords;
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    result.push(coords[Math.floor((i / (n - 1)) * (coords.length - 1))]);
  }
  return result;
}

// 从路径的 cables 字符串解析出 slug 列表
function resolveCableSlugs(
  cablesStr: string,
  cablesBySlug: Map<string, CableData>,
  nameIndex: Record<string, string>
): CableData[] {
  const names = cablesStr.split(' | ').map(s => s.trim());
  const result: CableData[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    // 尝试多种查找策略
    const candidates = [
      name.toLowerCase(),
      name.replace(/\s*\([^)]+\)\s*/g, '').trim().toLowerCase(),
      // 提取括号内缩写
      ...Array.from(name.matchAll(/\(([^)]+)\)/g)).map(m => m[1].toLowerCase()),
      // 取第一个词
      name.split(/[\s(]/)[0].toLowerCase(),
    ];

    for (const key of candidates) {
      const slug = nameIndex[key];
      if (slug && !seen.has(slug)) {
        const cable = cablesBySlug.get(slug);
        if (cable) {
          result.push(cable);
          seen.add(slug);
          break;
        }
      }
    }
  }
  return result;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function SovereignNetworkMap({ height = '540px', routes, selectedRouteId, onRouteSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const apiDataRef   = useRef<ApiResponse | null>(null);
  const cablesBySlug = useRef<Map<string, CableData>>(new Map());
  const animFrameRef = useRef<number>(0);
  const animIdRef    = useRef<number | null>(null);
  const animCoordsRef = useRef<[number, number][]>([]);
  const [loadingState, setLoadingState] = (() => {
    // 因为 hooks 不能在 ref 外调用，这里用一个小技巧：直接用 ref 存 loading 状态
    // 实际在 useEffect 中通过 DOM 操作更新
    return [null, null] as [null, null];
  })();

  // ── 地图初始化 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [80, 20],
      zoom: 2.4,
      attributionControl: false,
      fadeDuration: 0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    // 显示加载提示
    const loadEl = containerRef.current.querySelector('.map-loading') as HTMLElement;
    if (loadEl) loadEl.style.display = 'flex';

    map.on('load', async () => {
      try {
        // ── 加载海缆数据 ──────────────────────────────────────────────────
        const res = await fetch('/api/sovereign-network');
        if (!res.ok) throw new Error('API error');
        const data: ApiResponse = await res.json();
        apiDataRef.current = data;
        data.cables.forEach(c => cablesBySlug.current.set(c.slug, c));

        // ── 构建全量海缆 GeoJSON（所有主权路径涉及的海缆，默认状态下暗显）
        const allCableFeatures: GeoJSON.Feature[] = data.cables
          .filter(c => c.routeGeojson)
          .map(c => ({
            type: 'Feature',
            properties: { slug: c.slug, name: c.name },
            geometry: c.routeGeojson!,
          }));

        // 底层：所有主权海缆（暗色，仅作为背景网络参考）
        map.addSource('sv-cables-all', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: allCableFeatures },
        });
        map.addLayer({
          id: 'sv-cables-all-line',
          type: 'line',
          source: 'sv-cables-all',
          paint: {
            'line-color': '#1a3a6a',
            'line-width': 0.8,
            'line-opacity': 0.5,
          },
        });

        // 选中路径的海缆（颜色由 feature property 'riskColor' 驱动）
        map.addSource('sv-selected', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        // glow 层
        map.addLayer({
          id: 'sv-selected-glow',
          type: 'line',
          source: 'sv-selected',
          paint: {
            'line-color': ['get', 'riskColor'],
            'line-width': 10,
            'line-opacity': 0.2,
            'line-blur': 4,
          },
        });
        // 主体线
        map.addLayer({
          id: 'sv-selected-line',
          type: 'line',
          source: 'sv-selected',
          paint: {
            'line-color': ['get', 'riskColor'],
            'line-width': 2.8,
            'line-opacity': 0.95,
          },
        });
        // 透明宽命中区（改善点击体验）
        map.addLayer({
          id: 'sv-selected-hit',
          type: 'line',
          source: 'sv-selected',
          paint: { 'line-color': 'transparent', 'line-width': 16, 'line-opacity': 0 },
        });

        // ── 流光动画点（仅在选中时显示）──────────────────────────────────
        map.addSource('sv-dot', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        // 外圈光晕
        map.addLayer({
          id: 'sv-dot-glow',
          type: 'circle',
          source: 'sv-dot',
          paint: {
            'circle-radius': 12,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.25,
            'circle-blur': 1,
          },
        });
        // 主体圆点
        map.addLayer({
          id: 'sv-dot-core',
          type: 'circle',
          source: 'sv-dot',
          paint: {
            'circle-radius': 5,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.95,
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.8,
          },
        });

        // ── 金砖成员国节点（与 BRICSMap 完全一致）──────────────────────
        const memberFeats: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return {
            type: 'Feature',
            properties: { code, name: m?.nameZh ?? code },
            geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] },
          };
        });
        map.addSource('brics-members', { type: 'geojson', data: { type: 'FeatureCollection', features: memberFeats } });
        map.addLayer({ id: 'member-dots', type: 'circle', source: 'brics-members', paint: { 'circle-radius': 6, 'circle-color': C.gold, 'circle-opacity': 0.85, 'circle-stroke-color': C.goldDark, 'circle-stroke-width': 1.5 } });
        map.addLayer({ id: 'member-text', type: 'symbol', source: 'brics-members', layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': C.goldLight, 'text-halo-color': '#040f1e', 'text-halo-width': 1.5 } });

        // ── 金砖伙伴国节点 ──────────────────────────────────────────────
        const partnerFeats: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return {
            type: 'Feature',
            properties: { code, name: m?.nameZh ?? code },
            geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] },
          };
        });
        map.addSource('brics-partners', { type: 'geojson', data: { type: 'FeatureCollection', features: partnerFeats } });
        map.addLayer({ id: 'partner-dots', type: 'circle', source: 'brics-partners', paint: { 'circle-radius': 4.5, 'circle-color': '#60A5FA', 'circle-opacity': 0.8, 'circle-stroke-color': '#3B82F6', 'circle-stroke-width': 1 } });
        map.addLayer({ id: 'partner-text', type: 'symbol', source: 'brics-partners', layout: { 'text-field': ['get', 'name'], 'text-size': 9, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#93C5FD', 'text-halo-color': '#040f1e', 'text-halo-width': 1.2 } });

        // ── 交互：点击已选中海缆 ──────────────────────────────────────────
        map.on('click', 'sv-selected-hit', () => {
          // 点击已高亮的海缆 → 取消选中
          onRouteSelect(null);
        });
        map.on('mouseenter', 'sv-selected-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'sv-selected-hit', () => { map.getCanvas().style.cursor = ''; });

        // 隐藏加载提示
        if (loadEl) loadEl.style.display = 'none';
      } catch (e) {
        console.error('[SovereignNetworkMap]', e);
        if (loadEl) { loadEl.innerHTML = '<span style="color:#f87171;font-size:13px">海缆数据加载失败，请刷新重试</span>'; }
      }
    });

    return () => {
      stopAnimation();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 流光动画控制 ─────────────────────────────────────────────────────────
  const stopAnimation = useCallback(() => {
    if (animIdRef.current !== null) {
      cancelAnimationFrame(animIdRef.current);
      animIdRef.current = null;
    }
    // 清空动画点
    const map = mapRef.current;
    if (map?.getSource('sv-dot')) {
      (map.getSource('sv-dot') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection', features: [],
      });
    }
  }, []);

  // 流光动画：一个发光圆点沿着所有选中海缆的路径移动
  // 移动速度参照金砖仪表盘投资面板的节奏（约 60px/s 体感）
  const startAnimation = useCallback((coords: [number, number][], color: string) => {
    stopAnimation();
    if (!coords.length || !mapRef.current) return;

    // 每帧前进 2 个坐标（调整此值可控制速度）
    const STEP = 2;
    let idx = 0;

    const tick = () => {
      const map = mapRef.current;
      if (!map?.getSource('sv-dot')) return;

      idx = (idx + STEP) % coords.length;
      (map.getSource('sv-dot') as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        properties: { color },
        geometry: { type: 'Point', coordinates: coords[idx] },
      });

      animIdRef.current = requestAnimationFrame(tick);
    };
    animIdRef.current = requestAnimationFrame(tick);
  }, [stopAnimation]);

  // ── 响应选中路径变化 ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const data = apiDataRef.current;
    if (!map || !map.loaded()) return;

    // 无选中 → 清空选中层，停止动画
    if (!selectedRouteId) {
      stopAnimation();
      if (map.getSource('sv-selected')) {
        (map.getSource('sv-selected') as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection', features: [],
        });
      }
      // 恢复全局海缆亮度
      if (map.getLayer('sv-cables-all-line')) {
        map.setPaintProperty('sv-cables-all-line', 'line-opacity', 0.5);
      }
      return;
    }

    // 找到对应路径
    const route = routes.find(r => r.id === selectedRouteId);
    if (!route || !data) return;

    // 解析该路径涉及的海缆
    const cables = resolveCableSlugs(route.cables, cablesBySlug.current, data.nameIndex);
    const riskScores = route.riskScores.split(' | ').map(Number);

    // 构建选中层的 features（每条海缆一个 feature，带风险颜色属性）
    const selectedFeatures: GeoJSON.Feature[] = [];
    let allCoords: [number, number][] = [];
    let globalMaxRisk = 0;

    cables.forEach((cable, i) => {
      if (!cable.routeGeojson) return;
      const score = riskScores[i] ?? route.maxRisk;
      const color = riskColor(score);
      if (score > globalMaxRisk) globalMaxRisk = score;

      selectedFeatures.push({
        type: 'Feature',
        properties: { slug: cable.slug, name: cable.name, riskColor: color, score },
        geometry: cable.routeGeojson,
      });

      // 收集坐标用于 bbox + 动画
      allCoords = allCoords.concat(flattenCoords(cable.routeGeojson));
    });

    // 更新选中层
    if (map.getSource('sv-selected')) {
      (map.getSource('sv-selected') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection', features: selectedFeatures,
      });
    }

    // 压暗背景海缆，突出选中路径
    if (map.getLayer('sv-cables-all-line')) {
      map.setPaintProperty('sv-cables-all-line', 'line-opacity', 0.15);
    }

    // 缩放到路径 bbox（加 padding 留出边距）
    if (allCoords.length) {
      const bbox = computeBbox(allCoords);
      if (bbox) {
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 80, duration: 900, maxZoom: 7 }
        );
      }
    }

    // 启动流光动画（采样 400 个点保证速度均匀）
    const animColor = riskColor(globalMaxRisk);
    const sampled = sampleCoords(allCoords, 400);
    startAnimation(sampled, animColor);

  }, [selectedRouteId, routes, stopAnimation, startAnimation]);

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', height }}>
      {/* MapLibre 容器 */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 加载遮罩 */}
      <div className="map-loading" style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(4,15,30,.85)', borderRadius: 14, zIndex: 10,
      }}>
        <span style={{ color: C.goldLight, fontSize: 13, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          正在加载海缆数据…
        </span>
      </div>

      {/* 右下角图例（与 BRICSMap 一致） */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'rgba(10,22,40,.9)', backdropFilter: 'blur(8px)',
        borderRadius: 8, padding: '10px 14px',
        border: `1px solid ${C.gold}12`, zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        {[
          { color: C.gold,    label: '金砖成员国', dot: true },
          { color: '#60A5FA', label: '金砖伙伴国', dot: true },
          { color: '#1a3a6a', label: '主权可用海缆', dot: false },
        ].map(({ color, label, dot }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
            {dot
              ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}70`, flexShrink: 0 }} />
              : <span style={{ width: 18, height: 3, background: color, borderRadius: 1, flexShrink: 0 }} />
            }
            {label}
          </div>
        ))}
      </div>

      {/* 风险色阶说明（选中路径时显示） */}
      {selectedRouteId && (
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          background: 'rgba(10,22,40,.9)', backdropFilter: 'blur(8px)',
          borderRadius: 8, padding: '8px 12px',
          border: `1px solid ${C.gold}15`, zIndex: 5,
          fontSize: 11, color: 'rgba(255,255,255,.5)',
        }}>
          {[
            { c: '#0F6E56', l: '低风险' },
            { c: '#BA7517', l: '中等' },
            { c: '#A32D2D', l: '高暴露' },
          ].map(({ c, l }) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 16, height: 3, background: c, borderRadius: 1, boxShadow: `0 0 5px ${c}60` }} />
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}

      {/* MapLibre 导航控件样式修正 */}
      <style>{`
        .maplibregl-ctrl-group { background: rgba(10,22,40,.9) !important; border: 1px solid ${C.gold}15 !important; border-radius: 8px !important; }
        .maplibregl-ctrl-group button { background: transparent !important; color: rgba(255,255,255,.6) !important; }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.1) !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
      `}</style>
    </div>
  );
}

'use client';
// src/components/sovereign/SovereignNetworkMap.tsx  v5
//
// 改动：
// 1. 接受 cableApiData 作为 prop（数据在 Atlas 层统一获取，Map 不再 fetch）
// 2. 新增 onCableClick prop：点击地图上的默认海缆线 → 触发弹窗
// 3. 点击空白 → 取消选中 + 关闭弹窗

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META,
  BRICS_COLORS as C,
} from '@/lib/brics-constants';
import { riskColor, type SovereignRoute } from '@/lib/sovereign-routes';

const TRANSIT_NODES: Record<string, [number, number]> = {
  '新加坡':[103.8,1.35],'日本':[138.5,36.2],'菲律宾':[122.0,12.8],
  '韩国':[127.8,36.5],'喀麦隆':[12.3,3.9],'塞舌尔':[55.5,-4.7],
  '索马里':[46.2,5.2],'坦桑尼亚':[35.0,-6.4],'也门':[48.5,15.6],
};

interface CableData {
  slug: string; name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
}
interface CableApiData { cables: CableData[]; nameIndex: Record<string, string>; }

export interface CablePopupInfo {
  x: number; y: number;
  cables: Array<{ name: string; slug: string; score: number; color: string }>;
  route: SovereignRoute;
}

interface Props {
  height?: string;
  routes: SovereignRoute[];
  filteredRoutes: SovereignRoute[];
  selectedRouteId: string | null;
  cableApiData: CableApiData | null;   // ← 由 Atlas 传入，不在 Map 内 fetch
  onRouteSelect: (id: string | null) => void;
  onPopup?: (info: CablePopupInfo | null) => void;
  onCableClick?: (cableName: string, score: number) => void;  // ← 点击默认海缆线触发
}

function flattenCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][];
  if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
  return [];
}
function computeBbox(coords: [number, number][]): [[number,number],[number,number]] | null {
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
  height = '540px', routes, filteredRoutes, selectedRouteId,
  cableApiData, onRouteSelect, onPopup, onCableClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const bySlug       = useRef<Map<string, CableData>>(new Map());
  // 名称 → slug 的反向索引（用于默认层点击时查找海缆信息）
  const nameToSlug   = useRef<Map<string, string>>(new Map());
  const pulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapReadyRef  = useRef(false);

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');

  const stopPulse = useCallback(() => {
    if (pulseTimerRef.current) { clearInterval(pulseTimerRef.current); pulseTimerRef.current = null; }
    const map = mapRef.current; if (!map) return;
    ['sv-p1','sv-p2','sv-p3'].forEach(id => {
      if (map.getSource(id))
        (map.getSource(id) as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[] });
    });
  }, []);

  const startPulse = useCallback((pts: [number,number][], color: string) => {
    stopPulse();
    if (!pts.length || !mapRef.current) return;
    const map = mapRef.current;
    const makeFeats = (p: [number,number][]): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: p.map(c => ({ type:'Feature', properties:{ color }, geometry:{ type:'Point', coordinates:c } })),
    });
    ['sv-p1','sv-p2','sv-p3'].forEach(id => {
      if (map.getSource(id)) (map.getSource(id) as maplibregl.GeoJSONSource).setData(makeFeats(pts));
    });
    let t = 0;
    pulseTimerRef.current = setInterval(() => {
      const m = mapRef.current; if (!m) return;
      t += 0.05;
      [{ id:'sv-p1', ph:0 }, { id:'sv-p2', ph:Math.PI*2/3 }, { id:'sv-p3', ph:Math.PI*4/3 }]
        .forEach(({ id, ph }) => {
          const s = (Math.sin(t + ph) + 1) / 2;
          if (m.getLayer(id+'-ring')) {
            m.setPaintProperty(id+'-ring', 'circle-radius', 8 + s * 22);
            m.setPaintProperty(id+'-ring', 'circle-opacity', 0.7 * (1 - s * 0.85));
          }
        });
    }, 40);
  }, [stopPulse]);

  // ── 用传入的 cableApiData 更新地图上的默认海缆层 ─────────────────────────────
  const updateDefaultLayer = useCallback((cableNames?: Set<string>) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !cableApiData) return;

    // 建立 slug → CableData 和 name → slug 的索引
    bySlug.current.clear(); nameToSlug.current.clear();
    cableApiData.cables.forEach(c => {
      bySlug.current.set(c.slug, c);
      nameToSlug.current.set(c.name.toLowerCase(), c.slug);
      Array.from(c.name.matchAll(/\(([^)]+)\)/g)).forEach(m =>
        nameToSlug.current.set(m[1].toLowerCase(), c.slug)
      );
    });

    const feats: GeoJSON.Feature[] = cableApiData.cables
      .filter(c => c.routeGeojson && (!cableNames || cableNames.has(c.name)))
      .map(c => ({ type:'Feature', properties:{ slug:c.slug, name:c.name }, geometry:c.routeGeojson! }));

    if (map.getSource('sv-default'))
      (map.getSource('sv-default') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:feats });
  }, [cableApiData]);

  // ── cableApiData 变化时刷新默认层 ─────────────────────────────────────────
  useEffect(() => {
    if (cableApiData && mapReadyRef.current) updateDefaultLayer();
  }, [cableApiData, updateDefaultLayer]);

  // ── filteredRoutes 变化时更新显示的海缆 ────────────────────────────────────
  useEffect(() => {
    if (!selectedRouteId && cableApiData && mapReadyRef.current) {
      const names = new Set<string>();
      filteredRoutes.forEach(r => r.cables.split(' | ').forEach(c => names.add(c.trim())));
      // 如果筛选后覆盖了大多数海缆，就显示全量（避免空集）
      updateDefaultLayer(names.size > 0 ? names : undefined);
    }
  }, [filteredRoutes, selectedRouteId, cableApiData, updateDefaultLayer]);

  // ── 地图初始化 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [80, 20], zoom: 2.4, attributionControl: false, fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // ── 默认海缆层（金色，初始为空，等 cableApiData 注入后填充）────────────
      map.addSource('sv-default', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-default-glow', type:'line', source:'sv-default',
        paint:{ 'line-color':C.gold, 'line-width':5, 'line-opacity':0.06, 'line-blur':3 } });
      map.addLayer({ id:'sv-default-line', type:'line', source:'sv-default',
        paint:{ 'line-color':C.gold, 'line-width':1.6, 'line-opacity':0.65 } });
      // 透明宽命中区，方便点击
      map.addLayer({ id:'sv-default-hit', type:'line', source:'sv-default',
        paint:{ 'line-color':'transparent', 'line-width':14, 'line-opacity':0 } });

      // ── 选中路径层 ──────────────────────────────────────────────────────────
      map.addSource('sv-sel', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-sel-glow', type:'line', source:'sv-sel',
        paint:{ 'line-color':['get','rc'], 'line-width':12, 'line-opacity':0.2, 'line-blur':5 } });
      map.addLayer({ id:'sv-sel-line', type:'line', source:'sv-sel',
        paint:{ 'line-color':['get','rc'], 'line-width':2.8, 'line-opacity':0.95 } });
      map.addLayer({ id:'sv-sel-hit', type:'line', source:'sv-sel',
        paint:{ 'line-color':'transparent', 'line-width':18, 'line-opacity':0 } });

      // ── 三组脉冲圈 ──────────────────────────────────────────────────────────
      ['sv-p1','sv-p2','sv-p3'].forEach(id => {
        map.addSource(id, { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
        map.addLayer({ id:id+'-dot', type:'circle', source:id,
          paint:{ 'circle-radius':4, 'circle-color':['get','color'], 'circle-opacity':0.95,
            'circle-stroke-color':'white', 'circle-stroke-width':1.5, 'circle-stroke-opacity':0.7 } });
        map.addLayer({ id:id+'-ring', type:'circle', source:id,
          paint:{ 'circle-radius':8, 'circle-color':['get','color'], 'circle-opacity':0.4, 'circle-blur':0.6 } });
      });

      // ── 成员国 / 伙伴国 / 中转节点 ─────────────────────────────────────────
      const memberFeats: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => ({
        type: 'Feature',
        properties: { code, name: BRICS_COUNTRY_META[code]?.nameZh ?? code },
        geometry: { type: 'Point', coordinates: BRICS_COUNTRY_META[code]?.center ?? [0, 0] },
      }));
      map.addSource('bm', { type:'geojson', data:{ type:'FeatureCollection', features:memberFeats } });
      map.addLayer({ id:'bm-dot', type:'circle', source:'bm',
        paint:{ 'circle-radius':6, 'circle-color':C.gold, 'circle-opacity':0.88,
          'circle-stroke-color':C.goldDark, 'circle-stroke-width':1.5 } });
      map.addLayer({ id:'bm-text', type:'symbol', source:'bm',
        layout:{ 'text-field':['get','name'], 'text-size':11, 'text-offset':[0,1.4],
          'text-anchor':'top', 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] },
        paint:{ 'text-color':C.goldLight, 'text-halo-color':'#040f1e', 'text-halo-width':1.5 } });

      const partnerFeats: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => ({
        type: 'Feature',
        properties: { code, name: BRICS_COUNTRY_META[code]?.nameZh ?? code },
        geometry: { type: 'Point', coordinates: BRICS_COUNTRY_META[code]?.center ?? [0, 0] },
      }));
      map.addSource('bp', { type:'geojson', data:{ type:'FeatureCollection', features:partnerFeats } });
      map.addLayer({ id:'bp-dot', type:'circle', source:'bp',
        paint:{ 'circle-radius':4.5, 'circle-color':'#60A5FA', 'circle-opacity':0.8,
          'circle-stroke-color':'#3B82F6', 'circle-stroke-width':1 } });
      map.addLayer({ id:'bp-text', type:'symbol', source:'bp',
        layout:{ 'text-field':['get','name'], 'text-size':9, 'text-offset':[0,1.3],
          'text-anchor':'top', 'text-font':['Open Sans Bold','Arial Unicode MS Bold'] },
        paint:{ 'text-color':'#93C5FD', 'text-halo-color':'#040f1e', 'text-halo-width':1.2 } });

      const transitFeats: GeoJSON.Feature[] = Object.entries(TRANSIT_NODES).map(([name, coord]) => ({
        type: 'Feature', properties: { name },
        geometry: { type: 'Point', coordinates: coord },
      }));
      map.addSource('transit', { type:'geojson', data:{ type:'FeatureCollection', features:transitFeats } });
      map.addLayer({ id:'transit-dot', type:'circle', source:'transit',
        paint:{ 'circle-radius':3.5, 'circle-color':'#64748b', 'circle-opacity':0.7,
          'circle-stroke-color':'#475569', 'circle-stroke-width':1 } });
      map.addLayer({ id:'transit-text', type:'symbol', source:'transit',
        layout:{ 'text-field':['get','name'], 'text-size':9, 'text-offset':[0,1.2],
          'text-anchor':'top', 'text-font':['Open Sans Regular','Arial Unicode MS Regular'] },
        paint:{ 'text-color':'#94a3b8', 'text-halo-color':'#040f1e', 'text-halo-width':1 } });

      // ── 交互事件 ─────────────────────────────────────────────────────────────

      // 点击默认海缆 → 触发 onCableClick（海缆名称 + 风险评分）
      map.on('click', 'sv-default-hit', e => {
        const feat = e.features?.[0];
        if (!feat) return;
        const cableName: string = feat.properties?.name ?? '';
        if (cableName && onCableClick) {
          // 从路径数据中找到该缆的风险评分（取最大值）
          let maxScore = 0;
          routes.forEach(r => {
            const cables = r.cables.split(' | ').map(c => c.trim().toLowerCase());
            const idx = cables.findIndex(c => c === cableName.toLowerCase());
            if (idx !== -1) {
              const s = Number(r.riskScores.split(' | ')[idx] ?? 0);
              if (s > maxScore) maxScore = s;
            }
          });
          onCableClick(cableName, maxScore);
        }
      });
      map.on('mouseenter', 'sv-default-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sv-default-hit', () => { map.getCanvas().style.cursor = ''; });

      // 点击已选中路径的弧线 → 触发 onPopup
      map.on('click', 'sv-sel-hit', e => {
        const route = routes.find(r => r.id === selectedRouteId);
        if (route && cableApiData && onPopup) {
          const cables = resolveCables(route.cables, bySlug.current, cableApiData.nameIndex);
          const scores = route.riskScores.split(' | ').map(Number);
          onPopup({
            x: e.point.x, y: e.point.y,
            cables: cables.map((c, i) => ({ name:c.name, slug:c.slug, score:scores[i]??route.maxRisk, color:riskColor(scores[i]??route.maxRisk) })),
            route,
          });
        }
      });
      map.on('mouseenter', 'sv-sel-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sv-sel-hit', () => { map.getCanvas().style.cursor = ''; });

      // 点击空白 → 取消选中 + 关闭弹窗
      map.on('click', e => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['sv-default-hit','sv-sel-hit','bm-dot','bp-dot'] });
        if (!hit.length) { onRouteSelect(null); onPopup?.(null); }
      });

      mapReadyRef.current = true;

      // 如果 cableApiData 已经在初始化之前就到达（比如已缓存），立刻填充默认层
      if (cableApiData) updateDefaultLayer();

      setLoadState('ready');
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

  // ── 选中路径变化 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (!selectedRouteId) {
      stopPulse();
      (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:[] });
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line', 'line-opacity', 0.65);
      if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow', 'line-opacity', 0.06);
      return;
    }

    const route = routes.find(r => r.id === selectedRouteId);
    if (!route || !cableApiData) return;

    const cables = resolveCables(route.cables, bySlug.current, cableApiData.nameIndex);
    const scores = route.riskScores.split(' | ').map(Number);
    let allCoords: [number,number][] = []; let maxScore = 0;

    const selFeats: GeoJSON.Feature[] = cables.map((c, i) => {
      const score = scores[i] ?? route.maxRisk;
      if (score > maxScore) maxScore = score;
      if (c.routeGeojson) allCoords = allCoords.concat(flattenCoords(c.routeGeojson));
      return { type:'Feature', properties:{ slug:c.slug, rc:riskColor(score) }, geometry:c.routeGeojson ?? { type:'LineString', coordinates:[] } };
    });

    (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:selFeats });
    if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line', 'line-opacity', 0.15);
    if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow', 'line-opacity', 0.02);

    if (allCoords.length) {
      const bbox = computeBbox(allCoords);
      if (bbox) map.fitBounds(bbox, { padding:90, duration:900, maxZoom:7 });
    }

    const pulsePoints: [number,number][] = route.nodes
      .map(name => TRANSIT_NODES[name] ?? (BRICS_COUNTRY_META[name]?.center as [number,number] | undefined))
      .filter((p): p is [number,number] => !!p);
    const pts = pulsePoints.length >= 2 ? pulsePoints
      : allCoords.filter((_, i) => i % Math.max(1, Math.floor(allCoords.length / 5)) === 0).slice(0, 6);
    startPulse(pts, riskColor(maxScore));
  }, [selectedRouteId, routes, cableApiData, stopPulse, startPulse]);

  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden', height }}>
      <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

      {loadState === 'loading' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
          justifyContent:'center', background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:28, height:28, border:'2px solid rgba(212,175,55,.2)',
              borderTop:`2px solid ${C.gold}`, borderRadius:'50%', margin:'0 auto 10px',
              animation:'sv-spin .8s linear infinite' }} />
            <span style={{ color:C.goldLight, fontSize:13 }}>正在加载底图…</span>
          </div>
        </div>
      )}
      {loadState === 'error' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
          justifyContent:'center', background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <span style={{ color:'#f87171', fontSize:13 }}>底图加载失败，请刷新重试</span>
        </div>
      )}

      {loadState === 'ready' && (
        <div style={{ position:'absolute', bottom:12, right:12,
          background:'rgba(10,22,40,.9)', backdropFilter:'blur(8px)',
          borderRadius:8, padding:'10px 14px', border:`1px solid ${C.gold}12`, zIndex:5,
          display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { color:C.gold,    dot:true,  label:'金砖成员国' },
            { color:'#60A5FA', dot:true,  label:'金砖伙伴国' },
            { color:'#64748b', dot:true,  label:'中转节点' },
            { color:C.gold,    dot:false, label:'主权保留海缆（可点击）' },
          ].map(({ color, dot, label }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, color:'rgba(255,255,255,.5)' }}>
              {dot
                ? <span style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 6px ${color}70`, flexShrink:0 }} />
                : <span style={{ width:18, height:3, background:color, borderRadius:1, flexShrink:0 }} />}
              {label}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes sv-spin { to { transform: rotate(360deg); } }
        .maplibregl-ctrl-group { background: rgba(10,22,40,.9) !important; border: 1px solid ${C.gold}15 !important; border-radius: 8px !important; }
        .maplibregl-ctrl-group button { background: transparent !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.1) !important; }
      `}</style>
    </div>
  );
}

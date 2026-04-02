'use client';
// src/components/sovereign/SovereignNetworkMap.tsx  v6
//
// 新增功能：
// 1. 悬浮 tooltip（鼠标悬停时显示缆名/风险/路径数，离开消失）
//    点击后"锁定"tooltip，只有点击 × 才关闭（参考主页面 HoverCard 交互）
// 2. highlightedCableName prop：表格点击后高亮单条海缆 + fitBounds
// 3. cableApiData 由 Atlas 统一传入（不在 Map 内 fetch）

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META,
  BRICS_COLORS as C,
} from '@/lib/brics-constants';
import { riskColor, type SovereignRoute } from '@/lib/sovereign-routes';

// ── 常量 ─────────────────────────────────────────────────────────────────────
const TRANSIT_NODES: Record<string, [number, number]> = {
  '新加坡':[103.8,1.35],'日本':[138.5,36.2],'菲律宾':[122.0,12.8],
  '韩国':[127.8,36.5],'喀麦隆':[12.3,3.9],'塞舌尔':[55.5,-4.7],
  '索马里':[46.2,5.2],'坦桿尼亚':[35.0,-6.4],'也门':[48.5,15.6],
};

// ── 类型 ─────────────────────────────────────────────────────────────────────
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

// tooltip 数据（悬浮 or 锁定）
interface TooltipInfo {
  x: number; y: number;
  name: string;
  score: number;
  routeCount: number;
}

interface Props {
  height?: string;
  routes: SovereignRoute[];
  filteredRoutes: SovereignRoute[];
  selectedRouteId: string | null;
  cableApiData: CableApiData | null;
  highlightedCableName: string | null;    // ← 表格点击后高亮单条缆
  onRouteSelect: (id: string | null) => void;
  onPopup?: (info: CablePopupInfo | null) => void;
  onCableClick?: (cableName: string, score: number) => void;
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function flattenCoords(geom: GeoJSON.Geometry): [number, number][] {
  if (geom.type === 'LineString') return geom.coordinates as [number, number][];
  if (geom.type === 'MultiLineString') return (geom.coordinates as [number, number][][]).flat();
  return [];
}
function computeBbox(coords: [number, number][]): [[number, number],[number, number]] | null {
  if (!coords.length) return null;
  const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
function resolveCables(
  cablesStr: string, bySlug: Map<string, CableData>, nameIndex: Record<string, string>
): CableData[] {
  const result: CableData[] = []; const seen = new Set<string>();
  for (const raw of cablesStr.split(' | ')) {
    const name = raw.trim();
    const keys = [
      name.toLowerCase(),
      name.replace(/\s*\([^)]+\)/g,'').trim().toLowerCase(),
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

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function SovereignNetworkMap({
  height = '540px', routes, filteredRoutes, selectedRouteId,
  cableApiData, highlightedCableName,
  onRouteSelect, onPopup, onCableClick,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const bySlug        = useRef<Map<string, CableData>>(new Map());
  const nameToSlug    = useRef<Map<string, string>>(new Map());
  const pulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapReadyRef   = useRef(false);

  const [loadState,   setLoadState]   = useState<'loading'|'ready'|'error'>('loading');
  // 悬浮态 tooltip（鼠标在缆线上方时显示）
  const [hoverInfo,   setHoverInfo]   = useState<TooltipInfo | null>(null);
  // 锁定态 tooltip（点击后固定，直到点击 × 才消失）
  const [lockedInfo,  setLockedInfo]  = useState<TooltipInfo | null>(null);

  // 当前展示的 tooltip = 锁定态 优先，否则用悬浮态
  const displayTooltip = lockedInfo ?? hoverInfo;

  // ── 脉冲动画 ────────────────────────────────────────────────────────────────
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
    const makeFC = (p: [number,number][]): GeoJSON.FeatureCollection => ({
      type:'FeatureCollection',
      features: p.map(c => ({ type:'Feature', properties:{ color }, geometry:{ type:'Point', coordinates:c } })),
    });
    ['sv-p1','sv-p2','sv-p3'].forEach(id => {
      if (map.getSource(id)) (map.getSource(id) as maplibregl.GeoJSONSource).setData(makeFC(pts));
    });
    let t = 0;
    pulseTimerRef.current = setInterval(() => {
      const m = mapRef.current; if (!m) return;
      t += 0.05;
      [{ id:'sv-p1', ph:0 },{ id:'sv-p2', ph:Math.PI*2/3 },{ id:'sv-p3', ph:Math.PI*4/3 }]
        .forEach(({ id, ph }) => {
          const s = (Math.sin(t+ph)+1)/2;
          if (m.getLayer(id+'-ring')) {
            m.setPaintProperty(id+'-ring','circle-radius', 8+s*22);
            m.setPaintProperty(id+'-ring','circle-opacity', 0.7*(1-s*0.85));
          }
        });
    }, 40);
  }, [stopPulse]);

  // ── 更新默认缆显示层 ─────────────────────────────────────────────────────────
  const updateDefaultLayer = useCallback((cableNames?: Set<string>) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !cableApiData) return;

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

  useEffect(() => {
    if (cableApiData && mapReadyRef.current) updateDefaultLayer();
  }, [cableApiData, updateDefaultLayer]);

  useEffect(() => {
    if (!selectedRouteId && !highlightedCableName && cableApiData && mapReadyRef.current) {
      const names = new Set<string>();
      filteredRoutes.forEach(r => r.cables.split(' | ').forEach(c => names.add(c.trim())));
      updateDefaultLayer(names.size > 0 ? names : undefined);
    }
  }, [filteredRoutes, selectedRouteId, highlightedCableName, cableApiData, updateDefaultLayer]);

  // ── highlightedCableName 变化：高亮单条缆 ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !cableApiData) return;

    if (!highlightedCableName) {
      // 清除高亮层
      if (map.getSource('sv-hl'))
        (map.getSource('sv-hl') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[] });
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.65);
      if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.06);
      return;
    }

    // 找到对应的 DB 缆记录（用大小写不敏感匹配）
    const key = highlightedCableName.toLowerCase();
    const abbrs = Array.from(highlightedCableName.matchAll(/\(([^)]+)\)/g)).map(m => m[1].toLowerCase());
    let target: CableData | undefined = cableApiData.cables.find(c =>
      c.name.toLowerCase() === key || abbrs.some(a => c.name.toLowerCase().includes(a))
    );

    if (!target || !target.routeGeojson) {
      // DB 里没有这条缆的路由数据，只做视觉压暗但不飞到
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.2);
      return;
    }

    // 填充高亮层
    if (map.getSource('sv-hl'))
      (map.getSource('sv-hl') as maplibregl.GeoJSONSource).setData({
        type:'FeatureCollection',
        features:[{ type:'Feature', properties:{ name: target.name }, geometry:target.routeGeojson }],
      });

    // 压暗其他缆，突出高亮
    if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.1);
    if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.02);

    // fitBounds 到这条缆
    const coords = flattenCoords(target.routeGeojson);
    const bbox = computeBbox(coords);
    if (bbox) map.fitBounds(bbox, { padding:80, duration:900, maxZoom:7 });
  }, [highlightedCableName, cableApiData]);

  // ── 地图初始化（只跑一次）────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
      center: [80, 20], zoom: 2.4, attributionControl: false, fadeDuration: 0,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass:false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // ── 默认海缆层 ────────────────────────────────────────────────────────
      map.addSource('sv-default', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-default-glow', type:'line', source:'sv-default',
        paint:{ 'line-color':C.gold, 'line-width':5, 'line-opacity':0.06, 'line-blur':3 } });
      map.addLayer({ id:'sv-default-line', type:'line', source:'sv-default',
        paint:{ 'line-color':C.gold, 'line-width':1.6, 'line-opacity':0.65 } });
      map.addLayer({ id:'sv-default-hit', type:'line', source:'sv-default',
        paint:{ 'line-color':'transparent', 'line-width':16, 'line-opacity':0 } });

      // ── 单条缆高亮层（表格点击时使用，亮金色 + 强 glow）────────────────────
      map.addSource('sv-hl', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-hl-glow', type:'line', source:'sv-hl',
        paint:{ 'line-color':'#FFD700', 'line-width':12, 'line-opacity':0.3, 'line-blur':5 } });
      map.addLayer({ id:'sv-hl-line', type:'line', source:'sv-hl',
        paint:{ 'line-color':'#FFD700', 'line-width':3, 'line-opacity':1 } });

      // ── 路径选中层 ────────────────────────────────────────────────────────
      map.addSource('sv-sel', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-sel-glow', type:'line', source:'sv-sel',
        paint:{ 'line-color':['get','rc'], 'line-width':12, 'line-opacity':0.2, 'line-blur':5 } });
      map.addLayer({ id:'sv-sel-line', type:'line', source:'sv-sel',
        paint:{ 'line-color':['get','rc'], 'line-width':2.8, 'line-opacity':0.95 } });
      map.addLayer({ id:'sv-sel-hit', type:'line', source:'sv-sel',
        paint:{ 'line-color':'transparent', 'line-width':18, 'line-opacity':0 } });

      // ── 脉冲圈 ────────────────────────────────────────────────────────────
      ['sv-p1','sv-p2','sv-p3'].forEach(id => {
        map.addSource(id, { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
        map.addLayer({ id:id+'-dot', type:'circle', source:id,
          paint:{ 'circle-radius':4,'circle-color':['get','color'],'circle-opacity':0.95,
            'circle-stroke-color':'white','circle-stroke-width':1.5,'circle-stroke-opacity':0.7 } });
        map.addLayer({ id:id+'-ring', type:'circle', source:id,
          paint:{ 'circle-radius':8,'circle-color':['get','color'],'circle-opacity':0.4,'circle-blur':0.6 } });
      });

      // ── 成员国 / 伙伴国 / 中转节点标注 ────────────────────────────────────
      const memberFeats: GeoJSON.Feature[] = BRICS_MEMBERS.map(code => ({
        type:'Feature', properties:{ code, name:BRICS_COUNTRY_META[code]?.nameZh??code },
        geometry:{ type:'Point', coordinates:BRICS_COUNTRY_META[code]?.center??[0,0] },
      }));
      map.addSource('bm', { type:'geojson', data:{ type:'FeatureCollection', features:memberFeats } });
      map.addLayer({ id:'bm-dot', type:'circle', source:'bm',
        paint:{ 'circle-radius':6,'circle-color':C.gold,'circle-opacity':0.88,'circle-stroke-color':C.goldDark,'circle-stroke-width':1.5 } });
      map.addLayer({ id:'bm-text', type:'symbol', source:'bm',
        layout:{ 'text-field':['get','name'],'text-size':11,'text-offset':[0,1.4],
          'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold'] },
        paint:{ 'text-color':C.goldLight,'text-halo-color':'#040f1e','text-halo-width':1.5 } });

      const partnerFeats: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => ({
        type:'Feature', properties:{ code, name:BRICS_COUNTRY_META[code]?.nameZh??code },
        geometry:{ type:'Point', coordinates:BRICS_COUNTRY_META[code]?.center??[0,0] },
      }));
      map.addSource('bp', { type:'geojson', data:{ type:'FeatureCollection', features:partnerFeats } });
      map.addLayer({ id:'bp-dot', type:'circle', source:'bp',
        paint:{ 'circle-radius':4.5,'circle-color':'#60A5FA','circle-opacity':0.8,'circle-stroke-color':'#3B82F6','circle-stroke-width':1 } });
      map.addLayer({ id:'bp-text', type:'symbol', source:'bp',
        layout:{ 'text-field':['get','name'],'text-size':9,'text-offset':[0,1.3],
          'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold'] },
        paint:{ 'text-color':'#93C5FD','text-halo-color':'#040f1e','text-halo-width':1.2 } });

      const transitFeats: GeoJSON.Feature[] = Object.entries(TRANSIT_NODES).map(([name,coord]) => ({
        type:'Feature', properties:{ name }, geometry:{ type:'Point', coordinates:coord },
      }));
      map.addSource('transit', { type:'geojson', data:{ type:'FeatureCollection', features:transitFeats } });
      map.addLayer({ id:'transit-dot', type:'circle', source:'transit',
        paint:{ 'circle-radius':3.5,'circle-color':'#64748b','circle-opacity':0.7,'circle-stroke-color':'#475569','circle-stroke-width':1 } });
      map.addLayer({ id:'transit-text', type:'symbol', source:'transit',
        layout:{ 'text-field':['get','name'],'text-size':9,'text-offset':[0,1.2],
          'text-anchor':'top','text-font':['Open Sans Regular','Arial Unicode MS Regular'] },
        paint:{ 'text-color':'#94a3b8','text-halo-color':'#040f1e','text-halo-width':1 } });

      // ── 交互事件 ─────────────────────────────────────────────────────────

      // 默认缆 hover：更新 hoverInfo（如果没有锁定 tooltip）
      map.on('mousemove', 'sv-default-hit', e => {
        if (!e.features?.length) return;
        const cableName: string = e.features[0].properties?.name ?? '';
        if (!cableName) return;
        map.getCanvas().style.cursor = 'pointer';

        // 计算该缆的最大风险评分（扫描路径数据）
        let maxScore = 0;
        let routeCount = 0;
        routes.forEach(r => {
          const cables = r.cables.split(' | ').map(c => c.trim().toLowerCase());
          const idx = cables.findIndex(c => c === cableName.toLowerCase());
          if (idx !== -1) {
            routeCount++;
            const s = Number(r.riskScores.split(' | ')[idx] ?? 0);
            if (s > maxScore) maxScore = s;
          }
        });

        setHoverInfo({ x: e.point.x, y: e.point.y, name: cableName, score: maxScore, routeCount });
      });

      map.on('mouseleave', 'sv-default-hit', () => {
        map.getCanvas().style.cursor = '';
        setHoverInfo(null);
      });

      // 默认缆 click：锁定 tooltip（再次点击或点击 × 解锁）
      map.on('click', 'sv-default-hit', e => {
        const cableName: string = e.features?.[0]?.properties?.name ?? '';
        if (!cableName) return;

        let maxScore = 0; let routeCount = 0;
        routes.forEach(r => {
          const cables = r.cables.split(' | ').map(c => c.trim().toLowerCase());
          const idx = cables.findIndex(c => c === cableName.toLowerCase());
          if (idx !== -1) { routeCount++; const s = Number(r.riskScores.split(' | ')[idx]??0); if(s>maxScore)maxScore=s; }
        });

        // 触发外部回调（打开详情 modal）
        if (onCableClick) onCableClick(cableName, maxScore);

        // 锁定 tooltip
        setLockedInfo(prev =>
          prev?.name === cableName ? null  // 再次点击同一条缆 → 解锁
            : { x: e.point.x, y: e.point.y, name: cableName, score: maxScore, routeCount }
        );
      });

      // 选中路径的缆 click → 触发路径级弹窗
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
      map.on('mouseenter','sv-sel-hit',()=>{ map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','sv-sel-hit',()=>{ map.getCanvas().style.cursor=''; });

      // 点击空白 → 取消所有选中状态
      map.on('click', e => {
        const hit = map.queryRenderedFeatures(e.point, { layers:['sv-default-hit','sv-sel-hit','bm-dot','bp-dot'] });
        if (!hit.length) {
          onRouteSelect(null); onPopup?.(null);
          setLockedInfo(null); setHoverInfo(null);
        }
      });

      mapReadyRef.current = true;
      if (cableApiData) updateDefaultLayer();
      setLoadState('ready');
    });

    map.on('error', () => setLoadState('error'));

    return () => { stopPulse(); map.remove(); mapRef.current = null; mapReadyRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 路径选中变化 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    if (!selectedRouteId) {
      stopPulse();
      (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:[] });
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.65);
      if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.06);
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
      return { type:'Feature', properties:{ slug:c.slug, rc:riskColor(score) },
        geometry:c.routeGeojson??{ type:'LineString', coordinates:[] } };
    });

    (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:selFeats });
    if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.15);
    if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.02);

    if (allCoords.length) { const bbox = computeBbox(allCoords); if(bbox) map.fitBounds(bbox,{ padding:90, duration:900, maxZoom:7 }); }

    const pulsePoints: [number,number][] = route.nodes
      .map(name => TRANSIT_NODES[name] ?? (BRICS_COUNTRY_META[name]?.center as [number,number]|undefined))
      .filter((p): p is [number,number] => !!p);
    const pts = pulsePoints.length >= 2 ? pulsePoints
      : allCoords.filter((_,i)=>i%Math.max(1,Math.floor(allCoords.length/5))===0).slice(0,6);
    startPulse(pts, riskColor(maxScore));
  }, [selectedRouteId, routes, cableApiData, stopPulse, startPulse]);

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden', height }}>
      <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

      {/* 加载状态 */}
      {loadState === 'loading' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:28, height:28, border:'2px solid rgba(212,175,55,.2)', borderTop:`2px solid ${C.gold}`,
              borderRadius:'50%', margin:'0 auto 10px', animation:'sv-spin .8s linear infinite' }} />
            <span style={{ color:C.goldLight, fontSize:13 }}>正在加载底图…</span>
          </div>
        </div>
      )}
      {loadState === 'error' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <span style={{ color:'#f87171', fontSize:13 }}>底图加载失败，请刷新重试</span>
        </div>
      )}

      {/* ── 悬浮 / 锁定 Tooltip ──
          仿主页面 BRICSMap 的 HoverCard 样式：
          - 悬浮态：pointerEvents:'none'，不遮挡鼠标
          - 锁定态：显示关闭按钮，pointerEvents:'auto'
      */}
      {displayTooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(displayTooltip.x + 16, (containerRef.current?.clientWidth ?? 800) - 310),
          top:  Math.max(displayTooltip.y - 110, 8),
          width: 290,
          background: 'rgba(10,18,36,.97)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${lockedInfo ? C.gold + '40' : C.gold + '20'}`,
          borderRadius: 10,
          zIndex: 20,
          pointerEvents: lockedInfo ? 'auto' : 'none',
          boxShadow: `0 8px 32px rgba(0,0,0,.6)${lockedInfo ? `, 0 0 16px ${C.gold}15` : ''}`,
          overflow: 'hidden',
          transition: 'border-color .2s',
        }}>
          {/* 头部：缆名 + 锁定态下的关闭按钮 */}
          <div style={{ padding:'10px 14px', borderBottom:`1px solid ${C.gold}12`,
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ flex:1, overflow:'hidden', paddingRight: lockedInfo ? 8 : 0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#F0E6C8',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {displayTooltip.name}
              </div>
              {lockedInfo && (
                <div style={{ fontSize:10, color:`${C.gold}80`, marginTop:2 }}>已锁定 · 点击 × 关闭</div>
              )}
            </div>
            {lockedInfo && (
              <button onClick={() => setLockedInfo(null)}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,.45)',
                  cursor:'pointer', fontSize:18, lineHeight:1, flexShrink:0, padding:'0 2px' }}>×</button>
            )}
          </div>

          {/* 数据区 */}
          <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:11 }}>
            {/* 风险评分 */}
            <div>
              <div style={{ color:'rgba(255,255,255,.4)', fontSize:10, marginBottom:4 }}>风险评分</div>
              <div style={{ fontSize:20, fontWeight:700, color:riskColor(displayTooltip.score),
                fontFeatureSettings:'"tnum"' }}>{displayTooltip.score}</div>
              <div style={{ marginTop:4, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ width:`${displayTooltip.score}%`, height:'100%',
                  background:riskColor(displayTooltip.score), borderRadius:2 }} />
              </div>
            </div>
            {/* 出现路径数 */}
            <div>
              <div style={{ color:'rgba(255,255,255,.4)', fontSize:10, marginBottom:4 }}>出现路径数</div>
              <div style={{ fontSize:20, fontWeight:700, color:'#F0E6C8',
                fontFeatureSettings:'"tnum"' }}>{displayTooltip.routeCount}</div>
            </div>
          </div>

          {/* 风险等级文字 */}
          <div style={{ padding:'0 14px 12px' }}>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, fontWeight:600,
              background: displayTooltip.score<=40?'rgba(16,112,86,.25)':displayTooltip.score<=60?'rgba(120,90,10,.25)':'rgba(120,20,20,.25)',
              color: displayTooltip.score<=40?'#4ade80':displayTooltip.score<=60?'#fbbf24':'#f87171',
              border:`1px solid ${displayTooltip.score<=40?'rgba(74,222,128,.3)':displayTooltip.score<=60?'rgba(251,191,36,.3)':'rgba(248,113,113,.3)'}` }}>
              {displayTooltip.score<=20?'低风险':displayTooltip.score<=40?'中低':displayTooltip.score<=60?'中等':displayTooltip.score<=75?'较高':'极高'}
            </span>
            {!lockedInfo && (
              <span style={{ fontSize:10, color:'rgba(255,255,255,.25)', marginLeft:8 }}>点击锁定详情</span>
            )}
          </div>
        </div>
      )}

      {/* 右下角图例 */}
      {loadState === 'ready' && (
        <div style={{ position:'absolute', bottom:12, right:12, background:'rgba(10,22,40,.9)',
          backdropFilter:'blur(8px)', borderRadius:8, padding:'10px 14px',
          border:`1px solid ${C.gold}12`, zIndex:5, display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { color:C.gold,    dot:true,  label:'金砖成员国' },
            { color:'#60A5FA', dot:true,  label:'金砖伙伴国' },
            { color:'#64748b', dot:true,  label:'中转节点' },
            { color:C.gold,    dot:false, label:'主权保留海缆' },
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

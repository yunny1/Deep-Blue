'use client';
// src/components/admin/CableRouteEditor.tsx
//
// 交互式 2D 海缆路线编辑器
//
// 功能：
//   - 加载已有路线 + 登陆站坐标（从 cable-detail API）
//   - 背景参照缆（其他保留海缆，低透明度）
//   - 主干路线绘制（添加路点：点击地图插入坐标点）
//   - 分支单元 + 支缆：点击主干确定 BU → 点击登陆站完成支缆
//   - 拖动路点调整位置
//   - 撤销 / 重做
//   - 自动生成初稿（BU 投影算法）
//   - 保存路线（设置 ROUTE_FIXED，防 nightly-sync 覆盖）

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── 类型 ─────────────────────────────────────────────────────────────────────

type Pt   = [number, number];   // [经度, 纬度]
type Mode = 'pan' | 'addWaypoint' | 'addSpur';

interface StationInfo {
  id: string;
  name: string;
  nameZh: string | null;
  lat: number | null;
  lng: number | null;
}

interface SpurInfo {
  bu: Pt;
  station: Pt;
  stationId: string;
}

interface RouteState {
  trunk: Pt[];
  spurs: SpurInfo[];
}

// ── 几何工具 ──────────────────────────────────────────────────────────────────

function closestOnSeg(p: Pt, a: Pt, b: Pt): { pt: Pt; dist: number } {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const len2 = dx*dx + dy*dy;
  const t = len2 < 1e-14 ? 0 : Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len2));
  const pt: Pt = [a[0]+t*dx, a[1]+t*dy];
  return { pt, dist: Math.hypot(p[0]-pt[0], p[1]-pt[1]) };
}

function closestOnTrunk(trunk: Pt[], click: Pt): { pt: Pt; segIdx: number } {
  let best = { pt: trunk[0] as Pt, segIdx: 0, dist: Infinity };
  for (let i = 0; i < trunk.length-1; i++) {
    const r = closestOnSeg(click, trunk[i], trunk[i+1]);
    if (r.dist < best.dist) best = { ...r, segIdx: i };
  }
  return best;
}

function insertWaypoint(trunk: Pt[], pt: Pt): Pt[] {
  if (trunk.length < 2) return [...trunk, pt];
  let bestDist = Infinity, bestIdx = 0;
  for (let i = 0; i < trunk.length-1; i++) {
    const { dist } = closestOnSeg(pt, trunk[i], trunk[i+1]);
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return [...trunk.slice(0, bestIdx+1), pt, ...trunk.slice(bestIdx+1)];
}

/** 简化 BU 投影算法（无陆地检测，供自动生成初稿使用，用户随后手工调整） */
function buildBuRoute(stations: StationInfo[], orderedIds: string[]): RouteState {
  const ordered = orderedIds
    .map(id => stations.find(s => s.id === id))
    .filter((s): s is StationInfo => !!(s?.lat != null && s?.lng != null));

  if (ordered.length < 2) {
    return { trunk: ordered.map(s => [s.lng!, s.lat!]), spurs: [] };
  }

  const trunk: Pt[] = [[ordered[0].lng!, ordered[0].lat!]];
  const spurs: SpurInfo[] = [];
  const last: Pt = [ordered[ordered.length-1].lng!, ordered[ordered.length-1].lat!];

  for (let i = 1; i < ordered.length-1; i++) {
    const station: Pt = [ordered[i].lng!, ordered[i].lat!];
    const prev = trunk[trunk.length-1];
    const next: Pt = i+1 < ordered.length-1
      ? [ordered[i+1].lng!, ordered[i+1].lat!]
      : last;

    // 投影 station → prev→next 直线
    const dx = next[0]-prev[0], dy = next[1]-prev[1];
    const len2 = dx*dx + dy*dy;
    const t = len2 < 1e-14
      ? 0.5
      : Math.max(0.05, Math.min(0.95, ((station[0]-prev[0])*dx+(station[1]-prev[1])*dy)/len2));
    const bu: Pt = [prev[0]+t*dx, prev[1]+t*dy];

    trunk.push(bu);
    spurs.push({ bu, station, stationId: ordered[i].id });
  }

  trunk.push(last);
  return { trunk, spurs };
}

/** 防反子午线跳变：调整 newLng 使其与 prevLng 差值 ≤ 180°（保持路线连续向东或向西）*/
function fixAM(prevLng: number, newLng: number): number {
  while (newLng - prevLng >  180) newLng -= 360;
  while (prevLng - newLng >  180) newLng += 360;
  return newLng;
}

/** 从 RouteState 生成保存用的 MultiLineString GeoJSON */
function toGeoJson(state: RouteState): object {
  return {
    type: 'MultiLineString',
    coordinates: [
      state.trunk,
      ...state.spurs.map(s => [s.bu, s.station]),
    ],
  };
}

// ── 颜色常量 ─────────────────────────────────────────────────────────────────

const GOLD        = '#D4AF37';
const SPUR_COLOR  = '#F97316';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface Props {
  /** 海缆 slug，用于加载现有路线和保存 */
  slug: string;
  /** 来自拓扑编辑器的登陆站有序 ID 列表（可选，供自动生成使用）*/
  orderedStationIds?: string[];
  /** 路线更新时通知父组件（用于父组件的保存按钮同步）*/
  onChange?: (geojson: object | null) => void;
}

export default function CableRouteEditor({ slug, orderedStationIds, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const readyRef     = useRef(false);

  // ── 路线状态（同时维护 ref 供 maplibre 事件处理器使用）──
  const [route, setRoute]       = useState<RouteState>({ trunk: [], spurs: [] });
  const routeRef                = useRef<RouteState>({ trunk: [], spurs: [] });
  const [history, setHistory]   = useState<RouteState[]>([]);
  const [future,  setFuture]    = useState<RouteState[]>([]);

  // ── 交互模式（同样维护 ref）──
  const [mode, setMode]         = useState<Mode>('pan');
  const modeRef                 = useRef<Mode>('pan');
  const [spurStep, setSpurStep] = useState<0|1>(0);
  const spurRef                 = useRef<0|1>(0);
  const [pendingBu, setPendingBu] = useState<Pt | null>(null);
  const buRef                   = useRef<Pt | null>(null);

  // ── 数据 ──
  const [stations, setStations]     = useState<StationInfo[]>([]);
  const stationsRef                 = useRef<StationInfo[]>([]);
  const [showRef, setShowRef]       = useState(true);
  const [loadMsg, setLoadMsg]       = useState('');
  const [loadTrigger, setLoadTrigger] = useState(0);   // 重新加载触发器
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');

  // ── 同步 refs ──────────────────────────────────────────────────────────────

  const syncRoute = useCallback((next: RouteState) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  useEffect(() => { modeRef.current  = mode;     }, [mode]);
  useEffect(() => { spurRef.current  = spurStep; }, [spurStep]);
  useEffect(() => { buRef.current    = pendingBu; }, [pendingBu]);
  useEffect(() => { stationsRef.current = stations; }, [stations]);

  const retryLoad = useCallback(() => {
    setLoadMsg('');
    setLoadTrigger(t => t + 1);
  }, []);

  const commit = useCallback((next: RouteState) => {
    setHistory(h => [...h, routeRef.current]);
    setFuture([]);
    syncRoute(next);
  }, [syncRoute]);

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length-1];
      setFuture(f => [routeRef.current, ...f]);
      syncRoute(prev);
      return h.slice(0,-1);
    });
  }, [syncRoute]);

  const redo = useCallback(() => {
    setFuture(f => {
      if (!f.length) return f;
      const next = f[0];
      setHistory(h => [...h, routeRef.current]);
      syncRoute(next);
      return f.slice(1);
    });
  }, [syncRoute]);

  // ── 通知父组件 ─────────────────────────────────────────────────────────────

  useEffect(() => {
    onChange?.(route.trunk.length >= 2 ? toGeoJson(route) : null);
  }, [route, onChange]);

  // ── 加载登陆站 + 现有路线 ─────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return;
    setLoadMsg('加载中…');
    fetch(`/api/admin/cable-detail?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: {
        landingStations?: { id: string; name: string; nameZh: string | null; lat: number | null; lng: number | null }[];
        hasRouteGeojson?: boolean;
        routeGeojson?: { type: string; coordinates: unknown[][] };
      }) => {
        // 登陆站
        const sts: StationInfo[] = (data.landingStations ?? []).map(ls => ({
          id: ls.id, name: ls.name, nameZh: ls.nameZh, lat: ls.lat, lng: ls.lng,
        }));
        setStations(sts);
        stationsRef.current = sts;

        // 现有路线
        if (data.hasRouteGeojson && data.routeGeojson) {
          const geo = data.routeGeojson;
          if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates) && geo.coordinates.length > 0) {
            const trunk = (geo.coordinates[0] as number[][]).map(c => [c[0], c[1]] as Pt);
            const spurs: SpurInfo[] = [];
            for (let i = 1; i < geo.coordinates.length; i++) {
              const line = (geo.coordinates[i] as number[][]). map(c => [c[0], c[1]] as Pt);
              if (line.length >= 2) {
                const stCoord = line[line.length-1];
                const closest = sts.reduce<{ id: string; dist: number } | null>((b, s) => {
                  if (!s.lat || !s.lng) return b;
                  const d = Math.hypot(s.lng-stCoord[0], s.lat-stCoord[1]);
                  return !b || d < b.dist ? { id: s.id, dist: d } : b;
                }, null);
                spurs.push({ bu: line[0], station: stCoord, stationId: closest?.id ?? '' });
              }
            }
            syncRoute({ trunk, spurs });
          } else if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
            syncRoute({ trunk: (geo.coordinates as number[][]).map(c => [c[0], c[1]] as Pt), spurs: [] });
          }
        }
        setLoadMsg('');
      })
      .catch(() => setLoadMsg('⚠ 该 slug 在数据库中不存在，请先执行第四步保存，然后点击下方「重新加载」'));
  }, [slug, loadTrigger, syncRoute]);

  // ── 更新地图 sources ────────────────────────────────────────────────────────

  const updateSources = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const s = routeRef.current;
    const bu = buRef.current;

    // 主干
    const trunkFC: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: s.trunk.length >= 2 ? [{
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: s.trunk },
      }] : [],
    };
    (map.getSource('re-trunk') as maplibregl.GeoJSONSource)?.setData(trunkFC);

    // 支缆
    (map.getSource('re-spurs') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: s.spurs.map(sp => ({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [sp.bu, sp.station] },
      })),
    });

    // 可拖动路点（白色圆圈）
    (map.getSource('re-wpts') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: s.trunk.map((pt, idx) => ({
        type: 'Feature', properties: { idx },
        geometry: { type: 'Point', coordinates: pt },
      })),
    });

    // BU 点（橙色三角形用 circle 代替）
    (map.getSource('re-bu') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: s.spurs.map(sp => ({
        type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: sp.bu },
      })),
    });

    // 待定 BU（支缆第一步的临时位置）
    (map.getSource('re-pending') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: bu ? [{ type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: bu } }] : [],
    });
  }, []);

  const updateStations = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const sts = stationsRef.current;
    const oids = orderedStationIds ?? [];

    (map.getSource('re-stations') as maplibregl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: sts.filter(s => s.lat != null && s.lng != null).map(s => {
        const oi = oids.indexOf(s.id);
        return {
          type: 'Feature',
          properties: {
            id: s.id,
            name: s.nameZh || s.name,
            isEndpoint: oi === 0 || oi === oids.length-1,
            isOrdered: oi !== -1,
          },
          geometry: { type: 'Point', coordinates: [s.lng!, s.lat!] },
        };
      }),
    });
  }, [orderedStationIds]);

  // ── 地图初始化 ─────────────────────────────────────────────────────────────

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
      // ── 所有 sources ──
      for (const id of ['re-ref','re-trunk','re-spurs','re-wpts','re-bu','re-pending','re-stations']) {
        map.addSource(id, { type: 'geojson', data: EMPTY_FC });
      }

      // ── 参照缆（低透明度金色）──
      map.addLayer({ id:'re-ref-line', type:'line', source:'re-ref',
        paint:{ 'line-color':'#9A7B20', 'line-width':1, 'line-opacity':0.2 } });

      // ── 主干线 ──
      map.addLayer({ id:'re-trunk-glow', type:'line', source:'re-trunk',
        paint:{ 'line-color':GOLD, 'line-width':9, 'line-opacity':0.1, 'line-blur':4 } });
      map.addLayer({ id:'re-trunk-line', type:'line', source:'re-trunk',
        paint:{ 'line-color':GOLD, 'line-width':2, 'line-opacity':0.9 } });

      // ── 支缆（橙色虚线）──
      map.addLayer({ id:'re-spur-line', type:'line', source:'re-spurs',
        paint:{ 'line-color':SPUR_COLOR, 'line-width':1.5, 'line-opacity':0.85,
          'line-dasharray':[4,3] } });

      // ── BU 点（橙色圆圈）──
      map.addLayer({ id:'re-bu-dot', type:'circle', source:'re-bu',
        paint:{ 'circle-radius':5, 'circle-color':SPUR_COLOR, 'circle-opacity':0.9,
          'circle-stroke-color':'#fff', 'circle-stroke-width':1.5 } });

      // ── 待定 BU（黄色，支缆创建第一步）──
      map.addLayer({ id:'re-pending-dot', type:'circle', source:'re-pending',
        paint:{ 'circle-radius':7, 'circle-color':'#FBBF24', 'circle-opacity':1,
          'circle-stroke-color':'#fff', 'circle-stroke-width':2 } });

      // ── 可拖动路点（白色圆圈，在所有点层之上）──
      map.addLayer({ id:'re-wpt-dot', type:'circle', source:'re-wpts',
        paint:{ 'circle-radius':5, 'circle-color':'#fff', 'circle-opacity':0.85,
          'circle-stroke-color':GOLD, 'circle-stroke-width':2 } });

      // ── 登陆站标记 ──
      map.addLayer({ id:'re-st-dot', type:'circle', source:'re-stations',
        paint:{
          'circle-radius': ['case',['get','isEndpoint'],9,7],
          'circle-color': ['case',
            ['get','isEndpoint'], GOLD,
            ['get','isOrdered'], '#60A5FA',
            '#64748b'],
          'circle-opacity': 0.9,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        } });
      map.addLayer({ id:'re-st-label', type:'symbol', source:'re-stations',
        layout:{ 'text-field':['get','name'], 'text-size':10, 'text-offset':[0,1.5],
          'text-anchor':'top', 'text-font':['Open Sans Regular','Arial Unicode MS Regular'] },
        paint:{ 'text-color':'rgba(255,255,255,.7)', 'text-halo-color':'#040f1e', 'text-halo-width':1.2 } });

      // ── 拖动路点 ─────────────────────────────────────────────────────────
      let dragIdx = -1;
      let dragStartState: RouteState | null = null;

      map.on('mouseenter', 're-wpt-dot', () => {
        if (modeRef.current === 'pan') map.getCanvas().style.cursor = 'grab';
      });
      map.on('mouseleave', 're-wpt-dot', () => {
        if (dragIdx < 0) map.getCanvas().style.cursor = '';
      });

      map.on('mousedown', 're-wpt-dot', (e) => {
        if (modeRef.current !== 'pan') return;
        e.preventDefault();
        dragIdx = (e.features![0].properties!.idx as number);
        dragStartState = { ...routeRef.current };
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'grabbing';
      });

      map.on('mousemove', (e) => {
        if (dragIdx < 0) return;
        const { lng, lat } = e.lngLat;
        const s = routeRef.current;
        const newTrunk = [...s.trunk];
        const oldPt = newTrunk[dragIdx];
        newTrunk[dragIdx] = [lng, lat];
        // 同步移动以这个 trunk 点为 BU 的支缆
        const newSpurs = s.spurs.map(sp =>
          Math.hypot(sp.bu[0]-oldPt[0], sp.bu[1]-oldPt[1]) < 1e-6
            ? { ...sp, bu: [lng, lat] as Pt }
            : sp
        );
        routeRef.current = { trunk: newTrunk, spurs: newSpurs };
        updateSources();
      });

      map.on('mouseup', () => {
        if (dragIdx < 0) return;
        const committed = { ...routeRef.current };
        // 把拖动前的状态推入历史
        if (dragStartState) {
          setHistory(h => [...h, dragStartState!]);
          setFuture([]);
        }
        setRoute(committed);
        dragIdx = -1;
        dragStartState = null;
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
      });

      // ── 点击地图 ─────────────────────────────────────────────────────────

      map.on('click', (e) => {
        const m = modeRef.current;
        const click: Pt = [e.lngLat.lng, e.lngLat.lat];

        // ── addWaypoint：依次追加路点（按点击顺序连接，点登陆站自动吸附）──
        if (m === 'addWaypoint') {
          // 点到已有路点上 → 跳过（避免重复）
          const wptHit = map.queryRenderedFeatures(e.point, { layers: ['re-wpt-dot'] });
          if (wptHit.length) return;

          // 点到登陆站 → 吸附到站点精确坐标
          const stHit = map.queryRenderedFeatures(e.point, { layers: ['re-st-dot'] });
          const pt: Pt = stHit.length
            ? ((stHit[0].geometry as GeoJSON.Point).coordinates as Pt)
            : click;

          const s = routeRef.current;
          // 反子午线修复：调整经度使路线连续，避免绕地球另一侧
          const lastLng = s.trunk.length > 0 ? s.trunk[s.trunk.length - 1][0] : pt[0];
          const fixedPt: Pt = [fixAM(lastLng, pt[0]), pt[1]];

          // 追加到末尾（顺序连接，不插入中间）
          const next = { ...s, trunk: [...s.trunk, fixedPt] };
          setHistory(h => [...h, s]);
          setFuture([]);
          routeRef.current = next;
          setRoute(next);
          return;
        }

        // ── addSpur step 0：确定 BU 位置 ──
        if (m === 'addSpur' && spurRef.current === 0) {
          const s = routeRef.current;
          if (s.trunk.length < 2) return;
          const { pt } = closestOnTrunk(s.trunk, click);
          buRef.current = pt;
          setPendingBu(pt);
          spurRef.current = 1;
          setSpurStep(1);
          updateSources();
          return;
        }

        // ── addSpur step 1：点登陆站完成支缆 ──
        if (m === 'addSpur' && spurRef.current === 1) {
          const hit = map.queryRenderedFeatures(e.point, { layers: ['re-st-dot'] });
          if (!hit.length) {
            // 点到空白处 → 取消
            buRef.current = null;
            setPendingBu(null);
            spurRef.current = 0;
            setSpurStep(0);
            updateSources();
            return;
          }
          const feat    = hit[0];
          const stId    = feat.properties!.id as string;
          const stCoord = (feat.geometry as GeoJSON.Point).coordinates as Pt;
          const bu      = buRef.current!;
          const s       = routeRef.current;
          const next    = { ...s, spurs: [...s.spurs, { bu, station: stCoord, stationId: stId }] };
          setHistory(h => [...h, s]);
          setFuture([]);
          routeRef.current = next;
          setRoute(next);
          buRef.current = null;
          setPendingBu(null);
          spurRef.current = 0;
          setSpurStep(0);
        }
      });

      // ── 加载参照缆 ──
      try {
        const res = await fetch('/api/sovereign-network');
        if (res.ok) {
          const data = await res.json();
          const feats = (data.cables ?? [])
            .filter((c: { routeGeojson?: unknown }) => c.routeGeojson)
            .map((c: { name: string; routeGeojson: object }) => ({
              type: 'Feature', properties: { name: c.name }, geometry: c.routeGeojson,
            }));
          (map.getSource('re-ref') as maplibregl.GeoJSONSource)?.setData({
            type: 'FeatureCollection', features: feats,
          });
        }
      } catch { /* 参照缆加载失败不影响主功能 */ }

      readyRef.current = true;
      updateSources();
      updateStations();
    });

    map.on('error', () => {});
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ── 状态 → 地图同步 ──────────────────────────────────────────────────────

  useEffect(() => { updateSources(); }, [route, pendingBu, updateSources]);
  useEffect(() => { updateStations(); }, [stations, orderedStationIds, updateStations]);

  // ── 参照缆显示切换 ───────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer('re-ref-line'))
      map.setLayoutProperty('re-ref-line', 'visibility', showRef ? 'visible' : 'none');
  }, [showRef]);

  // ── 自动生成初稿 ─────────────────────────────────────────────────────────

  const autoGenerate = useCallback(() => {
    const ids = orderedStationIds;
    if (!ids || ids.length < 2) {
      alert('请先在拓扑编辑器中设置登陆站顺序（至少两个站点）');
      return;
    }
    const sts = stationsRef.current;
    const next = buildBuRoute(sts, ids);
    if (next.trunk.length < 2) {
      alert('登陆站坐标不足，请确认登陆站已有经纬度数据');
      return;
    }
    commit(next);

    const map = mapRef.current;
    if (map && next.trunk.length >= 2) {
      const lngs = next.trunk.map(p => p[0]);
      const lats  = next.trunk.map(p => p[1]);
      try {
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, duration: 800, maxZoom: 8 }
        );
      } catch { /* ignore invalid bounds */ }
    }
  }, [orderedStationIds, commit]);

  // ── 清空路线 ─────────────────────────────────────────────────────────────

  const clearRoute = useCallback(() => {
    if (!confirm('确认清空当前路线？可以用撤销按钮恢复。')) return;
    commit({ trunk: [], spurs: [] });
    setPendingBu(null);
    buRef.current = null;
    setSpurStep(0);
    spurRef.current = 0;
  }, [commit]);

  // ── 切换模式 ────────────────────────────────────────────────────────────

  const switchMode = useCallback((m: Mode) => {
    setMode(m);
    modeRef.current = m;
    setSpurStep(0);
    spurRef.current = 0;
    setPendingBu(null);
    buRef.current = null;
    updateSources();
  }, [updateSources]);

  // ── 删除最后一条支缆 ────────────────────────────────────────────────────

  const deleteLastSpur = useCallback(() => {
    const s = routeRef.current;
    if (!s.spurs.length) return;
    commit({ ...s, spurs: s.spurs.slice(0, -1) });
  }, [commit]);

  // ── 删除最后一个路点（非端点）─────────────────────────────────────────

  const deleteLastWaypoint = useCallback(() => {
    const s = routeRef.current;
    if (s.trunk.length <= 2) return;  // 端点不能删
    commit({ ...s, trunk: [...s.trunk.slice(0, -2), s.trunk[s.trunk.length-1]] });
  }, [commit]);

  // ── 保存路线 ─────────────────────────────────────────────────────────────

  const saveRoute = async () => {
    if (route.trunk.length < 2) { setSaveMsg('✗ 路线至少需要两个坐标点'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const res = await fetch('/api/admin/save-cable-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, geojson: toGeoJson(route) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaveMsg('✓ 路线已保存（ROUTE_FIXED 标记已设置，nightly-sync 不会覆盖此路线）。Cloudflare Purge + 强制刷新后地球生效。');
    } catch (e: unknown) {
      setSaveMsg(`✗ 保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── 提示文案 ─────────────────────────────────────────────────────────────

  const hint = mode === 'addWaypoint'
    ? '依次点击地图追加路点（按顺序连接）| 点击蓝色/金色登陆站标记自动吸附到站点坐标'
    : mode === 'addSpur'
      ? spurStep === 0
        ? '点击主干线（或空白处）确定分支单元 BU 位置'
        : '⚡ 已锁定 BU 位置 — 现在点击一个登陆站完成支缆连接，或点击空白取消'
      : '拖动白色圆点调整路点 / 拖动地图平移';

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", color:'#E8E0D0' }}>

      {/* ── 工具栏 ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>

        {/* 模式按钮 */}
        {([
          { m:'pan' as Mode,         label:'🖱 移动' },
          { m:'addWaypoint' as Mode, label:'➕ 路点' },
          { m:'addSpur' as Mode,     label:'🔀 支缆' },
        ]).map(({ m, label }) => (
          <button key={m} onClick={() => switchMode(m)} style={{
            padding:'6px 14px', borderRadius:7, cursor:'pointer', fontSize:12,
            background: mode===m ? `${GOLD}22` : 'rgba(255,255,255,.05)',
            border:`1px solid ${mode===m ? GOLD+'55' : 'rgba(255,255,255,.12)'}`,
            color: mode===m ? GOLD : 'rgba(255,255,255,.6)',
            fontWeight: mode===m ? 600 : 400,
          }}>{label}</button>
        ))}

        <div style={{ width:1, height:20, background:'rgba(255,255,255,.12)', flexShrink:0 }} />

        {/* 撤销 / 重做 */}
        <button onClick={undo} disabled={!history.length} style={{
          padding:'6px 12px', borderRadius:7, fontSize:12,
          cursor:history.length?'pointer':'not-allowed',
          background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
          color:history.length?'rgba(255,255,255,.7)':'rgba(255,255,255,.25)',
        }}>↩ 撤销</button>
        <button onClick={redo} disabled={!future.length} style={{
          padding:'6px 12px', borderRadius:7, fontSize:12,
          cursor:future.length?'pointer':'not-allowed',
          background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)',
          color:future.length?'rgba(255,255,255,.7)':'rgba(255,255,255,.25)',
        }}>↪ 重做</button>

        {/* 删除工具 */}
        <button onClick={deleteLastSpur} disabled={!route.spurs.length} title="删除最后一条支缆" style={{
          padding:'6px 12px', borderRadius:7, fontSize:12,
          cursor:route.spurs.length?'pointer':'not-allowed',
          background:'rgba(255,255,255,.04)', border:'1px solid rgba(249,115,22,.25)',
          color:route.spurs.length?'rgba(249,115,22,.8)':'rgba(255,255,255,.2)',
        }}>🔀✕</button>
        <button onClick={clearRoute} style={{
          padding:'6px 12px', borderRadius:7, fontSize:12, cursor:'pointer',
          background:'rgba(255,255,255,.04)', border:'1px solid rgba(248,113,113,.2)',
          color:'rgba(248,113,113,.7)',
        }}>🗑 清空</button>

        <div style={{ width:1, height:20, background:'rgba(255,255,255,.12)', flexShrink:0 }} />

        {/* 功能 */}
        <button onClick={autoGenerate} style={{
          padding:'6px 14px', borderRadius:7, cursor:'pointer', fontSize:12,
          background:'rgba(99,153,34,.15)', border:'1px solid rgba(99,153,34,.4)', color:'#86EFAC',
        }}>🤖 自动生成初稿</button>
        <button onClick={() => setShowRef(v => !v)} style={{
          padding:'6px 14px', borderRadius:7, cursor:'pointer', fontSize:12,
          background:showRef?`${GOLD}12`:'rgba(255,255,255,.04)',
          border:`1px solid ${showRef?GOLD+'30':'rgba(255,255,255,.1)'}`,
          color:showRef?GOLD:'rgba(255,255,255,.4)',
        }}>🗺 参照缆 {showRef?'ON':'OFF'}</button>

        {/* 统计 + 保存 */}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,.3)', whiteSpace:'nowrap' }}>
            主干 {route.trunk.length} 点 · 支缆 {route.spurs.length} 条
          </span>
          <button onClick={saveRoute}
            disabled={saving || route.trunk.length < 2}
            style={{
              padding:'7px 18px', borderRadius:7, fontSize:13, fontWeight:600,
              cursor:(saving||route.trunk.length<2)?'not-allowed':'pointer',
              background:GOLD, border:'none', color:'#0A1628',
              opacity:(saving||route.trunk.length<2)?0.45:1, whiteSpace:'nowrap',
            }}>
            {saving ? '保存中…' : '💾 保存路线'}
          </button>
        </div>
      </div>

      {/* ── 状态提示条 ── */}
      <div style={{
        padding:'6px 12px', borderRadius:7, marginBottom:8, fontSize:11, lineHeight:1.5,
        background: mode==='addSpur' && spurStep===1
          ? 'rgba(249,115,22,.15)' : 'rgba(255,255,255,.03)',
        border:`1px solid ${mode==='addSpur'&&spurStep===1?'rgba(249,115,22,.4)':'rgba(255,255,255,.07)'}`,
        color: mode==='addSpur'&&spurStep===1 ? '#F97316' : 'rgba(255,255,255,.45)',
      }}>
        {hint}
      </div>

      {/* ── 地图区域（始终挂载，警告以浮层形式覆盖）── */}
      <div style={{ position: 'relative' }}>
        {!slug ? (
          <div style={{
            height:520, display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)',
            borderRadius:12, color:'rgba(255,255,255,.25)', fontSize:13,
          }}>
            请先填写上方 Slug 字段后激活地图编辑器
          </div>
        ) : (
          <>
            <div ref={containerRef}
              style={{ height:520, borderRadius:12, overflow:'hidden',
                border:'1px solid rgba(255,255,255,.08)',
                cursor: mode==='addWaypoint' ? 'crosshair'
                  : mode==='addSpur' ? (spurStep===1?'cell':'crosshair')
                  : 'grab',
              }} />
            {loadMsg && (
              <div style={{
                position:'absolute', inset:0, display:'flex', alignItems:'center',
                justifyContent:'center', flexDirection:'column', gap:12,
                background:'rgba(6,14,30,.92)', borderRadius:12,
              }}>
                <span style={{ fontSize:22 }}>⚠️</span>
                <span style={{ fontSize:13, color:'rgba(255,255,255,.5)', textAlign:'center',
                  maxWidth:320, lineHeight:1.6 }}>{loadMsg}</span>
                <button onClick={retryLoad} style={{
                  padding:'8px 20px', borderRadius:8, cursor:'pointer',
                  background:'rgba(212,175,55,.15)', border:'1px solid rgba(212,175,55,.4)',
                  color:GOLD, fontSize:13, fontWeight:500,
                }}>🔄 重新加载</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 保存消息 ── */}
      {saveMsg && (
        <div style={{
          marginTop:10, padding:'9px 14px', borderRadius:8, fontSize:12, lineHeight:1.6,
          background:saveMsg.startsWith('✓')?'rgba(16,112,86,.2)':'rgba(120,20,20,.2)',
          border:`1px solid ${saveMsg.startsWith('✓')?'rgba(74,222,128,.2)':'rgba(248,113,113,.2)'}`,
          color:saveMsg.startsWith('✓')?'#4ade80':'#f87171',
        }}>
          {saveMsg}
        </div>
      )}

      {/* ── 图例 ── */}
      <div style={{ marginTop:10, display:'flex', gap:14, flexWrap:'wrap', fontSize:11,
        color:'rgba(255,255,255,.38)' }}>
        {[
          { type:'line',  color:GOLD,       dash:false, label:'主干线' },
          { type:'line',  color:SPUR_COLOR, dash:true,  label:'支缆 (BU→站)' },
          { type:'dot',   color:GOLD,       size:9,     label:'端点站' },
          { type:'dot',   color:'#60A5FA',  size:7,     label:'中间站' },
          { type:'dot',   color:'#64748b',  size:7,     label:'未排序站' },
          { type:'dot',   color:'#fff',     size:6,     label:'可拖路点', border:GOLD },
          { type:'dot',   color:SPUR_COLOR, size:6,     label:'分支单元 BU' },
          { type:'dot',   color:'#9A7B20',  size:5,     label:'参照缆' },
        ].map(({ type, color, dash, label, size, border }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
            {type === 'dot'
              ? <span style={{ width:size, height:size, borderRadius:'50%', background:color,
                  display:'inline-block', flexShrink:0,
                  border:`1.5px solid ${border ?? 'rgba(255,255,255,.4)'}` }} />
              : <span style={{ width:20, height:0, display:'inline-block', flexShrink:0,
                  borderTop: dash ? `2px dashed ${color}` : `2px solid ${color}` }} />}
            {label}
          </div>
        ))}
      </div>

      <style>{`
        .maplibregl-ctrl-group {
          background: rgba(10,22,40,.9) !important;
          border: 1px solid rgba(212,175,55,.15) !important;
          border-radius: 8px !important;
        }
        .maplibregl-ctrl-group button { background: transparent !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.08) !important; }
      `}</style>
    </div>
  );
}

'use client';
// src/components/sovereign/SovereignNetworkMap.tsx  v8
//
// 改动：
// 1. isZh 变化时动态更新地图成员/伙伴/中转标注（setData 刷新 GeoJSON）
// 2. 浮动卡片新增 status 字段（在役/退役/计划中），带颜色 badge
// 3. 所有卡片文案完整 i18n（中英切换无混乱）
// 4. TRANSIT_NODES 拆分中英双语版本

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META,
  BRICS_COLORS as C,
} from '@/lib/brics-constants';
import { riskColor, type SovereignRoute } from '@/lib/sovereign-routes';
import { ROUTE_SEGMENT_MAP } from '@/lib/route-segment-map';

// ── 中转节点（中英双语）────────────────────────────────────────────────────
const TRANSIT_COORDS: Record<string, [number, number]> = {
  Singapore: [103.8, 1.35], Japan: [138.5, 36.2], Philippines: [122.0, 12.8],
  'South Korea': [127.8, 36.5], Cameroon: [12.3, 3.9], Seychelles: [55.5, -4.7],
  Somalia: [46.2, 5.2], Tanzania: [35.0, -6.4], Yemen: [48.5, 15.6],
};
// 英文 key → 中文显示名
const TRANSIT_ZH: Record<string, string> = {
  Singapore: '新加坡', Japan: '日本', Philippines: '菲律宾',
  'South Korea': '韩国', Cameroon: '喀麦隆', Seychelles: '塞舌尔',
  Somalia: '索马里', Tanzania: '坦桑尼亚', Yemen: '也门',
};

// ── 海缆状态标签 ─────────────────────────────────────────────────────────
const STATUS_ZH: Record<string, string> = {
  IN_SERVICE: '在役', UNDER_CONSTRUCTION: '建设中',
  PLANNED: '计划中', RETIRED: '退役', DECOMMISSIONED: '已报废',
};
const STATUS_EN: Record<string, string> = {
  IN_SERVICE: 'In Service', UNDER_CONSTRUCTION: 'Under Construction',
  PLANNED: 'Planned', RETIRED: 'Retired', DECOMMISSIONED: 'Decommissioned',
};
const STATUS_COLOR: Record<string, string> = {
  IN_SERVICE: '#22C55E', UNDER_CONSTRUCTION: '#3B82F6',
  PLANNED: '#EAB308', RETIRED: '#94A3B8', DECOMMISSIONED: '#6B7280',
};

// ── 新闻分类标签（中英）──────────────────────────────────────────────────
const CATEGORY_ZH: Record<string, { label: string; color: string }> = {
  cut: { label:'断缆',color:'#EF4444' }, repair: { label:'修复',color:'#F59E0B' },
  deployment: { label:'部署',color:'#3B82F6' }, policy: { label:'政策',color:'#8B5CF6' },
  investment: { label:'投资',color:'#10B981' }, incident: { label:'事件',color:'#F97316' },
  other: { label:'其他',color:'#6B7280' },
};
const CATEGORY_EN: Record<string, { label: string; color: string }> = {
  cut: { label:'Cut',color:'#EF4444' }, repair: { label:'Repair',color:'#F59E0B' },
  deployment: { label:'Deploy',color:'#3B82F6' }, policy: { label:'Policy',color:'#8B5CF6' },
  investment: { label:'Invest',color:'#10B981' }, incident: { label:'Incident',color:'#F97316' },
  other: { label:'Other',color:'#6B7280' },
};

// ── 类型 ──────────────────────────────────────────────────────────────────
interface CableData {
  slug: string; name: string;
  status?: string | null;             // ← 新增
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
  vendor?: string | null;
  owners?: string[];
  lengthKm?: number | null;
  capacityTbps?: number | null;
  fiberPairs?: number | null;
}
interface CableApiData { cables: CableData[]; nameIndex: Record<string, string>; }

export interface CablePopupInfo {
  x: number; y: number;
  cables: Array<{ name: string; slug: string; score: number; color: string }>;
  route: SovereignRoute;
}

interface NewsItem {
  title: string; titleZh: string; summary: string;
  sourceUrl: string; sourceName: string; publishDate: string; category: string;
}

interface FloatingCard {
  x: number; y: number;
  name: string; slug: string;
  status?: string | null;             // ← 新增
  score: number; routeCount: number;
  vendor?: string | null;
  owners?: string[];
  lengthKm?: number | null;
  capacityTbps?: number | null;
  fiberPairs?: number | null;
  segments: Array<{ from: string; to: string; score: number; cables: string[] }>;
  locked: boolean;
}

interface Props {
  height?: string;
  routes: SovereignRoute[];
  filteredRoutes: SovereignRoute[];
  selectedRouteId: string | null;
  cableApiData: CableApiData | null;
  highlightedCableName: string | null;
  onRouteSelect: (id: string | null) => void;
  onPopup?: (info: CablePopupInfo | null) => void;
  isZh?: boolean;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────
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
function resolveCables(cablesStr: string, bySlug: Map<string,CableData>, nameIndex: Record<string,string>): CableData[] {
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
      if (slug && !seen.has(slug)) { const c = bySlug.get(slug); if (c) { result.push(c); seen.add(slug); break; } }
    }
  }
  return result;
}

function getCableSegments(cableName: string, routes: SovereignRoute[]) {
  const segments: Array<{ from: string; to: string; score: number; cables: string[] }> = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const segData = ROUTE_SEGMENT_MAP[route.id];
    if (!segData) continue;
    for (const seg of segData) {
      if (!seg.cables.some(c => c.name.toLowerCase() === cableName.toLowerCase())) continue;
      const key = `${seg.from}→${seg.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bestScore = seg.cables.find(c => c.isBest)?.score ?? seg.cables[0]?.score ?? 0;
      segments.push({ from: seg.from, to: seg.to, score: bestScore, cables: seg.cables.map(c => c.name) });
      if (segments.length >= 6) return segments;
    }
  }
  return segments;
}

// 构建地图用的 GeoJSON（成员/伙伴/中转）
function buildMemberFeatures(isZh: boolean): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: BRICS_MEMBERS.map(code => {
      const meta = BRICS_COUNTRY_META[code];
      const name = meta?.nameZh ?? meta?.name ?? code;
      return { type: 'Feature' as const, properties: { code, name }, geometry: { type: 'Point' as const, coordinates: meta?.center ?? [0, 0] } };
    }),
  };
}
function buildPartnerFeatures(isZh: boolean): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: BRICS_PARTNERS.map(code => {
      const meta = BRICS_COUNTRY_META[code];
      const name = isZh ? (meta?.nameZh ?? code) : (meta?.name ?? meta?.nameZh ?? code);
      return { type: 'Feature' as const, properties: { code, name }, geometry: { type: 'Point' as const, coordinates: meta?.center ?? [0, 0] } };
    }),
  };
}
function buildTransitFeatures(isZh: boolean): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: Object.entries(TRANSIT_COORDS).map(([enName, coord]) => ({
      type: 'Feature' as const,
      properties: { name: isZh ? (TRANSIT_ZH[enName] ?? enName) : enName },
      geometry: { type: 'Point' as const, coordinates: coord },
    })),
  };
}

// ── 浮动卡片组件 ──────────────────────────────────────────────────────────
function FloatingCableCard({
  card, containerW, onClose, routes, isZh,
}: {
  card: FloatingCard; containerW: number; onClose: () => void;
  routes: SovereignRoute[]; isZh: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [news, setNews]         = useState<NewsItem[] | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError,   setNewsError]   = useState(false);

  const CATEGORY = isZh ? CATEGORY_ZH : CATEGORY_EN;

  useEffect(() => {
    if (!expanded || news !== null) return;
    setNewsLoading(true); setNewsError(false);
    fetch(`/api/cables/news?slug=${encodeURIComponent(card.slug)}&name=${encodeURIComponent(card.name)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setNews(d.news ?? []))
      .catch(() => { setNewsError(true); setNews([]); })
      .finally(() => setNewsLoading(false));
  }, [expanded, card.slug, card.name, news]);

  const W = 320;
  const left = Math.min(card.x + 16, containerW - W - 8);
  const top  = Math.max(card.y - 60, 8);
  const color = riskColor(card.score);

  // 状态标签
  const statusLabel = card.status
    ? (isZh ? STATUS_ZH[card.status] : STATUS_EN[card.status]) ?? card.status
    : null;
  const statusColor = card.status ? (STATUS_COLOR[card.status] ?? '#6B7280') : '#6B7280';

  return (
    <div style={{
      position: 'absolute', left, top, width: W, zIndex: 30,
      background: 'rgba(8,18,36,.97)', backdropFilter: 'blur(20px)',
      border: `1px solid ${card.locked ? C.gold + '50' : C.gold + '20'}`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: `0 8px 40px rgba(0,0,0,.7)${card.locked ? `,0 0 20px ${C.gold}18` : ''}`,
      animation: 'sv-card-in .18s ease both',
      pointerEvents: card.locked ? 'auto' : 'none',
    }}>

      {/* ── 头部：缆名 + 风险评分 + 关闭 ── */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid rgba(255,255,255,.06)` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 8 }}>
          <div style={{ flex:1, overflow:'hidden', paddingRight:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#F0E6C8', lineHeight:1.3,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {card.name}
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginTop:2, fontFamily:'monospace' }}>
              {card.slug}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:800, color, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{card.score}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', marginTop:1 }}>{isZh ? '风险' : 'Risk'}</div>
            </div>
            {card.locked && (
              <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px' }}>×</button>
            )}
          </div>
        </div>

        {/* 在役状态 badge */}
        {statusLabel && (
          <div style={{ marginBottom:8 }}>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, fontWeight:600,
              background:`${statusColor}18`, color:statusColor, border:`1px solid ${statusColor}35` }}>
              {statusLabel}
            </span>
          </div>
        )}

        {/* 建造商 + 运营商 */}
        {(card.vendor || (card.owners && card.owners.length > 0)) && (
          <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
            {card.vendor && (
              <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap', minWidth:44 }}>
                  {isZh ? '建造商' : 'Vendor'}
                </span>
                <span style={{ fontSize:11, color:'rgba(255,255,255,.75)' }}>{card.vendor}</span>
              </div>
            )}
            {card.owners && card.owners.length > 0 && (
              <div style={{ display:'flex', gap:6, alignItems:'flex-start' }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap', minWidth:44 }}>
                  {isZh ? '运营商' : 'Operators'}
                </span>
                <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                  {card.owners.slice(0,4).map(o => (
                    <span key={o} style={{ fontSize:10, padding:'1px 5px', borderRadius:4,
                      background:'rgba(42,157,143,.12)', color:'#2A9D8F', border:'1px solid rgba(42,157,143,.2)' }}>{o}</span>
                  ))}
                  {card.owners.length > 4 && <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>+{card.owners.length-4}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 技术参数 */}
        {(card.lengthKm || card.capacityTbps || card.fiberPairs) && (
          <div style={{ display:'flex', gap:14, marginBottom:8 }}>
            {card.lengthKm && <div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)' }}>{isZh?'长度':'Length'}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.7)' }}>{card.lengthKm.toLocaleString()} km</div>
            </div>}
            {card.capacityTbps && <div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)' }}>{isZh?'容量':'Capacity'}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.7)' }}>{card.capacityTbps} Tbps</div>
            </div>}
            {card.fiberPairs && <div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)' }}>{isZh?'光纤对':'Fiber pairs'}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.7)' }}>{card.fiberPairs}</div>
            </div>}
          </div>
        )}

        {/* 子段风险评分（彩色圆点） */}
        {card.segments.length > 0 && (
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', marginBottom:5, fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase' }}>
              {isZh ? `涉及子段（${card.segments.length}）` : `Segments (${card.segments.length})`}
            </div>
            {card.segments.map((seg, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                {/* 彩色圆点代表该段风险 */}
                <div style={{ width:8, height:8, borderRadius:'50%', background:riskColor(seg.score),
                  flexShrink:0, boxShadow:`0 0 6px ${riskColor(seg.score)}80` }} />
                <span style={{ fontSize:11, color:'rgba(255,255,255,.65)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {seg.from} → {seg.to}
                </span>
                <span style={{ fontSize:11, fontWeight:700, color:riskColor(seg.score), flexShrink:0, fontFeatureSettings:'"tnum"' }}>
                  {seg.score}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 出现路径数 + 点击提示 */}
        <div style={{ marginTop:6, fontSize:10, color:'rgba(255,255,255,.3)' }}>
          {isZh
            ? <><strong style={{ color:'rgba(255,255,255,.6)' }}>{card.routeCount}</strong> 条主权路径涉及此缆</>
            : <>Appears in <strong style={{ color:'rgba(255,255,255,.6)' }}>{card.routeCount}</strong> sovereign routes</>}
          {!card.locked && <span style={{ marginLeft:8, color:`${C.gold}80` }}>{isZh?'点击展开新闻 ▾':'Click for news ▾'}</span>}
        </div>
      </div>

      {/* ── 新闻展开区 ── */}
      {card.locked && (
        <div style={{ maxHeight:expanded?380:0, overflow:'hidden', transition:'max-height .35s cubic-bezier(.4,0,.2,1)' }}>
          <div style={{ padding:'10px 14px 14px' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${C.gold}80`, marginBottom:10 }}>
              {isZh ? '近两年相关新闻' : 'Recent News (2 years)'}
            </div>
            {newsLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 0', color:'rgba(255,255,255,.35)', fontSize:12 }}>
                <div style={{ width:16, height:16, border:'2px solid rgba(255,255,255,.1)', borderTop:`2px solid ${C.gold}`, borderRadius:'50%', animation:'sv-spin .7s linear infinite', flexShrink:0 }} />
                {isZh ? '正在搜索最新新闻…' : 'Searching for latest news…'}
              </div>
            )}
            {newsError && <div style={{ fontSize:12, color:'#f87171', padding:'8px 0' }}>{isZh?'新闻加载失败':'Failed to load news'}</div>}
            {!newsLoading && !newsError && news?.length === 0 && (
              <div style={{ fontSize:12, color:'rgba(255,255,255,.3)', padding:'8px 0' }}>
                {isZh ? '暂未找到近两年相关新闻' : 'No recent news found'}
              </div>
            )}
            {!newsLoading && news?.map((item, i) => {
              const cat = CATEGORY[item.category] ?? CATEGORY.other;
              return (
                <a key={i} href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display:'block', textDecoration:'none', marginBottom:8, padding:'8px 10px', borderRadius:8,
                    background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', transition:'background .15s, border-color .15s' }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLAnchorElement).style.background='rgba(255,255,255,.06)';(e.currentTarget as HTMLAnchorElement).style.borderColor='rgba(255,255,255,.12)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLAnchorElement).style.background='rgba(255,255,255,.03)';(e.currentTarget as HTMLAnchorElement).style.borderColor='rgba(255,255,255,.06)';}}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:cat.color+'20',
                      color:cat.color, border:`1px solid ${cat.color}35`, whiteSpace:'nowrap', flexShrink:0, marginTop:2 }}>{cat.label}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'#E2E8F0', lineHeight:1.4 }}>
                      {isZh ? (item.titleZh || item.title) : item.title}
                    </span>
                  </div>
                  {item.summary && (
                    <p style={{ fontSize:11, color:'rgba(255,255,255,.45)', margin:'0 0 4px', lineHeight:1.5,
                      overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                      {item.summary}
                    </p>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'rgba(255,255,255,.3)' }}>
                    <span>{item.sourceName}</span>
                    <span>{item.publishDate}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* 展开/收起按钮 */}
      {card.locked && (
        <button onClick={() => setExpanded(e => !e)}
          style={{ display:'block', width:'100%', padding:'8px', background:'rgba(255,255,255,.03)', border:'none',
            borderTop:'1px solid rgba(255,255,255,.06)', color:'rgba(255,255,255,.45)', cursor:'pointer', fontSize:11,
            transition:'background .15s', textAlign:'center' }}
          onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.07)')}
          onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,255,255,.03)')}>
          {expanded
            ? (isZh ? '▲ 收起新闻' : '▲ Collapse news')
            : (isZh ? '▼ 展开近两年新闻' : '▼ Show recent news')}
        </button>
      )}
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────────────
export default function SovereignNetworkMap({
  height='540px', routes, filteredRoutes, selectedRouteId,
  cableApiData, highlightedCableName, onRouteSelect, onPopup, isZh=true,
}: Props) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<maplibregl.Map|null>(null);
  const bySlug         = useRef<Map<string,CableData>>(new Map());
  const pulseTimerRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const mapReadyRef    = useRef(false);
  const hoveredSlugRef = useRef<string|null>(null);
  const isZhRef        = useRef(isZh);  // 用 ref 追踪最新值，在 map 事件回调里使用

  const [loadState,    setLoadState]    = useState<'loading'|'ready'|'error'>('loading');
  const [floatingCard, setFloatingCard] = useState<FloatingCard|null>(null);

  // isZh 变化时同步 ref 并更新地图标注
  useEffect(() => {
    isZhRef.current = isZh;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    // 更新成员/伙伴/中转节点的标注语言
    if (map.getSource('bm')) (map.getSource('bm') as maplibregl.GeoJSONSource).setData(buildMemberFeatures(isZh));
    if (map.getSource('bp')) (map.getSource('bp') as maplibregl.GeoJSONSource).setData(buildPartnerFeatures(isZh));
    if (map.getSource('transit')) (map.getSource('transit') as maplibregl.GeoJSONSource).setData(buildTransitFeatures(isZh));
    // 同时更新浮动卡片的 isZh（触发重渲染，文案切换）
    setFloatingCard(prev => prev ? { ...prev } : null);
  }, [isZh]);

  // ── 脉冲动画 ─────────────────────────────────────────────────────────
  const stopPulse = useCallback(() => {
    if (pulseTimerRef.current) { clearInterval(pulseTimerRef.current); pulseTimerRef.current = null; }
    const map = mapRef.current; if (!map) return;
    ['sv-p1','sv-p2','sv-p3'].forEach(id => {
      if (map.getSource(id)) (map.getSource(id) as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[] });
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
      const m = mapRef.current; if (!m) return; t += 0.05;
      [{ id:'sv-p1',ph:0 },{ id:'sv-p2',ph:Math.PI*2/3 },{ id:'sv-p3',ph:Math.PI*4/3 }].forEach(({ id, ph }) => {
        const s = (Math.sin(t+ph)+1)/2;
        if (m.getLayer(id+'-ring')) { m.setPaintProperty(id+'-ring','circle-radius',8+s*22); m.setPaintProperty(id+'-ring','circle-opacity',0.7*(1-s*0.85)); }
      });
    }, 40);
  }, [stopPulse]);

  // ── 默认缆层 ──────────────────────────────────────────────────────────
  const updateDefaultLayer = useCallback((cableNames?: Set<string>) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !cableApiData) return;
    bySlug.current.clear();
    cableApiData.cables.forEach(c => bySlug.current.set(c.slug, c));
    const feats: GeoJSON.Feature[] = cableApiData.cables
      .filter(c => c.routeGeojson && (!cableNames || cableNames.has(c.name)))
      .map(c => ({ type:'Feature', properties:{ slug:c.slug, name:c.name }, geometry:c.routeGeojson! }));
    if (map.getSource('sv-default')) (map.getSource('sv-default') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:feats });
  }, [cableApiData]);

  useEffect(() => { if (cableApiData && mapReadyRef.current) updateDefaultLayer(); }, [cableApiData, updateDefaultLayer]);

  useEffect(() => {
    if (!selectedRouteId && !highlightedCableName && cableApiData && mapReadyRef.current) {
      const names = new Set<string>();
      filteredRoutes.forEach(r => r.cables.split(' | ').forEach(c => names.add(c.trim())));
      updateDefaultLayer(names.size > 0 ? names : undefined);
    }
  }, [filteredRoutes, selectedRouteId, highlightedCableName, cableApiData, updateDefaultLayer]);

  // ── 高亮单条缆（表格点击）──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || !cableApiData) return;
    if (!highlightedCableName) {
      if (map.getSource('sv-hl')) (map.getSource('sv-hl') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[] });
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.65);
      if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.06);
      return;
    }
    const target = cableApiData.cables.find(c =>
      c.name.toLowerCase() === highlightedCableName.toLowerCase() ||
      Array.from(c.name.matchAll(/\(([^)]+)\)/g)).some(m => m[1].toLowerCase() === highlightedCableName.toLowerCase())
    );
    if (target?.routeGeojson) {
      if (map.getSource('sv-hl')) (map.getSource('sv-hl') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[{ type:'Feature', properties:{}, geometry:target.routeGeojson }] });
      if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.1);
      if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.02);
      const bbox = computeBbox(flattenCoords(target.routeGeojson));
      if (bbox) map.fitBounds(bbox, { padding:80, duration:900, maxZoom:7 });
    }
  }, [highlightedCableName, cableApiData]);

  // ── 构造浮动卡片 ───────────────────────────────────────────────────────
  const buildCard = useCallback((cableName: string, x: number, y: number, locked: boolean): FloatingCard|null => {
    const db = [...bySlug.current.values()].find(c =>
      c.name.toLowerCase() === cableName.toLowerCase() ||
      Array.from(c.name.matchAll(/\(([^)]+)\)/g)).some(m => m[1].toLowerCase() === cableName.toLowerCase())
    );
    let maxScore = 0; let routeCount = 0;
    routes.forEach(r => {
      const cables = r.cables.split(' | ').map(c => c.trim().toLowerCase());
      const idx = cables.findIndex(c => c === cableName.toLowerCase());
      if (idx !== -1) { routeCount++; const s = Number(r.riskScores.split(' | ')[idx]??0); if (s>maxScore) maxScore=s; }
    });
    const segments = getCableSegments(cableName, routes);
    return {
      x, y, name: cableName, slug: db?.slug ?? cableName.toLowerCase().replace(/\s+/g,'-'),
      status: db?.status ?? null,    // ← 从 DB 数据取状态
      score: maxScore, routeCount,
      vendor: db?.vendor ? (typeof db.vendor==='string' ? db.vendor : (db.vendor as { name?: string })?.name ?? null) : null,
      owners: Array.isArray(db?.owners) ? (db!.owners as unknown[]).map(o => typeof o==='string' ? o : (o as { name?: string })?.name ?? '').filter(Boolean) : [],
      lengthKm: db?.lengthKm ?? null, capacityTbps: db?.capacityTbps ?? null, fiberPairs: db?.fiberPairs ?? null,
      segments, locked,
    };
  }, [routes]);

  // ── 地图初始化 ──────────────────────────────────────────────────────────
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
      // 默认海缆层
      map.addSource('sv-default', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-default-glow', type:'line', source:'sv-default', paint:{ 'line-color':C.gold,'line-width':5,'line-opacity':0.06,'line-blur':3 } });
      map.addLayer({ id:'sv-default-line', type:'line', source:'sv-default', paint:{ 'line-color':C.gold,'line-width':1.6,'line-opacity':0.65 } });
      map.addLayer({ id:'sv-default-hit', type:'line', source:'sv-default', paint:{ 'line-color':'transparent','line-width':16,'line-opacity':0 } });

      // 悬停高亮层
      map.addSource('sv-hover-hl', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-hover-glow', type:'line', source:'sv-hover-hl', paint:{ 'line-color':'#FFD700','line-width':10,'line-opacity':0.25,'line-blur':4 } });
      map.addLayer({ id:'sv-hover-line', type:'line', source:'sv-hover-hl', paint:{ 'line-color':'#FFD700','line-width':2.8,'line-opacity':0.9 } });

      // 表格点击高亮层
      map.addSource('sv-hl', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-hl-glow', type:'line', source:'sv-hl', paint:{ 'line-color':'#FFD700','line-width':12,'line-opacity':0.3,'line-blur':5 } });
      map.addLayer({ id:'sv-hl-line', type:'line', source:'sv-hl', paint:{ 'line-color':'#FFD700','line-width':3,'line-opacity':1 } });

      // 路径选中层
      map.addSource('sv-sel', { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
      map.addLayer({ id:'sv-sel-glow', type:'line', source:'sv-sel', paint:{ 'line-color':['get','rc'],'line-width':12,'line-opacity':0.2,'line-blur':5 } });
      map.addLayer({ id:'sv-sel-line', type:'line', source:'sv-sel', paint:{ 'line-color':['get','rc'],'line-width':2.8,'line-opacity':0.95 } });
      map.addLayer({ id:'sv-sel-hit', type:'line', source:'sv-sel', paint:{ 'line-color':'transparent','line-width':18,'line-opacity':0 } });

      // 脉冲圈
      ['sv-p1','sv-p2','sv-p3'].forEach(id => {
        map.addSource(id, { type:'geojson', data:{ type:'FeatureCollection', features:[] } });
        map.addLayer({ id:id+'-dot', type:'circle', source:id, paint:{ 'circle-radius':4,'circle-color':['get','color'],'circle-opacity':0.95,'circle-stroke-color':'white','circle-stroke-width':1.5,'circle-stroke-opacity':0.7 } });
        map.addLayer({ id:id+'-ring', type:'circle', source:id, paint:{ 'circle-radius':8,'circle-color':['get','color'],'circle-opacity':0.4,'circle-blur':0.6 } });
      });

      // 成员国/伙伴国/中转节点（使用当前 isZh 值）
      const curIsZh = isZhRef.current;
      map.addSource('bm', { type:'geojson', data:buildMemberFeatures(curIsZh) });
      map.addLayer({ id:'bm-dot', type:'circle', source:'bm', paint:{ 'circle-radius':6,'circle-color':C.gold,'circle-opacity':0.88,'circle-stroke-color':C.goldDark,'circle-stroke-width':1.5 } });
      map.addLayer({ id:'bm-text', type:'symbol', source:'bm', layout:{ 'text-field':['get','name'],'text-size':11,'text-offset':[0,1.4],'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold'] }, paint:{ 'text-color':C.goldLight,'text-halo-color':'#040f1e','text-halo-width':1.5 } });

      map.addSource('bp', { type:'geojson', data:buildPartnerFeatures(curIsZh) });
      map.addLayer({ id:'bp-dot', type:'circle', source:'bp', paint:{ 'circle-radius':4.5,'circle-color':'#60A5FA','circle-opacity':0.8,'circle-stroke-color':'#3B82F6','circle-stroke-width':1 } });
      map.addLayer({ id:'bp-text', type:'symbol', source:'bp', layout:{ 'text-field':['get','name'],'text-size':9,'text-offset':[0,1.3],'text-anchor':'top','text-font':['Open Sans Bold','Arial Unicode MS Bold'] }, paint:{ 'text-color':'#93C5FD','text-halo-color':'#040f1e','text-halo-width':1.2 } });

      map.addSource('transit', { type:'geojson', data:buildTransitFeatures(curIsZh) });
      map.addLayer({ id:'transit-dot', type:'circle', source:'transit', paint:{ 'circle-radius':3.5,'circle-color':'#64748b','circle-opacity':0.7,'circle-stroke-color':'#475569','circle-stroke-width':1 } });
      map.addLayer({ id:'transit-text', type:'symbol', source:'transit', layout:{ 'text-field':['get','name'],'text-size':9,'text-offset':[0,1.2],'text-anchor':'top','text-font':['Open Sans Regular','Arial Unicode MS Regular'] }, paint:{ 'text-color':'#94a3b8','text-halo-color':'#040f1e','text-halo-width':1 } });

      // ── 交互事件 ──────────────────────────────────────────────────────
      map.on('mousemove', 'sv-default-hit', e => {
        if (!e.features?.length) return;
        const cableName: string = e.features[0].properties?.name ?? '';
        const slug: string = e.features[0].properties?.slug ?? '';
        if (!cableName) return;
        map.getCanvas().style.cursor = 'pointer';
        if (hoveredSlugRef.current !== slug) {
          hoveredSlugRef.current = slug;
          const db = bySlug.current.get(slug);
          if (db?.routeGeojson) (map.getSource('sv-hover-hl') as maplibregl.GeoJSONSource).setData({ type:'FeatureCollection', features:[{ type:'Feature', properties:{}, geometry:db.routeGeojson }] });
        }
        setFloatingCard(prev => {
          if (prev?.locked) return prev;
          return buildCard(cableName, e.point.x, e.point.y, false);
        });
      });

      map.on('mouseleave', 'sv-default-hit', () => {
        map.getCanvas().style.cursor = '';
        hoveredSlugRef.current = null;
        (map.getSource('sv-hover-hl') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:[] });
        setFloatingCard(prev => prev?.locked ? prev : null);
      });

      map.on('click', 'sv-default-hit', e => {
        const cableName: string = e.features?.[0]?.properties?.name ?? '';
        if (!cableName) return;
        setFloatingCard(prev => {
          if (prev?.locked && prev.name === cableName) return null;
          return buildCard(cableName, e.point.x, e.point.y, true);
        });
      });

      map.on('click', 'sv-sel-hit', e => {
        const route = routes.find(r => r.id === selectedRouteId);
        if (route && cableApiData && onPopup) {
          const cables = resolveCables(route.cables, bySlug.current, cableApiData.nameIndex);
          const scores = route.riskScores.split(' | ').map(Number);
          onPopup({ x:e.point.x, y:e.point.y, cables:cables.map((c,i)=>({ name:c.name,slug:c.slug,score:scores[i]??route.maxRisk,color:riskColor(scores[i]??route.maxRisk) })), route });
        }
      });
      map.on('mouseenter','sv-sel-hit',()=>{ map.getCanvas().style.cursor='pointer'; });
      map.on('mouseleave','sv-sel-hit',()=>{ map.getCanvas().style.cursor=''; });

      map.on('click', e => {
        const hit = map.queryRenderedFeatures(e.point, { layers:['sv-default-hit','sv-sel-hit','bm-dot','bp-dot'] });
        if (!hit.length) { onRouteSelect(null); onPopup?.(null); setFloatingCard(null); hoveredSlugRef.current=null; }
      });

      mapReadyRef.current = true;
      if (cableApiData) updateDefaultLayer();
      setLoadState('ready');
    });

    map.on('error', () => setLoadState('error'));
    return () => { stopPulse(); map.remove(); mapRef.current=null; mapReadyRef.current=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 路径选中变化 ──────────────────────────────────────────────────────
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
    const selFeats: GeoJSON.Feature[] = cables.map((c,i) => {
      const score = scores[i]??route.maxRisk; if(score>maxScore)maxScore=score;
      if(c.routeGeojson) allCoords=allCoords.concat(flattenCoords(c.routeGeojson));
      return { type:'Feature', properties:{ slug:c.slug, rc:riskColor(score) }, geometry:c.routeGeojson??{ type:'LineString', coordinates:[] } };
    });
    (map.getSource('sv-sel') as maplibregl.GeoJSONSource)?.setData({ type:'FeatureCollection', features:selFeats });
    if (map.getLayer('sv-default-line')) map.setPaintProperty('sv-default-line','line-opacity',0.15);
    if (map.getLayer('sv-default-glow')) map.setPaintProperty('sv-default-glow','line-opacity',0.02);
    if (allCoords.length) { const bbox=computeBbox(allCoords); if(bbox) map.fitBounds(bbox,{ padding:90,duration:900,maxZoom:7 }); }
    const pulsePoints: [number,number][] = route.nodes
      .map(name => Object.entries(TRANSIT_COORDS).find(([en]) => TRANSIT_ZH[en]===name || en===name)?.[1] ?? (BRICS_COUNTRY_META[name]?.center as [number,number]|undefined))
      .filter((p): p is [number,number] => !!p);
    const pts = pulsePoints.length>=2 ? pulsePoints : allCoords.filter((_,i)=>i%Math.max(1,Math.floor(allCoords.length/5))===0).slice(0,6);
    startPulse(pts, riskColor(maxScore));
  }, [selectedRouteId, routes, cableApiData, stopPulse, startPulse]);

  const W = containerRef.current?.clientWidth ?? 800;
  const H = containerRef.current?.clientHeight ?? 540;

  return (
    <div style={{ position:'relative', borderRadius:14, overflow:'hidden', height }}>
      <div ref={containerRef} style={{ width:'100%', height:'100%' }} />

      {loadState === 'loading' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:28, height:28, border:'2px solid rgba(212,175,55,.2)', borderTop:`2px solid ${C.gold}`, borderRadius:'50%', margin:'0 auto 10px', animation:'sv-spin .8s linear infinite' }} />
            <span style={{ color:C.goldLight, fontSize:13 }}>{isZh ? '正在加载底图…' : 'Loading map…'}</span>
          </div>
        </div>
      )}
      {loadState === 'error' && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(4,15,30,.88)', borderRadius:14, zIndex:10 }}>
          <span style={{ color:'#f87171', fontSize:13 }}>{isZh ? '底图加载失败，请刷新重试' : 'Map failed to load, please refresh'}</span>
        </div>
      )}

      {floatingCard && (
        <FloatingCableCard
          card={floatingCard}
          containerW={W}
          onClose={() => setFloatingCard(null)}
          routes={routes}
          isZh={isZh}
        />
      )}

      {loadState === 'ready' && (
        <div style={{ position:'absolute', bottom:12, right:12, background:'rgba(10,22,40,.9)', backdropFilter:'blur(8px)', borderRadius:8, padding:'10px 14px', border:`1px solid ${C.gold}12`, zIndex:5, display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { color:C.gold,    dot:true,  labelZh:'金砖成员国',             labelEn:'BRICS Members' },
            { color:'#60A5FA', dot:true,  labelZh:'金砖伙伴国',             labelEn:'BRICS Partners' },
            { color:'#64748b', dot:true,  labelZh:'中转节点',               labelEn:'Transit nodes' },
            { color:C.gold,    dot:false, labelZh:'主权保留海缆（悬浮查看）', labelEn:'Sovereign cables (hover)' },
          ].map(({ color, dot, labelZh, labelEn }) => (
            <div key={labelZh} style={{ display:'flex', alignItems:'center', gap:7, fontSize:11, color:'rgba(255,255,255,.5)' }}>
              {dot ? <span style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 6px ${color}70`, flexShrink:0 }} />
                   : <span style={{ width:18, height:3, background:color, borderRadius:1, flexShrink:0 }} />}
              {isZh ? labelZh : labelEn}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes sv-spin   { to { transform: rotate(360deg); } }
        @keyframes sv-card-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .maplibregl-ctrl-group { background: rgba(10,22,40,.9) !important; border: 1px solid ${C.gold}15 !important; border-radius: 8px !important; }
        .maplibregl-ctrl-group button { background: transparent !important; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(0.7); }
        .maplibregl-ctrl-group button:hover { background: rgba(212,175,55,.1) !important; }
      `}</style>
    </div>
  );
}

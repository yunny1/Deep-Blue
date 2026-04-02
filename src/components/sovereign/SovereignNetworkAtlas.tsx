'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx  v7
// 新增：完整 i18n 支持（中英双语），新闻中文翻译 + 可点击链接

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import SovereignNetworkMap, { type CablePopupInfo } from './SovereignNetworkMap';
import { useBRICS } from '@/lib/brics-i18n';
import {
  SOVEREIGN_ROUTES, CANONICAL_CABLE_NAMES,
  riskColor, safetyCfg,
  type SovereignRoute, type SafetyLevel,
} from '@/lib/sovereign-routes';
import { ROUTE_SEGMENT_MAP, type RouteSegment } from '@/lib/route-segment-map';

// ── 设计常量 ────────────────────────────────────────────────────────────────
const GOLD = '#D4AF37'; const GOLD_LIGHT = '#F0E6C8'; const GOLD_DIM = '#D4AF3722';
const NAVY = '#0A1628'; const CARD_BG = 'rgba(26,45,74,.5)';
const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

// ── i18n 文案 ────────────────────────────────────────────────────────────────
const T = {
  zh: {
    back: '← 金砖仪表盘',
    badge: 'Strategic Intelligence · 战略情报',
    title: '自主权网络图谱',
    desc: '主权威胁框架下的金砖可用通信路径 · 排除核心西方体系 · 共 {n} 条保留海缆 · AI 语义去重',
    stat1l: '路径总数', stat1s: '覆盖所有国家对',
    stat2l: '优先可用', stat2s: '低暴露 + 较优备选',
    stat3l: '中等暴露', stat3s: '需关注中转节点',
    stat4l: '高暴露路径', stat4s: '含西方核心中转',
    filterTitle: '筛选条件',
    filterSafety: '安全等级', filterFrom: '起点国家', filterTo: '到达国家',
    filterAll: '全部', filterLow: '低暴露优先', filterOpt: '较优备选',
    filterMid: '中等暴露', filterHigh: '高暴露路径',
    filterClear: '✕ 清除',
    noRoute: '无匹配路径',
    riskLegend: '风险色阶',
    riskLabels: ['低风险','中低','中等','较高','极高'],
    uploadBtn: '↑ 上传路径 .xlsx（AI 去重）',
    uploadingAI: '⏳ 归一化中…',
    hlCancel: '点击地图空白处取消',
    hlPrefix: '正在高亮：',
    detailTitle: '路径主权详情',
    segLabel: '第',
    segUnit: '段',
    segAlt: '条备选',
    segBest: '最优',
    segDetail: '各段海缆明细（点击查看详情）',
    tableTitle: '主权可用海缆汇总',
    tableSubtitle: '当前范围内所有保留海缆',
    tableHint: '点击任意行：查看详情 + 地图高亮定位',
    tableCol1: '海缆名称', tableCol2: '风险评分', tableCol3: '出现路径数', tableCol4: '评级',
    tableMapHint: '↗ 地图定位',
    tableRiskLabel: (s: number): string => s<=20?'低风险':s<=40?'中低':s<=60?'中等':s<=75?'较高':'极高',
    modalTitle: '海缆详情',
    modalClose: '关闭',
    modalStat1: '风险评分', modalStat2: '出现路径数', modalStat3: '登陆站数量',
    modalCountry: '登陆站覆盖国家/地区',
    modalStations: '所有登陆站',
    modalNoStation: '登陆站数据加载中，或该缆暂未收录在数据库',
    routeCount: (n: number) => `出现在 ${n} 条主权路径中`,
    routeMaxRisk: '最大风险', routeAvgRisk: '平均风险', routeSegs: '保留段数',
    footerSrc: '数据来源：BRICS Transit Analysis · TeleGeography · Submarine Networks',
    footerNote: (n: number) => `保留海缆共 ${n} 条 · 路径数据更新请前往管理后台`,
    normalizing: (n: number) => `正在调用 AI 归一化 ${n} 个海缆名称…`,
    normalizeOk: (raw: number, std: number, fix: number) =>
      `✓ AI 去重完成：${raw} 个名称归一化为 ${std} 条标准海缆${fix>0?`（修正了 ${fix} 个变体）`:'（名称均已标准）'}`,
    normalizeErr: '⚠ AI 去重失败，将使用原始名称',
    normalizeRedis: (msg: string) => ` · ${msg}`,
  },
  en: {
    back: '← BRICS Dashboard',
    badge: 'Strategic Intelligence',
    title: 'Sovereign Network Atlas',
    desc: 'BRICS communication paths under sovereignty threat framework · Excluding Western-core system · {n} retained cables · AI dedup',
    stat1l: 'Total Routes', stat1s: 'All country pairs',
    stat2l: 'Low Exposure', stat2s: 'Priority + Alternative',
    stat3l: 'Medium Exposure', stat3s: 'Monitor transit nodes',
    stat4l: 'High Exposure', stat4s: 'Contains Western transit',
    filterTitle: 'Filters',
    filterSafety: 'Safety Level', filterFrom: 'Origin', filterTo: 'Destination',
    filterAll: 'All', filterLow: 'Low Exposure', filterOpt: 'Good Alternative',
    filterMid: 'Medium Exposure', filterHigh: 'High Exposure',
    filterClear: '✕ Clear',
    noRoute: 'No matching routes',
    riskLegend: 'Risk Scale',
    riskLabels: ['Low','Med-Low','Medium','High','Critical'],
    uploadBtn: '↑ Upload .xlsx (AI dedup)',
    uploadingAI: '⏳ Normalizing…',
    hlCancel: 'Click blank area to cancel',
    hlPrefix: 'Highlighting: ',
    detailTitle: 'Route Sovereignty Detail',
    segLabel: 'Seg',
    segUnit: '',
    segAlt: 'alternatives',
    segBest: 'Best',
    segDetail: 'Cable details per segment (click to inspect)',
    tableTitle: 'Sovereign Cable Summary',
    tableSubtitle: 'All retained cables in current scope',
    tableHint: 'Click any row: details + map highlight',
    tableCol1: 'Cable Name', tableCol2: 'Risk Score', tableCol3: 'Routes', tableCol4: 'Rating',
    tableMapHint: '↗ Map',
    tableRiskLabel: (s: number): string => s<=20?'Low':s<=40?'Med-Low':s<=60?'Medium':s<=75?'High':'Critical',
    modalTitle: 'Cable Details',
    modalClose: 'Close',
    modalStat1: 'Risk Score', modalStat2: 'Routes', modalStat3: 'Stations',
    modalCountry: 'Landing countries',
    modalStations: 'All landing stations',
    modalNoStation: 'Station data loading or cable not in database',
    routeCount: (n: number) => `Appears in ${n} sovereign routes`,
    routeMaxRisk: 'Max Risk', routeAvgRisk: 'Avg Risk', routeSegs: 'Segments',
    footerSrc: 'Sources: BRICS Transit Analysis · TeleGeography · Submarine Networks',
    footerNote: (n: number) => `${n} retained cables · Update routes in admin panel`,
    normalizing: (n: number) => `AI normalizing ${n} cable names…`,
    normalizeOk: (raw: number, std: number, fix: number) =>
      `✓ AI dedup: ${raw} names → ${std} standard cables${fix>0?` (fixed ${fix} variants)`:''}`,
    normalizeErr: '⚠ AI dedup failed, using original names',
    normalizeRedis: (msg: string) => ` · ${msg}`,
  },
};

// ── 类型 ────────────────────────────────────────────────────────────────────
interface CableDbRecord {
  slug: string;
  name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
  vendor?: string | null;
  owners?: string[];
  lengthKm?: number | null;
  capacityTbps?: number | null;
  fiberPairs?: number | null;
  rfsDate?: string | null;
}
interface CableApiResponse { cables: CableDbRecord[]; nameIndex: Record<string,string>; }
interface CableModalData {
  name: string; slug: string; score: number; routeCount: number;
  vendorStr?: string; ownerStrs?: string[];
  stations: { name: string; country: string | null; city: string | null }[];
}

// ── 安全提取 vendor/owners 为字符串 ─────────────────────────────────────────
function toStr(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.name === 'string') return o.name;
    return JSON.stringify(v);
  }
  return String(v);
}

// ── 小组件 ──────────────────────────────────────────────────────────────────
function Badge({ safety, isZh }: { safety: SafetyLevel; isZh: boolean }) {
  const { bg, text, border, label } = safetyCfg(safety);
  // safetyCfg 返回中文 label，英文模式时做映射
  const enLabel: Record<string, string> = {
    '低风险': 'Low Risk', '较优备选': 'Alternative', '中等风险': 'Medium', '高暴露': 'High Exposure',
  };
  return (
    <span style={{ background: bg, color: text, border: `1px solid ${border}`, fontSize: 10,
      padding: '1px 7px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {isZh ? label : (enLabel[label] ?? label)}
    </span>
  );
}

function Dot({ score, size=6 }: { score: number; size?: number }) {
  const c = riskColor(score);
  return <span style={{ width: size, height: size, borderRadius: '50%', background: c,
    display: 'inline-block', flexShrink: 0, boxShadow: `0 0 ${size}px ${c}60` }} />;
}

function AnimNum({ n, color=GOLD_LIGHT }: { n: number; color?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => { const p = Math.min((Date.now()-t0)/1200,1); setV(Math.round(n*(1-Math.pow(1-p,3)))); if(p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [n]);
  return <span style={{ color }}>{v.toLocaleString()}</span>;
}

// ── 主组件 ──────────────────────────────────────────────────────────────────
export default function SovereignNetworkAtlas() {
  // 从 localStorage 读取当前语言，并提供切换函数
// 之所以不直接用 useBRICS() 的 setIsZh，是因为我们需要同时广播事件给地图组件
  const [isZh, setIsZhState] = useState<boolean>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('deep-blue-locale') ?? 'zh') === 'zh' : true
  );
  const toggleLang = useCallback(() => {
    setIsZhState(prev => {
      const next = !prev;
      localStorage.setItem('deep-blue-locale', next ? 'zh' : 'en');
      // 广播给 SovereignNetworkMap 和其他监听语言切换的组件
      window.dispatchEvent(new Event('deep-blue-locale-changed'));
      return next;
    });
  }, []);
  const t = isZh ? T.zh : T.en;

  const [routes,       setRoutes]       = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');
  const [normalizing,  setNormalizing]  = useState(false);
  const [normalizeMsg, setNormalizeMsg] = useState('');
  const [cableApi,     setCableApi]     = useState<CableApiResponse | null>(null);
  const cableByName = useRef<Map<string, CableDbRecord>>(new Map());
  const [cableModal,   setCableModal]   = useState<CableModalData | null>(null);
  const [routePopup,   setRoutePopup]   = useState<CablePopupInfo | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [highlightedCable, setHighlightedCable] = useState<string | null>(null);

  const selectedRoute = selectedId ? routes.find(r => r.id === selectedId) ?? null : null;

  // 动态路径数据（Redis 优先）
  useEffect(() => {
    fetch('/api/sovereign-network/routes')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.routes?.length) setRoutes(data.routes); })
      .catch(console.warn);
  }, []);

  // 海缆 DB 数据
  useEffect(() => {
    fetch('/api/sovereign-network')
      .then(r => r.ok ? r.json() : null)
      .then((data: CableApiResponse | null) => {
        if (!data) return;
        setCableApi(data);
        const map = new Map<string, CableDbRecord>();
        data.cables.forEach(c => {
          map.set(c.name.toLowerCase(), c);
          Array.from(c.name.matchAll(/\(([^)]+)\)/g)).forEach(m => map.set(m[1].toLowerCase(), c));
        });
        cableByName.current = map;
      })
      .catch(console.warn);
  }, []);

  const filtered = useMemo(() => routes.filter(r => {
    if (filterSafety && r.safety !== filterSafety) return false;
    if (filterFrom   && r.from   !== filterFrom)   return false;
    if (filterTo     && r.to     !== filterTo)     return false;
    return true;
  }), [routes, filterSafety, filterFrom, filterTo]);

  const allUniqueCables = useMemo(() => {
    const seen = new Map<string, { name: string; score: number; routeCount: number }>();
    for (const r of filtered) {
    const cables = (r.cables ?? '').split(' | ').filter(Boolean);
    const scores = (r.riskScores ?? '').split(' | ').map(Number);
      cables.forEach((cable, i) => {
        const key = cable.trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, { name: cable.trim(), score: scores[i] ?? r.maxRisk, routeCount: 1 });
        else seen.get(key)!.routeCount++;
      });
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }, [filtered]);

  const fromOpts = useMemo(() => [...new Set(routes.map(r => r.from))].sort(), [routes]);
  const toOpts   = useMemo(() => {
    const base = filterFrom ? routes.filter(r => r.from === filterFrom) : routes;
    return [...new Set(base.map(r => r.to))].sort();
  }, [routes, filterFrom]);

  // xlsx 上传 + AI 去重
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表'); return; }
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsed: SovereignRoute[] = raw.map(r => {
      const path = String(r['路径节点序列'] ?? '');
      return { id: String(r['路径ID']??''), from: String(r['甲方']??''), to: String(r['乙方']??''),
        path, nodes: path.split(' → '), cables: String(r['各段保留海缆']??''),
        riskScores: String(r['各段风险评分']??''), maxRisk: Number(r['路径最大单段风险']??0),
        avgRisk: Number(r['路径平均单段风险']??0), segments: Number(r['保留段数']??0),
        safety: String(r['是否安全']??'') as SafetyLevel };
    });
    const rawNames = new Set<string>();
    parsed.forEach(r => (r.cables ?? '').split(' | ').forEach(c => rawNames.add(c.trim())));
    setNormalizing(true); setNormalizeMsg(t.normalizing(rawNames.size));
    let nameMapping: Record<string, string> = {};
    try {
      const res = await fetch('/api/sovereign/normalize-cables', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: [...rawNames] }) });
      const nd = await res.json(); nameMapping = nd.mapping ?? {};
      const fix = Object.entries(nameMapping).filter(([k, v]) => k !== v).length;
      setNormalizeMsg(t.normalizeOk(rawNames.size, new Set(Object.values(nameMapping)).size, fix));
    } catch { setNormalizeMsg(t.normalizeErr); }
    const normalizedRoutes = parsed.map(r => ({
      ...r, cables: (r.cables ?? '').split(' | ').map(c => nameMapping[c.trim()] ?? c.trim()).join(' | '),
    }));
    try {
      const saveRes = await fetch('/api/admin/sovereign-routes-upload', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes: normalizedRoutes }) });
      if (saveRes.ok) { const d = await saveRes.json(); setNormalizeMsg(prev => prev + t.normalizeRedis(d.message)); }
    } catch { /* 静默 */ }
    setNormalizing(false);
    setRoutes(normalizedRoutes);
    setSelectedId(null); setFilterSafety(''); setFilterFrom(''); setFilterTo(''); setHighlightedCable(null);
  };

  const openCableModal = useCallback((cableName: string, score: number, routeCount: number) => {
    const key = cableName.toLowerCase();
    const abbrs = Array.from(cableName.matchAll(/\(([^)]+)\)/g)).map(m => m[1].toLowerCase());
    const db = cableByName.current.get(key)
      ?? abbrs.reduce<CableDbRecord | undefined>((f, a) => f ?? cableByName.current.get(a), undefined);
    setCableModal({
      name: cableName, slug: db?.slug ?? '', score, routeCount,
      vendorStr: db?.vendor ? toStr(db.vendor) : undefined,
      ownerStrs: db?.owners ? (db.owners as unknown[]).map(toStr).filter(Boolean) : undefined,
      stations: db?.stations ?? [],
    });
  }, []);

  const handleTableCableClick = useCallback((name: string, score: number, routeCount: number) => {
    openCableModal(name, score, routeCount);
    setHighlightedCable(name);
    mapContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [openCableModal]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id); if (!id) setRoutePopup(null); setHighlightedCable(null);
  }, []);
  const handlePopup = useCallback((info: CablePopupInfo | null) => setRoutePopup(info), []);

  const totalLow  = routes.filter(r => r.safety==='相对低暴露优先路径'||r.safety==='较优备选路径').length;
  const totalMid  = routes.filter(r => r.safety==='中等暴露路径').length;
  const totalHigh = routes.filter(r => r.safety==='高暴露路径').length;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
    .sna{font-family:'DM Sans',system-ui,sans-serif}
    .sna h1,.sna h2{font-family:'Playfair Display',serif}
    @keyframes sna-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    .sna-up{animation:sna-up .5s ease both}
    .sna-card{background:${CARD_BG};border:1px solid ${GOLD_DIM};border-radius:14px;backdrop-filter:blur(12px);transition:all .2s}
    .sna-card:hover{border-color:${GOLD}35;box-shadow:0 0 20px ${GOLD}0c}
    .sna-route{background:transparent;border:1px solid rgba(255,255,255,.06);border-radius:9px;cursor:pointer;margin-bottom:4px;padding:9px 11px;text-align:left;transition:all .13s;width:100%}
    .sna-route:hover{background:rgba(212,175,55,.06);border-color:${GOLD}22}
    .sna-route.sel{background:rgba(212,175,55,.1);border-color:${GOLD}48}
    .sna-sel{background:rgba(10,22,40,.85);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:rgba(255,255,255,.7);font-size:12px;outline:none;padding:7px 9px;transition:border-color .15s;width:100%}
    .sna-sel:focus{border-color:${GOLD}55}
    .sna ::-webkit-scrollbar{width:4px}.sna ::-webkit-scrollbar-track{background:transparent}
    .sna ::-webkit-scrollbar-thumb{background:${GOLD}28;border-radius:2px}
  `;

  return (
    <div className="sna" style={{ minHeight:'100vh', background:NAVY, color:'#E8E0D0' }}>
      <style>{CSS}</style>
      <div style={{ display:'flex', height:4, position:'sticky', top:0, zIndex:100 }}>
        {FLAGS.map(c => <div key={c} style={{ flex:1, background:c }} />)}
      </div>
      <div style={{ maxWidth:1400, margin:'0 auto', padding:'32px 32px 48px' }}>

        {/* Hero */}
        <div className="sna-up" style={{ marginBottom:28 }}>
         

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* 语言切换按钮 */}
          <button
            onClick={toggleLang}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
              background: 'rgba(212,175,55,.1)', border: '1px solid rgba(212,175,55,.3)',
              color: '#D4AF37', fontSize: 12, fontWeight: 600,
              fontFamily: "'DM Sans',system-ui,sans-serif",
              transition: 'background .15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,.18)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(212,175,55,.1)'; }}
          >
            {isZh ? '🌐 EN' : '🌐 中文'}
          </button>
          {/* 原来的 badge */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px',
            background:`${GOLD}08`, border:`1px solid ${GOLD}1e`, borderRadius:20 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:GOLD, boxShadow:`0 0 8px ${GOLD}80` }}/>
            <span style={{ fontSize:11, color:`${GOLD}BB`, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600 }}>{t.badge}</span>
          </div>
        </div>



          <h1 style={{ fontSize:36, fontWeight:800, color:GOLD_LIGHT, margin:'0 0 8px', lineHeight:1.1 }}>{t.title}</h1>
          <p style={{ fontSize:14, color:'rgba(255,255,255,.4)', margin:0, maxWidth:640, lineHeight:1.75 }}>
            {t.desc.replace('{n}', String(CANONICAL_CABLE_NAMES.length))}
          </p>
        </div>

        {/* AI 去重提示 */}
        {normalizeMsg && (
          <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8,
            background: normalizeMsg.startsWith('✓') ? 'rgba(16,112,86,.15)' : normalizeMsg.startsWith('⚠') ? 'rgba(120,90,10,.15)' : 'rgba(26,45,74,.6)',
            border:`1px solid ${normalizeMsg.startsWith('✓')?'rgba(74,222,128,.2)':normalizeMsg.startsWith('⚠')?'rgba(251,191,36,.2)':GOLD_DIM}`,
            fontSize:12, color: normalizeMsg.startsWith('✓')?'#4ade80':normalizeMsg.startsWith('⚠')?'#fbbf24':'rgba(255,255,255,.6)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>{normalizing ? '⏳ ' : ''}{normalizeMsg}</span>
            <button onClick={() => setNormalizeMsg('')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.3)', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="sna-up" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14, marginBottom:28, animationDelay:'.06s' }}>
          {[
            { l:t.stat1l, v:routes.length,  c:GOLD_LIGHT, s:t.stat1s },
            { l:t.stat2l, v:totalLow,        c:'#22C55E',  s:t.stat2s },
            { l:t.stat3l, v:totalMid,        c:'#EAB308',  s:t.stat3s },
            { l:t.stat4l, v:totalHigh,       c:'#EF4444',  s:t.stat4s },
          ].map(({ l, v, c, s }) => (
            <div key={l} className="sna-card" style={{ padding:20, display:'flex', flexDirection:'column', gap:5 }}>
              <span style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80` }}>{l}</span>
              <span style={{ fontSize:32, fontWeight:700, lineHeight:1.1, fontFeatureSettings:'"tnum"' }}><AnimNum n={v} color={c}/></span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,.3)' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* 主体 */}
        <div className="sna-up" style={{ display:'flex', gap:16, animationDelay:'.12s', alignItems:'flex-start' }}>

          {/* 侧边栏 */}
          <div style={{ width:264, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:12 }}>{t.filterTitle}</div>
              {[
                { label:t.filterSafety, val:filterSafety, set:setFilterSafety, opts:[
                  {v:'相对低暴露优先路径',l:t.filterLow},{v:'较优备选路径',l:t.filterOpt},
                  {v:'中等暴露路径',l:t.filterMid},{v:'高暴露路径',l:t.filterHigh}]},
                { label:t.filterFrom, val:filterFrom, set:(v:string)=>{setFilterFrom(v);setFilterTo('');}, opts:fromOpts.map(c=>({v:c,l:c})) },
                { label:t.filterTo,   val:filterTo,   set:setFilterTo, opts:toOpts.map(c=>({v:c,l:c})) },
              ].map(({ label, val, set, opts }) => (
                <div key={label} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>{label}</div>
                  <select value={val} onChange={e => set(e.target.value)} className="sna-sel">
                    <option value="">{t.filterAll}</option>
                    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              {(filterSafety || filterFrom || filterTo) && (
                <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:`${GOLD}BB` }}>
                  <span>{filtered.length}/{routes.length}</span>
                  <button onClick={() => { setFilterSafety(''); setFilterFrom(''); setFilterTo(''); setSelectedId(null); setHighlightedCable(null); }}
                    style={{ background:'none', border:'none', color:`${GOLD}80`, cursor:'pointer', fontSize:13 }}>{t.filterClear}</button>
                </div>
              )}
            </div>

            <div style={{ overflowY:'auto', maxHeight:420 }}>
              {filtered.length === 0
                ? <div className="sna-card" style={{ padding:20, textAlign:'center', fontSize:13, color:'rgba(255,255,255,.3)' }}>{t.noRoute}</div>
                : filtered.map(r => {
                  const isSel = selectedId === r.id;
                  return (
                    <button key={r.id} className={`sna-route${isSel?' sel':''}`} onClick={() => handleSelect(isSel?null:r.id)}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <Dot score={r.maxRisk}/>
                        <span style={{ fontSize:12, fontWeight:600, color:isSel?GOLD_LIGHT:'#CBD5E1', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.from} → {r.to}
                        </span>
                        <Badge safety={r.safety} isZh={isZh}/>
                      </div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,.22)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{r.path}</div>
                    </button>
                  );
                })}
            </div>

            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:10 }}>{t.riskLegend}</div>
              {[['#0F6E56','0–20'],['#639922','21–40'],['#BA7517','41–60'],['#D85A30','61–75'],['#A32D2D','76+']].map(([c,r],i) => (
                <div key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ width:22, height:3, background:c, borderRadius:2, boxShadow:`0 0 4px ${c}55`, flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.45)', minWidth:32 }}>{r}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{t.riskLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 地图 + 详情 */}
          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>
          

            {highlightedCable && !selectedRoute && (
              <div style={{ padding:'8px 14px', borderRadius:8, background:'rgba(255,215,0,.08)', border:'1px solid rgba(255,215,0,.3)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:'#FFD700' }}>
                  {t.hlPrefix}{highlightedCable}
                  <span style={{ color:'rgba(255,255,255,.35)', marginLeft:8, fontSize:11 }}>{t.hlCancel}</span>
                </span>
                <button onClick={() => setHighlightedCable(null)} style={{ background:'none', border:'none', color:'#FFD700', cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
            )}

            {selectedRoute && (
              <div style={{ padding:'8px 14px', borderRadius:8, background:`${GOLD}0e`, border:`1px solid ${GOLD}28`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:GOLD }}>
                  {selectedRoute.from} → {selectedRoute.to}
                  <span style={{ color:'rgba(255,255,255,.3)', marginLeft:10 }}>{t.routeMaxRisk}</span>
                  <span style={{ color:riskColor(selectedRoute.maxRisk), fontWeight:700, marginLeft:4 }}>{selectedRoute.maxRisk}</span>
                </span>
                <button onClick={() => handleSelect(null)} style={{ background:'none', border:'none', color:GOLD, cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
            )}

            <div ref={mapContainerRef}>
              <SovereignNetworkMap
                height="520px"
                routes={routes}
                filteredRoutes={filtered}
                selectedRouteId={selectedId}
                cableApiData={cableApi}
                highlightedCableName={highlightedCable}
                onRouteSelect={handleSelect}
                onPopup={handlePopup}
                isZh={isZh}
              />
            </div>

            {selectedRoute
              ? <SelectedRouteDetail route={selectedRoute} isZh={isZh} t={t} onCableClick={openCableModal} allCables={allUniqueCables}/>
              : <AllCablesTable cables={allUniqueCables} total={routes.length} filtered={filtered.length} isZh={isZh} t={t} onCableClick={handleTableCableClick}/>}
          </div>
        </div>

        <footer style={{ marginTop:40, paddingTop:18, borderTop:`1px solid ${GOLD}0e` }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,.18)', marginBottom:8 }}>
            <span>{t.footerSrc}</span>
            <span>{t.footerNote(CANONICAL_CABLE_NAMES.length)}</span>
          </div>
        </footer>
      </div>

      {routePopup && <RoutePopup info={routePopup} onClose={() => setRoutePopup(null)} isZh={isZh}/>}
      {cableModal && <CableDetailModal data={cableModal} onClose={() => setCableModal(null)} isZh={isZh} t={t}/>}
    </div>
  );
}

// ── SelectedRouteDetail ──────────────────────────────────────────────────────
function SelectedRouteDetail({ route, isZh, t, onCableClick, allCables }: {
  route: SovereignRoute; isZh: boolean; t: typeof T.zh;
  onCableClick: (n: string, s: number, r: number) => void;
  allCables: { name: string; score: number; routeCount: number }[];
}) {
  const { bg, text, label } = safetyCfg(route.safety);
  const enLabel: Record<string,string> = { '低风险':'Low Risk','较优备选':'Alternative','中等风险':'Medium','高暴露':'High Exposure' };
  const segData: RouteSegment[] | undefined = ROUTE_SEGMENT_MAP[route.id];
  const getRc = (n: string) => allCables.find(c => c.name.toLowerCase()===n.toLowerCase())?.routeCount ?? 1;
  return (
    <div style={{ background:CARD_BG, border:`1px solid ${GOLD_DIM}`, borderRadius:14, backdropFilter:'blur(12px)', padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:4 }}>{t.detailTitle}</div>
          <h2 style={{ fontSize:20, fontWeight:700, color:GOLD_LIGHT, margin:'0 0 4px', fontFamily:"'Playfair Display',serif" }}>{route.from} → {route.to}</h2>
          <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:0, fontFamily:'monospace' }}>{route.path}</p>
        </div>
        <span style={{ background:bg, color:text, border:'1px solid rgba(255,255,255,.08)', fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, flexShrink:0 }}>
          {isZh ? label : (enLabel[label] ?? label)}
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:20 }}>
        {[
          { l:t.routeMaxRisk, v:route.maxRisk, c:riskColor(route.maxRisk) },
          { l:t.routeAvgRisk, v:route.avgRisk, c:riskColor(route.avgRisk) },
          { l:t.routeSegs,    v:route.segments, c:GOLD_LIGHT },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase' }}>{l}</div>
            <div style={{ fontSize:28, fontWeight:700, color:c, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:12 }}>{t.segDetail}</div>
      {segData ? (
        <div>
          {segData.map((seg, si) => {
            const isLast = si === segData.length - 1;
            const bestScore = seg.cables.find(c => c.isBest)?.score ?? seg.cables[0]?.score ?? 0;
            const segColor = riskColor(bestScore);
            const hasMulti = seg.cables.length > 1;
            return (
              <div key={seg.seg} style={{ display:'flex', alignItems:'stretch', gap:0 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:32, flexShrink:0 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:segColor, boxShadow:`0 0 10px ${segColor}80`, marginTop:16, flexShrink:0, border:'2px solid rgba(255,255,255,.15)' }}/>
                  {!isLast && <div style={{ flex:1, width:2, marginTop:4, background:`linear-gradient(${segColor}60,rgba(255,255,255,.05))`, borderRadius:1 }}/>}
                </div>
                <div style={{ flex:1, paddingBottom:isLast?0:12, paddingLeft:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, marginTop:10 }}>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.35)' }}>{t.segLabel} {seg.seg} {t.segUnit}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.7)' }}>{seg.from} → {seg.to}</span>
                    {hasMulti && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:10, background:'rgba(212,175,55,.12)', color:`${GOLD}BB`, border:`1px solid ${GOLD}25` }}>{seg.cables.length} {t.segAlt}</span>}
                  </div>
                  {hasMulti ? (
                    <div style={{ position:'relative', paddingLeft:16 }}>
                      <div style={{ position:'absolute', left:0, top:4, bottom:4, width:2, background:`${segColor}30`, borderRadius:1 }}/>
                      {seg.cables.map((cable, ci) => (
                        <div key={ci} style={{ position:'relative', marginBottom:ci<seg.cables.length-1?6:0 }}>
                          <div style={{ position:'absolute', left:-16, top:'50%', width:14, height:2, background:`${riskColor(cable.score)}60` }}/>
                          <button onClick={() => onCableClick(cable.name, cable.score, getRc(cable.name))}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'7px 12px', cursor:'pointer', textAlign:'left',
                              background:cable.isBest?`${riskColor(cable.score)}12`:'rgba(255,255,255,.03)',
                              border:`1px solid ${cable.isBest?riskColor(cable.score)+'30':'rgba(255,255,255,.06)'}`, borderRadius:7, transition:'border-color .15s' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                              {cable.isBest && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:`${riskColor(cable.score)}20`, color:riskColor(cable.score), border:`1px solid ${riskColor(cable.score)}40`, fontWeight:700, flexShrink:0 }}>{t.segBest}</span>}
                              <span style={{ fontSize:12, color:cable.isBest?'rgba(255,255,255,.85)':'rgba(255,255,255,.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cable.name}</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:10 }}>
                              <div style={{ width:44, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}><div style={{ width:`${cable.score}%`, height:'100%', background:riskColor(cable.score), borderRadius:2 }}/></div>
                              <span style={{ fontSize:12, fontWeight:700, color:riskColor(cable.score), minWidth:22, textAlign:'right', fontFeatureSettings:'"tnum"' }}>{cable.score}</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    seg.cables.map((cable, ci) => (
                      <button key={ci} onClick={() => onCableClick(cable.name, cable.score, getRc(cable.name))}
                        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'7px 12px', cursor:'pointer', textAlign:'left',
                          background:`${riskColor(cable.score)}10`, border:`1px solid ${riskColor(cable.score)}28`, borderRadius:7, transition:'border-color .15s' }}>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,.82)' }}>{cable.name}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:44, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}><div style={{ width:`${cable.score}%`, height:'100%', background:riskColor(cable.score), borderRadius:2 }}/></div>
                          <span style={{ fontSize:13, fontWeight:700, color:riskColor(cable.score), fontFeatureSettings:'"tnum"' }}>{cable.score}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {（route.cables ？？ ''）.split(' | ').map((cable, i) => {
            const scores = route.riskScores.split(' | ').map(Number);
            const score = scores[i] ?? route.maxRisk;
            return (
              <button key={i} onClick={() => onCableClick(cable.trim(), score, getRc(cable.trim()))}
                style={{ display:'inline-flex', alignItems:'center', gap:6, background:`${riskColor(score)}10`, border:`1px solid ${riskColor(score)}28`, borderRadius:6, padding:'4px 10px', fontSize:11, color:'rgba(255,255,255,.75)', fontFamily:'monospace', cursor:'pointer' }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:riskColor(score), flexShrink:0 }}/>{cable.trim()}<span style={{ color:riskColor(score), fontWeight:700, fontSize:10 }}>{score}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AllCablesTable ────────────────────────────────────────────────────────────
function AllCablesTable({ cables, total, filtered, isZh, t, onCableClick }: {
  cables: { name: string; score: number; routeCount: number }[];
  total: number; filtered: number; isZh: boolean; t: typeof T.zh;
  onCableClick: (n: string, s: number, r: number) => void;
}) {
  return (
    <div style={{ background:CARD_BG, border:`1px solid ${GOLD_DIM}`, borderRadius:14, backdropFilter:'blur(12px)', padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:4 }}>{t.tableTitle}</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:GOLD_LIGHT, margin:'0 0 2px', fontFamily:"'Playfair Display',serif" }}>{t.tableSubtitle}</h2>
          <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:0 }}>{t.tableHint}</p>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, color:GOLD_LIGHT }}>{cables.length}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>{filtered}/{total}</div>
        </div>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid rgba(255,255,255,.08)' }}>
            {[t.tableCol1, t.tableCol2, t.tableCol3, t.tableCol4].map(h => (
              <th key={h} style={{ padding:'8px 10px', textAlign:h===t.tableCol1?'left':'center', fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}70` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cables.map((cable, i) => {
            const color = riskColor(cable.score);
            return (
              <tr key={i} onClick={() => onCableClick(cable.name, cable.score, cable.routeCount)}
                style={{ borderBottom:'1px solid rgba(255,255,255,.04)', cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background='rgba(212,175,55,.06)'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background='transparent'}>
                <td style={{ padding:'10px', color:'rgba(255,255,255,.85)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background:color, boxShadow:`0 0 5px ${color}`, flexShrink:0 }}/>
                    {cable.name}
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{t.tableMapHint}</span>
                  </div>
                </td>
                <td style={{ padding:'10px', textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:700, color }}>{cable.score}</span>
                    <div style={{ width:48, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ width:`${cable.score}%`, height:'100%', background:color, borderRadius:2 }}/>
                    </div>
                  </div>
                </td>
                <td style={{ padding:'10px', textAlign:'center', color:'rgba(255,255,255,.5)' }}>{cable.routeCount}</td>
                <td style={{ padding:'10px', textAlign:'center' }}>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, fontWeight:600,
                    background:cable.score<=40?'rgba(16,112,86,.25)':cable.score<=60?'rgba(120,90,10,.25)':'rgba(120,20,20,.25)',
                    color:cable.score<=40?'#4ade80':cable.score<=60?'#fbbf24':'#f87171',
                    border:`1px solid ${cable.score<=40?'rgba(74,222,128,.3)':cable.score<=60?'rgba(251,191,36,.3)':'rgba(248,113,113,.3)'}`}}>
                    {t.tableRiskLabel(cable.score)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── CableDetailModal ──────────────────────────────────────────────────────────
function CableDetailModal({ data, onClose, isZh, t }: {
  data: CableModalData; onClose: () => void; isZh: boolean; t: typeof T.zh;
}) {
  const color = riskColor(data.score);
  const stationCountries = [...new Set(data.stations.map(s => s.country).filter(Boolean))].slice(0, 8) as string[];
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:300, backdropFilter:'blur(2px)' }}/>
      <div style={{ position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        width:Math.min(460, window.innerWidth-32), background:'rgba(8,18,36,.98)', backdropFilter:'blur(24px)',
        border:`1px solid ${GOLD}28`, borderRadius:14, zIndex:301, boxShadow:'0 16px 60px rgba(0,0,0,.8)', overflow:'hidden' }}>
        <div style={{ padding:'18px 20px', borderBottom:`1px solid ${GOLD}12`, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1, overflow:'hidden', paddingRight:12 }}>
            <div style={{ fontSize:11, color:`${GOLD}80`, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:5 }}>{t.modalTitle}</div>
            <div style={{ fontSize:17, fontWeight:700, color:GOLD_LIGHT, lineHeight:1.3 }}>{data.name}</div>
            {data.slug && <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:'monospace', marginTop:3 }}>slug: {data.slug}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:22, lineHeight:1, flexShrink:0 }}>×</button>
        </div>
        {/* vendor / owners */}
        {(data.vendorStr || (data.ownerStrs && data.ownerStrs.length > 0)) && (
          <div style={{ padding:'10px 20px', display:'flex', flexDirection:'column', gap:6, borderBottom:`1px solid ${GOLD}08` }}>
            {data.vendorStr && (
              <div style={{ display:'flex', gap:8 }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.3)', minWidth:50, flexShrink:0 }}>{isZh?'建造商':'Vendor'}</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.75)' }}>{data.vendorStr}</span>
              </div>
            )}
            {data.ownerStrs && data.ownerStrs.length > 0 && (
              <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,.3)', minWidth:50, flexShrink:0 }}>{isZh?'运营商':'Owners'}</span>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {data.ownerStrs.slice(0,6).map(o => (
                    <span key={o} style={{ fontSize:10, padding:'1px 6px', borderRadius:4, background:'rgba(42,157,143,.12)', color:'#2A9D8F', border:'1px solid rgba(42,157,143,.2)' }}>{o}</span>
                  ))}
                  {data.ownerStrs.length > 6 && <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>+{data.ownerStrs.length-6}</span>}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          {[{l:t.modalStat1,v:data.score,c:color},{l:t.modalStat2,v:data.routeCount,c:GOLD_LIGHT},{l:t.modalStat3,v:data.stations.length,c:GOLD_LIGHT}].map(({l,v,c})=>(
            <div key={l}><div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4 }}>{l}</div><div style={{ fontSize:24, fontWeight:700, color:c, fontFeatureSettings:'"tnum"' }}>{v}</div></div>
          ))}
        </div>
        {stationCountries.length > 0 && (
          <div style={{ padding:'0 20px 12px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:8 }}>{t.modalCountry}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {stationCountries.map(cc => <span key={cc} style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'rgba(42,157,143,.12)', color:'#2A9D8F', border:'1px solid rgba(42,157,143,.2)' }}>{cc}</span>)}
            </div>
          </div>
        )}
        {data.stations.length > 0 && (
          <div style={{ padding:'0 20px 14px', maxHeight:160, overflowY:'auto' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:8 }}>{t.modalStations}（{data.stations.length}）</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {data.stations.slice(0,20).map((s,i)=><span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,.04)', color:'rgba(255,255,255,.55)', border:'1px solid rgba(255,255,255,.06)' }}>{s.name}{s.city?`, ${s.city}`:''}</span>)}
              {data.stations.length>20&&<span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>+{data.stations.length-20}</span>}
            </div>
          </div>
        )}
        {data.stations.length===0 && <div style={{ padding:'0 20px 18px', fontSize:12, color:'rgba(255,255,255,.3)' }}>{t.modalNoStation}</div>}
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${GOLD}10`, textAlign:'right' }}>
          <button onClick={onClose} style={{ padding:'7px 20px', borderRadius:7, background:`${GOLD}12`, border:`1px solid ${GOLD}30`, color:GOLD, cursor:'pointer', fontSize:12, fontWeight:500 }}>{t.modalClose}</button>
        </div>
      </div>
    </>
  );
}

// ── RoutePopup ────────────────────────────────────────────────────────────────
function RoutePopup({ info, onClose, isZh }: { info: CablePopupInfo; onClose: () => void; isZh: boolean }) {
  const t = isZh ? T.zh : T.en;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200 }}/>
      <div style={{ position:'fixed', left:Math.min(info.x+16, window.innerWidth-340), top:Math.max(info.y-60,12),
        width:320, background:'rgba(8,18,36,.97)', backdropFilter:'blur(20px)',
        border:`1px solid ${GOLD}25`, borderRadius:12, zIndex:201, boxShadow:'0 8px 40px rgba(0,0,0,.7)', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${GOLD}12`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:GOLD_LIGHT }}>{info.route.from} → {info.route.to}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:'monospace', marginTop:2 }}>{info.route.path}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'10px 16px 14px', maxHeight:280, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}70`, marginBottom:10 }}>
            {isZh ? `涉及海缆（${info.cables.length} 条）` : `Cables (${info.cables.length})`}
          </div>
          {info.cables.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:i<info.cables.length-1?'1px solid rgba(255,255,255,.05)':'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:c.color, boxShadow:`0 0 5px ${c.color}`, flexShrink:0 }}/>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:10 }}>
                <div style={{ width:40, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}><div style={{ width:`${c.score}%`, height:'100%', background:c.color, borderRadius:2 }}/></div>
                <span style={{ fontSize:12, fontWeight:700, color:c.color, minWidth:24, textAlign:'right', fontFeatureSettings:'"tnum"' }}>{c.score}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${GOLD}10`, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[{l:t.routeMaxRisk,v:info.route.maxRisk},{l:t.routeAvgRisk,v:info.route.avgRisk}].map(({l,v})=>(
            <div key={l}><div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:2 }}>{l}</div><div style={{ fontSize:18, fontWeight:700, color:riskColor(v), fontFeatureSettings:'"tnum"' }}>{v}</div></div>
          ))}
        </div>
      </div>
    </>
  );
}

'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx  v5
//
// 核心改进：
// 1. xlsx 上传后调用 AI 对海缆名称做语义去重（/api/sovereign/normalize-cables）
//    AI 只负责"认出同一条缆的不同写法"，不参与计数逻辑本身
// 2. allUniqueCables 基于归一化后的名称计算，统计结果精确
// 3. 在 Atlas 层面统一获取 /api/sovereign-network 数据（不再在 Map 里获取）
//    cableDbData 同时用于地图渲染和弹窗信息展示
// 4. 点击表格里的海缆名称 → 弹出详情弹窗（含登陆站、状态等 DB 数据）
// 5. 点击地图上的海缆弧线 → 同款弹窗
// 6. 点击空白 → 弹窗消失

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import SovereignNetworkMap, { type CablePopupInfo } from './SovereignNetworkMap';
import {
  SOVEREIGN_ROUTES, CANONICAL_CABLE_NAMES,
  riskColor, safetyCfg,
  type SovereignRoute, type SafetyLevel,
} from '@/lib/sovereign-routes';
import { ROUTE_SEGMENT_MAP, type RouteSegment } from '@/lib/route-segment-map';

// ── 设计常量（与 BRICSDashboard 完全一致）────────────────────────────────────
const GOLD = '#D4AF37'; const GOLD_LIGHT = '#F0E6C8'; const GOLD_DIM = '#D4AF3722';
const NAVY = '#0A1628'; const CARD_BG = 'rgba(26,45,74,.5)';
const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

// ── 海缆 DB 数据类型（来自 /api/sovereign-network）────────────────────────────
interface CableDbRecord {
  slug: string; name: string;
  routeGeojson: GeoJSON.Geometry | null;
  stations: { name: string; lng: number; lat: number; country: string | null; city: string | null }[];
}
interface CableApiResponse { cables: CableDbRecord[]; nameIndex: Record<string, string>; }

// ── 单条海缆的弹窗信息（综合 DB 数据 + 路径风险数据）────────────────────────
interface CableModalData {
  name: string;
  slug: string;
  score: number;           // 路径中的风险评分
  routeCount: number;      // 出现在多少条路径里
  status?: string;
  stations: { name: string; country: string | null; city: string | null }[];
}

// ── 小工具组件 ────────────────────────────────────────────────────────────────
function Badge({ safety }: { safety: SafetyLevel }) {
  const { bg, text, border, label } = safetyCfg(safety);
  return (
    <span style={{ background: bg, color: text, border: `1px solid ${border}`,
      fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
      whiteSpace: 'nowrap', flexShrink: 0 }}>
      {label}
    </span>
  );
}

function Dot({ score, size = 6 }: { score: number; size?: number }) {
  const c = riskColor(score);
  return <span style={{ width: size, height: size, borderRadius: '50%', background: c,
    display: 'inline-block', flexShrink: 0, boxShadow: `0 0 ${size}px ${c}60` }} />;
}

function AnimNum({ n, color = GOLD_LIGHT }: { n: number; color?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => { const p = Math.min((Date.now()-t0)/1200, 1); setV(Math.round(n*(1-Math.pow(1-p,3)))); if(p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [n]);
  return <span style={{ color }}>{v.toLocaleString()}</span>;
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function SovereignNetworkAtlas() {
  const [routes,       setRoutes]       = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');

  // AI 去重状态
  const [normalizing,  setNormalizing]  = useState(false);
  const [normalizeMsg, setNormalizeMsg] = useState('');

  // 海缆 DB 数据（在 Atlas 层统一获取）
  const [cableApi,   setCableApi]   = useState<CableApiResponse | null>(null);
  const cableByName  = useRef<Map<string, CableDbRecord>>(new Map());

  // 海缆详情弹窗
  const [cableModal, setCableModal] = useState<CableModalData | null>(null);

  // 路径选中时的弹窗（来自地图点击）
  const [routePopup, setRoutePopup] = useState<CablePopupInfo | null>(null);

  const selectedRoute = selectedId ? routes.find(r => r.id === selectedId) ?? null : null;

  // ── 从 /api/sovereign-network 获取 DB 数据 ──────────────────────────────────
  useEffect(() => {
    fetch('/api/sovereign-network')
      .then(r => r.ok ? r.json() : null)
      .then((data: CableApiResponse | null) => {
        if (!data) return;
        setCableApi(data);
        // 建立名称 → DB记录的快查索引
        const map = new Map<string, CableDbRecord>();
        data.cables.forEach(c => {
          map.set(c.name.toLowerCase(), c);
          // 括号内缩写也索引
          Array.from(c.name.matchAll(/\(([^)]+)\)/g)).forEach(m => map.set(m[1].toLowerCase(), c));
        });
        cableByName.current = map;
      })
      .catch(console.warn);
  }, []);

  // ── 过滤路径 ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => routes.filter(r => {
    if (filterSafety && r.safety !== filterSafety) return false;
    if (filterFrom   && r.from   !== filterFrom)   return false;
    if (filterTo     && r.to     !== filterTo)     return false;
    return true;
  }), [routes, filterSafety, filterFrom, filterTo]);

  // ── 全量唯一海缆（基于标准名称去重，统计精确）────────────────────────────────
  // 由于 sovereign-routes.ts 现在从 Excel 直接生成，名称已与标准一致
  // 此处仍做 Map 去重而非 Set，是为了同时统计 routeCount
  const allUniqueCables = useMemo(() => {
    const seen = new Map<string, { name: string; score: number; routeCount: number }>();
    for (const r of filtered) {
      const cables = r.cables.split(' | ');
      const scores = r.riskScores.split(' | ').map(Number);
      cables.forEach((cable, i) => {
        const key = cable.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { name: cable.trim(), score: scores[i] ?? r.maxRisk, routeCount: 1 });
        } else {
          seen.get(key)!.routeCount++;
        }
      });
    }
    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }, [filtered]);

  // ── 选项枚举 ─────────────────────────────────────────────────────────────────
  const fromOpts = useMemo(() => [...new Set(routes.map(r => r.from))].sort(), [routes]);
  const toOpts   = useMemo(() => {
    const base = filterFrom ? routes.filter(r => r.from === filterFrom) : routes;
    return [...new Set(base.map(r => r.to))].sort();
  }, [routes, filterFrom]);

  // ── xlsx 上传 + AI 去重 ───────────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';

    const XLSX = await import('xlsx');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf);
    const ws   = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表'); return; }

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    // 第一步：解析路径数据（使用 Excel 原始字段名，不依赖标准化字段名）
    const parsed: SovereignRoute[] = raw.map(r => {
      const path = String(r['路径节点序列'] ?? '');
      return {
        id:         String(r['路径ID'] ?? ''),
        from:       String(r['甲方'] ?? ''),
        to:         String(r['乙方'] ?? ''),
        path,       nodes: path.split(' → '),
        cables:     String(r['各段保留海缆'] ?? ''),
        riskScores: String(r['各段风险评分'] ?? ''),
        maxRisk:    Number(r['路径最大单段风险'] ?? 0),
        avgRisk:    Number(r['路径平均单段风险'] ?? 0),
        segments:   Number(r['保留段数'] ?? 0),
        safety:     String(r['是否安全'] ?? '') as SafetyLevel,
      };
    });

    // 第二步：收集所有原始海缆名称
    const rawCableNames = new Set<string>();
    for (const r of parsed) {
      r.cables.split(' | ').forEach(c => rawCableNames.add(c.trim()));
    }

    // 第三步：调用 AI 做语义去重，把所有变体名称归一化到标准名
    setNormalizing(true);
    setNormalizeMsg(`正在调用 AI 归一化 ${rawCableNames.size} 个海缆名称…`);

    let nameMapping: Record<string, string> = {};
    try {
      const normRes = await fetch('/api/sovereign/normalize-cables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [...rawCableNames] }),
      });
      const normData = await normRes.json();
      nameMapping = normData.mapping ?? {};

      // 统计归一化效果
      const normalizedCount = Object.entries(nameMapping).filter(([k, v]) => k !== v).length;
      setNormalizeMsg(
        `✓ AI 去重完成：${rawCableNames.size} 个原始名称归一化为 ${new Set(Object.values(nameMapping)).size} 条标准海缆` +
        (normalizedCount > 0 ? `（修正了 ${normalizedCount} 个名称变体）` : '（名称均已标准）')
      );
    } catch (err) {
      setNormalizeMsg('⚠ AI 去重失败，将使用原始名称（统计可能有偏差）');
      console.warn('[normalize]', err);
    }

    // 第四步：把归一化映射应用到路径数据的 cables 和 riskScores 字段
    // 注意：cables 字段只替换名称，riskScores 与 cables 同位置对应，不需要变
    const normalizedRoutes = parsed.map(r => ({
      ...r,
      cables: r.cables.split(' | ')
        .map(c => nameMapping[c.trim()] ?? c.trim())
        .join(' | '),
    }));

    setNormalizing(false);
    setRoutes(normalizedRoutes);
    setSelectedId(null); setFilterSafety(''); setFilterFrom(''); setFilterTo('');
  };

  // ── 打开海缆详情弹窗 ──────────────────────────────────────────────────────────
  const openCableModal = useCallback((cableName: string, score: number, routeCount: number) => {
    const key = cableName.toLowerCase();
    const abbrs = Array.from(cableName.matchAll(/\(([^)]+)\)/g)).map(m => m[1].toLowerCase());
    const dbRecord = cableByName.current.get(key)
      ?? abbrs.reduce<CableDbRecord | undefined>((found, abbr) => found ?? cableByName.current.get(abbr), undefined);

    setCableModal({
      name:       cableName,
      slug:       dbRecord?.slug ?? '',
      score,
      routeCount,
      stations:   dbRecord?.stations ?? [],
    });
  }, []);

  const handleSelect  = useCallback((id: string | null) => { setSelectedId(id); if (!id) setRoutePopup(null); }, []);
  const handlePopup   = useCallback((info: CablePopupInfo | null) => setRoutePopup(info), []);

  // 统计卡片数据
  const totalLow  = routes.filter(r => r.safety === '相对低暴露优先路径' || r.safety === '较优备选路径').length;
  const totalMid  = routes.filter(r => r.safety === '中等暴露路径').length;
  const totalHigh = routes.filter(r => r.safety === '高暴露路径').length;

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
    .sna ::-webkit-scrollbar{width:4px}
    .sna ::-webkit-scrollbar-track{background:transparent}
    .sna ::-webkit-scrollbar-thumb{background:${GOLD}28;border-radius:2px}
  `;

  return (
    <div className="sna" style={{ minHeight:'100vh', background:NAVY, color:'#E8E0D0' }}>
      <style>{CSS}</style>

      {/* 五色顶部条纹 */}
      <div style={{ display:'flex', height:4, position:'sticky', top:0, zIndex:100 }}>
        {FLAGS.map(c => <div key={c} style={{ flex:1, background:c }} />)}
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:'32px 32px 48px' }}>

        {/* Hero 页头 */}
        <div className="sna-up" style={{ marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <a href="/brics" style={{ display:'inline-flex', alignItems:'center', gap:6,
              padding:'5px 12px', background:`${GOLD}10`, border:`1px solid ${GOLD}28`,
              borderRadius:20, textDecoration:'none', fontSize:11, color:'#9CA3AF' }}>
              ← 金砖仪表盘
            </a>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px',
              background:`${GOLD}08`, border:`1px solid ${GOLD}1e`, borderRadius:20 }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:GOLD, boxShadow:`0 0 8px ${GOLD}80` }} />
              <span style={{ fontSize:11, color:`${GOLD}BB`, letterSpacing:'.1em',
                textTransform:'uppercase', fontWeight:600 }}>Strategic Intelligence · 战略情报</span>
            </div>
          </div>
          <h1 style={{ fontSize:36, fontWeight:800, color:GOLD_LIGHT, margin:'0 0 8px', lineHeight:1.1 }}>
            自主权网络图谱
          </h1>
          <p style={{ fontSize:14, color:'rgba(255,255,255,.4)', margin:0, maxWidth:640, lineHeight:1.75 }}>
            主权威胁框架下的金砖可用通信路径 · 排除核心西方体系 · 共 {CANONICAL_CABLE_NAMES.length} 条保留海缆 · AI 语义去重
          </p>
        </div>

        {/* AI 去重状态提示 */}
        {normalizeMsg && (
          <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8,
            background: normalizeMsg.startsWith('✓') ? 'rgba(16,112,86,.15)' : normalizeMsg.startsWith('⚠') ? 'rgba(120,90,10,.15)' : 'rgba(26,45,74,.6)',
            border: `1px solid ${normalizeMsg.startsWith('✓') ? 'rgba(74,222,128,.2)' : normalizeMsg.startsWith('⚠') ? 'rgba(251,191,36,.2)' : GOLD_DIM}`,
            fontSize:12, color: normalizeMsg.startsWith('✓') ? '#4ade80' : normalizeMsg.startsWith('⚠') ? '#fbbf24' : 'rgba(255,255,255,.6)',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>{normalizing ? '⏳ ' : ''}{normalizeMsg}</span>
            <button onClick={() => setNormalizeMsg('')} style={{ background:'none', border:'none', color:'rgba(255,255,255,.3)', cursor:'pointer', fontSize:16 }}>×</button>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="sna-up" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14, marginBottom:28, animationDelay:'.06s' }}>
          {[
            { l:'路径总数',   v:routes.length, c:GOLD_LIGHT, s:'覆盖所有国家对' },
            { l:'优先可用',   v:totalLow,      c:'#22C55E',  s:'低暴露 + 较优备选' },
            { l:'中等暴露',   v:totalMid,      c:'#EAB308',  s:'需关注中转节点' },
            { l:'高暴露路径', v:totalHigh,     c:'#EF4444',  s:'含西方核心中转' },
          ].map(({ l, v, c, s }) => (
            <div key={l} className="sna-card" style={{ padding:20, display:'flex', flexDirection:'column', gap:5 }}>
              <span style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80` }}>{l}</span>
              <span style={{ fontSize:32, fontWeight:700, lineHeight:1.1, fontFeatureSettings:'"tnum"' }}>
                <AnimNum n={v} color={c} />
              </span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,.3)' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* 主体布局 */}
        <div className="sna-up" style={{ display:'flex', gap:16, animationDelay:'.12s', alignItems:'flex-start' }}>

          {/* 侧边栏 */}
          <div style={{ width:264, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* 筛选卡片 */}
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:12 }}>筛选条件</div>
              {[
                { label:'安全等级', val:filterSafety, set:setFilterSafety, opts:[
                  {v:'相对低暴露优先路径',l:'低暴露优先'},{v:'较优备选路径',l:'较优备选'},
                  {v:'中等暴露路径',l:'中等暴露'},{v:'高暴露路径',l:'高暴露路径'}]},
                { label:'起点国家', val:filterFrom, set:(v:string)=>{setFilterFrom(v);setFilterTo('');},
                  opts:fromOpts.map(c=>({v:c,l:c})) },
                { label:'到达国家', val:filterTo, set:setFilterTo, opts:toOpts.map(c=>({v:c,l:c})) },
              ].map(({ label, val, set, opts }) => (
                <div key={label} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>{label}</div>
                  <select value={val} onChange={e => set(e.target.value)} className="sna-sel">
                    <option value="">全部</option>
                    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              {(filterSafety || filterFrom || filterTo) && (
                <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:`${GOLD}BB` }}>
                  <span>显示 {filtered.length}/{routes.length}</span>
                  <button onClick={() => { setFilterSafety(''); setFilterFrom(''); setFilterTo(''); setSelectedId(null); }}
                    style={{ background:'none', border:'none', color:`${GOLD}80`, cursor:'pointer', fontSize:13 }}>✕</button>
                </div>
              )}
            </div>

            {/* 路径列表 */}
            <div style={{ overflowY:'auto', maxHeight:420 }}>
              {filtered.length === 0
                ? <div className="sna-card" style={{ padding:20, textAlign:'center', fontSize:13, color:'rgba(255,255,255,.3)' }}>无匹配路径</div>
                : filtered.map(r => {
                  const isSel = selectedId === r.id;
                  return (
                    <button key={r.id} className={`sna-route${isSel ? ' sel' : ''}`}
                      onClick={() => handleSelect(isSel ? null : r.id)}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <Dot score={r.maxRisk} />
                        <span style={{ fontSize:12, fontWeight:600, color:isSel?GOLD_LIGHT:'#CBD5E1',
                          flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.from} → {r.to}
                        </span>
                        <Badge safety={r.safety} />
                      </div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,.22)', overflow:'hidden',
                        textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>
                        {r.path}
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* 图例 */}
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:10 }}>风险色阶</div>
              {[['#0F6E56','0–20','低风险'],['#639922','21–40','中低'],['#BA7517','41–60','中等'],
                ['#D85A30','61–75','较高'],['#A32D2D','76+','极高']].map(([c,r,d]) => (
                <div key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ width:22, height:3, background:c, borderRadius:2, boxShadow:`0 0 4px ${c}55`, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.45)', minWidth:32 }}>{r}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 地图 + 详情区 */}
          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* xlsx 上传按钮（Admin 功能，在地图上方不显眼地放置） */}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px',
                background:`${GOLD}08`, border:`1px solid ${GOLD}18`, borderRadius:8,
                cursor:'pointer', fontSize:11, color:`${GOLD}80`, transition:'all .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLLabelElement).style.borderColor=`${GOLD}35`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLLabelElement).style.borderColor=`${GOLD}18`; }}>
                {normalizing ? '⏳ 归一化中…' : '↑ 上传路径 .xlsx（AI 去重）'}
                <input type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleUpload} disabled={normalizing} />
              </label>
            </div>

            {/* 选中提示条 */}
            {selectedRoute && (
              <div style={{ padding:'8px 14px', borderRadius:8, background:`${GOLD}0e`,
                border:`1px solid ${GOLD}28`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:GOLD }}>
                  {selectedRoute.from} → {selectedRoute.to}
                  <span style={{ color:'rgba(255,255,255,.3)', marginLeft:10 }}>最大风险</span>
                  <span style={{ color:riskColor(selectedRoute.maxRisk), fontWeight:700, marginLeft:4 }}>
                    {selectedRoute.maxRisk}
                  </span>
                </span>
                <button onClick={() => handleSelect(null)} style={{ background:'none', border:'none', color:GOLD, cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
            )}

            {/* 地图（传入 cableApiData 避免重复 fetch） */}
            <SovereignNetworkMap
              height="520px"
              routes={routes}
              filteredRoutes={filtered}
              selectedRouteId={selectedId}
              cableApiData={cableApi}
              onRouteSelect={handleSelect}
              onPopup={handlePopup}
              onCableClick={(name, score) => openCableModal(name, score, allUniqueCables.find(c => c.name.toLowerCase() === name.toLowerCase())?.routeCount ?? 1)}
            />

            {/* 详情面板 */}
            {selectedRoute
              ? <SelectedRouteDetail route={selectedRoute} onCableClick={openCableModal} allCables={allUniqueCables} />
              : <AllCablesTable cables={allUniqueCables} total={routes.length} filtered={filtered.length} onCableClick={openCableModal} />}
          </div>
        </div>

        {/* 页脚 */}
        <footer style={{ marginTop:40, paddingTop:18, borderTop:`1px solid ${GOLD}0e` }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,.18)', marginBottom:8 }}>
            <span>数据来源：BRICS Transit Analysis · TeleGeography · Submarine Networks</span>
            <span>保留海缆共 {CANONICAL_CABLE_NAMES.length} 条 · 风险评分：建造商 20% + 运营商 45% + 中转国家 35%</span>
          </div>
        </footer>
      </div>

      {/* 路径级弹窗（来自地图点击） */}
      {routePopup && <RoutePopup info={routePopup} onClose={() => setRoutePopup(null)} />}

      {/* 海缆详情弹窗 */}
      {cableModal && <CableDetailModal data={cableModal} onClose={() => setCableModal(null)} />}
    </div>
  );
}

// ── 选中路径详情（分支路线展示）─────────────────────────────────────────────
function SelectedRouteDetail({ route, onCableClick, allCables }: {
  route: SovereignRoute;
  onCableClick: (name: string, score: number, routeCount: number) => void;
  allCables: { name: string; score: number; routeCount: number }[];
}) {
  const { bg, text, label } = safetyCfg(route.safety);
  const segmentData: RouteSegment[] | undefined = ROUTE_SEGMENT_MAP[route.id];

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${GOLD_DIM}`, borderRadius:14,
      backdropFilter:'blur(12px)', padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:4 }}>路径主权详情</div>
          <h2 style={{ fontSize:20, fontWeight:700, color:GOLD_LIGHT, margin:'0 0 4px', fontFamily:"'Playfair Display',serif" }}>
            {route.from} → {route.to}
          </h2>
          <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:0, fontFamily:'monospace' }}>{route.path}</p>
        </div>
        <span style={{ background:bg, color:text, border:'1px solid rgba(255,255,255,.08)', fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600, flexShrink:0 }}>{label}</span>
      </div>

      {/* 三项指标 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:20 }}>
        {[
          { l:'最大段风险', v:route.maxRisk, c:riskColor(route.maxRisk) },
          { l:'平均风险',   v:route.avgRisk, c:riskColor(route.avgRisk) },
          { l:'保留段数',   v:route.segments, c:GOLD_LIGHT },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase' }}>{l}</div>
            <div style={{ fontSize:28, fontWeight:700, color:c, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:14 }}>各段海缆明细</div>
      <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:12 }}>点击海缆名称查看详细信息</p>

      {/* 分支路线展示 */}
      {segmentData ? (
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          {segmentData.map((seg, segIdx) => {
            const isLast = segIdx === segmentData.length - 1;
            const bestScore = seg.cables.find(c => c.isBest)?.score ?? seg.cables[0]?.score ?? 0;
            const segColor = riskColor(bestScore);
            const hasMulti = seg.cables.length > 1;
            return (
              <div key={seg.seg} style={{ display:'flex', alignItems:'stretch', gap:0 }}>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:32, flexShrink:0 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:segColor,
                    boxShadow:`0 0 10px ${segColor}80`, marginTop:16, flexShrink:0, border:'2px solid rgba(255,255,255,.15)' }} />
                  {!isLast && <div style={{ flex:1, width:2, marginTop:4, background:`linear-gradient(${segColor}60,rgba(255,255,255,.05))`, borderRadius:1 }} />}
                </div>
                <div style={{ flex:1, paddingBottom:isLast?0:12, paddingLeft:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, marginTop:10 }}>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,.35)' }}>第 {seg.seg} 段</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.7)' }}>{seg.from} → {seg.to}</span>
                    {hasMulti && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:10, background:'rgba(212,175,55,.12)', color:`${GOLD}BB`, border:`1px solid ${GOLD}25` }}>{seg.cables.length} 条备选</span>}
                  </div>
                  {hasMulti ? (
                    <div style={{ position:'relative', paddingLeft:16 }}>
                      <div style={{ position:'absolute', left:0, top:4, bottom:4, width:2, background:`${segColor}30`, borderRadius:1 }} />
                      {seg.cables.map((cable, cIdx) => (
                        <div key={cIdx} style={{ position:'relative', marginBottom:cIdx < seg.cables.length-1 ? 6 : 0 }}>
                          <div style={{ position:'absolute', left:-16, top:'50%', width:14, height:2, background:`${riskColor(cable.score)}60` }} />
                          <button
                            onClick={() => onCableClick(cable.name, cable.score, allCables.find(c=>c.name.toLowerCase()===cable.name.toLowerCase())?.routeCount??1)}
                            style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
                              padding:'7px 12px', cursor:'pointer', textAlign:'left',
                              background:cable.isBest?`${riskColor(cable.score)}12`:'rgba(255,255,255,.03)',
                              border:`1px solid ${cable.isBest?riskColor(cable.score)+'30':'rgba(255,255,255,.06)'}`,
                              borderRadius:7, transition:'border-color .15s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor=`${riskColor(cable.score)}60`}
                            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor=cable.isBest?`${riskColor(cable.score)}30`:'rgba(255,255,255,.06)'}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                              {cable.isBest && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:`${riskColor(cable.score)}20`, color:riskColor(cable.score), border:`1px solid ${riskColor(cable.score)}40`, fontWeight:700, flexShrink:0 }}>最优</span>}
                              <span style={{ fontSize:12, color:cable.isBest?'rgba(255,255,255,.85)':'rgba(255,255,255,.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cable.name}</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:10 }}>
                              <div style={{ width:44, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                                <div style={{ width:`${cable.score}%`, height:'100%', background:riskColor(cable.score), borderRadius:2 }} />
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color:riskColor(cable.score), minWidth:22, textAlign:'right', fontFeatureSettings:'"tnum"' }}>{cable.score}</span>
                            </div>
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    seg.cables.map((cable, cIdx) => (
                      <button key={cIdx}
                        onClick={() => onCableClick(cable.name, cable.score, allCables.find(c=>c.name.toLowerCase()===cable.name.toLowerCase())?.routeCount??1)}
                        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
                          padding:'7px 12px', cursor:'pointer', textAlign:'left',
                          background:`${riskColor(cable.score)}10`, border:`1px solid ${riskColor(cable.score)}28`, borderRadius:7, transition:'border-color .15s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor=`${riskColor(cable.score)}60`}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor=`${riskColor(cable.score)}28`}>
                        <span style={{ fontSize:12, color:'rgba(255,255,255,.82)' }}>{cable.name}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:44, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ width:`${cable.score}%`, height:'100%', background:riskColor(cable.score), borderRadius:2 }} />
                          </div>
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
        // Fallback：无段映射时
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {route.cables.split(' | ').map((cable, i) => {
            const scores = route.riskScores.split(' | ').map(Number);
            const score = scores[i] ?? route.maxRisk;
            return (
              <button key={i}
                onClick={() => onCableClick(cable.trim(), score, allCables.find(c=>c.name.toLowerCase()===cable.trim().toLowerCase())?.routeCount??1)}
                style={{ display:'inline-flex', alignItems:'center', gap:6, background:`${riskColor(score)}10`,
                  border:`1px solid ${riskColor(score)}28`, borderRadius:6, padding:'4px 10px',
                  fontSize:11, color:'rgba(255,255,255,.75)', fontFamily:'monospace', cursor:'pointer' }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:riskColor(score), flexShrink:0 }} />
                {cable.trim()}
                <span style={{ color:riskColor(score), fontWeight:700, fontSize:10 }}>{score}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 全量海缆汇总表（点击行打开弹窗）──────────────────────────────────────────
function AllCablesTable({ cables, total, filtered, onCableClick }: {
  cables: { name: string; score: number; routeCount: number }[];
  total: number; filtered: number;
  onCableClick: (name: string, score: number, routeCount: number) => void;
}) {
  return (
    <div style={{ background:CARD_BG, border:`1px solid ${GOLD_DIM}`, borderRadius:14, backdropFilter:'blur(12px)', padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:4 }}>主权可用海缆汇总</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:GOLD_LIGHT, margin:0, fontFamily:"'Playfair Display',serif" }}>当前范围内所有保留海缆</h2>
          <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:'4px 0 0' }}>点击任意行查看海缆详细信息</p>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, color:GOLD_LIGHT }}>{cables.length}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>条不重复海缆 · {filtered}/{total} 条路径</div>
        </div>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,.08)' }}>
              {['海缆名称','风险评分','出现路径数','评级'].map(h => (
                <th key={h} style={{ padding:'8px 10px', textAlign:h==='海缆名称'?'left':'center',
                  fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}70` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cables.map((cable, i) => {
              const color = riskColor(cable.score);
              return (
                <tr key={i}
                  onClick={() => onCableClick(cable.name, cable.score, cable.routeCount)}
                  style={{ borderBottom:'1px solid rgba(255,255,255,.04)', cursor:'pointer', transition:'background .1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background='rgba(212,175,55,.06)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background='transparent'}>
                  <td style={{ padding:'10px 10px', color:'rgba(255,255,255,.85)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:color, boxShadow:`0 0 5px ${color}`, flexShrink:0 }} />
                      {cable.name}
                    </div>
                  </td>
                  <td style={{ padding:'10px 10px', textAlign:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color }}>{cable.score}</span>
                      <div style={{ width:48, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ width:`${cable.score}%`, height:'100%', background:color, borderRadius:2 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'10px 10px', textAlign:'center', color:'rgba(255,255,255,.5)' }}>{cable.routeCount}</td>
                  <td style={{ padding:'10px 10px', textAlign:'center' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, fontWeight:600,
                      background: cable.score<=40?'rgba(16,112,86,.25)':cable.score<=60?'rgba(120,90,10,.25)':'rgba(120,20,20,.25)',
                      color: cable.score<=40?'#4ade80':cable.score<=60?'#fbbf24':'#f87171',
                      border:`1px solid ${cable.score<=40?'rgba(74,222,128,.3)':cable.score<=60?'rgba(251,191,36,.3)':'rgba(248,113,113,.3)'}` }}>
                      {cable.score<=20?'低风险':cable.score<=40?'中低':cable.score<=60?'中等':cable.score<=75?'较高':'极高'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 海缆详情弹窗（居中 Modal）─────────────────────────────────────────────────
function CableDetailModal({ data, onClose }: { data: CableModalData; onClose: () => void }) {
  const color = riskColor(data.score);
  const stationCountries = [...new Set(data.stations.map(s => s.country).filter(Boolean))].slice(0, 8);

  return (
    <>
      {/* 半透明遮罩，点击关闭 */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:300, backdropFilter:'blur(2px)' }} />

      <div style={{
        position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        width: Math.min(460, window.innerWidth - 32),
        background:'rgba(8,18,36,.98)', backdropFilter:'blur(24px)',
        border:`1px solid ${GOLD}28`, borderRadius:14,
        zIndex:301, boxShadow:'0 16px 60px rgba(0,0,0,.8)',
        overflow:'hidden', fontFamily:"'DM Sans',system-ui,sans-serif",
      }}>
        {/* 头部 */}
        <div style={{ padding:'18px 20px', borderBottom:`1px solid ${GOLD}12`,
          display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1, overflow:'hidden', paddingRight:12 }}>
            <div style={{ fontSize:11, color:`${GOLD}80`, fontWeight:600, letterSpacing:'.08em',
              textTransform:'uppercase', marginBottom:5 }}>海缆详情</div>
            <div style={{ fontSize:17, fontWeight:700, color:GOLD_LIGHT, lineHeight:1.3 }}>{data.name}</div>
            {data.slug && <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:'monospace', marginTop:3 }}>slug: {data.slug}</div>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)',
            cursor:'pointer', fontSize:22, lineHeight:1, flexShrink:0, padding:'0 2px' }}>×</button>
        </div>

        {/* 指标区 */}
        <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4 }}>风险评分</div>
            <div style={{ fontSize:24, fontWeight:700, color, fontFeatureSettings:'"tnum"' }}>{data.score}</div>
            <div style={{ marginTop:4, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ width:`${data.score}%`, height:'100%', background:color, borderRadius:2 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4 }}>出现路径数</div>
            <div style={{ fontSize:24, fontWeight:700, color:GOLD_LIGHT, fontFeatureSettings:'"tnum"' }}>{data.routeCount}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4 }}>登陆站数量</div>
            <div style={{ fontSize:24, fontWeight:700, color:GOLD_LIGHT, fontFeatureSettings:'"tnum"' }}>{data.stations.length}</div>
          </div>
        </div>

        {/* 登陆站覆盖国家 */}
        {stationCountries.length > 0 && (
          <div style={{ padding:'0 20px 14px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:8 }}>登陆站覆盖国家/地区</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {stationCountries.map(cc => (
                <span key={cc} style={{ fontSize:11, padding:'2px 8px', borderRadius:6,
                  background:'rgba(42,157,143,.12)', color:'#2A9D8F',
                  border:'1px solid rgba(42,157,143,.2)' }}>{cc}</span>
              ))}
              {data.stations.length > 8 && <span style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>+{data.stations.length - 8} 更多</span>}
            </div>
          </div>
        )}

        {/* 登陆站列表 */}
        {data.stations.length > 0 && (
          <div style={{ padding:'0 20px 14px', maxHeight:180, overflowY:'auto' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:8 }}>所有登陆站（{data.stations.length} 个）</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {data.stations.slice(0, 20).map((s, i) => (
                <span key={i} style={{ fontSize:10, padding:'2px 7px', borderRadius:5,
                  background:'rgba(255,255,255,.04)', color:'rgba(255,255,255,.55)',
                  border:'1px solid rgba(255,255,255,.06)' }}>
                  {s.name}{s.city ? `, ${s.city}` : ''}
                </span>
              ))}
              {data.stations.length > 20 && <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>+{data.stations.length-20}</span>}
            </div>
          </div>
        )}

        {/* 无登陆站数据时的提示 */}
        {data.stations.length === 0 && (
          <div style={{ padding:'0 20px 18px', fontSize:12, color:'rgba(255,255,255,.3)' }}>
            登陆站数据加载中，或该缆暂未收录在数据库里
          </div>
        )}

        {/* 底部关闭按钮 */}
        <div style={{ padding:'12px 20px', borderTop:`1px solid ${GOLD}10`, textAlign:'right' }}>
          <button onClick={onClose} style={{ padding:'7px 20px', borderRadius:7,
            background:`${GOLD}12`, border:`1px solid ${GOLD}30`, color:GOLD,
            cursor:'pointer', fontSize:12, fontWeight:500 }}>关闭</button>
        </div>
      </div>
    </>
  );
}

// ── 路径级弹窗（来自地图点击，浮动在点击位置旁边）─────────────────────────
function RoutePopup({ info, onClose }: { info: CablePopupInfo; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200 }} />
      <div style={{
        position:'fixed',
        left: Math.min(info.x + 16, window.innerWidth - 340),
        top:  Math.max(info.y - 60, 12),
        width:320, background:'rgba(8,18,36,.97)',
        backdropFilter:'blur(20px)', border:`1px solid ${GOLD}25`,
        borderRadius:12, zIndex:201, boxShadow:'0 8px 40px rgba(0,0,0,.7)',
        overflow:'hidden', fontFamily:"'DM Sans',system-ui,sans-serif",
      }}>
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${GOLD}12`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:GOLD_LIGHT }}>{info.route.from} → {info.route.to}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:'monospace', marginTop:2 }}>{info.route.path}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:18, lineHeight:1 }}>×</button>
        </div>
        <div style={{ padding:'10px 16px 14px', maxHeight:280, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}70`, marginBottom:10 }}>
            涉及海缆（{info.cables.length} 条）
          </div>
          {info.cables.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'7px 0', borderBottom:i<info.cables.length-1?'1px solid rgba(255,255,255,.05)':'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:c.color, boxShadow:`0 0 5px ${c.color}`, flexShrink:0 }} />
                <span style={{ fontSize:12, color:'rgba(255,255,255,.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:10 }}>
                <div style={{ width:40, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${c.score}%`, height:'100%', background:c.color, borderRadius:2 }} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:c.color, minWidth:24, textAlign:'right', fontFeatureSettings:'"tnum"' }}>{c.score}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${GOLD}10`, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[{l:'最大风险',v:info.route.maxRisk},{l:'平均风险',v:info.route.avgRisk}].map(({l,v})=>(
            <div key={l}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:700, color:riskColor(v), fontFeatureSettings:'"tnum"' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

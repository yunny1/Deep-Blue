'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx
// v3：筛选联动（from + to）、海缆明细面板（子段）、无重复全量展示、弹窗状态

import { useEffect, useState, useCallback, useMemo } from 'react';
import SovereignNetworkMap, { type CablePopupInfo } from './SovereignNetworkMap';
import {
  SOVEREIGN_ROUTES, riskColor, safetyCfg,
  type SovereignRoute, type SafetyLevel,
} from '@/lib/sovereign-routes';

const GOLD      = '#D4AF37';
const GOLD_LIGHT = '#F0E6C8';
const GOLD_DIM  = '#D4AF3722';
const NAVY      = '#0A1628';
const CARD_BG   = 'rgba(26,45,74,.5)';
const FLAGS     = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

// ── 小组件 ────────────────────────────────────────────────────────────────────
function Badge({ safety }: { safety: SafetyLevel }) {
  const { bg, text, border, label } = safetyCfg(safety);
  return (
    <span style={{ background: bg, color: text, border: `1px solid ${border}`,
      fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
      whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em',
      fontFamily: "'DM Sans',system-ui,sans-serif" }}>
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
    const tick = () => {
      const p = Math.min((Date.now()-t0)/1200, 1);
      setV(Math.round(n*(1-Math.pow(1-p,3))));
      if (p < 1) requestAnimationFrame(tick);
    };
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
  const [popup,        setPopup]        = useState<CablePopupInfo | null>(null);

  // ── 过滤后的路径 ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => routes.filter(r => {
    if (filterSafety && r.safety !== filterSafety) return false;
    if (filterFrom   && r.from   !== filterFrom)   return false;
    if (filterTo     && r.to     !== filterTo)     return false;
    return true;
  }), [routes, filterSafety, filterFrom, filterTo]);

  const selectedRoute = selectedId ? routes.find(r => r.id === selectedId) ?? null : null;

  // ── 全量海缆去重列表（筛选条件为空时在详情区展示）────────────────────────
  const allUniqueCables = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; score: number; routeCount: number }> = [];
    for (const r of filtered) {
      const cables = r.cables.split(' | ');
      const scores = r.riskScores.split(' | ').map(Number);
      cables.forEach((cable, i) => {
        const key = cable.trim().toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ name: cable.trim(), score: scores[i] ?? r.maxRisk, routeCount: 1 });
        } else {
          const ex = result.find(x => x.name.toLowerCase() === key);
          if (ex) ex.routeCount++;
        }
      });
    }
    return result.sort((a, b) => b.score - a.score);
  }, [filtered]);

  // ── 选项枚举 ─────────────────────────────────────────────────────────────
  const fromOpts = useMemo(() => [...new Set(routes.map(r => r.from))].sort(), [routes]);
  const toOpts   = useMemo(() => {
    const base = [...new Set(routes.map(r => r.to))].sort();
    // 根据已选 from 过滤 to 的可选项
    if (filterFrom) return [...new Set(routes.filter(r => r.from === filterFrom).map(r => r.to))].sort();
    return base;
  }, [routes, filterFrom]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (!id) setPopup(null);
  }, []);

  const handlePopup = useCallback((info: CablePopupInfo | null) => setPopup(info), []);

  // ── 统计 ─────────────────────────────────────────────────────────────────
  const totalLow  = routes.filter(r => r.safety==='相对低暴露优先路径'||r.safety==='较优备选路径').length;
  const totalMid  = routes.filter(r => r.safety==='中等暴露路径').length;
  const totalHigh = routes.filter(r => r.safety==='高暴露路径').length;

  // ── CSS ──────────────────────────────────────────────────────────────────
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
    .sna-sel{background:rgba(10,22,40,.85);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:rgba(255,255,255,.7);font-size:12px;outline:none;padding:7px 9px;transition:border-color .15s;width:100%;font-family:'DM Sans',system-ui,sans-serif}
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

        {/* Hero */}
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
              <span style={{ fontSize:11, color:`${GOLD}BB`, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600 }}>
                Strategic Intelligence · 战略情报
              </span>
            </div>
          </div>
          <h1 style={{ fontSize:36, fontWeight:800, color:GOLD_LIGHT, margin:'0 0 8px', lineHeight:1.1 }}>
            自主权网络图谱
          </h1>
          <p style={{ fontSize:14, color:'rgba(255,255,255,.4)', margin:0, maxWidth:600, lineHeight:1.75 }}>
            主权威胁框架下的金砖可用通信路径 · 排除核心西方体系 · 真实海缆路由 · 最弱链条原则风险评级
          </p>
        </div>

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

          {/* ── 左侧边栏 ── */}
          <div style={{ width:264, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* 筛选卡片 */}
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
                color:`${GOLD}80`, marginBottom:12 }}>筛选条件</div>

              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>安全等级</div>
                <select value={filterSafety} onChange={e => setFilterSafety(e.target.value)} className="sna-sel">
                  <option value="">全部</option>
                  <option value="相对低暴露优先路径">低暴露优先</option>
                  <option value="较优备选路径">较优备选</option>
                  <option value="中等暴露路径">中等暴露</option>
                  <option value="高暴露路径">高暴露路径</option>
                </select>
              </div>

              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>起点国家</div>
                <select value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setFilterTo(''); }} className="sna-sel">
                  <option value="">全部</option>
                  {fromOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>到达国家</div>
                <select value={filterTo} onChange={e => setFilterTo(e.target.value)} className="sna-sel">
                  <option value="">全部</option>
                  {toOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {(filterSafety||filterFrom||filterTo) && (
                <div style={{ marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:`${GOLD}BB` }}>
                  <span>显示 {filtered.length} / {routes.length}</span>
                  <button onClick={() => { setFilterSafety(''); setFilterFrom(''); setFilterTo(''); setSelectedId(null); }}
                    style={{ background:'none', border:'none', color:`${GOLD}80`, cursor:'pointer', fontSize:13 }}>✕ 清除</button>
                </div>
              )}
            </div>

            {/* 路径列表（联动地图）*/}
            <div style={{ overflowY:'auto', maxHeight:400 }}>
              {filtered.length === 0
                ? <div className="sna-card" style={{ padding:20, textAlign:'center', fontSize:13, color:'rgba(255,255,255,.3)' }}>
                    无匹配路径
                  </div>
                : filtered.map(r => {
                  const isSel = selectedId === r.id;
                  return (
                    <button key={r.id} className={`sna-route${isSel?' sel':''}`}
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
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
                color:`${GOLD}80`, marginBottom:10 }}>风险色阶</div>
              {[['#0F6E56','0–20','低风险'],['#639922','21–40','中低'],['#BA7517','41–60','中等'],
                ['#D85A30','61–75','较高'],['#A32D2D','76+','极高']].map(([c,r,d])=>(
                <div key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ width:22, height:3, background:c, borderRadius:2, boxShadow:`0 0 4px ${c}55`, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.45)', minWidth:32 }}>{r}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 右侧：地图 + 详情区 ── */}
          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

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
                  <span style={{ color:'rgba(255,255,255,.3)', marginLeft:10, fontFamily:'monospace', fontSize:10 }}>
                    {selectedRoute.path}
                  </span>
                </span>
                <button onClick={() => handleSelect(null)}
                  style={{ background:'none', border:'none', color:GOLD, cursor:'pointer', fontSize:16 }}>✕</button>
              </div>
            )}

            {/* MapLibre 地图 */}
            <SovereignNetworkMap
              height="520px"
              routes={filtered.length ? filtered : routes}
              selectedRouteId={selectedId}
              onRouteSelect={handleSelect}
              onPopup={handlePopup}
            />

            {/* ── 详情展示区（仿金砖投资机会分析布局）── */}
            {selectedRoute ? (
              // 选中路径：展示该路径的完整子段海缆明细
              <SelectedRouteDetail route={selectedRoute} />
            ) : (
              // 未选中：展示当前筛选范围内所有不重复的海缆
              <AllCablesTable cables={allUniqueCables} total={routes.length} filtered={filtered.length} />
            )}
          </div>
        </div>

        {/* 页脚 */}
        <footer style={{ marginTop:40, paddingTop:18, borderTop:`1px solid ${GOLD}0e` }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,.18)', marginBottom:8 }}>
            <span>数据来源：BRICS Transit Analysis · TeleGeography · Submarine Networks</span>
            <span>风险评分：建造商 20% + 运营商 45% + 中转国家 35%</span>
          </div>
          <p style={{ fontSize:10, color:'rgba(255,255,255,.1)', lineHeight:1.6, margin:0, maxWidth:900 }}>
            本图谱展示的路径排除了核心西方体系（SubCom/ASN/AT&T/Google/Meta 等）主导的海缆，风险评级采用最弱链条原则。仅供战略研究参考。
          </p>
        </footer>
      </div>

      {/* ── 悬浮弹窗：点击地图上海缆弧线后显示 ── */}
      {popup && <CablePopup info={popup} onClose={() => setPopup(null)} />}
    </div>
  );
}

// ── 选中路径详情面板（仿金砖投资机会分析样式）────────────────────────────────
function SelectedRouteDetail({ route }: { route: SovereignRoute }) {
  const cables  = route.cables.split(' | ');
  const scores  = route.riskScores.split(' | ').map(Number);
  const { bg, text, label } = safetyCfg(route.safety);
  const GOLD = '#D4AF37'; const GOLD_LIGHT = '#F0E6C8'; const CARD_BG = 'rgba(26,45,74,.5)';
  const GOLD_DIM = '#D4AF3722';

  return (
    <div style={{ background:CARD_BG, border:`1px solid ${GOLD_DIM}`, borderRadius:14,
      backdropFilter:'blur(12px)', padding:'20px 24px' }}>

      {/* 标题区 */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
            color:`${GOLD}80`, marginBottom:4, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
            路径主权详情
          </div>
          <h2 style={{ fontSize:20, fontWeight:700, color:GOLD_LIGHT, margin:'0 0 4px',
            fontFamily:"'Playfair Display',serif" }}>
            {route.from} → {route.to}
          </h2>
          <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:0, fontFamily:'monospace' }}>
            {route.path}
          </p>
        </div>
        <span style={{ background:bg, color:text, border:`1px solid rgba(255,255,255,.1)`,
          fontSize:11, padding:'4px 10px', borderRadius:20, fontWeight:600,
          fontFamily:"'DM Sans',system-ui,sans-serif" }}>
          {label}
        </span>
      </div>

      {/* 三项核心指标 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:20 }}>
        {[
          { l:'最大段风险', v:route.maxRisk,  c:riskColor(route.maxRisk) },
          { l:'平均风险',   v:route.avgRisk,  c:riskColor(route.avgRisk) },
          { l:'保留段数',   v:route.segments, c:GOLD_LIGHT },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ background:'rgba(255,255,255,.03)',
            border:'1px solid rgba(255,255,255,.06)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4,
              fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase' }}>{l}</div>
            <div style={{ fontSize:28, fontWeight:700, color:c, lineHeight:1,
              fontFeatureSettings:'"tnum"', fontFamily:"'DM Sans',system-ui,sans-serif" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 子段海缆明细（核心展示区）*/}
      <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase',
        color:`${GOLD}80`, marginBottom:12 }}>各段保留海缆明细</div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {cables.map((cable, i) => {
          const score = scores[i] ?? route.maxRisk;
          const color = riskColor(score);
          const segLabel = i === 0 ? `第 1 段` : i === cables.length - 1 ? `第 ${cables.length} 段（末段）` : `第 ${i+1} 段`;
          return (
            <div key={i} style={{ display:'flex', alignItems:'stretch', gap:0 }}>
              {/* 左侧段序号竖线 */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:28, flexShrink:0 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:color,
                  boxShadow:`0 0 8px ${color}`, marginTop:14, flexShrink:0 }} />
                {i < cables.length - 1 && (
                  <div style={{ flex:1, width:2, background:`linear-gradient(${color}60, rgba(255,255,255,.05))`,
                    marginTop:4, borderRadius:1 }} />
                )}
              </div>
              {/* 右侧内容卡 */}
              <div style={{ flex:1, background:`${color}0a`, border:`1px solid ${color}22`,
                borderRadius:8, padding:'10px 14px', marginBottom: i < cables.length-1 ? 0 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:"'DM Sans',system-ui,sans-serif" }}>
                    {segLabel}
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.3)' }}>风险评分</span>
                    <span style={{ fontSize:14, fontWeight:700, color,
                      fontFamily:"'DM Sans',system-ui,sans-serif", fontFeatureSettings:'"tnum"' }}>{score}</span>
                    {/* 风险条 */}
                    <div style={{ width:60, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ width:`${score}%`, height:'100%', background:color, borderRadius:2,
                        boxShadow:`0 0 4px ${color}` }} />
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,.85)',
                  fontFamily:"'DM Sans',system-ui,sans-serif" }}>
                  {cable.trim()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 全量海缆展示表（未选中路径时显示）────────────────────────────────────────
function AllCablesTable({ cables, total, filtered }: {
  cables: Array<{ name: string; score: number; routeCount: number }>;
  total: number; filtered: number;
}) {
  const GOLD = '#D4AF37'; const GOLD_LIGHT = '#F0E6C8'; const CARD_BG = 'rgba(26,45,74,.5)';
  const GOLD_DIM = '#D4AF3722';

  return (
    <div style={{ background:CARD_BG, border:`1px solid ${GOLD_DIM}`, borderRadius:14,
      backdropFilter:'blur(12px)', padding:'20px 24px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
            color:`${GOLD}80`, marginBottom:4 }}>主权可用海缆汇总</div>
          <h2 style={{ fontSize:18, fontWeight:700, color:GOLD_LIGHT, margin:0,
            fontFamily:"'Playfair Display',serif" }}>
            当前范围内所有保留海缆
          </h2>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:22, fontWeight:700, color:GOLD_LIGHT,
            fontFamily:"'DM Sans',system-ui,sans-serif" }}>{cables.length}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>
            条不重复海缆 · {filtered}/{total} 条路径
          </div>
        </div>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,.08)' }}>
              {['海缆名称','风险评分','出现路径数','评级'].map(h => (
                <th key={h} style={{ padding:'8px 10px', textAlign: h==='海缆名称'?'left':'center',
                  fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase',
                  color:`${GOLD}70`, fontFamily:"'DM Sans',system-ui,sans-serif" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cables.map((cable, i) => {
              const color = riskColor(cable.score);
              return (
                <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,.04)',
                  transition:'background .1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(212,175,55,.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                  <td style={{ padding:'9px 10px', color:'rgba(255,255,255,.8)',
                    fontFamily:"'DM Sans',system-ui,sans-serif" }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:color,
                        boxShadow:`0 0 5px ${color}`, flexShrink:0 }} />
                      {cable.name}
                    </div>
                  </td>
                  <td style={{ padding:'9px 10px', textAlign:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                      <span style={{ fontSize:13, fontWeight:700, color,
                        fontFamily:"'DM Sans',system-ui,sans-serif" }}>{cable.score}</span>
                      <div style={{ width:48, height:4, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ width:`${cable.score}%`, height:'100%', background:color, borderRadius:2 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'9px 10px', textAlign:'center', color:'rgba(255,255,255,.5)',
                    fontFamily:"'DM Sans',system-ui,sans-serif" }}>
                    {cable.routeCount}
                  </td>
                  <td style={{ padding:'9px 10px', textAlign:'center' }}>
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:12, fontWeight:600,
                      background: cable.score<=40 ? 'rgba(16,112,86,.25)' : cable.score<=60 ? 'rgba(120,90,10,.25)' : 'rgba(120,20,20,.25)',
                      color: cable.score<=40 ? '#4ade80' : cable.score<=60 ? '#fbbf24' : '#f87171',
                      border: `1px solid ${cable.score<=40 ? 'rgba(74,222,128,.3)' : cable.score<=60 ? 'rgba(251,191,36,.3)' : 'rgba(248,113,113,.3)'}`,
                      fontFamily:"'DM Sans',system-ui,sans-serif",
                    }}>
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

// ── 海缆点击悬浮弹窗 ──────────────────────────────────────────────────────────
function CablePopup({ info, onClose }: { info: CablePopupInfo; onClose: () => void }) {
  const GOLD = '#D4AF37'; const GOLD_LIGHT = '#F0E6C8';
  return (
    <>
      {/* 点击空白关闭 */}
      <div style={{ position:'fixed', inset:0, zIndex:200 }} onClick={onClose} />
      <div style={{
        position:'fixed', left:Math.min(info.x+16, window.innerWidth-340),
        top:Math.max(info.y-60, 12), width:320,
        background:'rgba(8,18,36,.97)', backdropFilter:'blur(20px)',
        border:`1px solid ${GOLD}25`, borderRadius:12, zIndex:201,
        boxShadow:'0 8px 40px rgba(0,0,0,.7)', overflow:'hidden',
        fontFamily:"'DM Sans',system-ui,sans-serif",
      }}>
        {/* 弹窗头 */}
        <div style={{ padding:'12px 16px', borderBottom:`1px solid ${GOLD}12`,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:GOLD_LIGHT }}>
              {info.route.from} → {info.route.to}
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:'monospace', marginTop:2 }}>
              {info.route.path}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none',
            color:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px' }}>×</button>
        </div>

        {/* 海缆列表 */}
        <div style={{ padding:'10px 16px 14px', maxHeight:320, overflowY:'auto' }}>
          <div style={{ fontSize:10, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase',
            color:`${GOLD}70`, marginBottom:10 }}>涉及海缆 ({info.cables.length} 条)</div>
          {info.cables.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 0', borderBottom: i<info.cables.length-1 ? '1px solid rgba(255,255,255,.05)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, overflow:'hidden' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:c.color,
                  boxShadow:`0 0 5px ${c.color}`, flexShrink:0 }} />
                <span style={{ fontSize:12, color:'rgba(255,255,255,.8)', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:10 }}>
                <div style={{ width:40, height:3, background:'rgba(255,255,255,.08)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${c.score}%`, height:'100%', background:c.color, borderRadius:2 }} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:c.color, minWidth:24,
                  textAlign:'right', fontFeatureSettings:'"tnum"' }}>{c.score}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 底部汇总 */}
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${GOLD}10`,
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { l:'最大风险', v:info.route.maxRisk, c:riskColor(info.route.maxRisk) },
            { l:'平均风险', v:info.route.avgRisk, c:riskColor(info.route.avgRisk) },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:700, color:c, fontFeatureSettings:'"tnum"' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

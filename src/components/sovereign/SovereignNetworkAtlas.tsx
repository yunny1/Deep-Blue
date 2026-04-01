'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx
//
// 自主权网络图谱主容器。
// 完全对齐 BRICSDashboard 设计系统（Playfair Display + DM Sans，金色主题，毛玻璃卡片）。
// ⚠️  必须通过 dynamic(..., { ssr: false }) 加载

import { useEffect, useState, useCallback } from 'react';
import SovereignNetworkMap from './SovereignNetworkMap';
import {
  SOVEREIGN_ROUTES, riskColor, safetyCfg,
  type SovereignRoute, type SafetyLevel,
} from '@/lib/sovereign-routes';

const GOLD       = '#D4AF37';
const GOLD_LIGHT = '#F0E6C8';
const GOLD_DIM   = '#D4AF3722';
const NAVY       = '#0A1628';
const CARD_BG    = 'rgba(26,45,74,.5)';
const FLAGS      = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

function Badge({ safety }: { safety: SafetyLevel }) {
  const { bg, text, label } = safetyCfg(safety);
  return <span style={{ background:bg, color:text, fontSize:10, padding:'2px 7px', borderRadius:4, fontWeight:600, whiteSpace:'nowrap', flexShrink:0 }}>{label}</span>;
}

function Dot({ score, size=7 }: { score:number; size?:number }) {
  const c = riskColor(score);
  return <span style={{ width:size, height:size, borderRadius:'50%', background:c, display:'inline-block', flexShrink:0, boxShadow:`0 0 ${size+1}px ${c}60` }} />;
}

function AnimNum({ n, color=GOLD_LIGHT }: { n:number; color?:string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => { const p=Math.min((Date.now()-t0)/1200,1); setV(Math.round(n*(1-Math.pow(1-p,3)))); if(p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [n]);
  return <span style={{ color }}>{v.toLocaleString()}</span>;
}

export default function SovereignNetworkAtlas() {
  const [routes,       setRoutes]       = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [filtered,     setFiltered]     = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');

  const selectedRoute = selectedId ? routes.find(r => r.id === selectedId) ?? null : null;

  useEffect(() => {
    setFiltered(routes.filter(r => {
      if (filterSafety && r.safety !== filterSafety) return false;
      if (filterFrom   && r.from   !== filterFrom)   return false;
      return true;
    }));
  }, [routes, filterSafety, filterFrom]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const ws = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表'); return; }
    const data = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws);
    setRoutes(data.map(r => {
      const path = String(r['路径节点序列'] ?? '');
      return { id:String(r['路径ID']??''), from:String(r['甲方']??''), to:String(r['乙方']??''), path, nodes:path.split(' → '), cables:String(r['各段保留海缆']??''), riskScores:String(r['各段风险评分']??''), maxRisk:Number(r['路径最大单段风险']??0), avgRisk:Number(r['路径平均单段风险']??0), segments:Number(r['保留段数']??0), safety:String(r['是否安全']??'') as SafetyLevel };
    }));
    setSelectedId(null); setFilterSafety(''); setFilterFrom('');
    e.target.value = '';
  };

  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  const totalLow  = routes.filter(r => r.safety==='相对低暴露优先路径'||r.safety==='较优备选路径').length;
  const totalMid  = routes.filter(r => r.safety==='中等暴露路径').length;
  const totalHigh = routes.filter(r => r.safety==='高暴露路径').length;
  const fromOpts  = [...new Set(routes.map(r => r.from))].sort();

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
    .sna{font-family:'DM Sans',system-ui,sans-serif}
    .sna h1,.sna h2{font-family:'Playfair Display',serif}
    @keyframes sna-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    .sna-up{animation:sna-up .55s ease both}
    .sna-card{background:${CARD_BG};border:1px solid ${GOLD_DIM};border-radius:14px;backdrop-filter:blur(12px);transition:all .22s}
    .sna-card:hover{border-color:${GOLD}35;box-shadow:0 0 22px ${GOLD}0d}
    .sna-route{background:transparent;border:1px solid rgba(255,255,255,.06);border-radius:9px;cursor:pointer;margin-bottom:4px;padding:9px 11px;text-align:left;transition:all .13s;width:100%}
    .sna-route:hover{background:rgba(212,175,55,.06);border-color:${GOLD}22}
    .sna-route.sel{background:rgba(212,175,55,.09);border-color:${GOLD}45}
    .sna-sel{background:rgba(26,45,74,.9);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:rgba(255,255,255,.65);font-size:12px;outline:none;padding:7px 9px;transition:border-color .15s;width:100%;font-family:'DM Sans',system-ui,sans-serif}
    .sna-sel:focus{border-color:${GOLD}55}
    .sna ::-webkit-scrollbar{width:5px}
    .sna ::-webkit-scrollbar-track{background:transparent}
    .sna ::-webkit-scrollbar-thumb{background:${GOLD}28;border-radius:3px}
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
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:18, alignItems:'center', justifyContent:'space-between' }}>
            <a href="/brics" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'5px 12px', background:`${GOLD}10`, border:`1px solid ${GOLD}28`, borderRadius:20, textDecoration:'none', fontSize:11, color:'#9CA3AF' }}>← 金砖仪表盘</a>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:`${GOLD}10`, border:`1px solid ${GOLD}28`, borderRadius:8, cursor:'pointer', fontSize:12, color:`${GOLD}CC`, fontWeight:500 }}>
              上传 .xlsx 更新数据
              <input type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleUpload} />
            </label>
          </div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px', background:`${GOLD}08`, border:`1px solid ${GOLD}1e`, borderRadius:20, marginBottom:14 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:GOLD, boxShadow:`0 0 8px ${GOLD}80` }} />
            <span style={{ fontSize:11, color:`${GOLD}BB`, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:600 }}>Strategic Intelligence · 战略情报</span>
          </div>
          <h1 style={{ fontSize:38, fontWeight:800, color:GOLD_LIGHT, margin:'0 0 10px', lineHeight:1.1 }}>自主权网络图谱</h1>
          <p style={{ fontSize:15, color:'rgba(255,255,255,.42)', margin:0, maxWidth:640, lineHeight:1.75 }}>
            主权威胁框架下的金砖可用通信路径 · 排除核心西方体系 · 真实海缆路由 · 最弱链条原则风险评级
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="sna-up" style={{ display:'grid', gridTemplateColumns:'repeat(4,minmax(0,1fr))', gap:14, marginBottom:28, animationDelay:'.08s' }}>
          {[
            { l:'路径总数',   v:routes.length, c:GOLD_LIGHT, s:'覆盖所有国家对' },
            { l:'优先可用',   v:totalLow,       c:'#22C55E',  s:'低暴露 + 较优备选' },
            { l:'中等暴露',   v:totalMid,       c:'#EAB308',  s:'需关注中转节点' },
            { l:'高暴露路径', v:totalHigh,      c:'#EF4444',  s:'含西方核心中转' },
          ].map(({ l, v, c, s }) => (
            <div key={l} className="sna-card" style={{ padding:20, display:'flex', flexDirection:'column', gap:5 }}>
              <span style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80` }}>{l}</span>
              <span style={{ fontSize:32, fontWeight:700, lineHeight:1.1, fontFeatureSettings:'"tnum"' }}><AnimNum n={v} color={c} /></span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,.3)' }}>{s}</span>
            </div>
          ))}
        </div>

        {/* 主体区域 */}
        <div className="sna-up" style={{ display:'flex', gap:16, animationDelay:'.15s', alignItems:'flex-start' }}>

          {/* 侧边栏 */}
          <div style={{ width:264, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* 筛选 */}
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:12 }}>筛选条件</div>
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
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginBottom:4 }}>起点国家</div>
                <select value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="sna-sel">
                  <option value="">全部</option>
                  {fromOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {(filterSafety||filterFrom) && (
                <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:`${GOLD}BB` }}>
                  <span>显示 {filtered.length} / {routes.length}</span>
                  <button onClick={() => { setFilterSafety(''); setFilterFrom(''); }} style={{ background:'none', border:'none', color:`${GOLD}80`, cursor:'pointer', fontSize:13 }}>✕</button>
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
                    <button key={r.id} className={`sna-route${isSel?' sel':''}`} onClick={() => handleSelect(isSel?null:r.id)}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                        <Dot score={r.maxRisk} size={6} />
                        <span style={{ fontSize:12, fontWeight:600, color:isSel?GOLD_LIGHT:'#CBD5E1', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.from} → {r.to}</span>
                        <Badge safety={r.safety} />
                      </div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,.22)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{r.path}</div>
                    </button>
                  );
                })}
            </div>

            {/* 图例 */}
            <div className="sna-card" style={{ padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:10 }}>风险色阶</div>
              {[['#0F6E56','0–20','低风险'],['#639922','21–40','中低'],['#BA7517','41–60','中等'],['#D85A30','61–75','较高'],['#A32D2D','76+','极高']].map(([c,r,d])=>(
                <div key={r} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <span style={{ width:22, height:3, background:c, borderRadius:2, boxShadow:`0 0 5px ${c}55`, flexShrink:0 }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.45)', minWidth:32 }}>{r}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.25)' }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 地图 + 详情 */}
          <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12 }}>

            {/* 选中提示条 */}
            {selectedRoute && (
              <div style={{ padding:'9px 14px', borderRadius:8, background:`${GOLD}0e`, border:`1px solid ${GOLD}28`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, color:GOLD }}>
                  正在查看：{selectedRoute.from} → {selectedRoute.to}
                  <span style={{ color:'rgba(255,255,255,.35)', marginLeft:10 }}>最大风险</span>
                  <span style={{ color:riskColor(selectedRoute.maxRisk), fontWeight:700, marginLeft:4 }}>{selectedRoute.maxRisk}</span>
                </span>
                <button onClick={() => handleSelect(null)} style={{ background:'none', border:'none', color:GOLD, cursor:'pointer', fontSize:16, lineHeight:1 }}>✕</button>
              </div>
            )}

            <SovereignNetworkMap
              height="540px"
              routes={routes}
              selectedRouteId={selectedId}
              onRouteSelect={handleSelect}
            />

            {/* 详情展开面板 */}
            {selectedRoute && (
              <div className="sna-card sna-up" style={{ padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
                  <div>
                    <h2 style={{ fontSize:19, fontWeight:700, color:GOLD_LIGHT, margin:'0 0 4px' }}>{selectedRoute.from} → {selectedRoute.to}</h2>
                    <p style={{ fontSize:11, color:'rgba(255,255,255,.3)', margin:0, fontFamily:'monospace' }}>{selectedRoute.path}</p>
                  </div>
                  <Badge safety={selectedRoute.safety} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,minmax(0,1fr))', gap:10, marginBottom:16 }}>
                  {[
                    { l:'最大段风险', v:selectedRoute.maxRisk,  c:riskColor(selectedRoute.maxRisk) },
                    { l:'平均风险',   v:selectedRoute.avgRisk,  c:riskColor(selectedRoute.avgRisk) },
                    { l:'保留段数',   v:selectedRoute.segments, c:GOLD_LIGHT },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', marginBottom:4, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase' }}>{l}</div>
                      <div style={{ fontSize:28, fontWeight:700, color:c, lineHeight:1, fontFeatureSettings:'"tnum"' }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.06em', textTransform:'uppercase', color:`${GOLD}80`, marginBottom:10 }}>保留海缆明细</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {selectedRoute.cables.split(' | ').map((cable, i) => {
                    const scores = selectedRoute.riskScores.split(' | ').map(Number);
                    const score = scores[i] ?? selectedRoute.maxRisk;
                    const color = riskColor(score);
                    return (
                      <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:6, background:`${color}10`, border:`1px solid ${color}28`, borderRadius:6, padding:'4px 10px', fontSize:11, color:'rgba(255,255,255,.75)', fontFamily:'monospace' }}>
                        <span style={{ width:5, height:5, borderRadius:'50%', background:color, boxShadow:`0 0 5px ${color}`, flexShrink:0 }} />
                        {cable.trim()}
                        <span style={{ color, fontWeight:700, fontSize:10 }}>{score}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="sna-up" style={{ marginTop:40, paddingTop:18, borderTop:`1px solid ${GOLD}0e`, animationDelay:'.3s' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'rgba(255,255,255,.18)', marginBottom:8 }}>
            <span>数据来源：BRICS Transit Analysis · TeleGeography · Submarine Networks</span>
            <span>风险评分：建造商 20% + 运营商 45% + 中转国家 35%</span>
          </div>
          <p style={{ fontSize:10, color:'rgba(255,255,255,.1)', lineHeight:1.6, margin:0, maxWidth:900 }}>
            本图谱展示的路径排除了核心西方体系（SubCom / ASN / AT&T / Google / Meta 等）主导的海缆，风险评级采用最弱链条原则。仅供战略研究参考，不构成外交或政策建议。
          </p>
        </footer>
      </div>
    </div>
  );
}

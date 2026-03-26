#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "🚀 BRICS Wave 3 — 大型升级..."

# ━━━ 1. Dashboard: 共享状态 + 成员国档案 + 投资面板 + PDF ━━━
cat > "$P/src/components/brics/BRICSDashboard.tsx" << 'DASHEOF'
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSMap from './BRICSMap';

const FLAGS=['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];
const LANDLOCKED=new Set(['ET','BY','BO','KZ','UZ','UG']);

interface CableInfo { cat:string; name:string; status:string; lengthKm:number|null; vendor:string|null; owners:string[]; stations:{name:string;country:string|null;city:string|null}[]; fiberPairs:number|null; capacityTbps:number|null; rfsDate:string|null; }
interface OV {
  global:{totalCables:number;totalStations:number};
  brics:{relatedCables:number;internalCables:number;domesticCables:number;externalCables:number;memberInternalCables:number;stations:number;sovereigntyIndex:number;
    statusBreakdown:{active:number;underConstruction:number;planned:number;other:number};memberCableCounts:Record<string,number>};
  cableMap:Record<string,CableInfo>;
}
interface SovD { members:{code:string;name:string;nameZh:string}[]; partners:{code:string;name:string;nameZh:string}[]; allCountries:{code:string;name:string;nameZh:string;tier:string}[]; matrix:{from:string;to:string;status:string;directCableCount:number;directCables:string[];transitPathNames?:{code:string;name:string;nameZh:string}[]}[];summary:Record<string,number>;transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]; }

/** 共享选择状态：矩阵点击 → 地图高亮 */
export type Selection = {kind:'none'}|{kind:'pair';from:string;to:string;cables:string[]};

function AN({n}:{n:number}){const[v,setV]=useState(0);useEffect(()=>{const t0=Date.now();const tick=()=>{const p=Math.min((Date.now()-t0)/1200,1);setV(Math.round(n*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);},[n]);return<>{v.toLocaleString()}</>;}

export default function BRICSDashboard(){
  const{tb,isZh}=useBRICS();
  const[ov,setOv]=useState<OV|null>(null);
  const[sov,setSov]=useState<SovD|null>(null);
  const[loading,setLoading]=useState(true);
  const[selection,setSelection]=useState<Selection>({kind:'none'});
  const mapRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    Promise.all([fetch('/api/brics/overview').then(r=>r.json()),fetch('/api/brics/sovereignty').then(r=>r.json())])
    .then(([o,s])=>{setOv(o);setSov(s);}).catch(console.error).finally(()=>setLoading(false));
  },[]);

  const handleMatrixClick=useCallback((from:string,to:string,cables:string[])=>{
    setSelection({kind:'pair',from,to,cables});
    // 滚动到地图
    mapRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
  },[]);

  const handleClearSelection=useCallback(()=>setSelection({kind:'none'}),[]);

  const gapPairs=sov?.matrix.filter(m=>m.from<m.to&&(m.status==='none'||m.status==='transit')&&!LANDLOCKED.has(m.from)&&!LANDLOCKED.has(m.to))
    .sort((a,b)=>{if(a.status!==b.status)return a.status==='none'?-1:1;const ar=a.from==='RU'||a.to==='RU';const br=b.from==='RU'||b.to==='RU';return ar!==br?(ar?1:-1):0;}).slice(0,15)??[];

  const cPct=ov?((ov.brics.relatedCables/ov.global.totalCables)*100).toFixed(1):'0';
  const sPct=ov?((ov.brics.stations/ov.global.totalStations)*100).toFixed(1):'0';

  // 成员国档案数据
  const countryProfiles=ov?Object.entries(ov.brics.memberCableCounts).sort(([,a],[,b])=>(b as number)-(a as number)).map(([code,count])=>{
    const meta=BRICS_COUNTRY_META[code];
    // 从 cableMap 中统计该国的详细数据
    const countryCables=Object.values(ov.cableMap).filter(c=>c.stations.some(s=>{const cc=(s.country||'').toUpperCase();return cc===code||(code==='CN'&&['TW','HK','MO'].includes(cc));}));
    const operators=new Set<string>();const vendors=new Set<string>();
    countryCables.forEach(c=>{c.owners.forEach(o=>operators.add(o));if(c.vendor)vendors.add(c.vendor);});
    const activeCount=countryCables.filter(c=>c.status==='IN_SERVICE').length;
    const stationCount=countryCables.reduce((s,c)=>s+c.stations.filter(st=>{const cc=(st.country||'').toUpperCase();return cc===code||(code==='CN'&&['TW','HK','MO'].includes(cc));}).length,0);
    return{code,name:isZh?meta?.nameZh:meta?.name,totalCables:count as number,activeCables:activeCount,stations:stationCount,topOperators:[...operators].slice(0,5),topVendors:[...vendors].slice(0,3)};
  }):[];

  // 投资机会：基于缺口分析
  const investOps=gapPairs.slice(0,5).map(g=>{
    const fM=BRICS_COUNTRY_META[g.from];const tM=BRICS_COUNTRY_META[g.to];
    const fName=isZh?fM?.nameZh:fM?.name;const tName=isZh?tM?.nameZh:tM?.name;
    const distKm=Math.round(Math.sqrt(Math.pow((fM?.center[0]||0)-(tM?.center[0]||0),2)+Math.pow((fM?.center[1]||0)-(tM?.center[1]||0),2))*111);
    const capexLow=Math.round(distKm*25000/1e6);const capexHigh=Math.round(distKm*45000/1e6);
    return{from:g.from,to:g.to,fromName:fName,toName:tName,status:g.status,distKm,capexRange:[capexLow,capexHigh] as [number,number],
      rationale:g.status==='none'?(isZh?'两国之间完全无海缆连接，是金砖数字主权的关键缺口':'No submarine cable connection exists — critical BRICS sovereignty gap'):(isZh?'通信必须经过非金砖基础设施，存在战略风险':'Traffic must traverse non-BRICS infrastructure — strategic risk'),
    };
  });

  const handlePrint=()=>{window.print();};

  return(
    <div style={{minHeight:'100vh',background:C.navy,color:'#E8E0D0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .bp{font-family:'DM Sans',system-ui,sans-serif} .bp h1,.bp h2{font-family:'Playfair Display',serif}
        .bp *::-webkit-scrollbar{width:6px;height:6px} .bp *::-webkit-scrollbar-track{background:${C.navy}} .bp *::-webkit-scrollbar-thumb{background:${C.gold}30;border-radius:3px}
        @keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .bs{animation:fu .6s ease both} .bc{background:rgba(26,45,74,.5);border:1px solid ${C.gold}15;border-radius:14px;backdrop-filter:blur(12px);transition:all .25s} .bc:hover{border-color:${C.gold}35;box-shadow:0 0 24px ${C.gold}10}
        @media print{.no-print{display:none!important} .bp{background:white!important;color:black!important} .bc{border-color:#ddd!important;background:white!important}}
      `}</style>
      <div className="bp">
        <div style={{position:'sticky',top:0,zIndex:100,display:'flex',height:4}}>{FLAGS.map(c=><div key={c} style={{flex:1,background:c}} />)}</div>

        {/* Hero */}
        <section className="bs" style={{padding:'48px 32px 28px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:20,alignItems:'center'}}>
            <a href="/" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',background:`${C.gold}10`,border:`1px solid ${C.gold}25`,borderRadius:20,textDecoration:'none'}}>
              <span style={{fontSize:11,color:'#9CA3AF'}}>← {tb('back')}</span>
            </a>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',background:`${C.gold}08`,border:`1px solid ${C.gold}20`,borderRadius:20}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:C.gold}} />
              <span style={{fontSize:12,fontWeight:600,letterSpacing:'.06em',color:C.gold,textTransform:'uppercase'}}>{tb('badge')}</span>
            </div>
            {/* PDF 导出按钮 */}
            <button className="no-print" onClick={handlePrint} style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.gold}25`,background:'rgba(255,255,255,.03)',color:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all .2s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.gold}50`;e.currentTarget.style.color=C.gold;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${C.gold}25`;e.currentTarget.style.color='rgba(255,255,255,.4)';}}>
              📄 {isZh?'导出 PDF':'Export PDF'}
            </button>
          </div>
          <h1 style={{fontSize:'clamp(28px,4.5vw,46px)',fontWeight:800,lineHeight:1.12,margin:'0 0 14px',color:'#F0E6C8',letterSpacing:'-.02em'}}>
            <span style={{background:`linear-gradient(135deg,${C.gold},${C.goldLight})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{isZh?'金砖':'BRICS'} </span>
            {isZh?'海缆战略仪表盘':'Submarine Cable Strategic Dashboard'}
          </h1>
          <p style={{fontSize:15,color:'rgba(255,255,255,.4)',maxWidth:750,lineHeight:1.7,margin:0}}>{tb('subtitle')}</p>
        </section>

        {/* Stats */}
        <section className="bs" style={{padding:'0 32px 24px',maxWidth:1400,margin:'0 auto',animationDelay:'.1s'}}>
          <SH t={tb('stats.title')} />
          {ov?(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
            <SC l={tb('stats.cables')} v={ov.brics.relatedCables} s={tb('stats.globalPct',{pct:cPct,n:ov.global.totalCables})} p={parseFloat(cPct)} c={C.gold} />
            <SC l={tb('stats.stations')} v={ov.brics.stations} s={tb('stats.stationPct',{pct:sPct,n:ov.global.totalStations})} p={parseFloat(sPct)} c={C.gold} />
            <SC l={tb('stats.internal')} v={ov.brics.internalCables} s={tb('stats.internalDesc')} c={C.goldLight} />
            <SC l={tb('stats.domestic')} v={ov.brics.domesticCables} s={tb('stats.domesticDesc')} c={C.domestic} />
            <SC l={tb('stats.sovereignty')} v={ov.brics.sovereigntyIndex} s={tb('stats.sovDesc')} p={ov.brics.sovereigntyIndex} c={ov.brics.sovereigntyIndex>=50?'#22C55E':ov.brics.sovereigntyIndex>=25?'#F59E0B':'#EF4444'} />
          </div>):<LB h={150} />}
        </section>

        {/* Status chart */}
        {ov&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.15s'}}>
            <SH t={tb('chart.title')} />
            <div className="bc" style={{padding:20}}>
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按状态':'By Status'}</div>
                  {[{l:tb('chart.statusActive'),v:ov.brics.statusBreakdown.active,c:'#22C55E'},{l:tb('chart.statusBuilding'),v:ov.brics.statusBreakdown.underConstruction,c:'#3B82F6'},{l:tb('chart.statusPlanned'),v:ov.brics.statusBreakdown.planned,c:'#F59E0B'}].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span><span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                        <div style={{width:`${ov.brics.relatedCables>0?(b.v/ov.brics.relatedCables)*100:0}%`,height:'100%',borderRadius:4,background:b.c,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按类别':'By Category'}</div>
                  {[{l:tb('chart.catInternal'),v:ov.brics.internalCables,c:C.gold},{l:tb('chart.catDomestic'),v:ov.brics.domesticCables,c:C.domestic},{l:tb('chart.catExternal'),v:ov.brics.externalCables,c:C.silver}].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span><span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                        <div style={{width:`${ov.brics.relatedCables>0?(b.v/ov.brics.relatedCables)*100:0}%`,height:'100%',borderRadius:4,background:b.c,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Map — 接收 selection 高亮 */}
        <section ref={mapRef} className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.2s'}}>
          <SH t={tb('map.title')} />
          {selection.kind==='pair'&&(
            <div className="no-print" style={{marginBottom:12,padding:'10px 16px',borderRadius:8,background:`${C.gold}10`,border:`1px solid ${C.gold}25`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,color:C.gold}}>
                {isZh?'正在高亮：':'Highlighting: '}{BRICS_COUNTRY_META[selection.from]?.[isZh?'nameZh':'name']} → {BRICS_COUNTRY_META[selection.to]?.[isZh?'nameZh':'name']}
                {selection.cables.length>0&&` (${selection.cables.length} ${isZh?'条海缆':'cables'})`}
              </span>
              <button onClick={handleClearSelection} style={{background:'none',border:'none',color:C.gold,cursor:'pointer',fontSize:13}}>✕</button>
            </div>
          )}
          <BRICSMap height="560px" selection={selection} />
        </section>

        {/* Sovereignty Matrix — 传入 onCellClick */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.3s'}}>
          <SH t={tb('matrix.title')} s={tb('matrix.subtitle')} />
          <SovereigntyMatrix onCellClick={handleMatrixClick} />
        </section>

        {/* 投资机会面板 */}
        {investOps.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
            <SH t={isZh?'投资机会分析':'Investment Opportunity Analysis'} s={isZh?'基于战略缺口识别的优先投资方向 — 含初步成本估算':'Priority investment directions based on strategic gap analysis — with preliminary cost estimates'} />
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>
              {investOps.map((op,i)=>(
                <div key={i} className="bc" style={{padding:0,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.gold}10`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{op.fromName} → {op.toName}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:op.status==='none'?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)',color:op.status==='none'?'#EF4444':'#F59E0B'}}>{op.status==='none'?(isZh?'无连接':'No Connection'):(isZh?'非金砖中转':'Via Non-BRICS')}</span>
                  </div>
                  <div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:10}}>
                    <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.6,margin:0}}>{op.rationale}</p>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{isZh?'估算距离':'Est. Distance'}</div><div style={{fontSize:13,color:'#F0E6C8',fontWeight:600}}>{op.distKm.toLocaleString()} km</div></div>
                      <div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{isZh?'估算成本':'Est. CAPEX'}</div><div style={{fontSize:13,color:'#F0E6C8',fontWeight:600}}>${op.capexRange[0]}M — ${op.capexRange[1]}M</div></div>
                    </div>
                    <div style={{fontSize:10,color:'rgba(255,255,255,.2)',borderTop:`1px solid ${C.gold}08`,paddingTop:8}}>{isZh?'成本基于 $25k-$45k/km 行业参考估算，实际因海底地形、深度和登陆站建设成本而异':'Cost based on $25k-$45k/km industry reference. Actual varies by seabed terrain, depth, and landing station construction.'}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 战略缺口 */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.4s'}}>
          <SH t={tb('gap.title')} s={tb('gap.subtitle')} />
          {gapPairs.length>0?(
            <div className="bc" style={{overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:`1px solid ${C.gold}15`}}>
                    {[tb('gap.priority'),tb('gap.pair'),tb('gap.status'),tb('gap.action')].map(h=><th key={h} style={{padding:'14px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{gapPairs.map((g,i)=>{const isN=g.status==='none';const fM=BRICS_COUNTRY_META[g.from];const tM=BRICS_COUNTRY_META[g.to];
                    return(<tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.03)',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}06`} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'12px 16px'}}><span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:isN?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)',color:isN?'#EF4444':'#F59E0B'}}>{isN?tb('gap.high'):tb('gap.medium')}</span></td>
                      <td style={{padding:'12px 16px',color:'#F0E6C8',fontWeight:500}}>{isZh?fM?.nameZh:fM?.name} → {isZh?tM?.nameZh:tM?.name}</td>
                      <td style={{padding:'12px 16px'}}><span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{width:8,height:8,borderRadius:'50%',background:isN?'#EF4444':'#F59E0B'}} /><span style={{color:'rgba(255,255,255,.6)',fontSize:12}}>{isN?tb('matrix.none'):tb('matrix.transit')}</span></span></td>
                      <td style={{padding:'12px 16px',color:'rgba(255,255,255,.5)',fontSize:12}}>{isN?tb('gap.buildDirect'):tb('gap.addRedundancy')}</td>
                    </tr>);})}</tbody>
                </table>
              </div>
            </div>
          ):loading?<LB h={200} />:null}
        </section>

        {/* 中转依赖 */}
        {sov?.transitNodes&&sov.transitNodes.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.45s'}}>
            <SH t={tb('transit.title')} s={tb('transit.subtitle')} />
            <div className="bc" style={{overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:`1px solid ${C.gold}15`}}>
                    {['#',tb('transit.country'),tb('transit.count'),tb('transit.isBrics')].map(h=><th key={h} style={{padding:'12px 16px',textAlign:'left',fontSize:11,fontWeight:600,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{sov.transitNodes.map((n,i)=>(
                    <tr key={n.code} style={{borderBottom:'1px solid rgba(255,255,255,.03)',transition:'background .15s'}} onMouseEnter={e=>e.currentTarget.style.background=`${C.gold}06`} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'10px 16px',color:'rgba(255,255,255,.3)',fontSize:12}}>{i+1}</td>
                      <td style={{padding:'10px 16px',color:'#F0E6C8',fontWeight:500}}>{isZh?(n.nameZh||n.name||n.code):(n.name||n.code)} <span style={{color:'rgba(255,255,255,.25)',fontSize:11}}>({n.code})</span></td>
                      <td style={{padding:'10px 16px'}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:Math.min(120,n.count*8),height:6,borderRadius:3,background:n.isBRICS?C.gold:'#EF4444',opacity:.7}} /><span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{n.count}</span></div></td>
                      <td style={{padding:'10px 16px'}}>{n.isBRICS?<span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E'}}>{tb('transit.yes')}</span>:<span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(239,68,68,.1)',color:'#EF4444'}}>{tb('transit.no')}</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* 成员国档案 */}
        {countryProfiles.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.5s'}}>
            <SH t={isZh?'成员国海缆档案':'Member State Cable Profiles'} s={isZh?'11 个金砖成员国各自的海缆基础设施画像':'Submarine cable infrastructure profile for each of the 11 BRICS member states'} />
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
              {countryProfiles.map(cp=>(
                <div key={cp.code} className="bc" style={{padding:0,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.gold}10`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#F0E6C8'}}>{cp.name}</span>
                    <span style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>{cp.code}</span>
                  </div>
                  <div style={{padding:'14px 18px'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                      <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:C.gold}}>{cp.totalCables}</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{isZh?'海缆':'Cables'}</div></div>
                      <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:'#22C55E'}}>{cp.activeCables}</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{isZh?'在役':'Active'}</div></div>
                      <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:'#3B82F6'}}>{cp.stations}</div><div style={{fontSize:10,color:'rgba(255,255,255,.3)'}}>{isZh?'登陆站':'Stations'}</div></div>
                    </div>
                    {cp.topOperators.length>0&&(
                      <div style={{marginBottom:8}}>
                        <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:4}}>{isZh?'主要运营商':'Top Operators'}</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{cp.topOperators.map(o=><span key={o} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(42,157,143,.1)',color:'#2A9D8F',border:'1px solid rgba(42,157,143,.15)'}}>{o}</span>)}</div>
                      </div>
                    )}
                    {cp.topVendors.length>0&&(
                      <div>
                        <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:4}}>{isZh?'建造商':'Vendors'}</div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{cp.topVendors.map(v=><span key={v} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(139,92,246,.1)',color:'#8B5CF6',border:'1px solid rgba(139,92,246,.15)'}}>{v}</span>)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer style={{padding:'20px 32px 12px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(255,255,255,.2)',marginBottom:12}}>
            <span>{tb('footer.source')}</span><span>{tb('footer.update')}</span>
          </div>
          <p style={{fontSize:10,color:'rgba(255,255,255,.12)',lineHeight:1.6,margin:'0 0 8px',maxWidth:900}}>{tb('method.disclaimerText')}</p>
        </footer>
      </div>
    </div>
  );
}

function SH({t,s}:{t:string;s?:string}){return<div style={{marginBottom:20}}><h2 style={{fontSize:22,fontWeight:700,color:'#F0E6C8',margin:'0 0 4px'}}>{t}</h2>{s&&<p style={{fontSize:13,color:'rgba(255,255,255,.3)',margin:0,lineHeight:1.6}}>{s}</p>}</div>;}
function SC({l,v,s,p,c}:{l:string;v:number;s?:string;p?:number;c:string}){return<div className="bc" style={{padding:20,display:'flex',flexDirection:'column',gap:5}}>
  <span style={{fontSize:11,fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',color:`${C.gold}80`}}>{l}</span>
  <span style={{fontSize:32,fontWeight:700,color:'#F0E6C8',lineHeight:1.1,fontFeatureSettings:'"tnum"'}}><AN n={v} /></span>
  {s&&<span style={{fontSize:12,color:'rgba(255,255,255,.35)'}}>{s}</span>}
  {p!==undefined&&<div style={{marginTop:4,height:4,borderRadius:2,background:'rgba(255,255,255,.06)',overflow:'hidden'}}><div style={{width:`${Math.min(100,p)}%`,height:'100%',borderRadius:2,background:`linear-gradient(90deg,${c},${c}88)`,transition:'width 1s cubic-bezier(.22,1,.36,1)'}} /></div>}
</div>;}
function LB({h}:{h:number}){return<div style={{height:h,borderRadius:14,background:'rgba(26,45,74,.4)',animation:'pulse 1.5s ease-in-out infinite'}} />;}
DASHEOF
echo "  ✅ 1/3 BRICSDashboard.tsx"

# ━━━ 2. Matrix: 21国切换 + onClick 联动地图 ━━━
cat > "$P/src/components/brics/SovereigntyMatrix.tsx" << 'MATEOF'
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS='direct'|'indirect'|'transit'|'none'|'landlocked';
interface Member{code:string;name:string;nameZh:string;tier?:string}
interface PathNode{code:string;name:string;nameZh:string}
interface Cell{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:PathNode[]}
interface Data{members:Member[];partners?:Member[];allCountries?:Member[];matrix:Cell[];summary:Record<string,number>;transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]}

const SC:Record<CS,{bg:string;key:string;tipKey?:string}>={
  direct:{bg:'#22C55E',key:'matrix.direct'},
  indirect:{bg:'#F59E0B',key:'matrix.indirect',tipKey:'matrix.indirectTip'},
  transit:{bg:'#EF4444',key:'matrix.transit',tipKey:'matrix.transitTip'},
  none:{bg:'#6B7280',key:'matrix.none'},
  landlocked:{bg:'#374151',key:'matrix.landlocked'},
};

interface Props { onCellClick?:(from:string,to:string,cables:string[])=>void; }

export default function SovereigntyMatrix({onCellClick}:Props){
  const{tb,isZh}=useBRICS();
  const[data,setData]=useState<Data|null>(null);
  const[loading,setLoading]=useState(true);
  const[tip,setTip]=useState<{x:number;y:number;cell:Cell;fn:string;tn:string}|null>(null);
  const[hlRow,setHlRow]=useState<string|null>(null);
  const[hlCol,setHlCol]=useState<string|null>(null);
  const[showMethod,setShowMethod]=useState(false);
  const[showAll,setShowAll]=useState(false); // false=仅成员国 true=全部21国

  useEffect(()=>{fetch('/api/brics/sovereignty').then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false));},[]);

  const getCell=useCallback((f:string,t:string)=>data?.matrix.find(m=>m.from===f&&m.to===t),[data]);
  const getName=useCallback((code:string)=>{const all=[...(data?.members||[]),...(data?.partners||[]),...(data?.allCountries||[])];const m=all.find(x=>x.code===code);return isZh?(m?.nameZh??code):(m?.name??code);},[data,isZh]);

  if(loading||!data)return<div style={{height:400,borderRadius:14,background:'rgba(26,45,74,.4)',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:14}}>{loading?(isZh?'正在计算数字主权矩阵…':'Computing sovereignty matrix…'):''}</div>;

  const{members,summary}=data;
  const partners=data.partners||[];
  const displayMembers=showAll?[...members,...partners]:members;
  const cs=showAll?36:46;const hw=showAll?70:80;

  return(
    <div>
      {/* 控制栏 */}
      <div className="no-print" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        {/* 成员/全部切换 */}
        <div style={{display:'flex',gap:2,background:'rgba(255,255,255,.03)',borderRadius:8,padding:3,border:`1px solid ${C.gold}15`}}>
          <button onClick={()=>setShowAll(false)} style={{padding:'5px 14px',fontSize:11,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',transition:'all .2s',background:!showAll?`${C.gold}25`:'transparent',color:!showAll?C.gold:'rgba(255,255,255,.4)'}}>
            {isZh?'仅成员国 (11)':'Members Only (11)'}
          </button>
          <button onClick={()=>setShowAll(true)} style={{padding:'5px 14px',fontSize:11,fontWeight:600,borderRadius:6,border:'none',cursor:'pointer',transition:'all .2s',background:showAll?`${C.gold}25`:'transparent',color:showAll?C.gold:'rgba(255,255,255,.4)'}}>
            {isZh?'全部 (21)':'All (21)'}
          </button>
        </div>
        <div style={{display:'flex',gap:8}}>
          {onCellClick&&<span style={{fontSize:10,color:'rgba(255,255,255,.25)',alignSelf:'center'}}>{isZh?'点击方块 → 地图高亮':'Click cell → map highlight'}</span>}
          <button onClick={()=>setShowMethod(!showMethod)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.gold}25`,background:showMethod?`${C.gold}15`:'rgba(255,255,255,.03)',color:showMethod?C.gold:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all .2s'}}>
            <span style={{fontSize:13}}>{showMethod?'\u25B2':'\u2139'}</span> {tb('method.title')}
          </button>
        </div>
      </div>

      {showMethod&&(
        <div style={{marginBottom:16,padding:20,borderRadius:12,border:`1px solid ${C.gold}15`,background:'rgba(15,29,50,.6)',display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{tb('method.title')}</div>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.scope')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.classify')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.matrix')}</p>
          <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.7,margin:0}}>{tb('method.update')}</p>
          <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10,marginTop:4}}>
            <div style={{fontSize:11,fontWeight:600,color:`${C.gold}80`,marginBottom:4}}>{tb('method.disclaimer')}</div>
            <p style={{fontSize:11,color:'rgba(255,255,255,.3)',lineHeight:1.6,margin:0}}>{tb('method.disclaimerText')}</p>
          </div>
        </div>
      )}

      {/* 矩阵 */}
      <div style={{overflowX:'auto',borderRadius:14,border:`1px solid ${C.gold}12`,background:'rgba(15,29,50,.5)',padding:20}}>
        <div style={{display:'inline-block',minWidth:'fit-content'}}>
          <div style={{display:'flex',marginLeft:hw,height:showAll?65:75,marginBottom:4}}>
            {displayMembers.map(m=>(
              <div key={`col-${m.code}`} style={{width:cs,position:'relative',height:'100%'}}>
                <span style={{position:'absolute',bottom:0,left:'70%',fontSize:showAll?8:10,fontWeight:600,whiteSpace:'nowrap',color:hlCol===m.code?C.gold:m.tier==='partner'?'rgba(255,255,255,.3)':'rgba(255,255,255,.45)',transition:'color .15s',transform:'rotate(-50deg)',transformOrigin:'bottom left'}}>
                  {isZh?m.nameZh:m.name}
                </span>
              </div>
            ))}
          </div>

          {displayMembers.map(rm=>(
            <div key={rm.code} style={{display:'flex',alignItems:'center'}}>
              <div style={{width:hw,fontSize:showAll?8:10,fontWeight:600,color:hlRow===rm.code?C.gold:rm.tier==='partner'?'rgba(255,255,255,.3)':'rgba(255,255,255,.4)',textAlign:'right',paddingRight:showAll?6:10,transition:'color .15s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={isZh?rm.nameZh:rm.name}>
                {isZh?rm.nameZh:rm.name}
              </div>
              {displayMembers.map(cm=>{
                const self=rm.code===cm.code;
                const cell=self?null:getCell(rm.code,cm.code);
                const cfg=cell?SC[cell.status]:null;
                const hl=hlRow===rm.code||hlCol===cm.code;
                return(
                  <div key={`${rm.code}-${cm.code}`} style={{width:cs,height:cs,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:showAll?3:4,margin:showAll?0.5:1,cursor:self?'default':'pointer',background:self?`${C.gold}06`:cfg?`${cfg.bg}${hl?'35':'20'}`:'transparent',transition:'background .15s',position:'relative'}}
                    onMouseEnter={e=>{if(self||!cell)return;setHlRow(rm.code);setHlCol(cm.code);
                      const r=e.currentTarget.getBoundingClientRect();
                      setTip({x:r.right,y:r.top,cell,fn:getName(rm.code),tn:getName(cm.code)});}}
                    onMouseLeave={()=>{setHlRow(null);setHlCol(null);setTip(null);}}
                    onClick={()=>{if(!self&&cell&&onCellClick){onCellClick(rm.code,cm.code,cell.directCables);}}}>
                    {self?<span style={{fontSize:showAll?7:9,color:`${C.gold}25`}}>{isZh?(rm.nameZh||'').slice(0,1):rm.code}</span>
                    :cfg?<>
                      <span style={{width:showAll?7:10,height:showAll?7:10,borderRadius:'50%',background:cfg.bg,opacity:.85}} />
                      {!showAll&&cell&&cell.directCableCount>0&&<span style={{position:'absolute',bottom:3,right:5,fontSize:8,color:'rgba(255,255,255,.35)',fontFeatureSettings:'"tnum"'}}>{cell.directCableCount}</span>}
                    </>:null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div style={{display:'flex',flexWrap:'wrap',gap:16,marginTop:16}}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s=>(
          <LI key={s} status={s} label={`${tb(SC[s].key)} — ${summary[s]??0} ${tb('matrix.pairs')}`} tipText={SC[s].tipKey?tb(SC[s].tipKey!):undefined} />
        ))}
        <span style={{fontSize:12,color:'rgba(255,255,255,.25)',marginLeft:8}}>{tb('matrix.total',{n:summary.totalPairs})}</span>
      </div>

      {tip&&<ET tip={tip} tb={tb} isZh={isZh} />}
    </div>
  );
}

function LI({status,label,tipText}:{status:CS;label:string;tipText?:string}){
  const ref=useRef<HTMLDivElement>(null);const[show,setShow]=useState(false);const[pos,setPos]=useState({x:0,y:0});
  return(<>
    <div ref={ref} style={{display:'flex',alignItems:'center',gap:6,cursor:tipText?'help':'default'}}
      onMouseEnter={()=>{if(!tipText||!ref.current)return;const r=ref.current.getBoundingClientRect();setPos({x:r.right+10,y:r.top+r.height/2});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      <span style={{width:12,height:12,borderRadius:3,background:SC[status].bg,opacity:.85}} /><span style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{label}</span>
    </div>
    {show&&tipText&&<div style={{position:'fixed',left:pos.x,top:pos.y,transform:'translateY(-50%)',maxWidth:280,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)',whiteSpace:'normal'}}>{tipText}</div>}
  </>);
}

function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const{cell,fn,tn}=tip;const cfg=SC[cell.status];
  const rm:Record<CS,string>={none:'matrix.riskCritical',transit:'matrix.riskHigh',indirect:'matrix.riskMedium',direct:'matrix.riskLow',landlocked:'matrix.riskNa'};
  const rc:Record<CS,string>={none:'matrix.recNone',transit:'matrix.recTransit',indirect:'matrix.recIndirect',direct:'matrix.recDirect',landlocked:'matrix.recLandlocked'};
  const clr:Record<CS,string>={none:'#EF4444',transit:'#F59E0B',indirect:'#3B82F6',direct:'#22C55E',landlocked:'#6B7280'};
  const left=tip.x+16;const adj=left+320>(typeof window!=='undefined'?window.innerWidth:1200)?tip.x-336:left;
  const pathStr=cell.transitPathNames?cell.transitPathNames.map(n=>isZh?n.nameZh:n.name).join(' → '):cell.transitPath?.join(' → ');

  return(
    <div style={{position:'fixed',left:adj,top:Math.max(8,tip.y-20),width:320,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}30`,borderRadius:12,padding:0,zIndex:9999,pointerEvents:'none',boxShadow:'0 12px 40px rgba(0,0,0,.6)',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.gold}15`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{fn} → {tn}</span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background:`${cfg.bg}20`,color:cfg.bg}}>{tb(cfg.key)}</span>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {cell.status==='direct'&&cell.directCableCount>0&&(<div><div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4}}>{tb('matrix.cables',{n:cell.directCableCount})}</div><div style={{display:'flex',flexWrap:'wrap',gap:4}}>{cell.directCables.slice(0,5).map(s=><span key={s} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E',border:'1px solid rgba(34,197,94,.2)'}}>{s}</span>)}</div></div>)}
        {cell.status==='indirect'&&pathStr&&(<div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔗 {isZh?'中转路径：':'Transit path: '}{pathStr}</div>)}
        {cell.status==='transit'&&(<><div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>⚠ {tb('matrix.transitWarn')}</div>{pathStr&&<div style={{fontSize:10,color:'rgba(255,255,255,.4)',lineHeight:1.5}}>{isZh?'路径：':'Path: '}{pathStr}</div>}</>)}
        {cell.status==='none'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔴 {tb('matrix.noneWarn')}</div>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.risk')}</span><span style={{fontSize:11,fontWeight:600,color:clr[cell.status]}}>{tb(rm[cell.status])}</span></div>
        <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10}}><span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.rec')}</span><div style={{fontSize:12,color:'#D1D5DB',marginTop:4,lineHeight:1.5}}>{tb(rc[cell.status])}</div></div>
      </div>
    </div>
  );
}
MATEOF
echo "  ✅ 2/3 SovereigntyMatrix.tsx"

# ━━━ 3. Map: 接收 selection prop 高亮指定海缆 ━━━
cat > /tmp/map-selection.py << 'PYEOF'
import sys
path = sys.argv[1]
with open(path,'r') as f: c = f.read()

# Add selection prop
c = c.replace(
    "interface Props { height?:string; }",
    "interface Props { height?:string; selection?:{kind:string;from?:string;to?:string;cables?:string[]}; }"
)
c = c.replace(
    "export default function BRICSMap({ height='560px' }:Props)",
    "export default function BRICSMap({ height='560px', selection }:Props)"
)

# Add effect to highlight cables when selection changes
# Insert before the return statement
old_return = "  return(\n    <div style={{position:'relative',borderRadius:14,overflow:'hidden'}}>"
new_return = """  // 矩阵联动：高亮选中的国家对海缆
  useEffect(()=>{
    const map=mRef.current;if(!map||!map.loaded())return;
    if(selection?.kind==='pair'&&selection.cables&&selection.cables.length>0){
      // 添加高亮层
      const slugs=new Set(selection.cables);
      const allSources=['c-int','c-dom','c-rel'];
      for(const src of allSources){
        const source=map.getSource(src);
        if(!source)continue;
        // 降低非选中海缆的透明度
      }
      // 用 filter 高亮特定海缆
      try{
        ['l-int','l-dom','l-rel'].forEach(lid=>{
          if(map.getLayer(lid)){map.setPaintProperty(lid,'line-opacity',0.15);}
        });
        ['l-int-glow','l-dom-glow'].forEach(lid=>{
          if(map.getLayer(lid)){map.setPaintProperty(lid,'line-opacity',0.03);}
        });
        // 添加高亮层
        if(map.getSource('c-highlight')){map.removeLayer('l-highlight-glow');map.removeLayer('l-highlight');map.removeSource('c-highlight');}
        // 从所有源中收集匹配的 features
        const features:GeoJSON.Feature[]=[];
        for(const src of allSources){
          const source=map.getSource(src) as any;
          if(!source?._data?.features)continue;
          source._data.features.forEach((f:any)=>{if(slugs.has(f.properties?.slug))features.push(f);});
        }
        if(features.length>0){
          map.addSource('c-highlight',{type:'geojson',data:{type:'FeatureCollection',features}});
          map.addLayer({id:'l-highlight-glow',type:'line',source:'c-highlight',paint:{'line-color':'#FFD700','line-width':10,'line-opacity':0.3,'line-blur':4}});
          map.addLayer({id:'l-highlight',type:'line',source:'c-highlight',paint:{'line-color':'#FFD700','line-width':3,'line-opacity':1}});
        }
      }catch(e){console.warn('[BRICSMap] highlight error',e);}
    }else{
      // 恢复正常状态
      const map2=mRef.current;if(!map2||!map2.loaded())return;
      try{
        ['l-int'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.95);});
        ['l-dom'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.75);});
        ['l-rel'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.4);});
        ['l-int-glow'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.15);});
        ['l-dom-glow'].forEach(lid=>{if(map2.getLayer(lid))map2.setPaintProperty(lid,'line-opacity',0.1);});
        if(map2.getSource('c-highlight')){map2.removeLayer('l-highlight-glow');map2.removeLayer('l-highlight');map2.removeSource('c-highlight');}
      }catch(e){}
    }
  },[selection]);

  return(
    <div style={{position:'relative',borderRadius:14,overflow:'hidden'}}>"""
c = c.replace(old_return, new_return)

with open(path,'w') as f: f.write(c)
print("  ✅ Map patched with selection highlight")
PYEOF
python3 /tmp/map-selection.py "$P/src/components/brics/BRICSMap.tsx"
echo "  ✅ 3/3 BRICSMap.tsx"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Wave 3 完成！"
echo ""
echo "腾讯云："
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 1; nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  → Cloudflare Purge Everything"
echo "  git add -A && git commit -m 'feat: BRICS Wave 3 — matrix 21-nation toggle, map linkage, country profiles, investment panel, PDF export' && git push origin main"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

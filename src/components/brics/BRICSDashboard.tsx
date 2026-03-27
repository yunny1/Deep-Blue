'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_MEMBERS, BRICS_ALL, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSInvestmentPanel from './BRICSInvestmentPanel';
import { estimateSubseaCapex, formatUsd, INDUSTRY_BENCHMARKS, SENSITIVITY_ITEMS } from '@/lib/subsea-cost-model';
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
  const countryProfiles=ov?[...BRICS_ALL].map(code=>{
    const count=(ov.brics.memberCableCounts[code]||0) as number;
    return {code,count};
  }).sort((a,b)=>b.count-a.count).map(({code,count})=>{
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

                <BRICSInvestmentPanel isZh={isZh} tb={tb} />

        

        {/* 成员国档案 */}
        {countryProfiles.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.5s'}}>
            <SH t={tb('profile.title')} s={tb('profile.subtitle')} />
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}}>
              {countryProfiles.map(cp=>(
                <div key={cp.code} className="bc" style={{padding:0,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.gold}10`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#F0E6C8'}}>{cp.name}</span>
                    <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:BRICS_MEMBERS.includes(cp.code as any)?'rgba(212,175,55,.1)':'rgba(139,149,165,.1)',color:BRICS_MEMBERS.includes(cp.code as any)?C.gold:C.silver}}>{BRICS_MEMBERS.includes(cp.code as any)?(isZh?'成员国':'Member'):(isZh?'伙伴国':'Partner')}</span>
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

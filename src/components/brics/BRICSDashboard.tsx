'use client';
import { useEffect, useState } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import SovereigntyMatrix from './SovereigntyMatrix';
import BRICSMap from './BRICSMap';

const FLAGS = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];
const LANDLOCKED = new Set(['ET']);

interface OV {
  global:{totalCables:number;totalStations:number};
  brics:{relatedCables:number;internalCables:number;domesticCables:number;externalCables:number;memberInternalCables:number;stations:number;sovereigntyIndex:number;
    statusBreakdown:{active:number;underConstruction:number;planned:number;other:number};memberCableCounts:Record<string,number>};
}
interface SovD { matrix:{from:string;to:string;status:string;directCableCount:number;directCables:string[];transitPath?:string[]}[];summary:Record<string,number>;transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]; }

function AN({n}:{n:number}){const[v,setV]=useState(0);useEffect(()=>{const t0=Date.now();const tick=()=>{const p=Math.min((Date.now()-t0)/1200,1);setV(Math.round(n*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);},[n]);return<>{v.toLocaleString()}</>;}

export default function BRICSDashboard() {
  const{tb,isZh}=useBRICS();
  const[ov,setOv]=useState<OV|null>(null);
  const[sov,setSov]=useState<SovD|null>(null);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([fetch('/api/brics/overview').then(r=>r.json()),fetch('/api/brics/sovereignty').then(r=>r.json())])
    .then(([o,s])=>{setOv(o);setSov(s);}).catch(console.error).finally(()=>setLoading(false));
  },[]);

  // 缺口分析：排除内陆国，优先显示非俄罗斯的缺口
  const gapPairs = sov?.matrix
    .filter(m => m.from < m.to && (m.status === 'none' || m.status === 'transit') && !LANDLOCKED.has(m.from) && !LANDLOCKED.has(m.to))
    .sort((a, b) => {
      // 优先级：none > transit
      if (a.status !== b.status) return a.status === 'none' ? -1 : 1;
      // 同优先级内：非俄罗斯对优先
      const aHasRU = a.from === 'RU' || a.to === 'RU';
      const bHasRU = b.from === 'RU' || b.to === 'RU';
      if (aHasRU !== bHasRU) return aHasRU ? 1 : -1;
      return 0;
    })
    .slice(0, 15) ?? [];

  const cPct=ov?((ov.brics.relatedCables/ov.global.totalCables)*100).toFixed(1):'0';
  const sPct=ov?((ov.brics.stations/ov.global.totalStations)*100).toFixed(1):'0';

  return (
    <div style={{minHeight:'100vh',background:C.navy,color:'#E8E0D0'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .bp{font-family:'DM Sans',system-ui,sans-serif} .bp h1,.bp h2{font-family:'Playfair Display',serif}
        .bp *::-webkit-scrollbar{width:6px;height:6px} .bp *::-webkit-scrollbar-track{background:${C.navy}} .bp *::-webkit-scrollbar-thumb{background:${C.gold}30;border-radius:3px} .bp *::-webkit-scrollbar-thumb:hover{background:${C.gold}60}
        @keyframes fu{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .bs{animation:fu .6s ease both} .bc{background:rgba(26,45,74,.5);border:1px solid ${C.gold}15;border-radius:14px;backdrop-filter:blur(12px);transition:all .25s} .bc:hover{border-color:${C.gold}35;box-shadow:0 0 24px ${C.gold}10}
      `}</style>
      <div className="bp">
        <div style={{display:'flex',height:4}}>{FLAGS.map(c=><div key={c} style={{flex:1,background:c}} />)}</div>

        {/* Hero — 去掉了台湾/港澳注释 */}
        <section className="bs" style={{padding:'48px 32px 28px',maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:20}}>
            <a href="/" style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',background:`${C.gold}10`,border:`1px solid ${C.gold}25`,borderRadius:20,textDecoration:'none'}}>
              <span style={{fontSize:11,color:'#9CA3AF'}}>← {tb('back')}</span>
            </a>
            <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 14px',background:`${C.gold}08`,border:`1px solid ${C.gold}20`,borderRadius:20}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:C.gold}} />
              <span style={{fontSize:12,fontWeight:600,letterSpacing:'.06em',color:C.gold,textTransform:'uppercase'}}>{tb('badge')}</span>
            </div>
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

        {/* Status chart — 去掉"其他"和合计公式 */}
        {ov && (
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.15s'}}>
            <SH t={tb('chart.title')} />
            <div className="bc" style={{padding:20}}>
              <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按状态':'By Status'}</div>
                  {[
                    {l:tb('chart.statusActive'),v:ov.brics.statusBreakdown.active,c:'#22C55E'},
                    {l:tb('chart.statusBuilding'),v:ov.brics.statusBreakdown.underConstruction,c:'#3B82F6'},
                    {l:tb('chart.statusPlanned'),v:ov.brics.statusBreakdown.planned,c:'#F59E0B'},
                  ].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span>
                        <span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
                      </div>
                      <div style={{height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                        <div style={{width:`${ov.brics.relatedCables>0?(b.v/ov.brics.relatedCables)*100:0}%`,height:'100%',borderRadius:4,background:b.c,transition:'width 1s ease'}} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{flex:1,minWidth:260}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>{isZh?'按类别':'By Category'}</div>
                  {[
                    {l:tb('chart.catInternal'),v:ov.brics.internalCables,c:C.gold},
                    {l:tb('chart.catDomestic'),v:ov.brics.domesticCables,c:C.domestic},
                    {l:tb('chart.catExternal'),v:ov.brics.externalCables,c:C.silver},
                  ].map(b=>(
                    <div key={b.l} style={{marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:'rgba(255,255,255,.6)'}}>{b.l}</span>
                        <span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{b.v}</span>
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

        {/* Map */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.2s'}}>
          <SH t={tb('map.title')} />
          <BRICSMap height="560px" />
        </section>

        {/* Sovereignty */}
        <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.3s'}}>
          <SH t={tb('matrix.title')} s={tb('matrix.subtitle')} />
          <SovereigntyMatrix />
        </section>

        {/* Gap — 过滤内陆国，非俄罗斯优先 */}
        <section className="bs" style={{padding:'0 32px 48px',maxWidth:1400,margin:'0 auto',animationDelay:'.4s'}}>
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
                    </tr>);
                  })}</tbody>
                </table>
              </div>
            </div>
          ):loading?<LB h={200} />:null}
        </section>

        {/* Transit Dependency */}
        {sov?.transitNodes && sov.transitNodes.length > 0 && (
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
                      <td style={{padding:'10px 16px',color:'#F0E6C8',fontWeight:500}}>{isZh?n.nameZh:n.name} <span style={{color:'rgba(255,255,255,.25)',fontSize:11}}>({n.code})</span></td>
                      <td style={{padding:'10px 16px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:Math.min(120,n.count*8),height:6,borderRadius:3,background:n.isBRICS?C.gold:'#EF4444',opacity:0.7,transition:'width .8s ease'}} />
                          <span style={{color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"'}}>{n.count}</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 16px'}}>
                        {n.isBRICS?<span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E'}}>{tb('transit.yes')}</span>
                        :<span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:'rgba(239,68,68,.1)',color:'#EF4444'}}>{tb('transit.no')} — {tb('transit.warn')}</span>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* 成员国海缆排行 */}
        {ov && (
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.5s'}}>
            <SH t={isZh?'成员国海缆实力':'Member State Cable Strength'} s={isZh?'各成员国涉及的海缆数量排行':'Number of cables connected to each member state'} />
            <div className="bc" style={{padding:20}}>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {Object.entries(ov.brics.memberCableCounts)
                  .sort(([,a],[,b])=>(b as number)-(a as number))
                  .map(([code,count])=>{
                    const meta=BRICS_COUNTRY_META[code];
                    const maxCount=Math.max(...Object.values(ov.brics.memberCableCounts));
                    return(
                      <div key={code} style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:90,fontSize:12,color:'#F0E6C8',fontWeight:500,textAlign:'right',flexShrink:0}}>{isZh?meta?.nameZh:meta?.name}</div>
                        <div style={{flex:1,height:8,borderRadius:4,background:'rgba(255,255,255,.04)',overflow:'hidden'}}>
                          <div style={{width:`${maxCount>0?((count as number)/maxCount)*100:0}%`,height:'100%',borderRadius:4,background:`linear-gradient(90deg,${C.gold},${C.gold}88)`,transition:'width 1s ease'}} />
                        </div>
                        <div style={{width:36,fontSize:12,color:'#F0E6C8',fontWeight:600,fontFeatureSettings:'"tnum"',textAlign:'right'}}>{count as number}</div>
                      </div>
                    );
                  })}
              </div>
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

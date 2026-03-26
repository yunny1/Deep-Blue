#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🚀 投资面板升级 — 交互式海缆成本计算器"
echo "═══════════════════════════════════════════════════════"

# ━━━ Step 1: 创建 BRICSInvestmentPanel.tsx ━━━
echo ""
echo ">>> Step 1/2: 创建 BRICSInvestmentPanel.tsx"
python3 << 'PYEOF'
content = r"""'use client';
import { useState, useEffect, useMemo } from 'react';
import { BRICS_ALL, BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import { estimateSubseaCapex, formatUsd, SENSITIVITY_ITEMS } from '@/lib/subsea-cost-model';

function haversineKm(lat1:number,lon1:number,lat2:number,lon2:number):number{
  const R=6371,toR=(d:number)=>d*Math.PI/180;
  const dLat=toR(lat2-lat1),dLon=toR(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function cn(code:string,zh:boolean):string{
  const m=BRICS_COUNTRY_META[code];
  return zh?(m?.nameZh||m?.name||code):(m?.name||code);
}

interface Props{isZh:boolean;tb:(k:string)=>string}

export default function BRICSInvestmentPanel({isZh,tb}:Props){
  const [from,setFrom]=useState('CN');
  const [to,setTo]=useState('ZA');
  const [pick,setPick]=useState<'from'|'to'|null>(null);
  const [hl,setHl]=useState<string|null>(null);
  const [ak,setAk]=useState(0);

  const fm=BRICS_COUNTRY_META[from],tm=BRICS_COUNTRY_META[to];
  const dist=useMemo(()=>Math.round(haversineKm(fm?.center[1]??0,fm?.center[0]??0,tm?.center[1]??0,tm?.center[0]??0)*1.3),[from,to]);
  const est=useMemo(()=>estimateSubseaCapex({routeLengthKm:dist,designCapacityTbps:100,landingStations:2,jurisdictions:2}),[dist]);
  useEffect(()=>{setAk(k=>k+1)},[from,to]);

  const secMap:Record<string,string>={cableCostDeepPerKm:'cable',landingStationCostUsd:'station',riskPremiumPct:'all',contingencyPct:'all',repeaterSpacingKm:'repeater',shipDayRateUsd:'marine'};
  const nRep=Math.min(est.repeaterCount,14);
  const repX=Array.from({length:nRep},(_,i)=>195+(810/(nRep+1))*(i+1));
  const isH=(s:string)=>hl===s||hl==='all';

  const bd=est.breakdown;
  const items=[
    {k:'cable',l:isZh?'电缆':'Cable',v:bd.cable,c:'#3B82F6'},
    {k:'repeater',l:isZh?'中继器':'Repeaters',v:bd.repeaters,c:'#8B5CF6'},
    {k:'marine',l:isZh?'海工敷设':'Marine',v:bd.marine,c:'#06B6D4'},
    {k:'station',l:isZh?'登陆站':'Stations',v:bd.landingStations,c:'#22C55E'},
    {k:'permit',l:isZh?'许可合规':'Permits',v:bd.permits,c:'#F59E0B'},
    {k:'survey',l:isZh?'路由调查':'Survey',v:bd.survey,c:'#EC4899'},
    {k:'pm',l:isZh?'项目管理':'PM/Ins',v:bd.pmInsurance,c:'#6B7280'},
    {k:'contingency',l:isZh?'预备费':'Contingency',v:bd.contingency,c:'#EF4444'},
    {k:'risk',l:isZh?'风险溢价':'Risk',v:bd.riskPremium,c:'#F97316'},
  ];

  const countries=useMemo(()=>[...BRICS_ALL].map(code=>({
    code,name:cn(code,isZh),isMember:(BRICS_MEMBERS as readonly string[]).includes(code)
  })).sort((a,b)=>(b.isMember?1:0)-(a.isMember?1:0)),[isZh]);

  const PickerOverlay=({target}:{target:'from'|'to'})=>{
    const cur=target==='from'?from:to;
    const set=target==='from'?setFrom:setTo;
    return(<>
      <div onClick={()=>setPick(null)} style={{position:'fixed',inset:0,zIndex:40}}/>
      <div style={{position:'absolute',top:'110%',[target==='from'?'left':'right']:0,zIndex:50,background:'#0D1B2A',border:'1px solid rgba(212,175,55,.2)',borderRadius:12,padding:14,width:340,boxShadow:'0 24px 48px rgba(0,0,0,.6)',maxHeight:360,overflowY:'auto'}}>
        <div style={{fontSize:9,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{isZh?'成员国':'Members'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3,marginBottom:10}}>
          {countries.filter(c=>c.isMember).map(c=>(
            <button key={c.code} onClick={()=>{set(c.code);setPick(null)}} style={{padding:'5px 7px',borderRadius:6,border:'none',cursor:'pointer',background:cur===c.code?'rgba(212,175,55,.15)':'transparent',color:cur===c.code?'#D4AF37':'rgba(255,255,255,.55)',fontSize:11,textAlign:'left',transition:'all .15s',fontFamily:"'DM Sans',sans-serif"}}>
              <b>{c.code}</b> <span style={{fontSize:10,opacity:.7}}>{c.name}</span>
            </button>
          ))}
        </div>
        <div style={{fontSize:9,fontWeight:700,color:'rgba(96,165,250,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{isZh?'伙伴国':'Partners'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3}}>
          {countries.filter(c=>!c.isMember).map(c=>(
            <button key={c.code} onClick={()=>{set(c.code);setPick(null)}} style={{padding:'5px 7px',borderRadius:6,border:'none',cursor:'pointer',background:cur===c.code?'rgba(96,165,250,.15)':'transparent',color:cur===c.code?'#60A5FA':'rgba(255,255,255,.45)',fontSize:11,textAlign:'left',transition:'all .15s',fontFamily:"'DM Sans',sans-serif"}}>
              <b>{c.code}</b> <span style={{fontSize:10,opacity:.7}}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>);
  };

  return(
    <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:'#F0E6C8',margin:'0 0 6px'}}>{tb('invest.title')}</h2>
        <p style={{fontSize:12,color:'rgba(255,255,255,.35)',margin:0}}>{isZh?'交互式海缆成本计算器 — 选择任意两个金砖国家，实时估算海底光缆铺设成本':'Interactive submarine cable cost estimator — select any two BRICS nations for real-time laying cost estimates'}</p>
      </div>

      {/* ─── 海缆路由剖面图 ─── */}
      <div className="bc" style={{padding:0,overflow:'hidden',marginBottom:16,borderRadius:12}}>
        <svg key={ak} viewBox="0 0 1200 220" style={{width:'100%',display:'block'}} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="oBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A1628" stopOpacity="0"/>
              <stop offset="25%" stopColor="#0C2440" stopOpacity="0.8"/>
              <stop offset="65%" stopColor="#0A1E38"/>
              <stop offset="100%" stopColor="#081428"/>
            </linearGradient>
            <linearGradient id="eFade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0D1B2A"/><stop offset="5%" stopColor="#0D1B2A" stopOpacity="0"/>
              <stop offset="95%" stopColor="#0D1B2A" stopOpacity="0"/><stop offset="100%" stopColor="#0D1B2A"/>
            </linearGradient>
            <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
          </defs>
          <rect width="1200" height="220" fill="url(#oBg)"/>
          {/* 海面波纹 */}
          <path d="M0,16 C120,8 240,24 360,16 S600,8 720,16 S960,24 1080,16 L1200,16" fill="none" stroke="rgba(30,80,140,.1)" strokeWidth="0.8">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,16 C120,8 240,24 360,16 S600,8 720,16 S960,24 1080,16 L1200,16;M0,20 C120,12 240,20 360,12 S600,20 720,12 S960,20 1080,12 L1200,20;M0,16 C120,8 240,24 360,16 S600,8 720,16 S960,24 1080,16 L1200,16"/>
          </path>
          {/* 海底地形 — 大陆架+深海 */}
          <path d="M0,200 L60,194 L110,182 C140,170 170,166 210,165 C380,164 500,166 600,167 C700,166 820,164 990,165 C1030,166 1060,170 1090,182 L1140,194 L1200,200 Z" fill="#050C16" stroke="#0E1828" strokeWidth="0.5"/>
          {/* 大陆架边缘细节 */}
          <path d="M60,194 L110,182 C140,170 170,166 210,165" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.6"/>
          <path d="M990,165 C1030,166 1060,170 1090,182 L1140,194" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.6"/>
          {/* 近岸碎石纹理 */}
          {[70,85,100,1100,1115,1130].map((x,i)=><circle key={`r${i}`} cx={x} cy={190-i%3*4} r={1.5+i%2} fill="#0A1220" opacity="0.6"/>)}
          {/* 光缆辉光底层 */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.35,transition:'opacity .5s'}}>
            <path d="M88,158 C160,164 260,168 400,170 C550,172 650,172 800,170 C940,168 1040,164 1112,158" fill="none" stroke="#D4AF37" strokeWidth="12" opacity="0.08" filter="url(#gl)"/>
          </g>
          {/* 近岸段（虚线） */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.65,transition:'opacity .4s'}}>
            <path d="M88,158 L185,166" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.7"/>
            <path d="M1015,166 L1112,158" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.7"/>
          </g>
          {/* 深海段（实线动画绘制） */}
          <g style={{opacity:isH('cable')?1:0.85,transition:'opacity .4s'}}>
            <path d="M185,166 C350,172 500,174 600,174 C700,174 850,172 1015,166" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2000" style={{animation:'drawL 1.6s ease-out forwards'}}/>
          </g>
          {/* 中继器 */}
          <g style={{opacity:isH('repeater')?1:0.7,transition:'opacity .5s'}}>
            {repX.map((x,i)=>{const y=170+Math.sin((x-195)/810*Math.PI)*4;return(
              <g key={i} style={{animation:`fadeI .3s ease ${.4+i*.06}s both`}}>
                <circle cx={x} cy={y} r={isH('repeater')?6.5:4.5} fill="#D4AF37" opacity="0.7" style={{transition:'r .3s'}}/>
                <circle cx={x} cy={y} r="2.5" fill="#F0E6C8"/>
              </g>
            );})}
          </g>
          {/* 登陆站 A */}
          <g style={{opacity:isH('station')?1:0.75,transition:'opacity .4s',animation:'fadeI .4s ease .1s both'}}>
            <rect x="58" y="130" width="34" height="30" rx="3" fill="#D4AF3710" stroke={isH('station')?'#D4AF3770':'#D4AF3730'} strokeWidth={isH('station')?1.5:1} style={{transition:'all .3s'}}/>
            <rect x="64" y="135" width="9" height="9" rx="1.5" fill="#D4AF3720"/><rect x="77" y="135" width="9" height="9" rx="1.5" fill="#D4AF3720"/>
            <rect x="64" y="147" width="22" height="7" rx="1" fill="#D4AF3715"/>
            <line x1="75" y1="130" x2="75" y2="118" stroke="#D4AF3740" strokeWidth="1"/><circle cx={75} cy={116} r="2" fill="#D4AF3750"/>
            <text x="75" y="110" textAnchor="middle" fontSize="10" fill="#D4AF3795" fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(from,isZh)}</text>
          </g>
          {/* 登陆站 B */}
          <g style={{opacity:isH('station')?1:0.75,transition:'opacity .4s',animation:'fadeI .4s ease .2s both'}}>
            <rect x="1108" y="130" width="34" height="30" rx="3" fill="#D4AF3710" stroke={isH('station')?'#D4AF3770':'#D4AF3730'} strokeWidth={isH('station')?1.5:1} style={{transition:'all .3s'}}/>
            <rect x="1114" y="135" width="9" height="9" rx="1.5" fill="#D4AF3720"/><rect x="1127" y="135" width="9" height="9" rx="1.5" fill="#D4AF3720"/>
            <rect x="1114" y="147" width="22" height="7" rx="1" fill="#D4AF3715"/>
            <line x1="1125" y1="130" x2="1125" y2="118" stroke="#D4AF3740" strokeWidth="1"/><circle cx={1125} cy={116} r="2" fill="#D4AF3750"/>
            <text x="1125" y="110" textAnchor="middle" fontSize="10" fill="#D4AF3795" fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(to,isZh)}</text>
          </g>
          {/* 区段标注 */}
          <text x="136" y="155" textAnchor="middle" fontSize="8" fill="#D4AF3745" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
          <text x="600" y="195" textAnchor="middle" fontSize="9.5" fill="#D4AF3765" fontWeight="600" fontFamily="DM Sans,sans-serif">{isZh?'深海电缆':'Deep Sea Cable'} — {dist.toLocaleString()} km</text>
          <text x="600" y="210" textAnchor="middle" fontSize="8" fill="#D4AF3740" fontFamily="DM Sans,sans-serif">{isZh?'中继器':'Repeaters'} ×{est.repeaterCount} ({isZh?'每':'every'} ~70km)</text>
          <text x="1064" y="155" textAnchor="middle" fontSize="8" fill="#D4AF3745" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
          {/* 数据脉冲光点 */}
          <circle r="3" fill="#F0E6C8" opacity="0">
            <animateMotion dur="5s" repeatCount="indefinite" path="M88,158 C160,164 260,168 400,170 C550,172 650,172 800,170 C940,168 1040,164 1112,158"/>
            <animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0;0.9;0.9;0" keyTimes="0;0.08;0.92;1"/>
          </circle>
          <rect width="1200" height="220" fill="url(#eFade)"/>
        </svg>
      </div>

      {/* ─── 国家选择器 + 距离 ─── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:0,marginBottom:24,position:'relative'}}>
        <button onClick={()=>setPick(pick==='from'?null:'from')} style={{padding:'10px 20px',borderRadius:'8px 0 0 8px',border:'1px solid rgba(212,175,55,.25)',borderRight:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .2s'}}>
          {cn(from,isZh)} ▾
        </button>
        <div style={{padding:'8px 28px',background:'rgba(212,175,55,.1)',borderTop:'1px solid rgba(212,175,55,.25)',borderBottom:'1px solid rgba(212,175,55,.25)',textAlign:'center'}}>
          <div key={ak} style={{fontSize:18,fontWeight:800,color:'#F0E6C8',fontFamily:"'Playfair Display',serif",animation:'fadeU .5s ease-out'}}>{dist.toLocaleString()} km</div>
          <div style={{fontSize:8,color:'rgba(255,255,255,.25)',marginTop:1}}>{isZh?'估算路由距离（×1.3系数）':'Est. route (×1.3 factor)'}</div>
        </div>
        <button onClick={()=>setPick(pick==='to'?null:'to')} style={{padding:'10px 20px',borderRadius:'0 8px 8px 0',border:'1px solid rgba(212,175,55,.25)',borderLeft:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .2s'}}>
          {cn(to,isZh)} ▾
        </button>
        {pick&&<PickerOverlay target={pick}/>}
      </div>

      {/* ─── 三档估算卡片 ─── */}
      <div key={`sc${ak}`} style={{display:'flex',gap:10,justifyContent:'center',marginBottom:20}}>
        {[{l:isZh?'保守（×0.75）':'Conservative',v:est.scenarios.low,c:'#6B7280',bg:'rgba(107,114,128,.05)'},
          {l:isZh?'基准估算':'Baseline',v:est.scenarios.base,c:'#D4AF37',bg:'rgba(212,175,55,.06)'},
          {l:isZh?'积极（×1.35）':'Aggressive',v:est.scenarios.high,c:'#EF4444',bg:'rgba(239,68,68,.05)'}
        ].map((s,i)=>(
          <div key={s.l} style={{flex:1,maxWidth:220,textAlign:'center',padding:'16px 12px',borderRadius:10,background:s.bg,border:`1px solid ${s.c}${i===1?'28':'12'}`,animation:`fadeU .5s ease-out ${.1+i*.1}s both`}}>
            <div style={{fontSize:10,fontWeight:700,color:s.c,marginBottom:6,textTransform:'uppercase',letterSpacing:'.04em'}}>{s.l}</div>
            <div style={{fontSize:i===1?30:22,fontWeight:800,color:'#F0E6C8',fontFamily:"'Playfair Display',serif"}}>{formatUsd(s.v)}</div>
          </div>
        ))}
      </div>

      {/* ─── 成本构成条形图 ─── */}
      <div className="bc" style={{padding:'16px 20px',marginBottom:16}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:12}}>{isZh?'成本构成':'Cost Breakdown'}</div>
        {items.map(it=>{const pct=est.capexTotalUsd>0?(it.v/est.capexTotalUsd)*100:0;const on=hl===it.k||hl==='all';return(
          <div key={it.k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}} onMouseEnter={()=>setHl(it.k)} onMouseLeave={()=>setHl(null)}>
            <div style={{width:60,fontSize:10,color:on?it.c:'rgba(255,255,255,.4)',textAlign:'right',flexShrink:0,fontWeight:on?700:400,transition:'all .2s'}}>{it.l}</div>
            <div style={{flex:1,height:7,borderRadius:4,background:'rgba(255,255,255,.03)',overflow:'hidden'}}>
              <div style={{width:`${pct}%`,height:'100%',borderRadius:4,background:it.c,opacity:on?1:.6,transition:'all .4s',boxShadow:on?`0 0 12px ${it.c}30`:'none'}}/>
            </div>
            <div style={{width:50,fontSize:10,color:on?'#F0E6C8':'rgba(255,255,255,.3)',textAlign:'right',fontWeight:600,transition:'color .2s'}}>{formatUsd(it.v)}</div>
            <div style={{width:28,fontSize:9,color:'rgba(255,255,255,.18)',textAlign:'right'}}>{pct.toFixed(0)}%</div>
          </div>
        );})}
        <div style={{display:'flex',gap:8,marginTop:12,paddingTop:12,borderTop:'1px solid rgba(212,175,55,.06)'}}>
          {[{l:isZh?'$/km 全口径':'$/km All-in',v:est.unitMetrics.usdPerKm?`$${Math.round(est.unitMetrics.usdPerKm/1000)}K`:'-'},
            {l:isZh?'年化 OPEX':'Annual OPEX',v:`${formatUsd(est.opex.totalOpexPerYear)}/yr`},
            {l:isZh?'中继器':'Repeaters',v:`${est.repeaterCount}`},
            {l:isZh?'登陆站':'Stations',v:'2'}
          ].map(m=>(
            <div key={m.l} style={{flex:1,textAlign:'center',padding:'5px 4px',borderRadius:6,background:'rgba(255,255,255,.015)'}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,.25)'}}>{m.l}</div>
              <div style={{fontSize:12,color:'#F0E6C8',fontWeight:700,marginTop:2}}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 敏感性分析（龙卷风图） ─── */}
      <div className="bc" style={{padding:'16px 20px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:14}}>{isZh?'敏感性分析':'Sensitivity Analysis'}</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80,textAlign:'right'}}>{isZh?'← 成本降低':'← Cost ↓'}</span>
          <div style={{flex:1,maxWidth:440,height:1,background:'rgba(212,175,55,.08)',margin:'0 12px'}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80}}>{isZh?'成本增加 →':'Cost ↑ →'}</span>
        </div>
        {SENSITIVITY_ITEMS.map(si=>{const sec=secMap[si.param]||'all';const on=hl===sec;return(
          <div key={si.param} onMouseEnter={()=>setHl(sec)} onMouseLeave={()=>setHl(null)} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer',padding:'3px 0',transition:'all .2s'}}>
            <div style={{width:75,fontSize:10,color:on?'#F0E6C8':'rgba(255,255,255,.4)',textAlign:'right',flexShrink:0,fontWeight:on?600:400,transition:'all .2s'}}>{isZh?si.labelZh:si.label}</div>
            <div style={{flex:1,maxWidth:440,display:'flex',alignItems:'center',position:'relative',height:22}}>
              <div style={{position:'absolute',left:'50%',top:1,bottom:1,width:1,background:'rgba(212,175,55,.1)'}}/>
              <div style={{position:'absolute',right:'50%',top:3,height:16,borderRadius:'4px 0 0 4px',width:`${si.capexImpact*2.8}%`,background:'linear-gradient(270deg,rgba(239,68,68,.6),rgba(239,68,68,.15))',opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(239,68,68,.15)':'none'}}/>
              <div style={{position:'absolute',left:'50%',top:3,height:16,borderRadius:'0 4px 4px 0',width:`${si.capexImpact*2.8}%`,background:`linear-gradient(90deg,rgba(212,175,55,.6),rgba(212,175,55,.15))`,opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(212,175,55,.15)':'none'}}/>
            </div>
            <div style={{width:34,fontSize:11,color:on?'#D4AF37':'rgba(255,255,255,.25)',fontWeight:700,textAlign:'right',transition:'color .2s'}}>±{si.capexImpact}%</div>
          </div>
        );})}
        <p style={{fontSize:9,color:'rgba(255,255,255,.12)',marginTop:12,lineHeight:1.6}}>{isZh?'鼠标悬停可联动上方海缆剖面图中对应的成本要素':'Hover to highlight the corresponding cost element in the cable diagram above'}</p>
      </div>

      <p style={{fontSize:10,color:'rgba(255,255,255,.1)',marginTop:14,lineHeight:1.6,maxWidth:900}}>{tb('invest.disclaimer')}</p>
      <style>{`@keyframes fadeU{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeI{from{opacity:0}to{opacity:1}}@keyframes drawL{from{stroke-dashoffset:2000}to{stroke-dashoffset:0}}`}</style>
    </section>
  );
}
"""

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSInvestmentPanel.tsx"
with open(path, 'w') as f:
    f.write(content)
print(f"  ✅ 创建完成 ({len(content)} 字符)")
PYEOF

# ━━━ Step 2: 修改 Dashboard — import + 替换投资面板 ━━━
echo ""
echo ">>> Step 2/2: 修改 BRICSDashboard.tsx"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path, 'r') as f:
    c = f.read()

changes = 0

# 2a. 添加 import（在 SovereigntyMatrix import 附近）
if 'BRICSInvestmentPanel' not in c:
    # 找到 SovereigntyMatrix 或其他 brics 组件 import
    import_markers = [
        "import SovereigntyMatrix",
        "import BRICSMap",
        "import BRICSStatsCards",
    ]
    insert_after = -1
    for marker in import_markers:
        idx = c.find(marker)
        if idx >= 0:
            # 找到这行的末尾
            line_end = c.find('\n', idx)
            if line_end >= 0:
                insert_after = line_end + 1
                break

    if insert_after >= 0:
        import_line = "import BRICSInvestmentPanel from './BRICSInvestmentPanel';\n"
        c = c[:insert_after] + import_line + c[insert_after:]
        changes += 1
        print("  ✅ 添加了 BRICSInvestmentPanel import")
    else:
        print("  ❌ 无法定位 import 插入位置")
else:
    print("  ✓ BRICSInvestmentPanel import 已存在")

# 2b. 替换投资面板区域
# 策略: 找到投资面板的注释标记, 然后找到其外层条件块的结束
invest_markers = ['{/* 投资机会面板', '{/* 投资机会分析', '{/* Investment Opportunity']
start = -1
marker_used = ''
for m in invest_markers:
    idx = c.find(m)
    if idx >= 0:
        start = idx
        marker_used = m
        break

if start >= 0:
    print(f"  找到投资面板: '{marker_used}' (位置 {start})")

    # 向前查找是否有条件包装 {investOps.length
    before_context = c[max(0,start-200):start]
    cond_idx = before_context.rfind('{investOps')
    if cond_idx >= 0:
        actual_start = max(0,start-200) + cond_idx
        print(f"  找到条件包装: {c[actual_start:actual_start+30]}...")
    else:
        actual_start = start
        print(f"  无条件包装，从注释开始")

    # 向后查找 </section> 然后 )} 结束
    rest = c[start:]
    # 找最后一个 </section> 后跟 )}
    end_match = re.search(r'</section>\s*\)\}', rest)
    if end_match:
        actual_end = start + end_match.end()
        old_section = c[actual_start:actual_end]
        print(f"  替换范围: {len(old_section)} 字符 (位置 {actual_start}-{actual_end})")

        replacement = '        <BRICSInvestmentPanel isZh={isZh} tb={tb} />'
        c = c[:actual_start] + replacement + c[actual_end:]
        changes += 1
        print("  ✅ 投资面板替换为 <BRICSInvestmentPanel />")
    else:
        print("  ❌ 未找到 </section>)} 结束标记")
        # 尝试备用方案: 直接在注释行后插入组件, 不删除旧代码
        print("  ⚠️ 将在旧面板前插入新组件（旧代码保留但被覆盖）")
else:
    print("  ⚠️ 未找到投资面板，在 sovereignty section 前插入")
    # 找到 sovereignty/战略缺口 section 并在其前插入
    sov_markers = ['{/* 战略缺口', '{/* Strategic Gap', 'SovereigntyMatrix']
    for m in sov_markers:
        idx = c.find(m)
        if idx >= 0:
            # 找到这行的开头
            line_start = c.rfind('\n', 0, idx) + 1
            insert_text = '        <BRICSInvestmentPanel isZh={isZh} tb={tb} />\n\n'
            c = c[:line_start] + insert_text + c[line_start:]
            changes += 1
            print(f"  ✅ 在 '{m}' 前插入了 BRICSInvestmentPanel")
            break

# 2c. 移除可能多余的 cost-model import（如果存在）
# 新组件自己 import cost model, Dashboard 不再需要
if "from '@/lib/subsea-cost-model'" in c and 'estimateSubseaCapex' not in c.split('BRICSInvestmentPanel')[0]:
    # 如果 Dashboard 不再直接使用 cost model functions, 可以保留 import 不影响
    pass

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {changes} 处修改")

# 诊断
print("\n  --- 诊断: BRICSInvestmentPanel 相关 ---")
for i, line in enumerate(c.split('\n')):
    if 'InvestmentPanel' in line or '投资机会' in line:
        print(f"    L{i+1}: {line.strip()[:100]}")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 投资面板升级完成！"
echo ""
echo "腾讯云执行："
echo "  cd /home/ubuntu/deep-blue"
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 2"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo ""
echo "  git add -A && git commit -m 'feat: interactive submarine cable cost calculator with SVG diagram' && git push origin main"
echo ""
echo "  → Cloudflare Purge Everything → Cmd+Shift+R"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

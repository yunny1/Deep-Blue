#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🎨 SVG 剖面图升级 — 内嵌成本标注"
echo "═══════════════════════════════════════════════════════"

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
    {k:'cable',l:isZh?'电缆本体':'Cable',v:bd.cable,c:'#3B82F6'},
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

  /* ─── annotation helpers ─── */
  const Callout=({x,y,label,value,color,anchor='middle',show}:{x:number,y:number,label:string,value:string,color:string,anchor?:string,show:boolean})=>(
    <g style={{opacity:show?1:0,transition:'opacity .4s',pointerEvents:'none'}}>
      <line x1={x} y1={y} x2={x} y2={y-16} stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
      <rect x={anchor==='start'?x-2:anchor==='end'?x-78:x-40} y={y-40} width={80} height={22} rx="4" fill="#0D1B2AE0" stroke={color} strokeWidth="0.6" opacity="0.9"/>
      <text x={anchor==='start'?x+38:anchor==='end'?x-38:x} y={y-32} textAnchor="middle" fontSize="7.5" fill={color} fontWeight="600" fontFamily="DM Sans,sans-serif">{label}</text>
      <text x={anchor==='start'?x+38:anchor==='end'?x-38:x} y={y-23} textAnchor="middle" fontSize="9" fill="#F0E6C8" fontWeight="700" fontFamily="DM Sans,sans-serif">{value}</text>
    </g>
  );

  return(
    <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:'#F0E6C8',margin:'0 0 6px'}}>{tb('invest.title')}</h2>
        <p style={{fontSize:12,color:'rgba(255,255,255,.35)',margin:0}}>{isZh?'交互式海缆成本计算器 — 选择任意两个金砖国家，实时估算海底光缆铺设成本':'Interactive submarine cable cost estimator — select any two BRICS nations for real-time laying cost estimates'}</p>
      </div>

      {/* ─── 海缆路由剖面图 (with cost annotations) ─── */}
      <div className="bc" style={{padding:0,overflow:'hidden',marginBottom:16,borderRadius:12}}>
        <svg key={ak} viewBox="0 0 1200 320" style={{width:'100%',display:'block'}} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="oBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0A1628" stopOpacity="0"/>
              <stop offset="15%" stopColor="#0C2440" stopOpacity="0.6"/>
              <stop offset="50%" stopColor="#0A1E38"/>
              <stop offset="100%" stopColor="#081428"/>
            </linearGradient>
            <linearGradient id="eFade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0D1B2A"/><stop offset="4%" stopColor="#0D1B2A" stopOpacity="0"/>
              <stop offset="96%" stopColor="#0D1B2A" stopOpacity="0"/><stop offset="100%" stopColor="#0D1B2A"/>
            </linearGradient>
            <linearGradient id="cableGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.3"/><stop offset="100%" stopColor="#D4AF37" stopOpacity="0"/>
            </linearGradient>
            <filter id="gl"><feGaussianBlur stdDeviation="4" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
            <filter id="gl2"><feGaussianBlur stdDeviation="6"/></filter>
          </defs>
          <rect width="1200" height="320" fill="url(#oBg)"/>

          {/* ─── 顶部总成本指标 ─── */}
          <text x="600" y="32" textAnchor="middle" fontSize="10" fill="rgba(212,175,55,.4)" fontWeight="600" fontFamily="DM Sans,sans-serif" style={{animation:'fadeI .5s ease .2s both'}}>{isZh?'估算总 CAPEX':'Estimated Total CAPEX'}</text>
          <text x="600" y="56" textAnchor="middle" fontSize="26" fill="#F0E6C8" fontWeight="800" fontFamily="Playfair Display,serif" style={{animation:'fadeU .6s ease .3s both'}}>{formatUsd(est.capexTotalUsd)}</text>
          <text x="600" y="72" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.2)" fontFamily="DM Sans,sans-serif" style={{animation:'fadeI .5s ease .4s both'}}>{cn(from,isZh)} → {cn(to,isZh)} · {dist.toLocaleString()} km</text>

          {/* ─── 三档区间指示 ─── */}
          <g style={{animation:'fadeI .6s ease .5s both'}}>
            <text x="420" y="56" textAnchor="end" fontSize="11" fill="#6B7280" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.low)}</text>
            <text x="420" y="67" textAnchor="end" fontSize="7.5" fill="rgba(107,114,128,.5)" fontFamily="DM Sans,sans-serif">{isZh?'保守':'Low'}</text>
            <text x="780" y="56" textAnchor="start" fontSize="11" fill="#EF4444" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.high)}</text>
            <text x="780" y="67" textAnchor="start" fontSize="7.5" fill="rgba(239,68,68,.5)" fontFamily="DM Sans,sans-serif">{isZh?'积极':'High'}</text>
          </g>

          {/* ─── 海面波纹 ─── */}
          <path d="M0,100 C120,92 240,108 360,100 S600,92 720,100 S960,108 1080,100 L1200,100" fill="none" stroke="rgba(30,80,140,.08)" strokeWidth="0.8">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,100 C120,92 240,108 360,100 S600,92 720,100 S960,108 1080,100 L1200,100;M0,104 C120,96 240,104 360,96 S600,104 720,96 S960,104 1080,96 L1200,104;M0,100 C120,92 240,108 360,100 S600,92 720,100 S960,108 1080,100 L1200,100"/>
          </path>

          {/* ─── 海底地形 ─── */}
          <path d="M0,300 L60,294 L110,280 C140,268 170,262 210,260 C380,258 500,260 600,262 C700,260 820,258 990,260 C1030,262 1060,268 1090,280 L1140,294 L1200,300 Z" fill="#050C16" stroke="#0E1828" strokeWidth="0.5"/>
          <path d="M60,294 L110,280 C140,268 170,262 210,260" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.5"/>
          <path d="M990,260 C1030,262 1060,268 1090,280 L1140,294" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.5"/>
          {[70,85,100,1100,1115,1130].map((x,i)=><circle key={`r${i}`} cx={x} cy={288-i%3*4} r={1.5+i%2} fill="#0A1220" opacity="0.5"/>)}

          {/* ─── 路由调查标注（海底扫描线） ─── */}
          <g style={{opacity:isH('survey')?1:0.15,transition:'opacity .5s'}}>
            {[300,450,600,750,900].map((x,i)=>(
              <line key={`sv${i}`} x1={x} y1={262} x2={x} y2={282} stroke="#EC4899" strokeWidth="0.6" strokeDasharray="1.5 3" opacity="0.5"/>
            ))}
            <Callout x={600} y={295} label={isZh?'路由调查':'Survey'} value={formatUsd(bd.survey)} color="#EC4899" show={isH('survey')} />
          </g>

          {/* ─── 光缆辉光底层 ─── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.3,transition:'opacity .5s'}}>
            <path d="M88,254 C160,260 260,264 400,266 C550,268 650,268 800,266 C940,264 1040,260 1112,254" fill="none" stroke="#D4AF37" strokeWidth="14" opacity="0.06" filter="url(#gl2)"/>
          </g>

          {/* ─── 近岸段 A（虚线 + shore 标注） ─── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.6,transition:'opacity .4s'}} onMouseEnter={()=>setHl('marine')} onMouseLeave={()=>setHl(null)}>
            <path d="M88,254 L185,262" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.65"/>
            <text x="136" y="250" textAnchor="middle" fontSize="7.5" fill="#06B6D480" fontFamily="DM Sans,sans-serif">{isZh?'近岸段 ×2.0':'Shore ×2.0'}</text>
          </g>
          {/* ─── 近岸段 B ─── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.6,transition:'opacity .4s'}} onMouseEnter={()=>setHl('marine')} onMouseLeave={()=>setHl(null)}>
            <path d="M1015,262 L1112,254" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.65"/>
            <text x="1064" y="250" textAnchor="middle" fontSize="7.5" fill="#06B6D480" fontFamily="DM Sans,sans-serif">{isZh?'近岸段 ×2.0':'Shore ×2.0'}</text>
          </g>

          {/* ─── 深海段（实线） ─── */}
          <g style={{opacity:isH('cable')?1:0.85,transition:'opacity .4s',cursor:'pointer'}} onMouseEnter={()=>setHl('cable')} onMouseLeave={()=>setHl(null)}>
            <path d="M185,262 C350,268 500,270 600,270 C700,270 850,268 1015,262" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2000" style={{animation:'drawL 1.6s ease-out forwards'}}/>
          </g>

          {/* ─── 电缆本体成本标注 ─── */}
          <Callout x={440} y={248} label={isZh?'电缆本体 · 深海+近岸':'Cable Body · Deep + Shore'} value={formatUsd(bd.cable)} color="#3B82F6" show={isH('cable')} />

          {/* ─── 海工敷设成本标注（船图标+标注） ─── */}
          <g style={{opacity:isH('marine')?1:0.25,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('marine')} onMouseLeave={()=>setHl(null)}>
            {/* 简化敷设船 */}
            <g transform="translate(340,88)">
              <path d="M0,12 L4,18 L36,18 L40,12 Z" fill="#06B6D430" stroke="#06B6D460" strokeWidth="0.6"/>
              <rect x="12" y="4" width="16" height="8" rx="1.5" fill="#06B6D420" stroke="#06B6D445" strokeWidth="0.5"/>
              <line x1="20" y1="4" x2="20" y2="0" stroke="#06B6D450" strokeWidth="0.6"/><circle cx="20" cy="-1" r="1" fill="#06B6D460"/>
            </g>
            <Callout x={360} y={88} label={isZh?'海工敷设 · 船日费+调遣':'Marine · Ship + Mobilization'} value={formatUsd(bd.marine)} color="#06B6D4" show={isH('marine')} />
          </g>

          {/* ─── 中继器 ─── */}
          <g style={{opacity:isH('repeater')?1:0.65,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('repeater')} onMouseLeave={()=>setHl(null)}>
            {repX.map((x,i)=>{const y=266+Math.sin((x-195)/810*Math.PI)*4;return(
              <g key={i} style={{animation:`fadeI .3s ease ${.4+i*.06}s both`}}>
                <circle cx={x} cy={y} r={isH('repeater')?7:4.5} fill="#D4AF37" opacity={isH('repeater')?0.8:0.6} style={{transition:'all .3s'}}/>
                <circle cx={x} cy={y} r="2.5" fill="#F0E6C8"/>
              </g>
            );})}
            {/* 中继器成本标注 — 放在中间偏上 */}
            <Callout x={600} y={242} label={isZh?`中继器 ×${est.repeaterCount} · 每个$200K`:`Repeaters ×${est.repeaterCount} · $200K each`} value={formatUsd(bd.repeaters)} color="#8B5CF6" show={isH('repeater')} />
          </g>

          {/* ─── 登陆站 A ─── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer',animation:'fadeI .4s ease .1s both'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="54" y="224" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8} style={{transition:'all .3s'}}/>
            <rect x="60" y="230" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="74" y="230" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="60" y="243" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="73" y1="224" x2="73" y2="210" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={73} cy={208} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="73" y="200" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif" style={{transition:'fill .3s'}}>{cn(from,isZh)}</text>
          </g>
          {/* ─── 登陆站 B ─── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer',animation:'fadeI .4s ease .2s both'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="1108" y="224" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8} style={{transition:'all .3s'}}/>
            <rect x="1114" y="230" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="1128" y="230" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="1114" y="243" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="1127" y1="224" x2="1127" y2="210" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={1127} cy={208} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="1127" y="200" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif" style={{transition:'fill .3s'}}>{cn(to,isZh)}</text>
          </g>
          {/* 登陆站成本标注 */}
          <Callout x={180} y={222} label={isZh?'登陆站 ×2 · 每站$15M':'Stations ×2 · $15M each'} value={formatUsd(bd.landingStations)} color="#22C55E" anchor="start" show={isH('station')} />

          {/* ─── 许可合规标注（旗帜图标） ─── */}
          <g style={{opacity:isH('permit')?1:0.2,transition:'opacity .5s'}}>
            {/* 旗帜在出发国侧 */}
            <g transform="translate(94,180)">
              <line x1="0" y1="0" x2="0" y2="16" stroke="#F59E0B60" strokeWidth="0.8"/>
              <path d="M1,0 L12,3 L1,7 Z" fill="#F59E0B40"/>
            </g>
            {/* 旗帜在目的国侧 */}
            <g transform="translate(1148,180)">
              <line x1="0" y1="0" x2="0" y2="16" stroke="#F59E0B60" strokeWidth="0.8"/>
              <path d="M-1,0 L-12,3 L-1,7 Z" fill="#F59E0B40"/>
            </g>
            <Callout x={94} y={178} label={isZh?'许可合规 ×2国':'Permits ×2 jur.'} value={formatUsd(bd.permits)} color="#F59E0B" anchor="start" show={isH('permit')} />
          </g>

          {/* ─── 底部指标带 ─── */}
          <g style={{animation:'fadeI .6s ease .6s both'}}>
            <rect x="250" y="290" width="700" height="24" rx="6" fill="rgba(255,255,255,.015)" stroke="rgba(212,175,55,.05)" strokeWidth="0.5"/>
            <text x="380" y="305" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,.3)" fontFamily="DM Sans,sans-serif">{isZh?'中继器':'Repeaters'} <tspan fill="#F0E6C8" fontWeight="700">×{est.repeaterCount}</tspan> ({isZh?'每':'every'} ~70km)</text>
            <text x="600" y="305" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,.3)" fontFamily="DM Sans,sans-serif">{isZh?'全口径 $/km':'All-in $/km'}: <tspan fill="#F0E6C8" fontWeight="700">{est.unitMetrics.usdPerKm?`$${Math.round(est.unitMetrics.usdPerKm/1000)}K`:'-'}</tspan></text>
            <text x="820" y="305" textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,.3)" fontFamily="DM Sans,sans-serif">{isZh?'年化 OPEX':'OPEX/yr'}: <tspan fill="#F0E6C8" fontWeight="700">{formatUsd(est.opex.totalOpexPerYear)}</tspan></text>
          </g>

          {/* ─── 数据脉冲光点 ─── */}
          <circle r="3" fill="#F0E6C8" opacity="0">
            <animateMotion dur="5s" repeatCount="indefinite" path="M88,254 C160,260 260,264 400,266 C550,268 650,268 800,266 C940,264 1040,260 1112,254"/>
            <animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0;0.9;0.9;0" keyTimes="0;0.08;0.92;1"/>
          </circle>

          {/* 左右渐隐 */}
          <rect width="1200" height="320" fill="url(#eFade)"/>
        </svg>

        {/* SVG 底部图例 — 悬停触发 */}
        <div style={{display:'flex',flexWrap:'wrap',justifyContent:'center',gap:4,padding:'8px 16px 12px',borderTop:'1px solid rgba(212,175,55,.04)'}}>
          {items.map(it=>(
            <div key={it.k} onMouseEnter={()=>setHl(it.k)} onMouseLeave={()=>setHl(null)} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 8px',borderRadius:5,cursor:'pointer',background:hl===it.k?`${it.c}10`:'transparent',border:`1px solid ${hl===it.k?`${it.c}30`:'transparent'}`,transition:'all .2s'}}>
              <div style={{width:7,height:7,borderRadius:2,background:it.c,opacity:hl===it.k?1:0.4,transition:'opacity .2s'}}/>
              <span style={{fontSize:10,color:hl===it.k?it.c:'rgba(255,255,255,.3)',fontWeight:hl===it.k?600:400,transition:'all .2s'}}>{it.l}</span>
              <span style={{fontSize:10,color:hl===it.k?'#F0E6C8':'rgba(255,255,255,.15)',fontWeight:600,transition:'color .2s'}}>{formatUsd(it.v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 国家选择器 ─── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:0,marginBottom:24,position:'relative'}}>
        <button onClick={()=>setPick(pick==='from'?null:'from')} style={{padding:'10px 20px',borderRadius:'8px 0 0 8px',border:'1px solid rgba(212,175,55,.25)',borderRight:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .2s'}}>
          {cn(from,isZh)} ▾
        </button>
        <div style={{padding:'8px 28px',background:'rgba(212,175,55,.1)',borderTop:'1px solid rgba(212,175,55,.25)',borderBottom:'1px solid rgba(212,175,55,.25)',textAlign:'center'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:2}}>{isZh?'路由距离':'Route'}</div>
          <div key={ak} style={{fontSize:16,fontWeight:700,color:'#F0E6C8',fontFamily:"'DM Sans',sans-serif",animation:'fadeU .5s ease-out'}}>{dist.toLocaleString()} km</div>
        </div>
        <button onClick={()=>setPick(pick==='to'?null:'to')} style={{padding:'10px 20px',borderRadius:'0 8px 8px 0',border:'1px solid rgba(212,175,55,.25)',borderLeft:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .2s'}}>
          {cn(to,isZh)} ▾
        </button>
        {pick&&<PickerOverlay target={pick}/>}
      </div>

      {/* ─── 敏感性分析（龙卷风图）—— 与上方联动 ─── */}
      <div className="bc" style={{padding:'16px 20px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:14}}>{isZh?'敏感性分析 — 悬停联动剖面图':'Sensitivity Analysis — Hover to Highlight Diagram'}</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80,textAlign:'right'}}>{isZh?'← 成本降低':'← Cost ↓'}</span>
          <div style={{flex:1,maxWidth:600,height:1,background:'rgba(212,175,55,.08)',margin:'0 12px'}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80}}>{isZh?'成本增加 →':'Cost ↑ →'}</span>
        </div>
        {SENSITIVITY_ITEMS.map(si=>{const sec=secMap[si.param]||'all';const on=hl===sec;return(
          <div key={si.param} onMouseEnter={()=>setHl(sec)} onMouseLeave={()=>setHl(null)} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer',padding:'3px 0',transition:'all .2s'}}>
            <div style={{width:75,fontSize:10,color:on?'#F0E6C8':'rgba(255,255,255,.4)',textAlign:'right',flexShrink:0,fontWeight:on?600:400,transition:'all .2s'}}>{isZh?si.labelZh:si.label}</div>
            <div style={{flex:1,display:'flex',alignItems:'center',position:'relative',height:22,margin:'0 auto',maxWidth:600}}>
              <div style={{position:'absolute',left:'50%',top:1,bottom:1,width:1,background:'rgba(212,175,55,.1)'}}/>
              <div style={{position:'absolute',right:'50%',top:3,height:16,borderRadius:'4px 0 0 4px',width:`${si.capexImpact*2.8}%`,background:'linear-gradient(270deg,rgba(239,68,68,.6),rgba(239,68,68,.15))',opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(239,68,68,.15)':'none'}}/>
              <div style={{position:'absolute',left:'50%',top:3,height:16,borderRadius:'0 4px 4px 0',width:`${si.capexImpact*2.8}%`,background:`linear-gradient(90deg,rgba(212,175,55,.6),rgba(212,175,55,.15))`,opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(212,175,55,.15)':'none'}}/>
            </div>
            <div style={{width:34,fontSize:11,color:on?'#D4AF37':'rgba(255,255,255,.25)',fontWeight:700,textAlign:'right',transition:'color .2s'}}>±{si.capexImpact}%</div>
          </div>
        );})}
        <p style={{fontSize:9,color:'rgba(255,255,255,.1)',marginTop:12,lineHeight:1.6}}>{isZh?'悬停参数名可联动上方剖面图对应区域高亮。成本估算基于行业公开参数模型，实际因地形、深度和供应链而异。':'Hover parameter labels to highlight corresponding elements in the diagram above. Estimates based on industry-standard parametric model.'}</p>
      </div>

      <style>{`@keyframes fadeU{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeI{from{opacity:0}to{opacity:1}}@keyframes drawL{from{stroke-dashoffset:2000}to{stroke-dashoffset:0}}`}</style>
    </section>
  );
}
"""

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSInvestmentPanel.tsx"
with open(path, 'w') as f:
    f.write(content)
print(f"  ✅ BRICSInvestmentPanel.tsx 重写完成 ({len(content)} 字符)")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ SVG 剖面图升级完成！"
echo ""
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 1"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  git add -A && git commit -m 'feat: SVG cable diagram with inline cost annotations + hover interactivity' && git push origin main"
echo "  → Cloudflare Purge Everything → Cmd+Shift+R"
echo "═══════════════════════════════════════════════════════"

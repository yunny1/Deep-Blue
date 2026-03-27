'use client';
import { useState, useEffect, useMemo } from 'react';
import { BRICS_ALL, BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';
import { estimateSubseaCapex, formatUsd, SENSITIVITY_ITEMS } from '@/lib/subsea-cost-model';
import { getSeaRouteDistance, isLandlocked, LANDLOCKED_PORTS } from '@/lib/sea-route-distances';


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
  const {km:dist,source:distSrc}=useMemo(()=>getSeaRouteDistance(from,to),[from,to]);
  const est=useMemo(()=>estimateSubseaCapex({routeLengthKm:dist,designCapacityTbps:100,landingStations:2,jurisdictions:2}),[dist]);
  useEffect(()=>{setAk(k=>k+1)},[from,to]);

  /* 敏感性参数→SVG区域映射（修正：每个参数对应唯一区域，不再用'all'） */
  const secMap:Record<string,string>={
    cableCostDeepPerKm:'cable',
    landingStationCostUsd:'station',
    riskPremiumPct:'risk',
    contingencyPct:'contingency',
    repeaterSpacingKm:'repeater',
    shipDayRateUsd:'marine'
  };
  const nRep=Math.min(est.repeaterCount,14);
  const repX=Array.from({length:nRep},(_,i)=>195+(810/(nRep+1))*(i+1));
  const isH=(s:string)=>hl===s;

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

  /* ─── SVG Callout 标注 ─── */
  const Callout=({x,y,label,value,color,anchor='middle',show}:{x:number,y:number,label:string,value:string,color:string,anchor?:string,show:boolean})=>(
    <g style={{opacity:show?1:0,transition:'opacity .4s',pointerEvents:'none'}}>
      <line x1={x} y1={y} x2={x} y2={y-16} stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
      <rect x={anchor==='start'?x-2:anchor==='end'?x-88:x-44} y={y-40} width={88} height={22} rx="4" fill="#0D1B2AE0" stroke={color} strokeWidth="0.6" opacity="0.9"/>
      <text x={anchor==='start'?x+42:anchor==='end'?x-44:x} y={y-32} textAnchor="middle" fontSize="7.5" fill={color} fontWeight="600" fontFamily="DM Sans,sans-serif">{label}</text>
      <text x={anchor==='start'?x+42:anchor==='end'?x-44:x} y={y-23} textAnchor="middle" fontSize="9" fill="#F0E6C8" fontWeight="700" fontFamily="DM Sans,sans-serif">{value}</text>
    </g>
  );

  return(
    <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:'#F0E6C8',margin:'0 0 6px'}}>{tb('invest.title')}</h2>
        <p style={{fontSize:12,color:'rgba(255,255,255,.35)',margin:0}}>{isZh?'交互式海缆成本计算器 — 选择任意两个金砖国家，实时估算海底光缆铺设成本':'Interactive submarine cable cost estimator — select any two BRICS nations for real-time laying cost estimates'}</p>
      </div>

      {/* ─── 海缆路由剖面图 ─── */}
      <div className="bc" style={{padding:0,overflow:'hidden',marginBottom:16,borderRadius:12}}>
        <svg key={ak} viewBox="0 0 1200 340" style={{width:'100%',display:'block'}} xmlns="http://www.w3.org/2000/svg">
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
            <filter id="gl2"><feGaussianBlur stdDeviation="6"/></filter>
          </defs>
          <rect width="1200" height="340" fill="url(#oBg)"/>

          {/* ── 顶部：总 CAPEX + 三档 ── */}
          <text x="600" y="32" textAnchor="middle" fontSize="10" fill="rgba(212,175,55,.4)" fontWeight="600" fontFamily="DM Sans,sans-serif" style={{animation:'fadeI .5s ease .2s both'}}>{isZh?'估算总 CAPEX':'Estimated Total CAPEX'}</text>
          <text x="600" y="58" textAnchor="middle" fontSize="28" fill="#F0E6C8" fontWeight="800" fontFamily="Playfair Display,serif" style={{animation:'fadeU .6s ease .3s both'}}>{formatUsd(est.capexTotalUsd)}</text>
          <text x="600" y="74" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.2)" fontFamily="DM Sans,sans-serif">{cn(from,isZh)} → {cn(to,isZh)} · {dist.toLocaleString()} km</text>
          <g style={{animation:'fadeI .6s ease .5s both'}}>
            <text x="415" y="56" textAnchor="end" fontSize="11" fill="#6B7280" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.low)}</text>
            <text x="415" y="67" textAnchor="end" fontSize="7.5" fill="rgba(107,114,128,.5)" fontFamily="DM Sans,sans-serif">{isZh?'保守 ×0.75':'Low ×0.75'}</text>
            <text x="785" y="56" textAnchor="start" fontSize="11" fill="#EF4444" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.high)}</text>
            <text x="785" y="67" textAnchor="start" fontSize="7.5" fill="rgba(239,68,68,.5)" fontFamily="DM Sans,sans-serif">{isZh?'积极 ×1.35':'High ×1.35'}</text>
          </g>

          {/* ── 海面 ── */}
          <path d="M0,118 C150,110 300,126 450,118 S750,110 900,118 S1050,126 1200,118" fill="none" stroke="rgba(30,80,140,.08)" strokeWidth="0.8">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,118 C150,110 300,126 450,118 S750,110 900,118 S1050,126 1200,118;M0,122 C150,114 300,122 450,114 S750,122 900,114 S1050,122 1200,114;M0,118 C150,110 300,126 450,118 S750,110 900,118 S1050,126 1200,118"/>
          </path>

          {/* ── 海工敷设船（海面上） ── */}
          <g style={{opacity:isH('marine')?1:0.25,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('marine')} onMouseLeave={()=>setHl(null)}>
            <g transform="translate(340,102)">
              <path d="M0,12 L4,18 L40,18 L44,12 Z" fill={isH('marine')?'#06B6D430':'#06B6D415'} stroke={isH('marine')?'#06B6D470':'#06B6D430'} strokeWidth="0.6" style={{transition:'all .3s'}}/>
              <rect x="14" y="4" width="16" height="8" rx="1.5" fill={isH('marine')?'#06B6D425':'#06B6D412'} stroke={isH('marine')?'#06B6D455':'#06B6D425'} strokeWidth="0.5"/>
              <line x1="22" y1="4" x2="22" y2="0" stroke="#06B6D450" strokeWidth="0.6"/><circle cx="22" cy="-1" r="1" fill="#06B6D460"/>
            </g>
            <Callout x={362} y={100} label={isZh?'海工敷设 · 船+调遣':'Marine · Ship + Mobil.'} value={formatUsd(bd.marine)} color="#06B6D4" show={isH('marine')} />
          </g>

          {/* ── 海底地形（Y=280~310） ── */}
          <path d="M0,310 L60,304 L110,290 C140,278 170,274 210,272 C380,270 500,272 600,274 C700,272 820,270 990,272 C1030,274 1060,278 1090,290 L1140,304 L1200,310 Z" fill="#050C16" stroke="#0E1828" strokeWidth="0.5"/>
          <path d="M60,304 L110,290 C140,278 170,274 210,272" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.5"/>
          <path d="M990,272 C1030,274 1060,278 1090,290 L1140,304" fill="none" stroke="#0E1828" strokeWidth="0.8" opacity="0.5"/>
          {[70,85,100,1100,1115,1130].map((x,i)=><circle key={`r${i}`} cx={x} cy={298-i%3*3} r={1.2+i%2} fill="#0A1220" opacity="0.4"/>)}

          {/* ── 路由调查扫描线（在海底下方，不与电缆重叠） ── */}
          <g style={{opacity:isH('survey')?1:0.12,transition:'opacity .5s'}}>
            {[280,380,480,580,680,780,880].map((x,i)=>(
              <line key={`sv${i}`} x1={x} y1={278} x2={x} y2={298} stroke="#EC4899" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.5"/>
            ))}
            <Callout x={580} y={308} label={isZh?'路由调查':'Survey'} value={formatUsd(bd.survey)} color="#EC4899" show={isH('survey')} />
          </g>

          {/* ── 电缆辉光底层 ── */}
          <g style={{opacity:isH('cable')?1:0.3,transition:'opacity .5s'}}>
            <path d="M88,248 C160,254 260,258 400,260 C550,262 650,262 800,260 C940,258 1040,254 1112,248" fill="none" stroke="#D4AF37" strokeWidth="14" opacity="0.06" filter="url(#gl2)"/>
          </g>

          {/* ── 近岸段 A（虚线） ── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.6,transition:'opacity .4s'}}>
            <path d="M88,248 L185,256" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.65"/>
            <text x="136" y="244" textAnchor="middle" fontSize="7.5" fill="#06B6D470" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
          </g>
          {/* ── 近岸段 B ── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.6,transition:'opacity .4s'}}>
            <path d="M1015,256 L1112,248" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.65"/>
            <text x="1064" y="244" textAnchor="middle" fontSize="7.5" fill="#06B6D470" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
          </g>

          {/* ── 深海段电缆（实线 Y=256~262） ── */}
          <g style={{opacity:isH('cable')?1:0.85,transition:'opacity .4s',cursor:'pointer'}} onMouseEnter={()=>setHl('cable')} onMouseLeave={()=>setHl(null)}>
            <path d="M185,256 C350,262 500,264 600,264 C700,264 850,262 1015,256" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2000" style={{animation:'drawL 1.6s ease-out forwards'}}/>
          </g>
          <Callout x={460} y={240} label={isZh?'电缆本体 · 深海+近岸':'Cable · Deep + Shore'} value={formatUsd(bd.cable)} color="#3B82F6" show={isH('cable')} />

          {/* ── 中继器（Y=200~210，在电缆上方，不重叠） ── */}
          <g style={{opacity:isH('repeater')?1:0.6,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('repeater')} onMouseLeave={()=>setHl(null)}>
            {repX.map((x,i)=>{
              const baseY=216;
              const y=baseY+Math.sin((x-195)/810*Math.PI)*3;
              return(
              <g key={i} style={{animation:`fadeI .3s ease ${.4+i*.06}s both`}}>
                {/* 连接线：中继器到电缆 */}
                <line x1={x} y1={y+5} x2={x} y2={260+Math.sin((x-195)/810*Math.PI)*4} stroke="#D4AF3725" strokeWidth="0.5" strokeDasharray="1 2"/>
                <circle cx={x} cy={y} r={isH('repeater')?7:4.5} fill="#8B5CF6" opacity={isH('repeater')?0.75:0.45} style={{transition:'all .3s'}}/>
                <circle cx={x} cy={y} r="2.5" fill="#E0D4FA"/>
              </g>
            );})}
            <Callout x={600} y={196} label={isZh?`中继器 ×${est.repeaterCount} · 每$200K`:`Repeaters ×${est.repeaterCount} · $200K ea`} value={formatUsd(bd.repeaters)} color="#8B5CF6" show={isH('repeater')} />
          </g>

          {/* ── 登陆站 A ── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer',animation:'fadeI .4s ease .1s both'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="54" y="218" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8} style={{transition:'all .3s'}}/>
            <rect x="60" y="224" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="74" y="224" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="60" y="237" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="73" y1="218" x2="73" y2="204" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={73} cy={202} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="73" y="194" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(from,isZh)}</text>
          </g>
          {/* ── 登陆站 B ── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer',animation:'fadeI .4s ease .2s both'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="1108" y="218" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8} style={{transition:'all .3s'}}/>
            <rect x="1114" y="224" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="1128" y="224" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="1114" y="237" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="1127" y1="218" x2="1127" y2="204" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={1127} cy={202} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="1127" y="194" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(to,isZh)}</text>
          </g>
          <Callout x={180} y={216} label={isZh?'登陆站 ×2 · 每站$15M':'Stations ×2 · $15M each'} value={formatUsd(bd.landingStations)} color="#22C55E" anchor="start" show={isH('station')} />

          {/* ── 许可合规旗帜 ── */}
          <g style={{opacity:isH('permit')?1:0.15,transition:'opacity .5s'}}>
            <g transform="translate(94,174)"><line x1="0" y1="0" x2="0" y2="14" stroke="#F59E0B60" strokeWidth="0.8"/><path d="M1,0 L11,3 L1,6 Z" fill="#F59E0B40"/></g>
            <g transform="translate(1148,174)"><line x1="0" y1="0" x2="0" y2="14" stroke="#F59E0B60" strokeWidth="0.8"/><path d="M-1,0 L-11,3 L-1,6 Z" fill="#F59E0B40"/></g>
            <Callout x={94} y={172} label={isZh?'许可合规 ×2国':'Permits ×2 jur.'} value={formatUsd(bd.permits)} color="#F59E0B" anchor="start" show={isH('permit')} />
          </g>

          {/* ── 预备费标注 (独立高亮区 — 整条线微红) ── */}
          <g style={{opacity:isH('contingency')?0.6:0,transition:'opacity .4s',pointerEvents:'none'}}>
            <path d="M185,256 C350,262 500,264 600,264 C700,264 850,262 1015,256" fill="none" stroke="#EF4444" strokeWidth="6" opacity="0.15"/>
          </g>
          <Callout x={750} y={240} label={isZh?'预备费 7%':'Contingency 7%'} value={formatUsd(bd.contingency)} color="#EF4444" show={isH('contingency')} />

          {/* ── 风险溢价标注 (独立高亮区 — 整条线微橙) ── */}
          <g style={{opacity:isH('risk')?0.6:0,transition:'opacity .4s',pointerEvents:'none'}}>
            <path d="M185,256 C350,262 500,264 600,264 C700,264 850,262 1015,256" fill="none" stroke="#F97316" strokeWidth="10" opacity="0.1"/>
          </g>
          <Callout x={850} y={196} label={isZh?'风险溢价 10%':'Risk Premium 10%'} value={formatUsd(bd.riskPremium)} color="#F97316" show={isH('risk')} />

          {/* ── 底部指标带 ── */}
          <g style={{animation:'fadeI .6s ease .6s both'}}>
            <rect x="250" y="318" width="700" height="18" rx="5" fill="rgba(255,255,255,.012)"/>
            <text x="380" y="330" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'全口径 $/km':'All-in $/km'}: <tspan fill="#F0E6C8" fontWeight="600">{est.unitMetrics.usdPerKm?`$${Math.round(est.unitMetrics.usdPerKm/1000)}K`:'-'}</tspan></text>
            <text x="600" y="330" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'中继器':'Repeaters'}: <tspan fill="#F0E6C8" fontWeight="600">×{est.repeaterCount}</tspan></text>
            <text x="820" y="330" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'年化 OPEX':'OPEX/yr'}: <tspan fill="#F0E6C8" fontWeight="600">{formatUsd(est.opex.totalOpexPerYear)}</tspan></text>
          </g>

          {/* 数据脉冲光点 */}
          <circle r="3" fill="#F0E6C8" opacity="0">
            <animateMotion dur="5s" repeatCount="indefinite" path="M88,248 C160,254 260,258 400,260 C550,262 650,262 800,260 C940,258 1040,254 1112,248"/>
            <animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0;0.9;0.9;0" keyTimes="0;0.08;0.92;1"/>
          </circle>
          <rect width="1200" height="340" fill="url(#eFade)"/>
        </svg>

        {/* SVG 底部图例 */}
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
          <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:2}}>{isZh?'海运航线距离':'Sea Route'}</div>
          <div key={ak} style={{fontSize:16,fontWeight:700,color:'#F0E6C8',fontFamily:"'DM Sans',sans-serif",animation:'fadeU .5s ease-out'}}>{dist.toLocaleString()} km</div>
          {(isLandlocked(from)||isLandlocked(to))&&<div style={{fontSize:8,color:'#F59E0B80',marginTop:2}}>{isZh?'含内陆接驳':'Incl. overland'}: {[from,to].filter(isLandlocked).map(c=>{const p=LANDLOCKED_PORTS[c];return p?(isZh?`${cn(c,true)}→${p.portZh} ${p.overlandKm}km`:`${c}→${p.port} ${p.overlandKm}km`):''}).join(' + ')}</div>}
        </div>
        <button onClick={()=>setPick(pick==='to'?null:'to')} style={{padding:'10px 20px',borderRadius:'0 8px 8px 0',border:'1px solid rgba(212,175,55,.25)',borderLeft:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .2s'}}>
          {cn(to,isZh)} ▾
        </button>
        {pick&&<PickerOverlay target={pick}/>}
      </div>

      {/* ─── 敏感性分析 ─── */}
      <div className="bc" style={{padding:'16px 20px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:14}}>{isZh?'敏感性分析 — 悬停联动剖面图':'Sensitivity Analysis — Hover to Highlight'}</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80,textAlign:'right'}}>{isZh?'← 成本降低':'← Cost ↓'}</span>
          <div style={{flex:1,maxWidth:600,height:1,background:'rgba(212,175,55,.08)',margin:'0 12px'}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80}}>{isZh?'成本增加 →':'Cost ↑ →'}</span>
        </div>
        {SENSITIVITY_ITEMS.map(si=>{const sec=secMap[si.param]||si.param;const on=hl===sec;return(
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
        <p style={{fontSize:9,color:'rgba(255,255,255,.1)',marginTop:12,lineHeight:1.6}}>{isZh?'悬停参数名联动上方剖面图。成本估算基于行业公开参数模型，实际因地形、深度和供应链而异。':'Hover labels to highlight diagram elements. Parametric model based on public industry data.'}</p>
      </div>

      <style>{`@keyframes fadeU{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeI{from{opacity:0}to{opacity:1}}@keyframes drawL{from{stroke-dashoffset:2000}to{stroke-dashoffset:0}}`}</style>
    </section>
  );
}

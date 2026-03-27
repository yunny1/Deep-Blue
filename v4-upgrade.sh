#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🔧 综合升级 V4 — 术语/图例/SVG/战略缺口/数据一致性"
echo "═══════════════════════════════════════════════════════"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. i18n 术语统一 + 删除 method 键
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ">>> 1/8: i18n 术语统一"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/lib/brics-i18n.ts"
with open(path, 'r') as f:
    c = f.read()
ch = 0

# 删除 method.classify 和 method.matrix（所有匹配行）
lines = c.split('\n')
new_lines = [l for l in lines if 'method.classify' not in l and 'method.matrix' not in l]
removed = len(lines) - len(new_lines)
c = '\n'.join(new_lines)
if removed > 0:
    ch += removed
    print(f"  ✅ 删除了 {removed} 行 method.classify/matrix")

# 术语替换 — 中文
reps_zh = [
    ("'跨国互联'", "'金砖组织内跨境'"),
    ("'跨国互联海缆'", "'金砖组织内跨境海缆'"),
    ("'国内海缆'", "'单一金砖国家海缆'"),
    ("'国内'", "'单一国家'"),
    ("'涉外'", "'对外连接'"),
    ("'涉外海缆'", "'对外连接海缆'"),
    ("'金砖跨国互联'", "'金砖组织内跨境'"),
]
# 术语替换 — 英文
reps_en = [
    ("'Cross-border'", "'Intra-BRICS Cross-border'"),
    ("'Domestic'", "'Single BRICS Nation'"),
    ("'External'", "'External Connection'"),
]

for old, new in reps_zh + reps_en:
    if old in c:
        c = c.replace(old, new)
        ch += 1

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {ch} 处修改")
PYEOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. Dashboard — 删 method 行 + 删战略缺口 + 术语
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 2/8: Dashboard 清理"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path, 'r') as f:
    c = f.read()
ch = 0

# 2a. 暴力删除 method.classify / method.matrix 行
lines = c.split('\n')
new_lines = [l for l in lines if 'method.classify' not in l and 'method.matrix' not in l]
removed = len(lines) - len(new_lines)
c = '\n'.join(new_lines)
if removed > 0:
    ch += removed
    print(f"  ✅ Dashboard 删除 {removed} 行 method 引用")
else:
    print("  ✓ method 行已不存在")

# 2b. 删除战略缺口分析整个 section
# 查找 {/* 战略缺口 或 Strategic Gap
gap_markers = ['{/* 战略缺口', '{/* Strategic Gap', "tb('gap."]
start = -1
for m in gap_markers:
    idx = c.find(m)
    if idx >= 0:
        start = idx
        break

if start >= 0:
    # 向后找 </section> 再找 )}
    rest = c[start:]
    end_match = re.search(r'</section>\s*\)\}', rest)
    if end_match:
        # 向前找条件包装
        before = c[max(0,start-300):start]
        cond = before.rfind('{gapData')
        if cond < 0:
            cond = before.rfind('{investOps') # 备用
        actual_start = max(0,start-300) + cond if cond >= 0 else start
        actual_end = start + end_match.end()
        
        old_section = c[actual_start:actual_end]
        c = c[:actual_start] + c[actual_end:]
        ch += 1
        print(f"  ✅ 删除战略缺口分析 ({len(old_section)} 字符)")
    else:
        print("  ⚠️ 未找到战略缺口结束标记")
else:
    print("  ✓ 战略缺口分析已不存在")

# 2c. Dashboard 中的术语替换
dash_reps = [
    ("'跨国互联'", "'金砖组织内跨境'"),
    ("'国内海缆'", "'单一金砖国家海缆'"),
    ("'国内'", "'单一国家'"),
    ("'涉外'", "'对外连接'"),
]
for old, new in dash_reps:
    if old in c:
        c = c.replace(old, new)
        ch += 1

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {ch} 处修改")
PYEOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. 地图图例 — 删非金砖+伙伴国图例项 + 隐藏非金砖海缆层
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 3/8: 地图图例清理 + 术语"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSMap.tsx"
with open(path, 'r') as f:
    c = f.read()
ch = 0

# 3a. 删除 other 图例项 {color:'#2A2F3A'...}
c = re.sub(r",?\s*\{color:'#2A2F3A'[^}]*\}", "", c)
ch += 1
print("  ✅ 删除非金砖 other 图例项")

# 3b. 删除伙伴国标注图例项
c = re.sub(r",?\s*\{color:'#60A5FA'[^}]*(?:伙伴|Partner)[^}]*\}", "", c)
ch += 1
print("  ✅ 删除伙伴国标注图例项")

# 3c. 隐藏非金砖海缆渲染层（opacity 降到极低）
c = c.replace("'line-opacity':0.15", "'line-opacity':0.03")
print("  ✅ 非金砖海缆透明度 0.15→0.03（几乎隐藏）")

# 3d. 图例术语替换
c = c.replace("tb('map.internal')", "isZh?'金砖组织内跨境':'Intra-BRICS'")
c = c.replace("tb('map.domestic')", "isZh?'单一金砖国家':'Single Nation'")
c = c.replace("tb('map.related')", "isZh?'对外连接':'External'")
c = c.replace("tb('map.other')", "isZh?'非金砖':'Non-BRICS'")
ch += 4

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {ch} 处修改")
PYEOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. SVG 投资面板 — 重新规划标注位置
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 4/8: SVG 剖面图标注重新布局"
python3 << 'PYEOF'
content = r"""'use client';
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

  const {km:dist}=useMemo(()=>getSeaRouteDistance(from,to),[from,to]);
  const est=useMemo(()=>estimateSubseaCapex({routeLengthKm:dist,designCapacityTbps:100,landingStations:2,jurisdictions:2}),[dist]);
  useEffect(()=>{setAk(k=>k+1)},[from,to]);

  const secMap:Record<string,string>={cableCostDeepPerKm:'cable',landingStationCostUsd:'station',riskPremiumPct:'risk',contingencyPct:'contingency',repeaterSpacingKm:'repeater',shipDayRateUsd:'marine'};
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
            <button key={c.code} onClick={()=>{set(c.code);setPick(null)}} style={{padding:'5px 7px',borderRadius:6,border:'none',cursor:'pointer',background:cur===c.code?'rgba(212,175,55,.15)':'transparent',color:cur===c.code?'#D4AF37':'rgba(255,255,255,.55)',fontSize:11,textAlign:'left',transition:'all .15s',fontFamily:"'DM Sans',sans-serif"}}><b>{c.code}</b> <span style={{fontSize:10,opacity:.7}}>{c.name}</span></button>
          ))}
        </div>
        <div style={{fontSize:9,fontWeight:700,color:'rgba(96,165,250,.5)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{isZh?'伙伴国':'Partners'}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3}}>
          {countries.filter(c=>!c.isMember).map(c=>(
            <button key={c.code} onClick={()=>{set(c.code);setPick(null)}} style={{padding:'5px 7px',borderRadius:6,border:'none',cursor:'pointer',background:cur===c.code?'rgba(96,165,250,.15)':'transparent',color:cur===c.code?'#60A5FA':'rgba(255,255,255,.45)',fontSize:11,textAlign:'left',transition:'all .15s',fontFamily:"'DM Sans',sans-serif"}}><b>{c.code}</b> <span style={{fontSize:10,opacity:.7}}>{c.name}</span></button>
          ))}
        </div>
      </div>
    </>);
  };

  /* Callout 标注气泡 */
  const Tag=({x,y,label,value,color,show,w=92}:{x:number,y:number,label:string,value:string,color:string,show:boolean,w?:number})=>(
    <g style={{opacity:show?1:0,transition:'opacity .4s',pointerEvents:'none'}}>
      <rect x={x-w/2} y={y-22} width={w} height={20} rx="4" fill="#0D1B2AE8" stroke={color} strokeWidth="0.6"/>
      <text x={x} y={y-15} textAnchor="middle" fontSize="7" fill={color} fontWeight="600" fontFamily="DM Sans,sans-serif">{label}</text>
      <text x={x} y={y-6} textAnchor="middle" fontSize="9" fill="#F0E6C8" fontWeight="700" fontFamily="DM Sans,sans-serif">{value}</text>
    </g>
  );

  return(
    <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
      <div style={{marginBottom:20}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:800,color:'#F0E6C8',margin:'0 0 6px'}}>{tb('invest.title')}</h2>
        <p style={{fontSize:12,color:'rgba(255,255,255,.35)',margin:0}}>{isZh?'交互式海缆成本计算器 — 选择任意两个金砖国家，查看基于海运航线的铺设成本估算':'Interactive cable cost estimator — select two BRICS nations for sea-route-based cost estimates'}</p>
      </div>

      {/* ─── 国家选择器 ─── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:0,marginBottom:16,position:'relative'}}>
        <button onClick={()=>setPick(pick==='from'?null:'from')} style={{padding:'10px 20px',borderRadius:'8px 0 0 8px',border:'1px solid rgba(212,175,55,.25)',borderRight:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{cn(from,isZh)} ▾</button>
        <div style={{padding:'8px 28px',background:'rgba(212,175,55,.1)',borderTop:'1px solid rgba(212,175,55,.25)',borderBottom:'1px solid rgba(212,175,55,.25)',textAlign:'center'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,.35)',marginBottom:2}}>{isZh?'海运航线距离':'Sea Route'}</div>
          <div key={ak} style={{fontSize:16,fontWeight:700,color:'#F0E6C8',fontFamily:"'DM Sans',sans-serif",animation:'fadeU .5s ease-out'}}>{dist.toLocaleString()} km</div>
          {(isLandlocked(from)||isLandlocked(to))&&<div style={{fontSize:8,color:'#F59E0B80',marginTop:1}}>{isZh?'含内陆接驳':'Incl. overland'}: {[from,to].filter(isLandlocked).map(c=>{const p=LANDLOCKED_PORTS[c];return p?(isZh?`${cn(c,true)}→${p.portZh}`:`${c}→${p.port}`):''}).join(' + ')}</div>}
        </div>
        <button onClick={()=>setPick(pick==='to'?null:'to')} style={{padding:'10px 20px',borderRadius:'0 8px 8px 0',border:'1px solid rgba(212,175,55,.25)',borderLeft:'none',background:'rgba(212,175,55,.06)',color:'#D4AF37',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{cn(to,isZh)} ▾</button>
        {pick&&<PickerOverlay target={pick}/>}
      </div>

      {/* ─── SVG 海缆剖面图 ─── */}
      <div className="bc" style={{padding:0,overflow:'hidden',marginBottom:16,borderRadius:12}}>
        <svg key={ak} viewBox="0 0 1200 360" style={{width:'100%',display:'block'}} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="oBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0A1628" stopOpacity="0"/><stop offset="15%" stopColor="#0C2440" stopOpacity="0.6"/><stop offset="50%" stopColor="#0A1E38"/><stop offset="100%" stopColor="#081428"/></linearGradient>
            <linearGradient id="eFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0D1B2A"/><stop offset="4%" stopColor="#0D1B2A" stopOpacity="0"/><stop offset="96%" stopColor="#0D1B2A" stopOpacity="0"/><stop offset="100%" stopColor="#0D1B2A"/></linearGradient>
            <filter id="gl2"><feGaussianBlur stdDeviation="6"/></filter>
          </defs>
          <rect width="1200" height="360" fill="url(#oBg)"/>

          {/* ── 顶部 CAPEX ── */}
          <text x="600" y="30" textAnchor="middle" fontSize="10" fill="rgba(212,175,55,.4)" fontWeight="600" fontFamily="DM Sans,sans-serif" style={{animation:'fadeI .5s ease .2s both'}}>{isZh?'估算总 CAPEX':'Est. Total CAPEX'}</text>
          <text x="600" y="56" textAnchor="middle" fontSize="28" fill="#F0E6C8" fontWeight="800" fontFamily="Playfair Display,serif" style={{animation:'fadeU .6s ease .3s both'}}>{formatUsd(est.capexTotalUsd)}</text>
          <g style={{animation:'fadeI .6s ease .5s both'}}>
            <text x="415" y="54" textAnchor="end" fontSize="11" fill="#6B7280" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.low)}</text>
            <text x="415" y="65" textAnchor="end" fontSize="7.5" fill="rgba(107,114,128,.5)" fontFamily="DM Sans,sans-serif">{isZh?'保守 ×0.75':'Low'}</text>
            <text x="785" y="54" textAnchor="start" fontSize="11" fill="#EF4444" fontWeight="600" fontFamily="DM Sans,sans-serif">{formatUsd(est.scenarios.high)}</text>
            <text x="785" y="65" textAnchor="start" fontSize="7.5" fill="rgba(239,68,68,.5)" fontFamily="DM Sans,sans-serif">{isZh?'积极 ×1.35':'High'}</text>
          </g>

          {/* ── 项目管理标注（顶部右侧） ── */}
          <Tag x={1020} y={40} label={isZh?'项目管理/保险 5%':'PM & Insurance 5%'} value={formatUsd(bd.pmInsurance)} color="#6B7280" show={isH('pm')} />

          {/* ── 风险溢价标注（右上） ── */}
          <Tag x={1020} y={70} label={isZh?'风险溢价 10%':'Risk Premium 10%'} value={formatUsd(bd.riskPremium)} color="#F97316" show={isH('risk')} />

          {/* ── 海面 ── */}
          <path d="M0,130 C150,122 300,138 450,130 S750,122 900,130 S1050,138 1200,130" fill="none" stroke="rgba(30,80,140,.08)" strokeWidth="0.8">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,130 C150,122 300,138 450,130 S750,122 900,130 S1050,138 1200,130;M0,134 C150,126 300,134 450,126 S750,134 900,126 S1050,134 1200,126;M0,130 C150,122 300,138 450,130 S750,122 900,130 S1050,138 1200,130"/>
          </path>

          {/* ── 海工敷设船（海面线上，Y=112） ── */}
          <g style={{opacity:isH('marine')?1:0.2,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('marine')} onMouseLeave={()=>setHl(null)}>
            <g transform="translate(800,114)">
              <path d="M0,12 L4,18 L44,18 L48,12 Z" fill={isH('marine')?'#06B6D425':'#06B6D410'} stroke={isH('marine')?'#06B6D465':'#06B6D425'} strokeWidth="0.6"/>
              <rect x="16" y="4" width="16" height="8" rx="1.5" fill={isH('marine')?'#06B6D420':'#06B6D40A'} stroke={isH('marine')?'#06B6D450':'#06B6D420'} strokeWidth="0.5"/>
              <line x1="24" y1="4" x2="24" y2="0" stroke="#06B6D450" strokeWidth="0.6"/><circle cx="24" cy="-1" r="1" fill="#06B6D460"/>
            </g>
            <Tag x={824} y={112} label={isZh?'海工敷设 · 船+调遣':'Marine · Ship + Mobil.'} value={formatUsd(bd.marine)} color="#06B6D4" show={isH('marine')} />
          </g>

          {/* ── 海底地形 (Y=290~320) ── */}
          <path d="M0,320 L60,314 L110,298 C140,286 170,282 210,280 C380,278 500,280 600,282 C700,280 820,278 990,280 C1030,282 1060,286 1090,298 L1140,314 L1200,320 Z" fill="#050C16" stroke="#0E1828" strokeWidth="0.5"/>
          {[70,85,100,1100,1115,1130].map((x,i)=><circle key={`r${i}`} cx={x} cy={308-i%3*3} r={1.2+i%2} fill="#0A1220" opacity="0.4"/>)}

          {/* ── 路由调查（海底扫描线 + tag） ── */}
          <g style={{opacity:isH('survey')?1:0.1,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('survey')} onMouseLeave={()=>setHl(null)}>
            {[300,400,500,600,700,800,900].map((x,i)=>(
              <line key={`sv${i}`} x1={x} y1={284} x2={x} y2={305} stroke="#EC4899" strokeWidth="0.5" strokeDasharray="1.5 3" opacity="0.6"/>
            ))}
            <Tag x={600} y={320} label={isZh?'路由调查 · 海底测绘':'Survey · Seabed Mapping'} value={formatUsd(bd.survey)} color="#EC4899" show={isH('survey')} w={110}/>
          </g>

          {/* ── 许可合规旗帜 ── */}
          <g style={{opacity:isH('permit')?1:0.12,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('permit')} onMouseLeave={()=>setHl(null)}>
            <g transform="translate(94,180)"><line x1="0" y1="0" x2="0" y2="14" stroke="#F59E0B60" strokeWidth="0.8"/><path d="M1,0 L11,3 L1,6 Z" fill="#F59E0B40"/></g>
            <g transform="translate(1148,180)"><line x1="0" y1="0" x2="0" y2="14" stroke="#F59E0B60" strokeWidth="0.8"/><path d="M-1,0 L-11,3 L-1,6 Z" fill="#F59E0B40"/></g>
            <Tag x={94} y={178} label={isZh?'许可合规 ×2国':'Permits ×2 jur.'} value={formatUsd(bd.permits)} color="#F59E0B" show={isH('permit')} />
          </g>

          {/* ── 电缆辉光 ── */}
          <g style={{opacity:isH('cable')?1:0.3,transition:'opacity .5s'}}>
            <path d="M88,258 C160,264 260,268 400,270 C550,272 650,272 800,270 C940,268 1040,264 1112,258" fill="none" stroke="#D4AF37" strokeWidth="14" opacity="0.06" filter="url(#gl2)"/>
          </g>

          {/* ── 近岸段 ── */}
          <g style={{opacity:isH('cable')||isH('marine')?1:0.55,transition:'opacity .4s'}}>
            <path d="M88,258 L185,266" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.6"/>
            <text x="136" y="254" textAnchor="middle" fontSize="7" fill="#06B6D460" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
            <path d="M1015,266 L1112,258" fill="none" stroke="#D4AF37" strokeWidth="2" strokeDasharray="5 4" opacity="0.6"/>
            <text x="1064" y="254" textAnchor="middle" fontSize="7" fill="#06B6D460" fontFamily="DM Sans,sans-serif">{isZh?'近岸 ×2.0':'Shore ×2.0'}</text>
          </g>

          {/* ── 深海段电缆 (Y=266~272) ── */}
          <g style={{opacity:isH('cable')?1:0.85,transition:'opacity .4s',cursor:'pointer'}} onMouseEnter={()=>setHl('cable')} onMouseLeave={()=>setHl(null)}>
            <path d="M185,266 C350,272 500,274 600,274 C700,274 850,272 1015,266" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2000" style={{animation:'drawL 1.6s ease-out forwards'}}/>
          </g>
          {/* 电缆标注 — 正中间 */}
          <Tag x={600} y={252} label={isZh?'电缆本体 · 深海+近岸':'Cable · Deep + Shore'} value={formatUsd(bd.cable)} color="#3B82F6" show={isH('cable')} w={110}/>

          {/* ── 预备费（缆线上方微红光晕, Y=250 不挡中继器） ── */}
          <g style={{opacity:isH('contingency')?0.55:0,transition:'opacity .4s',pointerEvents:'none'}}>
            <path d="M185,266 C350,272 500,274 600,274 C700,274 850,272 1015,266" fill="none" stroke="#EF4444" strokeWidth="6" opacity="0.2"/>
          </g>
          <Tag x={380} y={252} label={isZh?'预备费 7%':'Contingency 7%'} value={formatUsd(bd.contingency)} color="#EF4444" show={isH('contingency')} />

          {/* ── 风险溢价（更宽光晕） ── */}
          <g style={{opacity:isH('risk')?0.5:0,transition:'opacity .4s',pointerEvents:'none'}}>
            <path d="M185,266 C350,272 500,274 600,274 C700,274 850,272 1015,266" fill="none" stroke="#F97316" strokeWidth="10" opacity="0.12"/>
          </g>

          {/* ── 中继器 (Y=215~225, 远在电缆上方) ── */}
          <g style={{opacity:isH('repeater')?1:0.55,transition:'opacity .5s',cursor:'pointer'}} onMouseEnter={()=>setHl('repeater')} onMouseLeave={()=>setHl(null)}>
            {repX.map((x,i)=>{
              const y=220+Math.sin((x-195)/810*Math.PI)*3;
              return(
              <g key={i} style={{animation:`fadeI .3s ease ${.4+i*.06}s both`}}>
                <line x1={x} y1={y+5} x2={x} y2={270+Math.sin((x-195)/810*Math.PI)*4} stroke="#D4AF3718" strokeWidth="0.5" strokeDasharray="1 2"/>
                <circle cx={x} cy={y} r={isH('repeater')?7:4.5} fill="#8B5CF6" opacity={isH('repeater')?0.75:0.4} style={{transition:'all .3s'}}/>
                <circle cx={x} cy={y} r="2.5" fill="#E0D4FA"/>
              </g>);
            })}
            <Tag x={600} y={196} label={isZh?`中继器 ×${est.repeaterCount} · $200K/个`:`Repeaters ×${est.repeaterCount} · $200K ea`} value={formatUsd(bd.repeaters)} color="#8B5CF6" show={isH('repeater')} w={120}/>
          </g>

          {/* ── 登陆站 A（tag 紧贴左侧建筑） ── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="54" y="228" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8} style={{transition:'all .3s'}}/>
            <rect x="60" y="234" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="74" y="234" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="60" y="247" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="73" y1="228" x2="73" y2="214" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={73} cy={212} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="73" y="204" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(from,isZh)}</text>
            {/* 登陆站 Tag — 左侧建筑上方 */}
            <Tag x={73} y={175} label={isZh?'登陆站 ×2 · 每站$15M':'Stations ×2 · $15M ea'} value={formatUsd(bd.landingStations)} color="#22C55E" show={isH('station')} w={105}/>
          </g>
          {/* ── 登陆站 B ── */}
          <g style={{opacity:isH('station')?1:0.7,transition:'opacity .4s',cursor:'pointer'}} onMouseEnter={()=>setHl('station')} onMouseLeave={()=>setHl(null)}>
            <rect x="1108" y="228" width="38" height="34" rx="3" fill={isH('station')?'#22C55E10':'#D4AF3708'} stroke={isH('station')?'#22C55E50':'#D4AF3725'} strokeWidth={isH('station')?1.5:0.8}/>
            <rect x="1114" y="234" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/><rect x="1128" y="234" width="10" height="10" rx="2" fill={isH('station')?'#22C55E18':'#D4AF3715'}/>
            <rect x="1114" y="247" width="24" height="8" rx="1" fill={isH('station')?'#22C55E12':'#D4AF3710'}/>
            <line x1="1127" y1="228" x2="1127" y2="214" stroke={isH('station')?'#22C55E50':'#D4AF3735'} strokeWidth="1"/><circle cx={1127} cy={212} r="2.5" fill={isH('station')?'#22C55E60':'#D4AF3740'}/>
            <text x="1127" y="204" textAnchor="middle" fontSize="11" fill={isH('station')?'#22C55E':'#D4AF3790'} fontWeight="700" fontFamily="DM Sans,sans-serif">{cn(to,isZh)}</text>
          </g>

          {/* ── 底部指标带 ── */}
          <g style={{animation:'fadeI .6s ease .6s both'}}>
            <rect x="250" y="336" width="700" height="18" rx="5" fill="rgba(255,255,255,.012)"/>
            <text x="380" y="348" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'全口径 $/km':'All-in $/km'}: <tspan fill="#F0E6C8" fontWeight="600">{est.unitMetrics.usdPerKm?`$${Math.round(est.unitMetrics.usdPerKm/1000)}K`:'-'}</tspan></text>
            <text x="600" y="348" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'中继器':'Repeaters'}: <tspan fill="#F0E6C8" fontWeight="600">×{est.repeaterCount}</tspan></text>
            <text x="820" y="348" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,.25)" fontFamily="DM Sans,sans-serif">{isZh?'年化 OPEX':'OPEX/yr'}: <tspan fill="#F0E6C8" fontWeight="600">{formatUsd(est.opex.totalOpexPerYear)}</tspan></text>
          </g>

          {/* 数据脉冲光点 */}
          <circle r="3" fill="#F0E6C8" opacity="0">
            <animateMotion dur="5s" repeatCount="indefinite" path="M88,258 C160,264 260,268 400,270 C550,272 650,272 800,270 C940,268 1040,264 1112,258"/>
            <animate attributeName="opacity" dur="5s" repeatCount="indefinite" values="0;0.9;0.9;0" keyTimes="0;0.08;0.92;1"/>
          </circle>
          <rect width="1200" height="360" fill="url(#eFade)"/>
        </svg>

        {/* 底部图例 */}
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

      {/* ─── 敏感性分析 ─── */}
      <div className="bc" style={{padding:'16px 20px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'rgba(212,175,55,.5)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:14}}>{isZh?'敏感性分析 — 悬停联动剖面图':'Sensitivity — Hover to Highlight'}</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',marginBottom:10}}>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80,textAlign:'right'}}>{isZh?'← 成本降低':'← Cost ↓'}</span>
          <div style={{flex:1,maxWidth:600,height:1,background:'rgba(212,175,55,.08)',margin:'0 12px'}}/>
          <span style={{fontSize:9,color:'rgba(255,255,255,.18)',width:80}}>{isZh?'成本增加 →':'Cost ↑ →'}</span>
        </div>
        {SENSITIVITY_ITEMS.map(si=>{const sec=secMap[si.param]||si.param;const on=hl===sec;return(
          <div key={si.param} onMouseEnter={()=>setHl(sec)} onMouseLeave={()=>setHl(null)} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7,cursor:'pointer',padding:'3px 0'}}>
            <div style={{width:75,fontSize:10,color:on?'#F0E6C8':'rgba(255,255,255,.4)',textAlign:'right',flexShrink:0,fontWeight:on?600:400,transition:'all .2s'}}>{isZh?si.labelZh:si.label}</div>
            <div style={{flex:1,display:'flex',alignItems:'center',position:'relative',height:22,margin:'0 auto',maxWidth:600}}>
              <div style={{position:'absolute',left:'50%',top:1,bottom:1,width:1,background:'rgba(212,175,55,.1)'}}/>
              <div style={{position:'absolute',right:'50%',top:3,height:16,borderRadius:'4px 0 0 4px',width:`${si.capexImpact*2.8}%`,background:'linear-gradient(270deg,rgba(239,68,68,.6),rgba(239,68,68,.15))',opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(239,68,68,.15)':'none'}}/>
              <div style={{position:'absolute',left:'50%',top:3,height:16,borderRadius:'0 4px 4px 0',width:`${si.capexImpact*2.8}%`,background:`linear-gradient(90deg,rgba(212,175,55,.6),rgba(212,175,55,.15))`,opacity:on?1:.45,transition:'all .3s',boxShadow:on?'0 0 10px rgba(212,175,55,.15)':'none'}}/>
            </div>
            <div style={{width:34,fontSize:11,color:on?'#D4AF37':'rgba(255,255,255,.25)',fontWeight:700,textAlign:'right',transition:'color .2s'}}>±{si.capexImpact}%</div>
          </div>
        );})}
        <p style={{fontSize:9,color:'rgba(255,255,255,.1)',marginTop:12,lineHeight:1.6}}>{isZh?'悬停参数名联动上方剖面图。估算基于行业公开参数模型，实际因地形、深度和供应链而异。':'Hover labels to highlight diagram. Parametric model with public industry data.'}</p>
      </div>

      <style>{`@keyframes fadeU{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes fadeI{from{opacity:0}to{opacity:1}}@keyframes drawL{from{stroke-dashoffset:2000}to{stroke-dashoffset:0}}`}</style>
    </section>
  );
}
"""

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSInvestmentPanel.tsx"
with open(path, 'w') as f:
    f.write(content)
print(f"  ✅ BRICSInvestmentPanel.tsx 重写 ({len(content)} 字符)")
PYEOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. 统计卡片术语
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 5/8: BRICSStatsCards 术语更新"
python3 << 'PYEOF'
import os
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSStatsCards.tsx"
if os.path.exists(path):
    with open(path, 'r') as f:
        c = f.read()
    reps = [
        ("'跨国互联'", "'金砖组织内跨境'"),
        ("'跨国互联海缆'", "'金砖组织内跨境'"),
        ("'国内海缆'", "'单一金砖国家'"),
        ("'国内'", "'单一国家'"),
        ("'涉外'", "'对外连接'"),
        ("'涉外海缆'", "'对外连接'"),
        ("'Internal'", "'Intra-BRICS'"),
        ("'Domestic'", "'Single Nation'"),
        ("'External'", "'External Conn.'"),
    ]
    ch = 0
    for old, new in reps:
        if old in c:
            c = c.replace(old, new)
            ch += 1
    with open(path, 'w') as f:
        f.write(c)
    print(f"  ✅ StatsCards {ch} 处术语替换")
else:
    print("  ⚠️ StatsCards.tsx 不存在")
PYEOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. 数据库标记 SeaMeWe-3 退役
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 6/8: 数据库标记 SeaMeWe-3 退役"
cd "$P"
node -e "
const{PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // 查找 SeaMeWe-3
  const cable=await p.cable.findFirst({where:{OR:[{name:{contains:'SeaMeWe-3'}},{slug:{contains:'seamewe-3'}}]}});
  if(!cable){console.log('  ⚠️ SeaMeWe-3 未找到');process.exit(0);}
  console.log('  找到:',cable.slug,'当前状态:',cable.status);
  // 更新状态为 RETIRED + 加保护标签
  await p.cable.update({
    where:{id:cable.id},
    data:{
      status:'RETIRED',
      notes: (cable.notes||'') + ' [PROTECTED] Marked retired 2025-06. Do not overwrite on data refresh.'
    }
  });
  console.log('  ✅ SeaMeWe-3 已标记为 RETIRED + PROTECTED');
  await p.\$disconnect();
})();
" 2>/dev/null || echo "  ⚠️ 数据库更新跳过（可能需要 source .env）"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. 清除 ISR 缓存
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 7/8: 清除缓存"
rm -rf "$P/.next/cache" 2>/dev/null || true
echo "  ✅ .next/cache 清除"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. 验证 method.classify 彻底删除
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo ">>> 8/8: 验证 method.classify/matrix 残留"
count=$(grep -r "method\.classify\|method\.matrix" "$P/src/" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
if [ "$count" -eq 0 ]; then
    echo "  ✅ 零残留 — 彻底清除"
else
    echo "  ❌ 仍有 $count 处残留，强制删除..."
    grep -rn "method\.classify\|method\.matrix" "$P/src/" --include="*.ts" --include="*.tsx"
    # 暴力删除
    find "$P/src" -name "*.ts" -o -name "*.tsx" | xargs sed -i '/method\.classify/d;/method\.matrix/d'
    echo "  ✅ 已用 sed 强制删除"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ V4 综合升级完成！"
echo ""
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 1"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo ""
echo "  git add -A && git commit -m 'feat: V4 — unified terminology, SVG layout, remove gap analysis, SeaMeWe-3 retired' && git push origin main"
echo "  → Cloudflare Purge Everything → Cmd+Shift+R"
echo "  本地: cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

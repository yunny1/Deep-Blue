#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "🚀 BRICS Wave 3.5 升级..."

# ━━━ 1. 部署成本模型库 ━━━
cat > "$P/src/lib/subsea-cost-model.ts" << 'COSTEOF'
export interface SubseaCostInputs { routeLengthKm:number; designCapacityTbps?:number; cableCostDeepPerKm?:number; shoreEndKmEachSide?:number; shoreMultiplier?:number; repeaterSpacingKm?:number; repeaterUnitCost?:number; shipDayRateUsd?:number; layRateDeepKmPerDay?:number; layRateShoreKmPerDay?:number; delayFactor?:number; mobilizationFixedUsd?:number; landingStations?:number; landingStationCostUsd?:number; jurisdictions?:number; permitPerJurisdictionUsd?:number; surveyFixedUsd?:number; pmInsurancePct?:number; contingencyPct?:number; riskPremiumPct?:number; }
export interface CostBreakdown { cable:number; repeaters:number; marine:number; landingStations:number; permits:number; survey:number; pmInsurance:number; contingency:number; riskPremium:number; }
export interface SubseaCostOutput { capexTotalUsd:number; repeaterCount:number; breakdown:CostBreakdown; unitMetrics:{usdPerKm:number|null;usdPerTbps:number|null}; scenarios:{low:number;base:number;high:number}; opex:{fixedOpexPerYear:number;expectedRepairPerYear:number;totalOpexPerYear:number}; params:{routeLengthKm:number;shoreKm:number;deepKm:number;repeaterSpacingKm:number;landingStations:number;jurisdictions:number;contingencyPct:number;riskPremiumPct:number}; }
export const INDUSTRY_BENCHMARKS = {
  cablePerKm:{min:6000,max:20000,unit:'USD/km',source:'TeleGeography'},
  repeaterSpacing:{min:60,max:80,unit:'km',source:'TeleGeography'},
  repeaterCost:{value:200000,unit:'USD',source:'TeleGeography'},
  totalCapexPerKm:{min:20000,max:40000,unit:'USD/km',source:'World Bank / TRAI'},
  shipDayRate:{value:150000,unit:'USD/day',source:'Briglauer et al.'},
  layRate:{min:100,max:150,unit:'km/day',source:'JRC'},
  landingStation:{min:5000000,max:25000000,unit:'USD',source:'TeleGeography'},
  contingency:{value:7,unit:'%',source:'World Bank'},
  opexPct:{max:6,unit:'% CAPEX/yr',source:'Salience Consulting'},
  repairCost:{min:1000000,max:3000000,unit:'USD/event',source:'ICPC'},
  globalFaults:{min:150,max:200,unit:'events/yr',source:'ITU'},
};
export const SENSITIVITY_ITEMS = [
  {param:'cableCostDeepPerKm',label:'Cable body $/km',labelZh:'电缆本体 $/km',pctChange:20,capexImpact:11,source:'TeleGeography'},
  {param:'landingStationCostUsd',label:'Landing station',labelZh:'登陆站',pctChange:33,capexImpact:5.6,source:'TeleGeography'},
  {param:'riskPremiumPct',label:'Risk premium',labelZh:'风险溢价',pctChange:100,capexImpact:4.5,source:'NDB / OECD'},
  {param:'contingencyPct',label:'Contingency',labelZh:'预备费',pctChange:50,capexImpact:3.3,source:'World Bank'},
  {param:'repeaterSpacingKm',label:'Repeater spacing',labelZh:'中继器间距',pctChange:15,capexImpact:2.5,source:'TeleGeography'},
  {param:'shipDayRateUsd',label:'Ship day rate',labelZh:'船日费',pctChange:20,capexImpact:1.3,source:'Briglauer et al.'},
];
export function estimateSubseaCapex(input:SubseaCostInputs):SubseaCostOutput{
  const L=input.routeLengthKm;const cDeep=input.cableCostDeepPerKm??15000;const shoreEach=input.shoreEndKmEachSide??50;const shoreMul=input.shoreMultiplier??2.0;
  const repSpace=input.repeaterSpacingKm??70;const repCost=input.repeaterUnitCost??200000;const shipRate=input.shipDayRateUsd??150000;
  const layDeep=input.layRateDeepKmPerDay??120;const layShore=input.layRateShoreKmPerDay??30;const delay=input.delayFactor??1.3;const mobil=input.mobilizationFixedUsd??5000000;
  const nLS=input.landingStations??2;const lsCost=input.landingStationCostUsd??15000000;const nJur=input.jurisdictions??2;const permCost=input.permitPerJurisdictionUsd??2000000;
  const survey=input.surveyFixedUsd??5000000;const pmPct=input.pmInsurancePct??0.05;const contPct=input.contingencyPct??0.07;const riskPct=input.riskPremiumPct??0.10;
  const Lshore=Math.min(L,2*shoreEach);const Ldeep=Math.max(0,L-Lshore);
  const cCable=Ldeep*cDeep+Lshore*cDeep*shoreMul;const nRep=Math.max(0,Math.ceil(L/repSpace)-1);const cRep=nRep*repCost;
  const daysDeep=layDeep>0?Ldeep/layDeep:0;const daysShore=layShore>0?Lshore/layShore:0;const cMarine=(daysDeep+daysShore)*shipRate*delay+mobil;
  const cLS=nLS*lsCost;const cPerm=nJur*permCost;const subtotal=cCable+cRep+cMarine+cLS+cPerm+survey;
  const cPM=subtotal*pmPct;const sub2=subtotal+cPM;const cCont=sub2*contPct;const sub3=sub2+cCont;const cRisk=sub3*riskPct;const total=sub3+cRisk;
  const fixedOpex=total*0.03;const expectedRepairs=L*(175/1500000)*2000000;const D=input.designCapacityTbps??0;
  return{capexTotalUsd:total,repeaterCount:nRep,breakdown:{cable:cCable,repeaters:cRep,marine:cMarine,landingStations:cLS,permits:cPerm,survey,pmInsurance:cPM,contingency:cCont,riskPremium:cRisk},
    unitMetrics:{usdPerKm:L>0?total/L:null,usdPerTbps:D>0?total/D:null},scenarios:{low:Math.round(total*0.75),base:Math.round(total),high:Math.round(total*1.35)},
    opex:{fixedOpexPerYear:Math.round(fixedOpex),expectedRepairPerYear:Math.round(expectedRepairs),totalOpexPerYear:Math.round(fixedOpex+expectedRepairs)},
    params:{routeLengthKm:L,shoreKm:Lshore,deepKm:Ldeep,repeaterSpacingKm:repSpace,landingStations:nLS,jurisdictions:nJur,contingencyPct:contPct*100,riskPremiumPct:riskPct*100}};
}
export function formatUsd(usd:number):string{if(usd>=1e9)return`$${(usd/1e9).toFixed(1)}B`;if(usd>=1e6)return`$${(usd/1e6).toFixed(0)}M`;return`$${(usd/1e3).toFixed(0)}K`;}
COSTEOF
echo "  ✅ 1/4 subsea-cost-model.ts"

# ━━━ 2. i18n: 删方法学两句 + 加投资面板翻译键 ━━━
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/lib/brics-i18n.ts"
with open(path, 'r') as f: c = f.read()

# 删掉方法学两句（中文）
c = c.replace("    'method.classify':'分类逻辑：每条海缆根据其登陆站所在国家归属，被唯一分类为\"跨国互联 / 国内 / 涉外 / 非金砖\"四类之一。分类在服务端完成，前端仅渲染结果。',\n", "")
c = c.replace("    'method.matrix':'矩阵算法：基于全球海缆登陆站构建国家级邻接图，对每对成员国执行 BFS（广度优先搜索）。优先寻找仅经过金砖国家的路径，其次寻找任意路径，据此判定四级连接状态。',\n", "")
# 删掉方法学两句（英文）
c = c.replace("    'method.classify':'Classification: Each cable is uniquely classified as Cross-border / Domestic / External / Non-BRICS based on its landing station countries. Classification is computed server-side; the frontend only renders results.',\n", "")
c = c.replace("    'method.matrix':'Matrix Algorithm: A country-level adjacency graph is built from all cable landing stations globally. For each member state pair, BFS (breadth-first search) first seeks a path through BRICS-only nodes, then through any nodes, determining the 4-level connectivity status.',\n", "")

# 加投资面板+国家档案翻译键
zh_new = """    'invest.title':'投资机会分析',
    'invest.subtitle':'基于两段式成本模型的战略缺口投资估算 — CAPEX三档区间、成本构成瀑布图、敏感性分析、行业基准引用',
    'invest.formula':'成本模型',
    'invest.formulaFull':'C_capex = (L_deep × c_deep + L_shore × c_shore × k) + N_rep × c_rep + C_marine + N_LS × C_LS + N_jur × C_perm + C_survey + C_PM × (1+α) × (1+ρ)',
    'invest.benchmarks':'行业基准参数',
    'invest.capex':'估算 CAPEX',
    'invest.opex':'年化 OPEX',
    'invest.breakdown':'成本构成',
    'invest.sensitivity':'敏感性分析',
    'invest.scenarios':'三档估算',
    'invest.low':'保守（×0.75）',
    'invest.base':'基准',
    'invest.high':'积极（×1.35）',
    'invest.confidence':'置信度',
    'invest.sources':'数据来源：ITU海缆韧性报告 · TeleGeography经济学综述 · 世界银行项目文件 · ICPC修复成本参考 · OECD韧性报告',
    'invest.disclaimer':'成本估算基于行业公开参数的参数化模型，实际成本因海底地形、深度、近岸保护需求、许可复杂度和供应链而异。预备费7%（世界银行基准），风险溢价10%（默认中档）。近岸段成本倍数×2.0（因锚害/渔业风险需更高铠装保护，来源：ITU/ICPC）。',
    'invest.perKm':'$/km（全口径）',
    'invest.perTbps':'$/Tbps',
    'invest.opexFixed':'固定运维（3% CAPEX）',
    'invest.opexRepair':'预期修复（故障率×$2M/次）',
    'profile.title':'金砖国家海缆档案',
    'profile.subtitle':'21个金砖成员国和伙伴国各自的海缆基础设施画像',
    'profile.cables':'海缆',
    'profile.active':'在役',
    'profile.stationsLabel':'登陆站',
    'profile.operators':'主要运营商',
    'profile.vendors':'建造商',
    'profile.member':'成员国',
    'profile.partner':'伙伴国',
"""
en_new = """    'invest.title':'Investment Opportunity Analysis',
    'invest.subtitle':'Strategic gap estimates via two-segment cost model — CAPEX tri-scenario, waterfall breakdown, sensitivity analysis, industry benchmarks',
    'invest.formula':'Cost Model',
    'invest.formulaFull':'C_capex = (L_deep × c_deep + L_shore × c_shore × k) + N_rep × c_rep + C_marine + N_LS × C_LS + N_jur × C_perm + C_survey + C_PM × (1+α) × (1+ρ)',
    'invest.benchmarks':'Industry Benchmarks',
    'invest.capex':'Est. CAPEX',
    'invest.opex':'Annual OPEX',
    'invest.breakdown':'Cost Breakdown',
    'invest.sensitivity':'Sensitivity Analysis',
    'invest.scenarios':'Tri-Scenario Estimates',
    'invest.low':'Conservative (×0.75)',
    'invest.base':'Baseline',
    'invest.high':'Aggressive (×1.35)',
    'invest.confidence':'Confidence',
    'invest.sources':'Sources: ITU Cable Resilience · TeleGeography Economics · World Bank Projects · ICPC Repair Cost · OECD Resilience',
    'invest.disclaimer':'Estimates based on parameterized model with public industry data. Actual costs vary by seabed terrain, depth, shore-end protection, permit complexity, and supply chain. Contingency 7% (World Bank benchmark), risk premium 10% (default medium). Shore multiplier ×2.0 (anchor/fishing damage risk per ITU/ICPC).',
    'invest.perKm':'$/km (all-in)',
    'invest.perTbps':'$/Tbps',
    'invest.opexFixed':'Fixed O&M (3% CAPEX)',
    'invest.opexRepair':'Expected repair (fault rate × $2M/event)',
    'profile.title':'BRICS Cable Profiles',
    'profile.subtitle':'Submarine cable infrastructure profiles for all 21 BRICS member and partner nations',
    'profile.cables':'Cables',
    'profile.active':'Active',
    'profile.stationsLabel':'Stations',
    'profile.operators':'Top Operators',
    'profile.vendors':'Vendors',
    'profile.member':'Member',
    'profile.partner':'Partner',
"""

c = c.replace("    'footer.source':'数据来源：Deep Blue 海缆情报平台'", zh_new + "    'footer.source':'数据来源：Deep Blue 海缆情报平台'")
c = c.replace("    'footer.source':'Source: Deep Blue Cable Intelligence Platform'", en_new + "    'footer.source':'Source: Deep Blue Cable Intelligence Platform'")

with open(path, 'w') as f: f.write(c)
print("  ✅ 2/4 brics-i18n.ts (删方法学2句 + 加投资/档案键)")
PYEOF

# ━━━ 3. Map: 加伙伴国银色标注 ━━━
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSMap.tsx"
with open(path, 'r') as f: c = f.read()

# 在 import 中加入 BRICS_PARTNERS
c = c.replace(
    "import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';",
    "import { BRICS_MEMBERS, BRICS_PARTNERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';"
)

# 在成员国标注之后加入伙伴国银色标注
# 找到 hover popup 之前的位置
old_hover = "        // Hover: highlight + detail panel"
new_partner_labels = """        // BRICS partner nation labels (silver dots)
        const partnerFeatures: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return { type: 'Feature', properties: { code, name: isZh ? m?.nameZh : m?.name }, geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] } };
        });
        map.addSource('partner-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: partnerFeatures } });
        map.addLayer({ id: 'partner-dots', type: 'circle', source: 'partner-labels', paint: { 'circle-radius': 3.5, 'circle-color': C.silver, 'circle-opacity': 0.6, 'circle-stroke-color': '#6B7280', 'circle-stroke-width': 0.8 } });
        map.addLayer({ id: 'partner-text', type: 'symbol', source: 'partner-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#8B95A5', 'text-halo-color': C.navy, 'text-halo-width': 1.2 } });

        // Hover: highlight + detail panel"""

c = c.replace(old_hover, new_partner_labels)

# 在图例中加入伙伴国标注说明
old_legend_member = "{color:C.gold,label:tb('map.internal'),n:stats.internal,glow:true,tip:tb('map.internalTip')}"
# 在图例数组末尾加一个伙伴国项
old_other_legend = "{color:'#2A2F3A',label:tb('map.other'),n:stats.other,glow:false,tip:tb('map.otherTip')}"
new_other_legend = """{color:'#2A2F3A',label:tb('map.other'),n:stats.other,glow:false,tip:tb('map.otherTip')},
          {color:C.silver,label:isZh?'● 伙伴国标注':'● Partner Labels',n:10,glow:false,tip:isZh?'10个金砖伙伴国的地理位置银色标注':'Silver labels showing 10 BRICS partner nation locations'}"""
c = c.replace(old_other_legend, new_other_legend)

with open(path, 'w') as f: f.write(c)
print("  ✅ 3/4 BRICSMap.tsx (伙伴国银色标注)")
PYEOF

# ━━━ 4. Dashboard: 档案扩21国 + 投资面板集成成本模型 ━━━
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path, 'r') as f: c = f.read()

# 4a. 加入成本模型 import
c = c.replace(
    "import SovereigntyMatrix from './SovereigntyMatrix';",
    "import SovereigntyMatrix from './SovereigntyMatrix';\nimport { estimateSubseaCapex, formatUsd, INDUSTRY_BENCHMARKS, SENSITIVITY_ITEMS } from '@/lib/subsea-cost-model';"
)

# 4b. 加入 BRICS_ALL import
c = c.replace(
    "import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';",
    "import { BRICS_MEMBERS, BRICS_ALL, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';"
)

# 4c. 替换国家档案标题+范围（从11成员国扩到21国）
old_profiles_title = "isZh?'成员国海缆档案':'Member State Cable Profiles'"
new_profiles_title = "tb('profile.title')"
c = c.replace(old_profiles_title, new_profiles_title)

old_profiles_sub = "isZh?'11 个金砖成员国各自的海缆基础设施画像':'Submarine cable infrastructure profile for each of the 11 BRICS member states'"
new_profiles_sub = "tb('profile.subtitle')"
c = c.replace(old_profiles_sub, new_profiles_sub)

# 4d. 修改 countryProfiles 使用 BRICS_ALL 而非仅 memberCableCounts
old_profiles_data = """const countryProfiles=ov?Object.entries(ov.brics.memberCableCounts).sort(([,a],[,b])=>(b as number)-(a as number)).map(([code,count])=>{"""
new_profiles_data = """const countryProfiles=ov?[...BRICS_ALL].map(code=>{
    const count=(ov.brics.memberCableCounts[code]||0) as number;
    return {code,count};
  }).sort((a,b)=>b.count-a.count).map(({code,count})=>{"""
c = c.replace(old_profiles_data, new_profiles_data)

# 4e. 在档案卡片中加入成员/伙伴标签
old_profile_header = """<span style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>{cp.code}</span>"""
new_profile_header = """<span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:BRICS_MEMBERS.includes(cp.code as any)?'rgba(212,175,55,.1)':'rgba(139,149,165,.1)',color:BRICS_MEMBERS.includes(cp.code as any)?C.gold:C.silver}}>{BRICS_MEMBERS.includes(cp.code as any)?tb('profile.member'):tb('profile.partner')}</span>"""
c = c.replace(old_profile_header, new_profile_header)

# 4f. 替换投资面板 — 用成本模型驱动
old_invest_section = """        {/* 投资机会面板 */}
        {investOps.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
            <SH t={isZh?'投资机会分析':'Investment Opportunity Analysis'} s={isZh?'基于战略缺口识别的优先投资方向 — 含初步成本估算':'Priority investment directions based on strategic gap analysis — with preliminary cost estimates'} />"""

new_invest_section = """        {/* 投资机会面板 — 集成成本模型 */}
        {investOps.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
            <SH t={tb('invest.title')} s={tb('invest.subtitle')} />
            {/* 成本模型公式 */}
            <div className="bc" style={{padding:18,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{tb('invest.formula')}</div>
              <div style={{fontFamily:'monospace',fontSize:12,color:'#F0E6C8',background:'rgba(0,0,0,.2)',borderRadius:8,padding:'12px 16px',lineHeight:1.8,overflowX:'auto',whiteSpace:'nowrap'}}>
                {tb('invest.formulaFull')}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:8,marginTop:12}}>
                {Object.entries(INDUSTRY_BENCHMARKS).slice(0,8).map(([k,v])=>(
                  <div key={k} style={{fontSize:10,color:'rgba(255,255,255,.4)',padding:'6px 10px',borderRadius:6,background:'rgba(255,255,255,.02)',border:'1px solid rgba(255,255,255,.04)'}}>
                    <span style={{color:'rgba(255,255,255,.6)',fontWeight:600}}>{k.replace(/([A-Z])/g,' $1').trim()}</span>
                    <span style={{float:'right',color:C.gold,fontWeight:600}}>{'min' in v?`${(v as any).min.toLocaleString()}-${(v as any).max.toLocaleString()}`:(v as any).value?.toLocaleString()} {(v as any).unit}</span>
                    <div style={{fontSize:9,color:'rgba(255,255,255,.2)',marginTop:2}}>{(v as any).source}</div>
                  </div>
                ))}
              </div>
              <p style={{fontSize:10,color:'rgba(255,255,255,.15)',marginTop:10,lineHeight:1.6}}>{tb('invest.sources')}</p>
            </div>"""

c = c.replace(old_invest_section, new_invest_section)

# 4g. 替换每个投资卡片 — 加入成本模型计算结果
old_invest_card_start = """            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:14}}>
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
            </div>"""

new_invest_cards = """            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:14}}>
              {investOps.map((op,i)=>{
                const est=estimateSubseaCapex({routeLengthKm:op.distKm,designCapacityTbps:100,landingStations:2,jurisdictions:2});
                const bd=est.breakdown;const items=[
                  {label:isZh?'电缆本体':'Cable',value:bd.cable,color:'#3B82F6'},
                  {label:isZh?'中继器':'Repeaters',value:bd.repeaters,color:'#8B5CF6'},
                  {label:isZh?'海工敷设':'Marine',value:bd.marine,color:'#06B6D4'},
                  {label:isZh?'登陆站':'Landing Stn',value:bd.landingStations,color:'#22C55E'},
                  {label:isZh?'许可合规':'Permits',value:bd.permits,color:'#F59E0B'},
                  {label:isZh?'调查':'Survey',value:bd.survey,color:'#EC4899'},
                  {label:isZh?'管理/保险':'PM/Ins',value:bd.pmInsurance,color:'#6B7280'},
                  {label:isZh?'预备费 7%':'Contingency',value:bd.contingency,color:'#EF4444'},
                  {label:isZh?'风险溢价 10%':'Risk Premium',value:bd.riskPremium,color:'#F97316'},
                ];
                return(
                <div key={i} className="bc" style={{padding:0,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.gold}10`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{op.fromName} → {op.toName}</span>
                    <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:op.status==='none'?'rgba(239,68,68,.1)':'rgba(245,158,11,.1)',color:op.status==='none'?'#EF4444':'#F59E0B'}}>{op.status==='none'?(isZh?'无连接':'No Connection'):(isZh?'非金砖中转':'Via Non-BRICS')}</span>
                  </div>
                  <div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:10}}>
                    <p style={{fontSize:12,color:'rgba(255,255,255,.5)',lineHeight:1.6,margin:0}}>{op.rationale}</p>
                    {/* 三档估算 */}
                    <div style={{display:'flex',gap:6}}>
                      {[{l:tb('invest.low'),v:est.scenarios.low,c:'#6B7280'},{l:tb('invest.base'),v:est.scenarios.base,c:C.gold},{l:tb('invest.high'),v:est.scenarios.high,c:'#EF4444'}].map(s=>(
                        <div key={s.l} style={{flex:1,textAlign:'center',padding:'8px 4px',borderRadius:6,background:`${s.c}08`,border:`1px solid ${s.c}20`}}>
                          <div style={{fontSize:9,color:s.c,fontWeight:600,marginBottom:2}}>{s.l}</div>
                          <div style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{formatUsd(s.v)}</div>
                        </div>
                      ))}
                    </div>
                    {/* 瀑布图 */}
                    <div style={{fontSize:10,color:'rgba(255,255,255,.3)',fontWeight:600,marginTop:4}}>{tb('invest.breakdown')}</div>
                    {items.map(it=>{const pct=est.capexTotalUsd>0?(it.value/est.capexTotalUsd)*100:0;return(
                      <div key={it.label} style={{display:'flex',alignItems:'center',gap:6,height:16}}>
                        <div style={{width:70,fontSize:9,color:'rgba(255,255,255,.4)',textAlign:'right',flexShrink:0}}>{it.label}</div>
                        <div style={{flex:1,height:6,borderRadius:3,background:'rgba(255,255,255,.03)',overflow:'hidden'}}>
                          <div style={{width:`${pct}%`,height:'100%',borderRadius:3,background:it.color,transition:'width .8s ease'}} />
                        </div>
                        <div style={{width:50,fontSize:9,color:'rgba(255,255,255,.4)',textAlign:'right'}}>{formatUsd(it.value)}</div>
                      </div>
                    );})}
                    {/* 单位指标 + OPEX */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginTop:4}}>
                      <div style={{fontSize:9,textAlign:'center',padding:4,borderRadius:4,background:'rgba(255,255,255,.02)'}}><div style={{color:'rgba(255,255,255,.3)'}}>{tb('invest.perKm')}</div><div style={{color:'#F0E6C8',fontWeight:600}}>{est.unitMetrics.usdPerKm?`$${Math.round(est.unitMetrics.usdPerKm/1000)}K`:'-'}</div></div>
                      <div style={{fontSize:9,textAlign:'center',padding:4,borderRadius:4,background:'rgba(255,255,255,.02)'}}><div style={{color:'rgba(255,255,255,.3)'}}>{tb('invest.opex')}</div><div style={{color:'#F0E6C8',fontWeight:600}}>{formatUsd(est.opex.totalOpexPerYear)}/yr</div></div>
                      <div style={{fontSize:9,textAlign:'center',padding:4,borderRadius:4,background:'rgba(255,255,255,.02)'}}><div style={{color:'rgba(255,255,255,.3)'}}>{isZh?'中继器':'Repeaters'}</div><div style={{color:'#F0E6C8',fontWeight:600}}>{est.repeaterCount}</div></div>
                    </div>
                  </div>
                </div>);
              })}
            </div>
            {/* 敏感性分析 */}
            <div className="bc" style={{padding:18,marginTop:14}}>
              <div style={{fontSize:11,fontWeight:700,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>{tb('invest.sensitivity')}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,.3)',marginBottom:8}}>{isZh?'单变量变化对基准CAPEX的影响（以MAREA量级6,600km为例）':'Single-variable impact on baseline CAPEX (MAREA-class 6,600km example)'}</div>
              {SENSITIVITY_ITEMS.map(si=>(
                <div key={si.param} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{width:100,fontSize:10,color:'rgba(255,255,255,.5)',textAlign:'right',flexShrink:0}}>{isZh?si.labelZh:si.label}</div>
                  <div style={{flex:1,display:'flex',alignItems:'center',position:'relative',height:14}}>
                    <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'rgba(255,255,255,.08)'}} />
                    <div style={{position:'absolute',left:`${50-si.capexImpact*3}%`,width:`${si.capexImpact*6}%`,height:10,borderRadius:3,background:`linear-gradient(90deg,#EF444460,${C.gold}60)`,top:2}} />
                  </div>
                  <div style={{width:40,fontSize:10,color:C.gold,fontWeight:600,textAlign:'right'}}>±{si.capexImpact}%</div>
                  <div style={{width:80,fontSize:9,color:'rgba(255,255,255,.2)'}}>{si.source}</div>
                </div>
              ))}
              <p style={{fontSize:10,color:'rgba(255,255,255,.12)',marginTop:10,lineHeight:1.6}}>{tb('invest.disclaimer')}</p>
            </div>"""

c = c.replace(old_invest_cards, new_invest_cards)

with open(path, 'w') as f: f.write(c)
print("  ✅ 4/4 BRICSDashboard.tsx (21国档案 + 成本模型投资面板)")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Wave 3.5 完成！"
echo ""
echo "腾讯云："
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 2; nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  → Cloudflare Purge Everything → Cmd+Shift+R"
echo "  git add -A && git commit -m 'feat: BRICS Wave 3.5 — cost model, partner labels, 21-nation profiles, methodology fix' && git push origin main"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

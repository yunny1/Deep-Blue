#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "🔧 Wave 3.5 修复 Dashboard..."

python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path, 'r') as f: c = f.read()

# 1. 加入成本模型 import
c = c.replace(
    "import SovereigntyMatrix from './SovereigntyMatrix';",
    "import SovereigntyMatrix from './SovereigntyMatrix';\nimport { estimateSubseaCapex, formatUsd, INDUSTRY_BENCHMARKS, SENSITIVITY_ITEMS } from '@/lib/subsea-cost-model';"
)

# 2. 加入 BRICS_ALL import
c = c.replace(
    "import { BRICS_MEMBERS, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';",
    "import { BRICS_MEMBERS, BRICS_ALL, BRICS_COUNTRY_META, BRICS_COLORS as C } from '@/lib/brics-constants';"
)

# 3. 档案标题改名 + 扩到21国
c = c.replace(
    "isZh?'成员国海缆档案':'Member State Cable Profiles'",
    "tb('profile.title')"
)
c = c.replace(
    "isZh?'11 个金砖成员国各自的海缆基础设施画像':'Submarine cable infrastructure profile for each of the 11 BRICS member states'",
    "tb('profile.subtitle')"
)

# 4. countryProfiles: 从仅memberCableCounts扩到BRICS_ALL
old_cp = "const countryProfiles=ov?Object.entries(ov.brics.memberCableCounts).sort(([,a],[,b])=>(b as number)-(a as number)).map(([code,count])=>{"
new_cp = """const countryProfiles=ov?[...BRICS_ALL].map(code=>{
    const count=(ov.brics.memberCableCounts[code]||0) as number;
    return {code,count};
  }).sort((a,b)=>b.count-a.count).map(({code,count})=>{"""
c = c.replace(old_cp, new_cp)

# 5. 档案卡片头部加成员/伙伴标签
c = c.replace(
    """<span style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>{cp.code}</span>""",
    """<span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:BRICS_MEMBERS.includes(cp.code as any)?'rgba(212,175,55,.1)':'rgba(139,149,165,.1)',color:BRICS_MEMBERS.includes(cp.code as any)?C.gold:C.silver}}>{BRICS_MEMBERS.includes(cp.code as any)?(isZh?'成员国':'Member'):(isZh?'伙伴国':'Partner')}</span>"""
)

# 6. 替换整个投资面板（精确匹配行184-210的实际内容）
old_invest = """        {/* 投资机会面板 */}
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
        )}"""

new_invest = """        {/* 投资机会面板 — 集成成本模型 */}
        {investOps.length>0&&(
          <section className="bs" style={{padding:'0 32px 40px',maxWidth:1400,margin:'0 auto',animationDelay:'.35s'}}>
            <SH t={tb('invest.title')} s={tb('invest.subtitle')} />
            {/* 成本模型公式 + 行业基准 */}
            <div className="bc" style={{padding:18,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:`${C.gold}90`,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>{tb('invest.formula')}</div>
              <div style={{fontFamily:'monospace',fontSize:11,color:'#F0E6C8',background:'rgba(0,0,0,.2)',borderRadius:8,padding:'12px 16px',lineHeight:1.8,overflowX:'auto',whiteSpace:'nowrap'}}>
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
            </div>
            {/* 投资卡片 — 含瀑布图+三档 */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:14}}>
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
                  {label:isZh?'预备费7%':'Contingency',value:bd.contingency,color:'#EF4444'},
                  {label:isZh?'风险溢价10%':'Risk Premium',value:bd.riskPremium,color:'#F97316'},
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
            </div>
          </section>
        )}"""

if old_invest in c:
    c = c.replace(old_invest, new_invest)
    print("  ✅ 投资面板替换成功")
else:
    print("  ❌ 投资面板未找到匹配，尝试逐行对比...")
    # 打印差异帮助debug
    import difflib
    actual = c[c.find('{/* 投资机会面板'):c.find('{/* 战略缺口')]
    print(repr(actual[:200]))

with open(path, 'w') as f: f.write(c)
print("  ✅ Dashboard 修复完成")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 修复完成！"
echo ""
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 2; nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  → Cloudflare Purge Everything"
echo "  git add -A && git commit -m 'fix: Wave 3.5 Dashboard — cost model integration, 21-nation profiles' && git push origin main"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

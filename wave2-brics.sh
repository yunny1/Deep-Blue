#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "🚀 BRICS Wave 2 升级（含 Wave 1 修复）..."

# ━━━ 1. Sovereignty API: transitNodes 返回所有国家的中英文名 + transitPath 也返回名称 ━━━
cat > "$P/src/app/api/brics/sovereignty/route.ts" << 'EOF1'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
const LL = new Set(['ET']);
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

// 获取国家名称（含非金砖国家，从 countries 表取）
async function buildNameMap(): Promise<Record<string, { name: string; nameZh: string }>> {
  const map: Record<string, { name: string; nameZh: string }> = {};
  // 先加入金砖国家元数据
  for (const [code, meta] of Object.entries(BRICS_COUNTRY_META)) {
    map[code] = { name: meta.name, nameZh: meta.nameZh };
  }
  // 再从数据库补充非金砖国家
  const countries = await prisma.country.findMany({ select: { code: true, nameEn: true, nameZh: true } });
  for (const c of countries) {
    if (!map[c.code]) {
      map[c.code] = { name: c.nameEn, nameZh: c.nameZh || c.nameEn };
    }
  }
  return map;
}

export async function GET() {
  try {
    const [raw, nameMap] = await Promise.all([
      prisma.cable.findMany({
        where: AF,
        select: { slug:true, name:true, landingStations: { select: { landingStation: { select: { countryCode:true } } } } },
      }),
      buildNameMap(),
    ]);

    const ccs = raw.map(c => ({
      slug: c.slug, name: c.name,
      countries: [...new Set(c.landingStations.map(cls => normalizeBRICS(cls.landingStation.countryCode ?? '')).filter(Boolean))],
    }));

    const adj: Record<string, Set<string>> = {};
    const dc: Record<string, Record<string, string[]>> = {};
    for (const cb of ccs) { const cc = cb.countries;
      for (let i=0;i<cc.length;i++) for (let j=i+1;j<cc.length;j++) {
        const [a,b] = [cc[i],cc[j]];
        (adj[a]??=new Set()).add(b); (adj[b]??=new Set()).add(a);
        ((dc[a]??={})[b]??=[]).push(cb.slug); ((dc[b]??={})[a]??=[]).push(cb.slug);
      }
    }

    function bfsPath(from:string,to:string,bricsOnly:boolean): string[]|null {
      if(!adj[from])return null;
      const vis=new Set([from]);const q:string[][]=[[from]];
      while(q.length){const path=q.shift()!;const cur=path[path.length-1];
        for(const nb of adj[cur]??[]){
          if(nb===to)return[...path,nb];
          if(!vis.has(nb)&&(!bricsOnly||isBRICSCountry(nb))){vis.add(nb);q.push([...path,nb]);}
        }
      }
      return null;
    }

    const m=[...BRICS_MEMBERS];
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:{code:string;name:string;nameZh:string}[]}[]=[];
    const transitNodeCount: Record<string, number> = {};

    for(let i=0;i<m.length;i++)for(let j=0;j<m.length;j++){
      if(i===j)continue;const[f,t]=[m[i],m[j]];
      if(LL.has(f)||LL.has(t)){mx.push({from:f,to:t,status:'landlocked',directCableCount:0,directCables:[]});continue;}
      const cbl=dc[f]?.[t]??[];
      let status:CS;let transitPath:string[]|undefined;
      if(cbl.length>0){status='direct';}
      else{
        const bricsPath=bfsPath(f,t,true);
        if(bricsPath){status='indirect';transitPath=bricsPath;
          for(let k=1;k<bricsPath.length-1;k++){transitNodeCount[bricsPath[k]]=(transitNodeCount[bricsPath[k]]||0)+1;}
        }else{
          const anyPath=bfsPath(f,t,false);
          if(anyPath){status='transit';transitPath=anyPath;
            for(let k=1;k<anyPath.length-1;k++){transitNodeCount[anyPath[k]]=(transitNodeCount[anyPath[k]]||0)+1;}
          }else{status='none';}
        }
      }
      const transitPathNames = transitPath?.map(code => ({
        code, name: nameMap[code]?.name ?? code, nameZh: nameMap[code]?.nameZh ?? code,
      }));
      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath,transitPathNames});
    }

    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){const c=mx.find(x=>x.from===m[i]&&x.to===m[j]);if(c)up[c.status]++;}

    const transitNodes = Object.entries(transitNodeCount)
      .map(([code, count]) => ({
        code, name: nameMap[code]?.name ?? code, nameZh: nameMap[code]?.nameZh ?? code,
        count, isBRICS: isBRICSCountry(code),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return NextResponse.json({
      members:m.map(c=>({code:c,name:nameMap[c]?.name??c,nameZh:nameMap[c]?.nameZh??c})),
      matrix:mx,
      summary:{totalPairs:(m.length*(m.length-1))/2,...up},
      transitNodes,
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);return NextResponse.json({error:'Failed'},{status:500});}
}
EOF1
echo "  ✅ 1/3 sovereignty API"

# ━━━ 2. Matrix: 完整重写（列居中 + 全中文 tooltip + 方法学 + transitPath 中文）━━━
cat > "$P/src/components/brics/SovereigntyMatrix.tsx" << 'EOF2'
'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
interface Member { code:string; name:string; nameZh:string; }
interface PathNode { code:string; name:string; nameZh:string; }
interface Cell { from:string; to:string; status:CS; directCableCount:number; directCables:string[]; transitPath?:string[]; transitPathNames?:PathNode[]; }
interface Data { members:Member[]; matrix:Cell[]; summary:Record<string,number>; transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]; }

const SC:Record<CS,{bg:string;key:string;tipKey?:string}>={
  direct:{bg:'#22C55E',key:'matrix.direct'},
  indirect:{bg:'#F59E0B',key:'matrix.indirect',tipKey:'matrix.indirectTip'},
  transit:{bg:'#EF4444',key:'matrix.transit',tipKey:'matrix.transitTip'},
  none:{bg:'#6B7280',key:'matrix.none'},
  landlocked:{bg:'#374151',key:'matrix.landlocked'},
};

export default function SovereigntyMatrix(){
  const{tb,isZh}=useBRICS();
  const[data,setData]=useState<Data|null>(null);
  const[loading,setLoading]=useState(true);
  const[tip,setTip]=useState<{x:number;y:number;cell:Cell;fn:string;tn:string}|null>(null);
  const[hlRow,setHlRow]=useState<string|null>(null);
  const[hlCol,setHlCol]=useState<string|null>(null);
  const[showMethod,setShowMethod]=useState(false);

  useEffect(()=>{fetch('/api/brics/sovereignty').then(r=>r.json()).then(setData).catch(console.error).finally(()=>setLoading(false));},[]);

  const getCell=useCallback((f:string,t:string)=>data?.matrix.find(m=>m.from===f&&m.to===t),[data]);
  const getName=useCallback((code:string)=>{const m=data?.members.find(x=>x.code===code);return isZh?(m?.nameZh??code):(m?.name??code);},[data,isZh]);

  if(loading||!data)return<div style={{height:400,borderRadius:14,background:'rgba(26,45,74,.4)',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,.3)',fontSize:14}}>{loading?(isZh?'正在计算数字主权矩阵…':'Computing sovereignty matrix…'):''}</div>;

  const{members,summary}=data;
  const cs=46;const hw=80;

  return(
    <div>
      {/* 方法学按钮 */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={()=>setShowMethod(!showMethod)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:8,border:`1px solid ${C.gold}25`,background:showMethod?`${C.gold}15`:'rgba(255,255,255,.03)',color:showMethod?C.gold:'rgba(255,255,255,.4)',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all .2s'}}>
          <span style={{fontSize:13}}>{showMethod?'\u25B2':'\u2139'}</span> {tb('method.title')}
        </button>
      </div>

      {/* 方法学面板 */}
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
          {/* 列头：旋转45°，居中对齐到每个单元格正中 */}
          <div style={{display:'flex',marginLeft:hw,height:80}}>
            {members.map(m=>(
              <div key={`col-${m.code}`} style={{width:cs,position:'relative',height:'100%'}}>
                <span style={{
                  position:'absolute',bottom:2,left:cs/2,
                  fontSize:10,fontWeight:600,whiteSpace:'nowrap',
                  color:hlCol===m.code?C.gold:'rgba(255,255,255,.45)',
                  transition:'color .15s',
                  transform:'rotate(-50deg)',transformOrigin:'0% 100%',
                }}>
                  {isZh?m.nameZh:m.name}
                </span>
              </div>
            ))}
          </div>

          {/* 行 */}
          {members.map(rm=>(
            <div key={rm.code} style={{display:'flex',alignItems:'center'}}>
              <div style={{width:hw,fontSize:10,fontWeight:600,color:hlRow===rm.code?C.gold:'rgba(255,255,255,.4)',textAlign:'right',paddingRight:10,transition:'color .15s',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={isZh?rm.nameZh:rm.name}>
                {isZh?rm.nameZh:rm.name}
              </div>
              {members.map(cm=>{
                const self=rm.code===cm.code;
                const cell=self?null:getCell(rm.code,cm.code);
                const cfg=cell?SC[cell.status]:null;
                const hl=hlRow===rm.code||hlCol===cm.code;
                return(
                  <div key={`${rm.code}-${cm.code}`} style={{width:cs,height:cs,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,margin:1,cursor:self?'default':'pointer',background:self?`${C.gold}06`:cfg?`${cfg.bg}${hl?'35':'20'}`:'transparent',transition:'background .15s',position:'relative'}}
                    onMouseEnter={e=>{if(self||!cell)return;setHlRow(rm.code);setHlCol(cm.code);
                      const r=e.currentTarget.getBoundingClientRect();
                      setTip({x:r.right,y:r.top,cell,fn:getName(rm.code),tn:getName(cm.code)});}}
                    onMouseLeave={()=>{setHlRow(null);setHlCol(null);setTip(null);}}>
                    {self?<span style={{fontSize:9,color:`${C.gold}25`}}>{rm.code}</span>
                    :cfg?<>
                      <span style={{width:10,height:10,borderRadius:'50%',background:cfg.bg,opacity:.85}} />
                      {cell&&cell.directCableCount>0&&<span style={{position:'absolute',bottom:3,right:5,fontSize:8,color:'rgba(255,255,255,.35)',fontFeatureSettings:'"tnum"'}}>{cell.directCableCount}</span>}
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

      {/* Tooltip */}
      {tip&&<ET tip={tip} tb={tb} isZh={isZh} />}
    </div>
  );
}

/* 图例项 */
function LI({status,label,tipText}:{status:CS;label:string;tipText?:string}){
  const ref=useRef<HTMLDivElement>(null);
  const[show,setShow]=useState(false);
  const[pos,setPos]=useState({x:0,y:0});
  return(<>
    <div ref={ref} style={{display:'flex',alignItems:'center',gap:6,cursor:tipText?'help':'default'}}
      onMouseEnter={()=>{if(!tipText||!ref.current)return;const r=ref.current.getBoundingClientRect();setPos({x:r.right+10,y:r.top+r.height/2});setShow(true);}}
      onMouseLeave={()=>setShow(false)}>
      <span style={{width:12,height:12,borderRadius:3,background:SC[status].bg,opacity:.85}} />
      <span style={{fontSize:12,color:'rgba(255,255,255,.5)'}}>{label}</span>
    </div>
    {show&&tipText&&<div style={{position:'fixed',left:pos.x,top:pos.y,transform:'translateY(-50%)',maxWidth:280,background:'rgba(10,18,36,.97)',border:`1px solid ${C.gold}30`,borderRadius:8,padding:'8px 12px',fontSize:11,color:'#D1D5DB',lineHeight:1.6,zIndex:9999,pointerEvents:'none',boxShadow:'0 4px 20px rgba(0,0,0,.5)',whiteSpace:'normal'}}>{tipText}</div>}
  </>);
}

/* 增强 Tooltip */
function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const{cell,fn,tn}=tip;
  const cfg=SC[cell.status];
  const riskMap:Record<CS,string>={none:'matrix.riskCritical',transit:'matrix.riskHigh',indirect:'matrix.riskMedium',direct:'matrix.riskLow',landlocked:'matrix.riskNa'};
  const recMap:Record<CS,string>={none:'matrix.recNone',transit:'matrix.recTransit',indirect:'matrix.recIndirect',direct:'matrix.recDirect',landlocked:'matrix.recLandlocked'};
  const riskColor:Record<CS,string>={none:'#EF4444',transit:'#F59E0B',indirect:'#3B82F6',direct:'#22C55E',landlocked:'#6B7280'};
  const left=tip.x+16;
  const adj=left+320>(typeof window!=='undefined'?window.innerWidth:1200)?tip.x-336:left;

  // 中转路径：用中文或英文国名
  const pathStr = cell.transitPathNames
    ? cell.transitPathNames.map(n => isZh ? n.nameZh : n.name).join(' → ')
    : cell.transitPath?.join(' → ');

  return(
    <div style={{position:'fixed',left:adj,top:Math.max(8,tip.y-20),width:320,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}30`,borderRadius:12,padding:0,zIndex:9999,pointerEvents:'none',boxShadow:'0 12px 40px rgba(0,0,0,.6)',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.gold}15`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{fn} → {tn}</span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background:`${cfg.bg}20`,color:cfg.bg}}>{tb(cfg.key)}</span>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {/* 直连海缆列表 */}
        {cell.status==='direct'&&cell.directCableCount>0&&(
          <div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4}}>{tb('matrix.cables',{n:cell.directCableCount})}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {cell.directCables.slice(0,5).map(s=><span key={s} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E',border:'1px solid rgba(34,197,94,.2)'}}>{s}</span>)}
            </div>
          </div>
        )}
        {/* 金砖中转路径 */}
        {cell.status==='indirect'&&pathStr&&(
          <div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>
            🔗 {isZh?'中转路径：':'Transit path: '}{pathStr}
          </div>
        )}
        {/* 非金砖中转 */}
        {cell.status==='transit'&&(
          <>
            <div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>⚠ {tb('matrix.transitWarn')}</div>
            {pathStr&&<div style={{fontSize:10,color:'rgba(255,255,255,.4)',lineHeight:1.5}}>{isZh?'路径：':'Path: '}{pathStr}</div>}
          </>
        )}
        {/* 无连接 */}
        {cell.status==='none'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔴 {tb('matrix.noneWarn')}</div>}

        {/* 风险 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.risk')}</span>
          <span style={{fontSize:11,fontWeight:600,color:riskColor[cell.status]}}>{tb(riskMap[cell.status])}</span>
        </div>
        {/* 建议 */}
        <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.rec')}</span>
          <div style={{fontSize:12,color:'#D1D5DB',marginTop:4,lineHeight:1.5}}>{tb(recMap[cell.status])}</div>
        </div>
      </div>
    </div>
  );
}
EOF2
echo "  ✅ 2/3 SovereigntyMatrix.tsx"

# ━━━ 3. Dashboard: 中转依赖全中文 + 成员国海缆排行 ━━━
cat > /tmp/dash-w2.py << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, 'r') as f: c = f.read()

# Fix transit dependency table: ensure Chinese country names are used
# The current code already uses {isZh?n.nameZh:n.name} which is correct,
# but let's also ensure the non-BRICS transit nodes show Chinese names
# The API now returns nameZh for all countries (from DB), so this should work.

# Add member cable ranking section after transit dependency
old_footer_section = """        <footer style={{padding:'20px 32px 12px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto'}}>"""

new_section_before_footer = """        {/* 成员国海缆排行 */}
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

        <footer style={{padding:'20px 32px 12px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto'}}>"""

c = c.replace(old_footer_section, new_section_before_footer)

with open(path, 'w') as f: f.write(c)
print("  ✅ Dashboard patched")
PYEOF
python3 /tmp/dash-w2.py "$P/src/components/brics/BRICSDashboard.tsx"
echo "  ✅ 3/3 Dashboard (+ member ranking)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Wave 2 完成！"
echo ""
echo "腾讯云："
echo "  npm run build"
echo "  kill \$(lsof -t -i:3000) && sleep 1 && nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  → Cloudflare Purge Everything"
echo "  git add -A && git commit -m 'feat: BRICS Wave 2 — fixed matrix i18n, transit paths, member ranking' && git push origin main"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "🚀 BRICS Wave 1 升级..."

# ━━━ 1. Sovereignty API: 增加 transit dependency 统计 ━━━
cat > "$P/src/app/api/brics/sovereignty/route.ts" << 'EOF1'
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, normalizeBRICS, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type CS = 'direct'|'indirect'|'transit'|'none'|'landlocked';
const LL = new Set(['ET']);
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const raw = await prisma.cable.findMany({
      where: AF,
      select: { slug:true, name:true, landingStations: { select: { landingStation: { select: { countryCode:true } } } } },
    });
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

    // BFS returning path
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
    const mx:{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[]}[]=[];
    
    // Transit node counter: how many BRICS pairs depend on each country as transit
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
          // Count intermediate nodes as transit nodes
          for(let k=1;k<bricsPath.length-1;k++){transitNodeCount[bricsPath[k]]=(transitNodeCount[bricsPath[k]]||0)+1;}
        }else{
          const anyPath=bfsPath(f,t,false);
          if(anyPath){status='transit';transitPath=anyPath;
            for(let k=1;k<anyPath.length-1;k++){transitNodeCount[anyPath[k]]=(transitNodeCount[anyPath[k]]||0)+1;}
          }else{status='none';}
        }
      }
      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath});
    }

    const up:Record<CS,number>={direct:0,indirect:0,transit:0,none:0,landlocked:0};
    for(let i=0;i<m.length;i++)for(let j=i+1;j<m.length;j++){const c=mx.find(x=>x.from===m[i]&&x.to===m[j]);if(c)up[c.status]++;}

    // Top transit nodes sorted by dependency count
    const transitNodes = Object.entries(transitNodeCount)
      .map(([code, count]) => ({ code, name: BRICS_COUNTRY_META[code]?.name ?? code, nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code, count, isBRICS: isBRICSCountry(code) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return NextResponse.json({
      members:m.map(c=>({code:c,name:BRICS_COUNTRY_META[c]?.name??c,nameZh:BRICS_COUNTRY_META[c]?.nameZh??c})),
      matrix:mx,
      summary:{totalPairs:(m.length*(m.length-1))/2,...up},
      transitNodes,
    });
  } catch(e){console.error('[BRICS Sovereignty]',e);return NextResponse.json({error:'Failed'},{status:500});}
}
EOF1
echo "  ✅ 1/5 sovereignty API (+ transit dependency)"

# ━━━ 2. 翻译：新增 Wave 1 键 ━━━
# 用 sed 追加新键到 zh 和 en sections（在 footer.update 之后）
cat > /tmp/brics-i18n-patch.py << 'PYEOF'
import re, sys
path = sys.argv[1]
with open(path, 'r') as f: content = f.read()

zh_keys = """    'method.title':'方法学说明',
    'method.subtitle':'数据口径、分类定义与算法逻辑',
    'method.scope':'数据范围：统计单位为海缆系统（非单段），包括在役、建设中、规划中状态，不含退役和已合并。路线为示意线，非精确敷设路径。',
    'method.classify':'分类逻辑：每条海缆根据其登陆站所在国家归属，被唯一分类为"跨国互联 / 国内 / 涉外 / 非金砖"四类之一。分类在服务端完成，前端仅渲染结果。',
    'method.matrix':'矩阵算法：基于全球海缆登陆站构建国家级邻接图，对每对成员国执行 BFS（广度优先搜索）。优先寻找仅经过金砖国家的路径，其次寻找任意路径，据此判定四级连接状态。',
    'method.update':'更新频率：数据库与多个行业数据源同步，BRICS API 使用 ISR 每小时重新验证。',
    'method.disclaimer':'地图与名称声明',
    'method.disclaimerText':'地图上显示的边界、地名和标注仅用于信息可视化目的，不构成任何政治立场或主权表达。海缆路线为近似示意，不代表精确的海底敷设路径。',
    'transit.title':'中转依赖分析',
    'transit.subtitle':'金砖成员国通信路径中最常被依赖的中转节点 — 依赖次数越高，该节点的战略价值与风险越大',
    'transit.country':'国家/地区',
    'transit.count':'被依赖次数',
    'transit.isBrics':'是否金砖',
    'transit.yes':'是',
    'transit.no':'否',
    'transit.warn':'非金砖中转节点 — 代表外部基础设施依赖',"""

en_keys = """    'method.title':'Methodology',
    'method.subtitle':'Data scope, classification definitions, and algorithm logic',
    'method.scope':'Data Scope: Statistics count cable systems (not individual segments). Includes active, under construction, and planned cables. Routes shown are approximate, not precisely surveyed paths.',
    'method.classify':'Classification: Each cable is uniquely classified as Cross-border / Domestic / External / Non-BRICS based on its landing station countries. Classification is computed server-side; the frontend only renders results.',
    'method.matrix':'Matrix Algorithm: A country-level adjacency graph is built from all cable landing stations globally. For each member state pair, BFS (breadth-first search) first seeks a path through BRICS-only nodes, then through any nodes, determining the 4-level connectivity status.',
    'method.update':'Update Frequency: Database synced with multiple industry sources. BRICS APIs use ISR with hourly revalidation.',
    'method.disclaimer':'Map & Naming Disclaimer',
    'method.disclaimerText':'Boundaries, names, and designations shown on this map are for information visualization purposes only and do not imply any political position or sovereignty endorsement. Cable routes are approximate and do not represent precise submarine laying paths.',
    'transit.title':'Transit Dependency Analysis',
    'transit.subtitle':'Most-depended transit nodes in BRICS member communication paths — higher count indicates greater strategic value and risk',
    'transit.country':'Country/Region',
    'transit.count':'Dependency Count',
    'transit.isBrics':'BRICS Member',
    'transit.yes':'Yes',
    'transit.no':'No',
    'transit.warn':'Non-BRICS transit node — represents external infrastructure dependency',"""

# Insert before footer.source in zh
content = content.replace("    'footer.source':'数据来源：Deep Blue 海缆情报平台'", zh_keys + "\n    'footer.source':'数据来源：Deep Blue 海缆情报平台'")
content = content.replace("    'footer.source':'Source: Deep Blue Cable Intelligence Platform'", en_keys + "\n    'footer.source':'Source: Deep Blue Cable Intelligence Platform'")

with open(path, 'w') as f: f.write(content)
print("  ✅ i18n patched")
PYEOF
python3 /tmp/brics-i18n-patch.py "$P/src/lib/brics-i18n.ts"
echo "  ✅ 2/5 i18n (+ methodology + transit keys)"

# ━━━ 3. Dashboard: 加入中转依赖 + 方法学 + 声明 footer ━━━
cat > /tmp/dashboard-patch.py << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, 'r') as f: content = f.read()

# 1. Add transitNodes to SovD type
content = content.replace(
    "interface SovD { matrix:{from:string;to:string;status:string;directCableCount:number;directCables:string[]}[];summary:Record<string,number>; }",
    "interface SovD { matrix:{from:string;to:string;status:string;directCableCount:number;directCables:string[];transitPath?:string[]}[];summary:Record<string,number>;transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]; }"
)

# 2. Replace footer with enhanced version including methodology disclaimer
old_footer = """        <footer style={{padding:'20px 32px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto',display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(255,255,255,.2)'}}>
          <span>{tb('footer.source')}</span><span>{tb('footer.update')}</span>
        </footer>"""

new_footer = """        {/* Transit Dependency */}
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

        <footer style={{padding:'20px 32px 12px',borderTop:`1px solid ${C.gold}10`,maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(255,255,255,.2)',marginBottom:12}}>
            <span>{tb('footer.source')}</span><span>{tb('footer.update')}</span>
          </div>
          <p style={{fontSize:10,color:'rgba(255,255,255,.12)',lineHeight:1.6,margin:'0 0 8px',maxWidth:900}}>{tb('method.disclaimerText')}</p>
        </footer>"""

content = content.replace(old_footer, new_footer)

with open(path, 'w') as f: f.write(content)
print("  ✅ Dashboard patched")
PYEOF
python3 /tmp/dashboard-patch.py "$P/src/components/brics/BRICSDashboard.tsx"
echo "  ✅ 3/5 Dashboard (+ transit + footer disclaimer)"

# ━━━ 4. Map: 加宽 hitbox 层 ━━━
cat > /tmp/map-hitbox-patch.py << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, 'r') as f: content = f.read()

# After each visible cable layer, add a wide transparent hitbox layer
# Find the pattern where hover layers are defined and add hitbox sources

# Replace the hover layer list to include hitbox layers
old_hover = "const hoverLayers=['l-int','l-dom','l-rel'];"
new_hover = """// Add wide transparent hitbox layers for easier hover/click
        map.addLayer({id:'hit-int',type:'line',source:'c-int',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});
        map.addLayer({id:'hit-dom',type:'line',source:'c-dom',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});
        map.addLayer({id:'hit-rel',type:'line',source:'c-rel',paint:{'line-color':'transparent','line-width':14,'line-opacity':0}});

        const hoverLayers=['hit-int','hit-dom','hit-rel'];
        const visibleMap:Record<string,string>={'hit-int':'l-int','hit-dom':'l-dom','hit-rel':'l-rel'};"""

content = content.replace(old_hover, new_hover)

# Update hover handlers to use the visible layer for width changes
old_width_increase = "map.setPaintProperty(lid,'line-width',lid.includes('int')?4:lid.includes('dom')?3:2.5);"
new_width_increase = "const vl=visibleMap[lid]||lid;map.setPaintProperty(vl,'line-width',vl.includes('int')?4:vl.includes('dom')?3:2.5);"
content = content.replace(old_width_increase, new_width_increase)

old_width_reset = "map.setPaintProperty(lid,'line-width',lid.includes('int')?2.2:lid.includes('dom')?1.6:1);"
new_width_reset = "const vl2=visibleMap[lid]||lid;map.setPaintProperty(vl2,'line-width',vl2.includes('int')?2.2:vl2.includes('dom')?1.6:1);"
content = content.replace(old_width_reset, new_width_reset)

with open(path, 'w') as f: f.write(content)
print("  ✅ Map hitbox patched")
PYEOF
python3 /tmp/map-hitbox-patch.py "$P/src/components/brics/BRICSMap.tsx"
echo "  ✅ 4/5 Map (+ hitbox layers)"

# ━━━ 5. Matrix: 加入方法学抽屉 + transit path 显示 ━━━
cat > /tmp/matrix-method-patch.py << 'PYEOF'
import sys
path = sys.argv[1]
with open(path, 'r') as f: content = f.read()

# Add methodology drawer state
old_state = "const [legendTip, setLegendTip] = useState<{ x: number; y: number; text: string } | null>(null);"
new_state = """const [legendTip, setLegendTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [showMethod, setShowMethod] = useState(false);"""
content = content.replace(old_state, new_state)

# Add methodology button before the matrix container
old_matrix_start = """<div style={{ overflowX: 'auto', borderRadius: 14, border: `1px solid ${C.gold}12`, background: 'rgba(15,29,50,0.5)', padding: '20px 20px 20px 20px' }}>"""
new_matrix_start = """<div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
        <button onClick={()=>setShowMethod(!showMethod)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:`1px solid ${C.gold}25`, background:showMethod?`${C.gold}15`:'rgba(255,255,255,.03)', color:showMethod?C.gold:'rgba(255,255,255,.4)', cursor:'pointer', fontSize:11, fontWeight:600, transition:'all .2s' }}>
          <span style={{fontSize:13}}>{showMethod?'\u25B2':'\u2139'}</span> {tb('method.title')}
        </button>
      </div>

      {showMethod && (
        <div style={{ marginBottom:16, padding:20, borderRadius:12, border:`1px solid ${C.gold}15`, background:'rgba(15,29,50,.6)', display:'flex', flexDirection:'column', gap:12 }}>
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

      <div style={{ overflowX: 'auto', borderRadius: 14, border: `1px solid ${C.gold}12`, background: 'rgba(15,29,50,0.5)', padding: '20px 20px 20px 20px' }}>"""
content = content.replace(old_matrix_start, new_matrix_start)

# Add transitPath display in ETip tooltip
old_transit_warn = """{cell.status === 'transit' && <div style={{ fontSize: 11, color: '#F59E0B', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6 }}>⚠ {tb('matrix.transitWarn')}</div>}"""
new_transit_warn = """{cell.status === 'transit' && <><div style={{ fontSize: 11, color: '#F59E0B', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6 }}>⚠ {tb('matrix.transitWarn')}</div>
        {(cell as any).transitPath && <div style={{fontSize:10,color:'rgba(255,255,255,.4)',marginTop:4}}>{((cell as any).transitPath as string[]).join(' → ')}</div>}</>}"""
content = content.replace(old_transit_warn, new_transit_warn)

# Same for indirect
old_indirect = """{cell.status === 'direct' && cell.directCableCount > 0 && ("""
# Don't change direct, but add transitPath for indirect after none warning
old_none_warn = """{cell.status === 'none' && <div style={{ fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6 }}>🔴 {tb('matrix.noneWarn')}</div>}"""
new_none_warn = """{cell.status === 'none' && <div style={{ fontSize: 11, color: '#EF4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6 }}>🔴 {tb('matrix.noneWarn')}</div>}
        {cell.status === 'indirect' && (cell as any).transitPath && <div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔗 {((cell as any).transitPath as string[]).join(' → ')}</div>}"""
content = content.replace(old_none_warn, new_none_warn)

# Update Cell interface to include transitPath
old_cell_interface = "interface Cell { from: string; to: string; status: CS; directCableCount: number; directCables: string[]; }"
new_cell_interface = "interface Cell { from: string; to: string; status: CS; directCableCount: number; directCables: string[]; transitPath?: string[]; }"
content = content.replace(old_cell_interface, new_cell_interface)

with open(path, 'w') as f: f.write(content)
print("  ✅ Matrix patched")
PYEOF
python3 /tmp/matrix-method-patch.py "$P/src/components/brics/SovereigntyMatrix.tsx"
echo "  ✅ 5/5 Matrix (+ methodology drawer + transit paths)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ Wave 1 完成！"
echo ""
echo "  npm run build"
echo "  kill \$(lsof -t -i:3000) && sleep 1 && nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  → Cloudflare Purge Everything"
echo "  git add -A && git commit -m 'feat: BRICS Wave 1 — methodology, hitbox, transit dependency, disclaimers' && git push origin main"
echo ""
echo "本地同步: cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

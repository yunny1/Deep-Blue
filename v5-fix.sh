#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🔧 综合修复 V5"
echo "═══════════════════════════════════════════════════════"

# ━━━ 1. Dashboard: 删建设中 + 类别颜色 + 术语 ━━━
echo ">>> 1/4: Dashboard"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path, 'r') as f:
    c = f.read()

# 1a. 删除建设中（statusBuilding 那一项）
# 原始: {l:tb('chart.statusBuilding'),v:ov.brics.statusBreakdown.underConstruction,c:'#3B82F6'},
old = "{l:tb('chart.statusBuilding'),v:ov.brics.statusBreakdown.underConstruction,c:'#3B82F6'},"
c = c.replace(old, "")
print("  ✅ 删除建设中统计项")

# 1b. 按类别的对外连接颜色 C.silver → '#7C6EEB'
c = c.replace("{l:tb('chart.catExternal'),v:ov.brics.externalCables,c:C.silver}", "{l:tb('chart.catExternal'),v:ov.brics.externalCables,c:'#7C6EEB'}")
print("  ✅ 对外连接颜色改为 #7C6EEB")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ━━━ 2. i18n: 矩阵副标题 ━━━
echo ""
echo ">>> 2/4: i18n 矩阵副标题"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/lib/brics-i18n.ts"
with open(path, 'r') as f:
    c = f.read()

c = c.replace("'成员国间海缆连接分析", "'金砖国家间海缆连接分析")
c = c.replace("'成员国间", "'金砖国家间")

with open(path, 'w') as f:
    f.write(c)
print("  ✅ 成员国间→金砖国家间")
PYEOF

# ━━━ 3. 地图: hover 颜色跟随类别 ━━━
echo ""
echo ">>> 3/4: 地图 hover 颜色"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/BRICSMap.tsx"
with open(path, 'r') as f:
    c = f.read()

# 找到 hover source 和 layer 定义，改为动态颜色
# 当前固定用 #FFD700，改为根据 lid 判断类别后用对应荧光色

old_hover = """        /* 单条海缆 hover 高亮源 */
        map.addSource('c-hover',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'l-hover-glow',type:'line',source:'c-hover',paint:{'line-color':'#FFD700','line-width':8,'line-opacity':0.25,'line-blur':4}});
        map.addLayer({id:'l-hover',type:'line',source:'c-hover',paint:{'line-color':'#FFD700','line-width':3,'line-opacity':0.9}});

        const allFeatures=[...intF,...domF,...relF,...othF];
        for(const lid of hoverLayers){
          map.on('mouseenter',lid,e=>{map.getCanvas().style.cursor='pointer';
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              const feat=allFeatures.find(f=>f.properties?.slug===slug);
              if(feat)(map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[feat]});
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
          map.on('mouseleave',lid,()=>{map.getCanvas().style.cursor='';
            (map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[]});
            setHover(null);
          });
          map.on('mousemove',lid,e=>{
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              const feat=allFeatures.find(f=>f.properties?.slug===slug);
              if(feat)(map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[feat]});
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
        }"""

new_hover = """        /* 单条海缆 hover 高亮源 — 颜色跟随类别 */
        map.addSource('c-hover',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        map.addLayer({id:'l-hover-glow',type:'line',source:'c-hover',paint:{'line-color':'#FFD700','line-width':8,'line-opacity':0.3,'line-blur':4}});
        map.addLayer({id:'l-hover',type:'line',source:'c-hover',paint:{'line-color':'#FFD700','line-width':3,'line-opacity':0.95}});

        const allFeatures=[...intF,...domF,...relF,...othF];
        const hoverColors:Record<string,string>={'hit-int':'#FFD700','hit-dom':'#5EEAD4','hit-rel':'#A78BFA'};
        const hoverGlowColors:Record<string,string>={'hit-int':'#FFD70080','hit-dom':'#5EEAD480','hit-rel':'#A78BFA80'};
        for(const lid of hoverLayers){
          map.on('mouseenter',lid,e=>{map.getCanvas().style.cursor='pointer';
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              const hc=hoverColors[lid]||'#FFD700';const gc=hoverGlowColors[lid]||'#FFD70060';
              map.setPaintProperty('l-hover','line-color',hc);
              map.setPaintProperty('l-hover-glow','line-color',gc);
              const feat=allFeatures.find(f=>f.properties?.slug===slug);
              if(feat)(map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[feat]});
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
          map.on('mouseleave',lid,()=>{map.getCanvas().style.cursor='';
            (map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[]});
            setHover(null);
          });
          map.on('mousemove',lid,e=>{
            const slug=e.features?.[0]?.properties?.slug;
            if(slug && cmRef.current[slug]){
              const hc=hoverColors[lid]||'#FFD700';const gc=hoverGlowColors[lid]||'#FFD70060';
              map.setPaintProperty('l-hover','line-color',hc);
              map.setPaintProperty('l-hover-glow','line-color',gc);
              const feat=allFeatures.find(f=>f.properties?.slug===slug);
              if(feat)(map.getSource('c-hover') as any)?.setData({type:'FeatureCollection',features:[feat]});
              setHover({x:e.point.x,y:e.point.y,info:cmRef.current[slug]});
            }
          });
        }"""

if old_hover in c:
    c = c.replace(old_hover, new_hover)
    print("  ✅ hover 颜色跟随类别（金/青/紫）")
else:
    print("  ❌ hover 代码块未匹配")

with open(path, 'w') as f:
    f.write(c)
PYEOF

# ━━━ 4. 矩阵: tooltip 非金砖节点红色 + 图例展开折叠 ━━━
echo ""
echo ">>> 4/4: 矩阵 tooltip + 图例展开"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/SovereigntyMatrix.tsx"
with open(path, 'r') as f:
    c = f.read()

# 4a. 图例区域 — 替换为可展开折叠版本
old_legend = """      {/* 图例 */}
      <div style={{display:'flex',flexWrap:'wrap',gap:16,marginTop:16}}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s=>(
          <LI key={s} status={s} label={`${tb(SC[s].key)} — ${summary[s]??0} ${tb('matrix.pairs')}`} tipText={SC[s].tipKey?tb(SC[s].tipKey!):undefined} />
        ))}
        <span style={{fontSize:12,color:'rgba(255,255,255,.25)',marginLeft:8}}>{tb('matrix.total',{n:summary.totalPairs})}</span>
      </div>"""

new_legend = """      {/* 图例 + 展开详情 */}
      <LegendPanel data={data} summary={summary} displayMembers={displayMembers} getName={getName} tb={tb} isZh={isZh} />"""

if old_legend in c:
    c = c.replace(old_legend, new_legend)
    print("  ✅ 图例替换为 LegendPanel")
else:
    print("  ❌ 图例未匹配，手动检查")

# 4b. 在文件末尾（最后一个 } 前）添加 LegendPanel 组件
legend_component = r"""
function LegendPanel({data,summary,displayMembers,getName,tb,isZh}:{data:Data;summary:Record<string,number>;displayMembers:Member[];getName:(c:string)=>string;tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const[expanded,setExpanded]=useState<CS|null>(null);
  const getCell=(f:string,t:string)=>data.matrix.find(m=>m.from===f&&m.to===t);
  const getPairs=(status:CS)=>{
    const pairs:{from:string;to:string;cell:Cell}[]=[];
    const members=data.members||[];
    for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){
      const cell=getCell(members[i].code,members[j].code);
      if(cell&&cell.status===status)pairs.push({from:members[i].code,to:members[j].code,cell});
    }
    return pairs;
  };
  return(
    <div style={{marginTop:16}}>
      <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:8}}>
        {(['direct','indirect','transit','none','landlocked'] as CS[]).map(s=>{
          const isExp=expanded===s;
          return(
            <button key={s} onClick={()=>setExpanded(isExp?null:s)} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:`1px solid ${isExp?SC[s].bg+'40':'rgba(255,255,255,.06)'}`,background:isExp?`${SC[s].bg}10`:'transparent',cursor:'pointer',transition:'all .2s'}}>
              <span style={{width:10,height:10,borderRadius:3,background:SC[s].bg,opacity:.85}}/>
              <span style={{fontSize:12,color:isExp?'#F0E6C8':'rgba(255,255,255,.5)',fontWeight:isExp?600:400}}>{tb(SC[s].key)}</span>
              <span style={{fontSize:12,color:SC[s].bg,fontWeight:700,marginLeft:2}}>{summary[s]??0}</span>
              <span style={{fontSize:10,color:'rgba(255,255,255,.2)',marginLeft:2}}>{isExp?'▲':'▼'}</span>
            </button>
          );
        })}
        <span style={{fontSize:12,color:'rgba(255,255,255,.2)',alignSelf:'center'}}>{tb('matrix.total',{n:summary.totalPairs})}</span>
      </div>
      {expanded&&(
        <div style={{padding:14,borderRadius:10,border:`1px solid ${SC[expanded].bg}20`,background:`${SC[expanded].bg}06`,animation:'fadeI .3s ease'}}>
          <div style={{fontSize:11,fontWeight:700,color:SC[expanded].bg,marginBottom:8}}>{tb(SC[expanded].key)} — {summary[expanded]??0} {tb('matrix.pairs')}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {getPairs(expanded).map(p=>(
              <div key={`${p.from}-${p.to}`} style={{fontSize:11,padding:'4px 10px',borderRadius:6,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.06)',color:'rgba(255,255,255,.6)'}}>
                <span style={{fontWeight:600}}>{getName(p.from)}</span>
                <span style={{color:'rgba(255,255,255,.2)',margin:'0 4px'}}>↔</span>
                <span style={{fontWeight:600}}>{getName(p.to)}</span>
                {p.cell.directCableCount>0&&<span style={{fontSize:9,color:SC[expanded].bg,marginLeft:4}}>({p.cell.directCableCount})</span>}
                {p.cell.transitEdges&&p.cell.transitEdges.length>0&&(
                  <span style={{fontSize:9,color:'rgba(255,255,255,.3)',marginLeft:4}}>
                    via {p.cell.transitEdges.map(e=>isZh?(data.allCountries?.find(x=>x.code===e.to)?.nameZh||e.to):(data.allCountries?.find(x=>x.code===e.to)?.name||e.to)).filter((_,i,a)=>i<a.length-1).join('→')}
                  </span>
                )}
              </div>
            ))}
            {getPairs(expanded).length===0&&<span style={{fontSize:11,color:'rgba(255,255,255,.3)'}}>{isZh?'无':'None'}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
"""

# 在文件最后一行前插入
if 'LegendPanel' not in c.split('function LegendPanel')[0] if 'function LegendPanel' in c else True:
    # 找到文件最后的位置（最后一个函数结束后）
    last_brace = c.rfind('}')
    if last_brace > 0:
        c = c[:last_brace+1] + "\n" + legend_component
        print("  ✅ 添加 LegendPanel 组件（展开折叠 + 详情）")

with open(path, 'w') as f:
    f.write(c)
PYEOF

rm -rf "$P/.next/cache" 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ V5 修复完成"
echo ""
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 1"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo "  git add -A && git commit -m 'feat: V5 — category hover colors, legend expand, remove construction' && git push origin main"
echo "═══════════════════════════════════════════════════════"

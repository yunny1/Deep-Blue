#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🔗 矩阵 Tooltip 升级 — 显示具体海缆路由"
echo "═══════════════════════════════════════════════════════"

# ━━━ Step 1: Sovereignty API — BFS 记录每跳海缆 ━━━
echo ""
echo ">>> Step 1/2: Sovereignty API — 添加 transitEdges"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/app/api/brics/sovereignty/route.ts"
with open(path, 'r') as f:
    c = f.read()
ch = 0

# 1a. 修改 bfsPath 函数 — 返回 {path, edges}
old_bfs = """    function bfsPath(from:string,to:string,bricsOnly:boolean): string[]|null {
      if(!adj[from])return null;
      const vis=new Set([from]);const q:string[][]=[[from]];
      while(q.length){const path=q.shift()!;const cur=path[path.length-1];
        for(const nb of adj[cur]??[]){
          if(nb===to)return[...path,nb];
          if(!vis.has(nb)&&(!bricsOnly||isBRICSCountry(nb))){vis.add(nb);q.push([...path,nb]);}
        }
      }
      return null;
    }"""

new_bfs = """    type BfsResult = { path: string[]; edges: { from: string; to: string; cables: string[] }[] } | null;
    function bfsPath(from:string,to:string,bricsOnly:boolean): BfsResult {
      if(!adj[from])return null;
      const vis=new Set([from]);
      const q:{path:string[];edges:{from:string;to:string;cables:string[]}[]}[]=[{path:[from],edges:[]}];
      while(q.length){
        const{path,edges}=q.shift()!;
        const cur=path[path.length-1];
        for(const nb of adj[cur]??[]){
          const hopCables=(dc[cur]?.[nb]??[]).slice(0,3);
          if(nb===to)return{path:[...path,nb],edges:[...edges,{from:cur,to:nb,cables:hopCables}]};
          if(!vis.has(nb)&&(!bricsOnly||isBRICSCountry(nb))){
            vis.add(nb);
            q.push({path:[...path,nb],edges:[...edges,{from:cur,to:nb,cables:hopCables}]});
          }
        }
      }
      return null;
    }"""

if old_bfs in c:
    c = c.replace(old_bfs, new_bfs)
    ch += 1
    print("  ✅ bfsPath 升级 — 返回 edges（含海缆名）")
else:
    print("  ❌ 未找到原始 bfsPath 函数")

# 1b. 修改调用处 — 解构 BfsResult
old_call1 = """        const bricsPath=bfsPath(f,t,true);
        if(bricsPath){status='indirect';transitPath=bricsPath;
          for(let k=1;k<bricsPath.length-1;k++){transitNodeCount[bricsPath[k]]=(transitNodeCount[bricsPath[k]]||0)+1;}
        }else{
          const anyPath=bfsPath(f,t,false);
          if(anyPath){status='transit';transitPath=anyPath;
            for(let k=1;k<anyPath.length-1;k++){transitNodeCount[anyPath[k]]=(transitNodeCount[anyPath[k]]||0)+1;}
          }else{status='none';}
        }"""

new_call1 = """        let transitEdges:{from:string;to:string;cables:string[]}[]|undefined;
        const bricsResult=bfsPath(f,t,true);
        if(bricsResult){status='indirect';transitPath=bricsResult.path;transitEdges=bricsResult.edges;
          for(let k=1;k<bricsResult.path.length-1;k++){transitNodeCount[bricsResult.path[k]]=(transitNodeCount[bricsResult.path[k]]||0)+1;}
        }else{
          const anyResult=bfsPath(f,t,false);
          if(anyResult){status='transit';transitPath=anyResult.path;transitEdges=anyResult.edges;
            for(let k=1;k<anyResult.path.length-1;k++){transitNodeCount[anyResult.path[k]]=(transitNodeCount[anyResult.path[k]]||0)+1;}
          }else{status='none';}
        }"""

if old_call1 in c:
    c = c.replace(old_call1, new_call1)
    ch += 1
    print("  ✅ BFS 调用处升级 — 解构 transitEdges")
else:
    print("  ❌ 未找到 BFS 调用代码块")

# 1c. 在 mx.push 中加入 transitEdges
old_push = """      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath,transitPathNames,tier:BRICS_MEMBERS.includes(f as any)?'member':'partner'});"""

new_push = """      mx.push({from:f,to:t,status,directCableCount:cbl.length,directCables:cbl.slice(0,10),transitPath,transitPathNames,transitEdges,tier:BRICS_MEMBERS.includes(f as any)?'member':'partner'});"""

if old_push in c:
    c = c.replace(old_push, new_push)
    ch += 1
    print("  ✅ mx.push 添加 transitEdges 字段")
else:
    print("  ❌ 未找到 mx.push")

with open(path, 'w') as f:
    f.write(c)
print(f"  API 共 {ch} 处修改")
PYEOF

# ━━━ Step 2: SovereigntyMatrix.tsx — Tooltip 显示海缆路由 + 中转依赖悬停 ━━━
echo ""
echo ">>> Step 2/2: SovereigntyMatrix.tsx — Tooltip + 中转依赖"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/components/brics/SovereigntyMatrix.tsx"
with open(path, 'r') as f:
    c = f.read()
ch = 0

# 2a. 在 Cell 接口中添加 transitEdges 类型
old_cell_type = "interface Cell{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:PathNode[]}"
new_cell_type = "interface TransitEdge{from:string;to:string;cables:string[]}\ninterface Cell{from:string;to:string;status:CS;directCableCount:number;directCables:string[];transitPath?:string[];transitPathNames?:PathNode[];transitEdges?:TransitEdge[]}"

if old_cell_type in c:
    c = c.replace(old_cell_type, new_cell_type)
    ch += 1
    print("  ✅ Cell 接口添加 transitEdges 类型")
else:
    print("  ⚠️ Cell 接口未精确匹配，尝试备用...")
    if 'TransitEdge' not in c:
        c = c.replace("interface Cell{", "interface TransitEdge{from:string;to:string;cables:string[]}\ninterface Cell{")
        if 'transitPathNames?:PathNode[]' in c and 'transitEdges' not in c:
            c = c.replace('transitPathNames?:PathNode[]}', 'transitPathNames?:PathNode[];transitEdges?:TransitEdge[]}')
            ch += 1
            print("  ✅ Cell 接口添加 transitEdges（备用方式）")

# 2b. 替换 ET (tooltip) 组件 — 显示海缆路由
old_et_start = "function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){"
et_idx = c.find(old_et_start)

if et_idx >= 0:
    # 找到整个 ET 函数的结束（最后一个 } 在文件末尾附近）
    # 找到下一个顶层 function 或文件末尾
    rest = c[et_idx:]
    # ET 函数结束于最后一个 } 之前
    # 策略: 从 et_idx 开始找匹配的最外层花括号
    depth = 0
    end_idx = -1
    in_body = False
    for i, ch_c in enumerate(rest):
        if ch_c == '{':
            depth += 1
            in_body = True
        elif ch_c == '}':
            depth -= 1
            if in_body and depth == 0:
                end_idx = et_idx + i + 1
                break
    
    if end_idx > 0:
        new_et = r"""function ET({tip,tb,isZh}:{tip:{x:number;y:number;cell:Cell;fn:string;tn:string};tb:(k:string,p?:Record<string,string|number>)=>string;isZh:boolean}){
  const{cell,fn,tn}=tip;const cfg=SC[cell.status];
  const rm:Record<CS,string>={none:'matrix.riskCritical',transit:'matrix.riskHigh',indirect:'matrix.riskMedium',direct:'matrix.riskLow',landlocked:'matrix.riskNa'};
  const rc:Record<CS,string>={none:'matrix.recNone',transit:'matrix.recTransit',indirect:'matrix.recIndirect',direct:'matrix.recDirect',landlocked:'matrix.recLandlocked'};
  const clr:Record<CS,string>={none:'#EF4444',transit:'#F59E0B',indirect:'#3B82F6',direct:'#22C55E',landlocked:'#6B7280'};
  const left=tip.x+16;const adj=left+340>(typeof window!=='undefined'?window.innerWidth:1200)?tip.x-356:left;

  /* 构建海缆路由描述 */
  const edges=cell.transitEdges||[];
  const names=cell.transitPathNames||[];

  return(
    <div style={{position:'fixed',left:adj,top:Math.max(8,tip.y-20),width:340,background:'rgba(10,18,36,.97)',backdropFilter:'blur(16px)',border:`1px solid ${C.gold}30`,borderRadius:12,padding:0,zIndex:9999,pointerEvents:'none',boxShadow:'0 12px 40px rgba(0,0,0,.6)',overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.gold}15`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:14,fontWeight:700,color:'#F0E6C8'}}>{fn} → {tn}</span>
        <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background:`${cfg.bg}20`,color:cfg.bg}}>{tb(cfg.key)}</span>
      </div>
      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        {/* 直连: 显示海缆列表 */}
        {cell.status==='direct'&&cell.directCableCount>0&&(
          <div>
            <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginBottom:4}}>{tb('matrix.cables',{n:cell.directCableCount})}</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {cell.directCables.slice(0,5).map(s=><span key={s} style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(34,197,94,.1)',color:'#22C55E',border:'1px solid rgba(34,197,94,.2)'}}>{s}</span>)}
            </div>
          </div>
        )}

        {/* 金砖中转(indirect) / 非金砖中转(transit): 显示逐跳海缆路由 */}
        {(cell.status==='indirect'||cell.status==='transit')&&edges.length>0&&(
          <div style={{background:cell.status==='indirect'?'rgba(245,158,11,.05)':'rgba(239,68,68,.05)',border:`1px solid ${cell.status==='indirect'?'rgba(245,158,11,.12)':'rgba(239,68,68,.12)'}`,borderRadius:8,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{fontSize:9,fontWeight:700,color:cell.status==='indirect'?'#F59E0B80':'#EF444480',textTransform:'uppercase',letterSpacing:'.04em'}}>
              {isZh?(cell.status==='indirect'?'🔗 经由金砖国家中转':'⚠ 经由非金砖国家中转'):(cell.status==='indirect'?'🔗 Via BRICS nations':'⚠ Via non-BRICS nations')}
            </div>
            {edges.map((e,i)=>{
              const fromName=names.find(n=>n.code===e.from);
              const toName=names.find(n=>n.code===e.to);
              const fn2=isZh?(fromName?.nameZh||e.from):(fromName?.name||e.from);
              const tn2=isZh?(toName?.nameZh||e.to):(toName?.name||e.to);
              const isBricsNode=names.find(n=>n.code===e.to);
              const isNonBrics=cell.status==='transit'&&i<edges.length-1&&!(['BR','RU','IN','CN','ZA','SA','IR','EG','AE','ET','ID','BY','BO','KZ','TH','CU','UG','MY','UZ','NG','VN'].includes(e.to));
              return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
                  <span style={{color:'rgba(255,255,255,.6)',fontWeight:600,flexShrink:0}}>{fn2}</span>
                  <span style={{fontSize:9,color:'rgba(255,255,255,.2)'}}>→</span>
                  <div style={{flex:1,display:'flex',flexWrap:'wrap',gap:2}}>
                    {e.cables.slice(0,2).map(cab=>(
                      <span key={cab} style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:isNonBrics?'rgba(239,68,68,.1)':'rgba(212,175,55,.08)',color:isNonBrics?'#EF4444':'#D4AF37',border:`1px solid ${isNonBrics?'rgba(239,68,68,.15)':'rgba(212,175,55,.12)'}`}}>{cab}</span>
                    ))}
                  </div>
                  <span style={{fontSize:9,color:'rgba(255,255,255,.2)'}}>→</span>
                  <span style={{color:isNonBrics?'#EF4444':'rgba(255,255,255,.6)',fontWeight:isNonBrics?700:600,flexShrink:0}}>{tn2}{isNonBrics?' ⚠':''}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 金砖中转旧文字提示 — 仅在没有 edges 时回退 */}
        {cell.status==='indirect'&&edges.length===0&&names.length>0&&(
          <div style={{fontSize:11,color:'#F59E0B',background:'rgba(245,158,11,.06)',border:'1px solid rgba(245,158,11,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>
            🔗 {isZh?'中转路径：':'Transit path: '}{names.map(n=>isZh?n.nameZh:n.name).join(' → ')}
          </div>
        )}

        {/* 非金砖中转警告 */}
        {cell.status==='transit'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>⚠ {tb('matrix.transitWarn')}</div>}

        {/* 无连接 */}
        {cell.status==='none'&&<div style={{fontSize:11,color:'#EF4444',background:'rgba(239,68,68,.06)',border:'1px solid rgba(239,68,68,.15)',borderRadius:6,padding:'8px 10px',lineHeight:1.6}}>🔴 {tb('matrix.noneWarn')}</div>}

        {/* 风险等级 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.risk')}</span>
          <span style={{fontSize:11,fontWeight:600,color:clr[cell.status]}}>{tb(rm[cell.status])}</span>
        </div>

        {/* 建议 */}
        <div style={{borderTop:`1px solid ${C.gold}10`,paddingTop:10}}>
          <span style={{fontSize:10,color:'rgba(255,255,255,.4)',textTransform:'uppercase',letterSpacing:'.05em'}}>{tb('matrix.rec')}</span>
          <div style={{fontSize:12,color:'#D1D5DB',marginTop:4,lineHeight:1.5}}>{tb(rc[cell.status])}</div>
        </div>
      </div>
    </div>
  );
}"""
        
        c = c[:et_idx] + new_et + c[end_idx:]
        ch += 1
        print(f"  ✅ ET tooltip 组件重写（显示逐跳海缆路由）")
    else:
        print("  ❌ 无法定位 ET 函数结束位置")
else:
    print("  ❌ 未找到 ET 函数开头")

# 2c. 中转依赖表格 — 数字悬停显示详情
# 查找 transitNodes 渲染区域
tn_idx = c.find('transitNodes')
if tn_idx >= 0:
    # 找到 count 数字的渲染位置 — 一般是 .count 的显示
    # 替换 count 显示为带 title 的 span
    old_count_display = ">{n.count}<"
    if old_count_display in c:
        new_count_display = ' title={`${isZh?n.nameZh:n.name}: ${isZh?"被":"used as transit "}${n.count}${isZh?"次用作中转节点":" times"}`} style={{cursor:"help"}}>{n.count}<'
        c = c.replace(old_count_display, new_count_display)
        ch += 1
        print("  ✅ 中转依赖计数添加 title 悬停提示")
    else:
        print("  ⚠️ 未找到 count 显示模式，搜索替代...")
        # 搜索其他可能的模式
        import re
        count_patterns = [
            (r'(\{n\.count\})', r'{n.count}'),
        ]
        for pat, _ in count_patterns:
            matches = list(re.finditer(pat, c))
            if matches:
                print(f"  找到 {len(matches)} 处 n.count 渲染")
                break
else:
    print("  ⚠️ 未找到 transitNodes 区域")

with open(path, 'w') as f:
    f.write(c)
print(f"  矩阵共 {ch} 处修改")
PYEOF

# ━━━ 清除缓存 ━━━
echo ""
echo ">>> 清除 ISR 缓存"
rm -rf "$P/.next/cache" 2>/dev/null || true
echo "  ✅ 缓存清除"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 矩阵 Tooltip 升级完成！"
echo ""
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 1"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo ""
echo "  git add -A && git commit -m 'feat: matrix tooltip shows cable-per-hop routing, transit dependency hover' && git push origin main"
echo "  → Cloudflare Purge Everything → Cmd+Shift+R"
echo "═══════════════════════════════════════════════════════"

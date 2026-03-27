#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🔧 最终修复 — 地图高亮"
echo "═══════════════════════════════════════════════════════"

# ━━━ 1. Sovereignty API → force-dynamic + 在 response 中加入 dc 邻接表 ━━━
echo ">>> 1/2: API 改 dynamic + 返回 cablePairs"
python3 << 'PYEOF'
path = "/home/ubuntu/deep-blue/src/app/api/brics/sovereignty/route.ts"
with open(path, 'r') as f:
    c = f.read()

# 1a. revalidate → force-dynamic
c = c.replace("export const revalidate = 3600;", "export const dynamic = 'force-dynamic';")
c = c.replace("export const dynamic = 'force-dynamic';\nexport const dynamic = 'force-dynamic';", "export const dynamic = 'force-dynamic';")

# 1b. 在 return NextResponse.json 中加入 cablePairs（每对国家之间的海缆slug列表）
# 这样前端可以自己查 transitPath 每一跳对应的海缆
old_return = "return NextResponse.json({"
new_return_block = """    // 构建国家对→海缆映射（前端用于路径高亮）
    const cablePairs: Record<string, string[]> = {};
    for (const [a, bs] of Object.entries(dc)) {
      for (const [b, slugs] of Object.entries(bs)) {
        const key = [a, b].sort().join('-');
        if (!cablePairs[key]) cablePairs[key] = [...new Set(slugs)].slice(0, 5);
      }
    }

    return NextResponse.json({"""

if 'cablePairs' not in c:
    c = c.replace(old_return, new_return_block)
    print("  ✅ 添加 cablePairs 到 response")
else:
    print("  ✓ cablePairs 已存在")

# 1c. 在 return 的 JSON 对象中加入 cablePairs 字段
if 'cablePairs,' not in c and 'cablePairs' in c:
    c = c.replace("transitNodes,", "transitNodes,\n      cablePairs,")
    print("  ✅ cablePairs 加入返回数据")

with open(path, 'w') as f:
    f.write(c)
print("  API 修改完成")
PYEOF

# ━━━ 2. Matrix + Dashboard: 前端用 cablePairs 查找海缆 ━━━
echo ""
echo ">>> 2/2: 前端用 cablePairs 高亮"
python3 << 'PYEOF'
# ── Matrix: 传 transitPath + 用 cablePairs 查 slugs ──
path = "/home/ubuntu/deep-blue/src/components/brics/SovereigntyMatrix.tsx"
with open(path, 'r') as f:
    c = f.read()

# 在 Data 接口加入 cablePairs
old_data = "transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[]"
new_data = "transitNodes:{code:string;name:string;nameZh:string;count:number;isBRICS:boolean}[];cablePairs?:Record<string,string[]>"
if 'cablePairs' not in c:
    c = c.replace(old_data, new_data)
    print("  ✅ Data 接口加入 cablePairs")

# 修改 Props
old_props = "interface Props { onCellClick?:(from:string,to:string,cables:string[],transitPath?:string[])=>void; }"
if old_props in c:
    pass  # 已经是新签名
else:
    old_props2 = "interface Props { onCellClick?:(from:string,to:string,cables:string[])=>void; }"
    new_props2 = "interface Props { onCellClick?:(from:string,to:string,cables:string[])=>void; }"
    # 不改 Props，改 onClick 调用让它自己查 cablePairs

# 修改 onClick: 用 cablePairs 补全 cables
old_click = "onClick={()=>{if(!self&&cell&&onCellClick){const allCables=[...cell.directCables,...(cell.transitEdges||[]).flatMap(e=>e.cables)];onCellClick(rm.code,cm.code,[...new Set(allCables)],cell.transitPath);}}}"
if old_click not in c:
    # 可能是旧签名
    old_click = "onClick={()=>{if(!self&&cell&&onCellClick){const allCables=[...cell.directCables,...(cell.transitEdges||[]).flatMap(e=>e.cables)];onCellClick(rm.code,cm.code,[...new Set(allCables)]);}}}"

new_click = """onClick={()=>{if(!self&&cell&&onCellClick){
                      let allCables=[...cell.directCables,...(cell.transitEdges||[]).flatMap(e=>e.cables)];
                      // 兜底: 从 cablePairs 查找 transitPath 每一跳的海缆
                      if(allCables.length===0&&cell.transitPath&&cell.transitPath.length>=2&&data?.cablePairs){
                        const cp=data.cablePairs;
                        for(let k=0;k<cell.transitPath.length-1;k++){
                          const key=[cell.transitPath[k],cell.transitPath[k+1]].sort().join('-');
                          if(cp[key])allCables.push(...cp[key]);
                        }
                      }
                      onCellClick(rm.code,cm.code,[...new Set(allCables)]);
                    }}}"""

if old_click in c:
    c = c.replace(old_click, new_click)
    print("  ✅ onClick 使用 cablePairs 兜底查找海缆")
else:
    print("  ❌ onClick 未匹配，当前内容:")
    for i,line in enumerate(c.split('\n')):
        if 'onCellClick' in line and 'onClick' in line:
            print(f"    L{i+1}: {line.strip()[:140]}")

with open(path, 'w') as f:
    f.write(c)

# ── Dashboard: 确保 handleMatrixClick 签名匹配 ──
path2 = "/home/ubuntu/deep-blue/src/components/brics/BRICSDashboard.tsx"
with open(path2, 'r') as f:
    c2 = f.read()

# 确保 handleMatrixClick 接受 3 参数
import re
match = re.search(r'const handleMatrixClick=useCallback\((.*?)\)=>\{', c2)
if match:
    params = match.group(1)
    print(f"  当前 handleMatrixClick 参数: {params}")
    # 确保是 (from:string,to:string,cables:string[])
    if 'transitPath' in params:
        # 去掉 transitPath 参数（不再需要，Matrix 自己查了）
        c2 = re.sub(
            r'const handleMatrixClick=useCallback\(\(from:string,to:string,cables:string\[\],transitPath\?:string\[\]\)',
            'const handleMatrixClick=useCallback((from:string,to:string,cables:string[])',
            c2
        )
        print("  ✅ 去掉 transitPath 参数")

# 简化 handleMatrixClick body（去掉之前的复杂兜底逻辑）
# 替换整个函数
old_fn_pattern = r'const handleMatrixClick=useCallback\([^}]+\},[^;]*;'
new_fn = """const handleMatrixClick=useCallback((from:string,to:string,cables:string[])=>{
    setSelection({kind:'pair',from,to,cables});
    mapRef.current?.scrollIntoView({behavior:'smooth',block:'center'});
  },[]);"""
c2 = re.sub(old_fn_pattern, new_fn, c2, flags=re.DOTALL)
print("  ✅ handleMatrixClick 简化（cables 已由 Matrix 填充）")

with open(path2, 'w') as f:
    f.write(c2)
PYEOF

# ━━━ 3. 清除 + 构建 ━━━
echo ""
echo ">>> 清除构建产物"
rm -rf "$P/.next"
echo "  ✅ .next 已清除"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 修复完成！执行以下命令："
echo ""
echo "  cd /home/ubuntu/deep-blue"
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 2"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo ""
echo "  # 验证（等 6 秒）"
echo "  sleep 6 && curl -s 'http://localhost:3000/api/brics/sovereignty' | python3 -c \""
echo "import sys,json;d=json.load(sys.stdin)"
echo "print('cablePairs数量:',len(d.get('cablePairs',{})))"
echo "cp=d.get('cablePairs',{})"
echo "print('RU-JP海缆:',cp.get('JP-RU',cp.get('RU-JP','无')))"
echo "print('IN-JP海缆:',cp.get('IN-JP',cp.get('JP-IN','无')))\""
echo ""
echo "  git add -A && git commit -m 'fix: sovereignty returns cablePairs, matrix uses it for map highlight' && git push origin main"
echo "═══════════════════════════════════════════════════════"

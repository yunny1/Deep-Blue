#!/bin/bash
set -e
P="/home/ubuntu/deep-blue"
echo "═══════════════════════════════════════════════════════"
echo "🔧 BRICS 21 国统计口径扩展 + 地图伙伴国修复"
echo "═══════════════════════════════════════════════════════"

# ━━━ Step 1: brics-constants.ts — 添加 isBRICSNation() 函数 ━━━
echo ""
echo ">>> Step 1/4: brics-constants.ts — 添加 isBRICSNation()"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/lib/brics-constants.ts"
with open(path, 'r') as f:
    c = f.read()

changes = 0

# 1a. 检查 BRICS_ALL 是否存在
if 'BRICS_ALL' in c:
    print("  ✓ BRICS_ALL 已存在")
else:
    # 在 BRICS_PARTNERS 定义之后添加 BRICS_ALL
    if 'BRICS_PARTNERS' in c:
        # 找到 BRICS_PARTNERS 定义的结束位置，在其后添加 BRICS_ALL
        # 匹配 "export const BRICS_PARTNERS = [...] as const;" 或类似
        pat = re.compile(r'(export const BRICS_PARTNERS\s*=\s*\[.*?\]\s*(?:as\s+const\s*)?;)', re.DOTALL)
        m = pat.search(c)
        if m:
            insert_after = m.end()
            c = c[:insert_after] + "\nexport const BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS] as const;\n" + c[insert_after:]
            changes += 1
            print("  ✅ 添加了 BRICS_ALL = [...BRICS_MEMBERS, ...BRICS_PARTNERS]")
        else:
            print("  ⚠️ 找到 BRICS_PARTNERS 但无法定位定义行，请手动检查")
    else:
        print("  ❌ BRICS_PARTNERS 不存在，无法自动添加 BRICS_ALL")

# 1b. 检查 isBRICSNation 是否已存在
if 'isBRICSNation' in c:
    print("  ✓ isBRICSNation() 已存在")
else:
    # 在 isBRICSMember 函数之后添加 isBRICSNation
    if 'isBRICSMember' in c:
        # 找到 isBRICSMember 函数定义的结束
        # 常见模式: export function isBRICSMember(code:string):boolean { ... }
        # 用正则找到完整函数体（匹配最外层花括号）
        pat = re.compile(r'(export function isBRICSMember\([^)]*\)\s*:\s*boolean\s*\{[^}]*\})')
        m = pat.search(c)
        if m:
            insert_pos = m.end()
            new_fn = """

/** 检查是否属于金砖21国（11成员 + 10伙伴），统计口径用 */
export function isBRICSNation(code: string): boolean {
  const n = normalizeBRICS(code);
  return (BRICS_ALL as readonly string[]).includes(n);
}"""
            c = c[:insert_pos] + new_fn + c[insert_pos:]
            changes += 1
            print("  ✅ 添加了 isBRICSNation() 函数")
        else:
            # 备用方案：在文件末尾添加
            new_fn = """
/** 检查是否属于金砖21国（11成员 + 10伙伴），统计口径用 */
export function isBRICSNation(code: string): boolean {
  const n = normalizeBRICS(code);
  return (BRICS_ALL as readonly string[]).includes(n);
}
"""
            c += new_fn
            changes += 1
            print("  ✅ 在文件末尾添加了 isBRICSNation() 函数（备用位置）")
    else:
        print("  ❌ isBRICSMember 函数不存在，结构异常")

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {changes} 处修改")

# 诊断输出
print("\n  --- 诊断: 导出函数列表 ---")
for line in c.split('\n'):
    if line.strip().startswith('export function') or line.strip().startswith('export const BRICS_'):
        print(f"    {line.strip()[:80]}")
PYEOF

# ━━━ Step 2: overview/route.ts — 统计口径从11国扩到21国 ━━━
echo ""
echo ">>> Step 2/4: overview/route.ts — 统计口径扩展到21国"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/app/api/brics/overview/route.ts"
with open(path, 'r') as f:
    c = f.read()

changes = 0

# 2a. 更新 import — 添加 isBRICSNation 和 BRICS_ALL
# 找到从 brics-constants 的 import 行
import_pat = re.compile(r"(import\s*\{[^}]*\}\s*from\s*'@/lib/brics-constants'\s*;)")
m = import_pat.search(c)
if m:
    old_import = m.group(1)
    new_import = old_import

    # 添加 BRICS_ALL（如果不在）
    if 'BRICS_ALL' not in old_import:
        new_import = new_import.replace('BRICS_MEMBERS', 'BRICS_MEMBERS, BRICS_ALL', 1)
        changes += 1

    # 添加 isBRICSNation（如果不在）
    if 'isBRICSNation' not in old_import:
        # 在 isBRICSMember 后面添加
        if 'isBRICSMember' in new_import:
            new_import = new_import.replace('isBRICSMember', 'isBRICSMember, isBRICSNation', 1)
        else:
            # 在最后一个 } 前添加
            new_import = new_import.replace('}', ', isBRICSNation }', 1)
        changes += 1

    if new_import != old_import:
        c = c.replace(old_import, new_import)
        print(f"  ✅ import 更新完成")
        print(f"    旧: {old_import[:100]}...")
        print(f"    新: {new_import[:100]}...")
    else:
        print("  ✓ import 已包含所需导入")
else:
    print("  ❌ 未找到 brics-constants import 行")

# 2b. 全局替换 isBRICSMember( → isBRICSNation(（仅在函数调用处）
count_before = c.count('isBRICSMember(')
c = c.replace('isBRICSMember(', 'isBRICSNation(')
count_after = c.count('isBRICSMember(')
replaced = count_before - count_after
if replaced > 0:
    print(f"  ✅ 替换了 {replaced} 处 isBRICSMember( → isBRICSNation(")
    changes += replaced
else:
    print("  ✓ 无 isBRICSMember( 调用需替换（可能已替换过）")

# 2c. memberCableCounts 循环：BRICS_MEMBERS → BRICS_ALL
# 常见模式: for (const code of BRICS_MEMBERS) 或 BRICS_MEMBERS.forEach 或 for...of BRICS_MEMBERS
# 也可能是 Object.entries 遍历时用 BRICS_MEMBERS 过滤
# 用正则替换 memberCableCounts 附近的 BRICS_MEMBERS
# 策略：找到 memberCableCounts 关键字上下文中的 BRICS_MEMBERS 并替换为 BRICS_ALL

# 更精确的方法：找到包含 memberCableCounts 的代码块
lines = c.split('\n')
in_member_counts_block = False
for i, line in enumerate(lines):
    if 'memberCableCounts' in line and ('BRICS_MEMBERS' in line or 'for' in line.lower()):
        in_member_counts_block = True
    if in_member_counts_block and 'BRICS_MEMBERS' in line:
        lines[i] = line.replace('BRICS_MEMBERS', 'BRICS_ALL')
        print(f"  ✅ 行 {i+1}: memberCableCounts 循环中 BRICS_MEMBERS → BRICS_ALL")
        changes += 1
        in_member_counts_block = False  # 只替换第一处

# 也搜索 for...of 模式 + BRICS_MEMBERS（在 memberCableCounts 赋值附近）
c_new = '\n'.join(lines)

# 额外检查：如果有 "for (const code of BRICS_MEMBERS)" 且附近有 CableCounts
# 做一个更宽泛的搜索
pat = re.compile(r'for\s*\(\s*const\s+\w+\s+of\s+BRICS_MEMBERS\s*\)')
for m in pat.finditer(c_new):
    # 检查前后 200 字符是否有 CableCounts 关键字
    context = c_new[max(0,m.start()-200):m.end()+200]
    if 'CableCounts' in context or 'cableCounts' in context or 'memberCable' in context:
        old = m.group()
        new = old.replace('BRICS_MEMBERS', 'BRICS_ALL')
        c_new = c_new.replace(old, new, 1)
        print(f"  ✅ for-of 循环: BRICS_MEMBERS → BRICS_ALL (near CableCounts)")
        changes += 1

c = c_new

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {changes} 处修改")

# 诊断
print("\n  --- 诊断: 关键函数调用 ---")
for i, line in enumerate(c.split('\n')):
    if 'isBRICS' in line or 'BRICS_ALL' in line or 'BRICS_MEMBERS' in line:
        print(f"    L{i+1}: {line.strip()[:100]}")
PYEOF

# ━━━ Step 3: sovereignty/route.ts — 同步扩展 ━━━
echo ""
echo ">>> Step 3/4: sovereignty/route.ts — 同步检查"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/app/api/brics/sovereignty/route.ts"
with open(path, 'r') as f:
    c = f.read()

changes = 0

# 3a. 更新 import
import_pat = re.compile(r"(import\s*\{[^}]*\}\s*from\s*'@/lib/brics-constants'\s*;)")
m = import_pat.search(c)
if m:
    old_import = m.group(1)
    new_import = old_import
    if 'isBRICSNation' not in old_import and 'isBRICSMember' in old_import:
        new_import = new_import.replace('isBRICSMember', 'isBRICSMember, isBRICSNation', 1)
    if 'BRICS_ALL' not in old_import:
        new_import = new_import.replace('BRICS_MEMBERS', 'BRICS_MEMBERS, BRICS_ALL', 1)
    if new_import != old_import:
        c = c.replace(old_import, new_import)
        changes += 1
        print(f"  ✅ import 更新完成")

# 3b. 替换 isBRICSMember( → isBRICSNation(
count = c.count('isBRICSMember(')
if count > 0:
    c = c.replace('isBRICSMember(', 'isBRICSNation(')
    print(f"  ✅ 替换了 {count} 处 isBRICSMember( → isBRICSNation(")
    changes += count
else:
    print("  ✓ sovereignty API 无 isBRICSMember 调用")

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {changes} 处修改")
PYEOF

# ━━━ Step 4: BRICSMap.tsx — 伙伴国标注 + 颜色升级 ━━━
echo ""
echo ">>> Step 4/4: BRICSMap.tsx — 伙伴国标注 + 颜色升级"
python3 << 'PYEOF'
import re

path = "/home/ubuntu/deep-blue/src/components/brics/BRICSMap.tsx"
with open(path, 'r') as f:
    c = f.read()

changes = 0

# 4a. 确保 import 包含 BRICS_PARTNERS
import_pat = re.compile(r"(import\s*\{[^}]*\}\s*from\s*'@/lib/brics-constants'\s*;)")
m = import_pat.search(c)
if m:
    old_import = m.group(1)
    new_import = old_import
    if 'BRICS_PARTNERS' not in old_import:
        new_import = new_import.replace('BRICS_MEMBERS', 'BRICS_MEMBERS, BRICS_PARTNERS', 1)
        c = c.replace(old_import, new_import)
        changes += 1
        print("  ✅ 添加 BRICS_PARTNERS 到 import")
    else:
        print("  ✓ BRICS_PARTNERS 已在 import 中")

# 4b. 检查是否已有伙伴国图层
if 'partner-dots' in c or 'partner-labels' in c:
    print("  ✓ 伙伴国图层已存在，更新颜色...")
    
    # 更新圆点颜色 — 从银色改为亮蓝色
    # 匹配 circle-color 在 partner-dots paint 中
    c = re.sub(
        r"('circle-color'\s*:\s*)(?:C\.silver|'#[0-9a-fA-F]+'|'[^']*')",
        r"\g<1>'#60A5FA'",
        c,
        count=0  # 替换所有 partner 相关的
    )
    
    # 更精确：只改 partner-dots 图层
    # 替换 partner-dots 的 circle-opacity
    old_partner_paint = re.search(r"id:\s*'partner-dots'.*?paint:\s*\{([^}]+)\}", c, re.DOTALL)
    if old_partner_paint:
        old_paint = old_partner_paint.group(1)
        new_paint = old_paint
        # 升级 opacity
        new_paint = re.sub(r"'circle-opacity'\s*:\s*[\d.]+", "'circle-opacity': 0.9", new_paint)
        # 升级 radius
        new_paint = re.sub(r"'circle-radius'\s*:\s*[\d.]+", "'circle-radius': 5", new_paint)
        # 升级 stroke color
        new_paint = re.sub(r"'circle-stroke-color'\s*:\s*'[^']*'", "'circle-stroke-color': '#3B82F6'", new_paint)
        # 升级 stroke width
        new_paint = re.sub(r"'circle-stroke-width'\s*:\s*[\d.]+", "'circle-stroke-width': 1.5", new_paint)
        
        if new_paint != old_paint:
            c = c.replace(old_paint, new_paint)
            changes += 1
            print("  ✅ partner-dots 圆点颜色升级: 银色→亮蓝 #60A5FA, 半径5, 描边#3B82F6")
    
    # 替换 partner-text 的文字颜色
    old_text_paint = re.search(r"id:\s*'partner-text'.*?paint:\s*\{([^}]+)\}", c, re.DOTALL)
    if old_text_paint:
        old_tp = old_text_paint.group(1)
        new_tp = old_tp
        new_tp = re.sub(r"'text-color'\s*:\s*'[^']*'", "'text-color': '#93C5FD'", new_tp)
        if new_tp != old_tp:
            c = c.replace(old_tp, new_tp)
            changes += 1
            print("  ✅ partner-text 文字颜色升级: #8B95A5→#93C5FD")
else:
    print("  ⚠️ 伙伴国图层不存在，添加中...")
    
    # 找到 hover 部分之前的位置来插入伙伴国标注
    hover_markers = [
        "// Hover: highlight",
        "// hover:",
        "// Hover popup",
        "map.on('mousemove'",
    ]
    
    insert_pos = -1
    for marker in hover_markers:
        idx = c.find(marker)
        if idx > 0:
            # 找到这一行的开头
            line_start = c.rfind('\n', 0, idx) + 1
            insert_pos = line_start
            print(f"  找到插入点: '{marker}' (位置 {idx})")
            break
    
    if insert_pos < 0:
        # 备用：在 addLayer member-text 之后
        idx = c.find("'member-text'")
        if idx > 0:
            # 找到这个 addLayer 调用的结束 });
            end = c.find('});', idx)
            if end > 0:
                insert_pos = end + 3
                print("  找到备用插入点: member-text 图层之后")
    
    if insert_pos > 0:
        partner_code = """
        // ─── BRICS 伙伴国标注（亮蓝色圆点） ───
        const partnerFeatures: GeoJSON.Feature[] = BRICS_PARTNERS.map(code => {
          const m = BRICS_COUNTRY_META[code];
          return { type: 'Feature', properties: { code, name: isZh ? m?.nameZh : m?.name }, geometry: { type: 'Point', coordinates: m?.center ?? [0, 0] } };
        });
        map.addSource('partner-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: partnerFeatures } });
        map.addLayer({ id: 'partner-dots', type: 'circle', source: 'partner-labels', paint: { 'circle-radius': 5, 'circle-color': '#60A5FA', 'circle-opacity': 0.9, 'circle-stroke-color': '#3B82F6', 'circle-stroke-width': 1.5 } });
        map.addLayer({ id: 'partner-text', type: 'symbol', source: 'partner-labels', layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] }, paint: { 'text-color': '#93C5FD', 'text-halo-color': '#0A0F1E', 'text-halo-width': 1.2 } });

"""
        c = c[:insert_pos] + partner_code + c[insert_pos:]
        changes += 1
        print("  ✅ 添加了伙伴国标注图层（亮蓝色 #60A5FA）")
    else:
        print("  ❌ 无法定位插入点，请手动添加伙伴国标注")

# 4c. 地图图例中加入伙伴国说明（如果不存在）
if '伙伴国' not in c and 'Partner' not in c.split('legend')[-1] if 'legend' in c.lower() else True:
    # 在图例数组最后一项后面加入伙伴国
    # 找到 'map.other' 或 non-BRICS 图例项
    other_legend = re.search(r"\{color:'#2A2F3A'[^}]*otherTip[^}]*\}", c)
    if other_legend:
        old_item = other_legend.group()
        new_item = old_item + """,
          {color:'#60A5FA',label:isZh?'● 伙伴国标注':'● Partner Nations',n:10,glow:false,tip:isZh?'10个金砖伙伴国地理位置标注（蓝色）':'Blue labels showing 10 BRICS partner nation locations'}"""
        c = c.replace(old_item, new_item)
        changes += 1
        print("  ✅ 图例添加伙伴国项（蓝色）")
    else:
        print("  ⚠️ 未找到图例数组末尾，伙伴国图例需手动添加")

with open(path, 'w') as f:
    f.write(c)
print(f"  共 {changes} 处修改")
PYEOF

# ━━━ 清除缓存 + 重建 ━━━
echo ""
echo ">>> 清除 ISR 缓存..."
rm -rf "$P/.next/cache" 2>/dev/null || true
echo "  ✅ .next/cache 已清除"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✅ 21 国口径扩展完成！"
echo ""
echo "接下来在腾讯云执行："
echo ""
echo "  cd /home/ubuntu/deep-blue"
echo "  npm run build"
echo "  kill -9 \$(lsof -t -i:3000) 2>/dev/null; sleep 2"
echo "  nohup npx next start -p 3000 > /tmp/deep-blue.log 2>&1 &"
echo ""
echo "  git add -A && git commit -m 'feat: expand BRICS stats to 21 nations, blue partner labels on map' && git push origin main"
echo ""
echo "  → Cloudflare Purge Everything → 浏览器 Cmd+Shift+R"
echo ""
echo "本地同步："
echo "  cd /你本地的/deep-blue && git pull"
echo "═══════════════════════════════════════════════════════"

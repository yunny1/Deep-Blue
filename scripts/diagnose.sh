#!/bin/bash
# diagnose.sh
# 在运行 nightly-update.sh 之前，验证所有依赖是否正常
# 运行方式：bash /home/ubuntu/deep-blue/scripts/diagnose.sh

PROJECT_DIR="/home/ubuntu/deep-blue"
PASS=0
FAIL=0

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; }
info()  { echo -e "\033[36m   → $1\033[0m"; }

echo ""
echo "════════════════════════════════════════"
echo "  Deep Blue 运行前诊断"
echo "════════════════════════════════════════"
echo ""

# ── 1. 检查项目目录 ───────────────────────────────────────
echo "【1】项目目录"
if [ -d "$PROJECT_DIR" ]; then
  green "目录存在: $PROJECT_DIR"
  PASS=$((PASS+1))
else
  red "目录不存在: $PROJECT_DIR"
  info "请先 git clone 项目"
  FAIL=$((FAIL+1))
fi

# ── 2. 检查关键文件 ───────────────────────────────────────
echo ""
echo "【2】关键文件"
for f in "scripts/nightly-update.sh" "scripts/import-full.ts" ".env" "package.json" "prisma/schema.prisma"; do
  if [ -f "$PROJECT_DIR/$f" ]; then
    green "$f"
    PASS=$((PASS+1))
  else
    red "$f 不存在"
    FAIL=$((FAIL+1))
  fi
done

# ── 3. 检查 node_modules ──────────────────────────────────
echo ""
echo "【3】Node 依赖"
if [ -d "$PROJECT_DIR/node_modules/@prisma" ]; then
  green "node_modules/@prisma 存在"
  PASS=$((PASS+1))
else
  red "node_modules/@prisma 不存在，需要先运行 npm install"
  FAIL=$((FAIL+1))
fi

# ── 4. 加载 .env 并检查必要变量 ──────────────────────────
echo ""
echo "【4】环境变量"
set -a; source "$PROJECT_DIR/.env" 2>/dev/null; set +a

if [ -n "$DATABASE_URL" ]; then
  # 只显示前40个字符，不暴露完整密码
  PREVIEW="${DATABASE_URL:0:40}..."
  green "DATABASE_URL 已加载: $PREVIEW"
  PASS=$((PASS+1))
else
  red "DATABASE_URL 未加载（.env 文件可能为空或格式错误）"
  info "请检查 $PROJECT_DIR/.env 文件内容"
  FAIL=$((FAIL+1))
fi

if [ -n "$REVALIDATE_SECRET" ]; then
  green "REVALIDATE_SECRET 已加载"
  PASS=$((PASS+1))
else
  red "REVALIDATE_SECRET 未加载"
  info "请在 $PROJECT_DIR/.env 中添加 REVALIDATE_SECRET=..."
  FAIL=$((FAIL+1))
fi

# ── 5. 测试数据库连接 ─────────────────────────────────────
echo ""
echo "【5】数据库连接"
if [ -n "$DATABASE_URL" ]; then
  # 用 node 直接测试 pg 连接
  DB_TEST=$(node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
client.connect()
  .then(() => client.query('SELECT COUNT(*) FROM cables'))
  .then(r => { console.log('OK:' + r.rows[0].count); client.end(); })
  .catch(e => { console.log('FAIL:' + e.message); client.end(); });
" 2>/dev/null)

  if [[ "$DB_TEST" == OK:* ]]; then
    CABLE_COUNT="${DB_TEST#OK:}"
    green "数据库连接成功，cables 表中有 $CABLE_COUNT 条记录"
    PASS=$((PASS+1))
  else
    red "数据库连接失败: ${DB_TEST#FAIL:}"
    info "请检查 DATABASE_URL 是否正确，或 Supabase 是否在线"
    FAIL=$((FAIL+1))
  fi
else
  red "跳过数据库测试（DATABASE_URL 未加载）"
  FAIL=$((FAIL+1))
fi

# ── 6. 测试 Vercel /api/revalidate 端点 ───────────────────
echo ""
echo "【6】Vercel 端点"
SITE_URL="https://deep-blue-ten.vercel.app"

# 先测试端点是否存在（不带 secret，应该返回 401 而不是 404）
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$SITE_URL/api/revalidate" \
  -H "Content-Type: application/json" \
  -d '{"type":"full"}')

if [ "$HTTP_CODE" = "401" ]; then
  green "端点存在且鉴权正常（返回 401 表示端点在线，密钥验证生效）"
  PASS=$((PASS+1))
elif [ "$HTTP_CODE" = "404" ]; then
  red "端点不存在（404），Vercel 上还没有 /api/revalidate"
  info "请检查 src/app/api/revalidate/route.ts 是否已推送到 GitHub 并部署成功"
  FAIL=$((FAIL+1))
elif [ "$HTTP_CODE" = "200" ]; then
  red "端点返回 200 但没有鉴权——这说明 REVALIDATE_SECRET 验证没有生效，请检查代码"
  FAIL=$((FAIL+1))
else
  red "端点返回意外状态码: $HTTP_CODE"
  info "可能是网络问题或 Vercel 部署异常"
  FAIL=$((FAIL+1))
fi

# 用正确的 secret 再测一次
if [ -n "$REVALIDATE_SECRET" ] && [ "$HTTP_CODE" != "404" ]; then
  AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$SITE_URL/api/revalidate" \
    -H "Content-Type: application/json" \
    -H "x-revalidate-secret: $REVALIDATE_SECRET" \
    -d '{"type":"full"}')

  if [ "$AUTH_CODE" = "200" ]; then
    green "带 secret 调用成功（200），缓存刷新链路完全正常"
    PASS=$((PASS+1))
  else
    red "带 secret 调用返回 $AUTH_CODE"
    info "请检查 Vercel 环境变量中 REVALIDATE_SECRET 是否和 .env 里的值一致"
    FAIL=$((FAIL+1))
  fi
fi

# ── 7. 检查 nightly-update.sh 关键配置 ───────────────────
echo ""
echo "【7】nightly-update.sh 配置"
SCRIPT="$PROJECT_DIR/scripts/nightly-update.sh"

if grep -q "deep-blue-ten.vercel.app" "$SCRIPT"; then
  green "SITE_URL 已设置为 Vercel 原始域名"
  PASS=$((PASS+1))
else
  red "SITE_URL 可能还是 deep-cloud.org，需要改成 deep-blue-ten.vercel.app"
  FAIL=$((FAIL+1))
fi

if grep -q "curl -s -L" "$SCRIPT"; then
  green "curl 包含 -L 跟随重定向参数"
  PASS=$((PASS+1))
else
  red "curl 缺少 -L 参数，会导致 307 重定向失败"
  FAIL=$((FAIL+1))
fi

if grep -q "set -a" "$SCRIPT"; then
  green ".env 加载方式正确（使用 set -a）"
  PASS=$((PASS+1))
else
  red ".env 加载方式可能有问题，tsx 运行时可能读不到环境变量"
  FAIL=$((FAIL+1))
fi

# ── 汇总 ──────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  诊断结果: $PASS 项通过，$FAIL 项失败"
echo "════════════════════════════════════════"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "\033[32m所有检查通过，可以安全运行 nightly-update.sh\033[0m"
  echo ""
  echo "运行命令："
  echo "  /bin/bash $PROJECT_DIR/scripts/nightly-update.sh"
else
  echo -e "\033[31m有 $FAIL 项检查未通过，请先修复上面标红的问题再运行。\033[0m"
fi
echo ""


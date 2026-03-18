#!/bin/bash
# /home/ubuntu/deep-blue/scripts/nightly-update.sh
# Deep Blue 夜间数据同步脚本
# Cron: 0 19 * * * /bin/bash /home/ubuntu/deep-blue/scripts/nightly-update.sh

PROJECT_DIR="/home/ubuntu/deep-blue"
LOG_FILE="/home/ubuntu/deep-blue/logs/nightly-sync.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p /home/ubuntu/deep-blue/logs

echo "====================================" >> "$LOG_FILE"
echo "[$DATE] 开始夜间同步" >> "$LOG_FILE"
echo "====================================" >> "$LOG_FILE"

cd "$PROJECT_DIR" || exit 1

# 加载环境变量
set -a
source "$PROJECT_DIR/.env"
set +a

# 拉取最新代码
echo "[$DATE] 拉取最新代码..." >> "$LOG_FILE"
git pull origin main >> "$LOG_FILE" 2>&1

# 运行交叉验证同步脚本
echo "[$DATE] 开始交叉验证同步..." >> "$LOG_FILE"
npx tsx scripts/nightly-sync.ts >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
DATE_END=$(date '+%Y-%m-%d %H:%M:%S')

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$DATE_END] ✓ 同步完成" >> "$LOG_FILE"
else
  echo "[$DATE_END] ✗ 同步失败 (exit code: $EXIT_CODE)" >> "$LOG_FILE"
fi

# 保留最近 30 天的日志，避免磁盘撑爆
find /home/ubuntu/deep-blue/logs -name "*.log" -mtime +30 -delete

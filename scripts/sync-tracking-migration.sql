-- ============================================================
-- Deep Blue v8 — 同步追踪 + 状态变更检测
-- 由 dedup-backfill 或 nightly-sync 自动执行，也可手动在 Supabase SQL Editor 执行
-- ============================================================

-- 1. 同步追踪：记录每条海缆最后一次被上游数据源确认的时间
ALTER TABLE cables ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 2. 状态变更追踪：记录状态变更时间和变更前的状态
ALTER TABLE cables ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE cables ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 3. 首次入库时间（用于"新增"标记）
-- 注意：如果 Prisma 已经有 createdAt 字段则不需要这个
ALTER TABLE cables ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT NOW();

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_cables_last_synced_at ON cables (last_synced_at);
CREATE INDEX IF NOT EXISTS idx_cables_status_changed_at ON cables (status_changed_at);

-- ============================================================
-- Deep Blue 去重系统 — 数据库迁移
-- 运行方式：在 Supabase SQL Editor 中执行，或通过 psql 连接执行
-- ============================================================

-- 1. Cable 表新增字段
ALTER TABLE cables ADD COLUMN IF NOT EXISTS data_source TEXT;           -- 'TELEGEOGRAPHY' | 'SUBMARINE_NETWORKS'
ALTER TABLE cables ADD COLUMN IF NOT EXISTS external_id TEXT;           -- 上游原始ID，精确回溯
ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_name TEXT;        -- 标准化名称，用于匹配索引
ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_base TEXT;        -- 标准化基础名（不含编号后缀）
ALTER TABLE cables ADD COLUMN IF NOT EXISTS canonical_suffix TEXT;      -- 标准化编号后缀
ALTER TABLE cables ADD COLUMN IF NOT EXISTS review_status TEXT;         -- NULL | 'PENDING_REVIEW' | 'CONFIRMED' | 'MERGED'
ALTER TABLE cables ADD COLUMN IF NOT EXISTS possible_duplicate_of TEXT; -- 指向疑似重复的cable id
ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_into TEXT;           -- 被合并到哪条cable（软删除标记）
ALTER TABLE cables ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;     -- 合并时间

-- 2. 建索引加速查询
CREATE INDEX IF NOT EXISTS idx_cables_canonical_base ON cables (canonical_base);
CREATE INDEX IF NOT EXISTS idx_cables_canonical_name ON cables (canonical_name);
CREATE INDEX IF NOT EXISTS idx_cables_data_source ON cables (data_source);
CREATE INDEX IF NOT EXISTS idx_cables_review_status ON cables (review_status);
CREATE INDEX IF NOT EXISTS idx_cables_merged_into ON cables (merged_into);

-- 3. 名称别名表（持续积累领域知识）
CREATE TABLE IF NOT EXISTS cable_name_aliases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alias TEXT NOT NULL UNIQUE,          -- 变体写法（小写，去空格连字符）
  canonical TEXT NOT NULL,             -- 标准写法
  created_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT                            -- 备注（谁加的、为什么加）
);

-- 4. 预填充已知别名
INSERT INTO cable_name_aliases (alias, canonical, note) VALUES
  ('seamewe', 'sea-me-we', '常见缩写变体'),
  ('smw', 'sea-me-we', 'TeleGeography缩写'),
  ('apcn', 'asia-pacific-cable-network', '缩写'),
  ('apg', 'asia-pacific-gateway', '缩写'),
  ('apl', 'asia-pacific-link', '缩写'),
  ('flag', 'fiber-optic-link-around-the-globe', '缩写'),
  ('imewe', 'india-middle-east-western-europe', '缩写'),
  ('eig', 'europe-india-gateway', '缩写'),
  ('aae1', 'asia-africa-europe-1', '缩写'),
  ('peace', 'pakistan-east-africa-connecting-europe', '缩写'),
  ('2africa', 'two-africa', '数字开头变体'),
  ('tgn', 'tata-global-network', '缩写'),
  ('c2c', 'cross-channel-cable', '缩写变体'),
  ('jga', 'japan-guam-australia', '缩写'),
  ('sjc', 'southeast-asia-japan-cable', '缩写'),
  ('sjc2', 'southeast-asia-japan-cable-2', '缩写含版本号'),
  ('plcn', 'pacific-light-cable-network', '缩写'),
  ('hkamericas', 'hong-kong-americas', '无连字符变体')
ON CONFLICT (alias) DO NOTHING;

-- 5. 合并日志表（审计跟踪）
CREATE TABLE IF NOT EXISTS cable_merge_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kept_cable_id TEXT NOT NULL,         -- 保留的海缆ID
  removed_cable_id TEXT NOT NULL,      -- 被合并（软删除）的海缆ID
  kept_name TEXT NOT NULL,
  removed_name TEXT NOT NULL,
  merge_method TEXT NOT NULL,          -- 'auto-exact' | 'auto-fuzzy' | 'manual'
  match_score REAL,                    -- 匹配分数
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merged_by TEXT DEFAULT 'system'      -- 'system' | 'admin'
);

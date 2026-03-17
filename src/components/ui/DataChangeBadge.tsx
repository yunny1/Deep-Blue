// src/components/ui/DataChangeBadge.tsx
// 数据变化小标签
// 在海缆详情面板中，若该海缆在最近一次导入中发生了变化，显示对应小标签：
//   - 绿色 NEW：这条海缆是新增的
//   - 蓝色 UPDATED：这条海缆的数据有更新（hover 可看到变化的字段）
//   - 红色 REMOVED：这条海缆在新数据中不存在了（极少见）
//
// 数据来源：/api/changes，在组件首次挂载时请求一次，结果在模块级别缓存
// 避免每个面板都发起独立请求

'use client';

import { useEffect, useState } from 'react';

// ── 类型定义 ────────────────────────────────────────────────────

interface CableChange {
  type: 'NEW' | 'UPDATED' | 'REMOVED';
  slug: string;
  name: string;
  changedFields?: string[];
}

interface ChangeLog {
  hasChanges: boolean;
  importedAt?: string;
  changes?: CableChange[];
  summary?: {
    newCount: number;
    updatedCount: number;
    removedCount: number;
  };
}

// ── 模块级缓存（所有组件实例共用同一份数据，只请求一次）────────

let cachedChanges: ChangeLog | null = null;
let fetchPromise: Promise<ChangeLog> | null = null;

async function fetchChanges(): Promise<ChangeLog> {
  // 如果已经有缓存，直接返回
  if (cachedChanges) return cachedChanges;
  // 如果已经在请求中，复用同一个 Promise（避免并发重复请求）
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/changes')
    .then(r => r.json())
    .then(data => {
      cachedChanges = data;
      return data;
    })
    .catch(() => {
      // 请求失败时静默降级，不显示任何标签
      return { hasChanges: false };
    });

  return fetchPromise;
}

// ── 字段名的中英文映射（用于 tooltip 中展示变化的字段）────────

const FIELD_LABELS: Record<string, string> = {
  status: '运行状态',
  length: '线路长度',
  owners: '运营商',
  landingStations: '登陆站',
};

function formatChangedFields(fields: string[], locale: string): string {
  return fields
    .map(f => (locale === 'zh' ? FIELD_LABELS[f] || f : f))
    .join('、');
}

// ── 主组件 ──────────────────────────────────────────────────────

interface DataChangeBadgeProps {
  cableSlug: string;
  locale?: string; // 'zh' | 'en'，默认 'en'
}

export default function DataChangeBadge({ cableSlug, locale = 'en' }: DataChangeBadgeProps) {
  const [change, setChange] = useState<CableChange | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    fetchChanges().then(data => {
      if (!data.hasChanges || !data.changes) return;
      const found = data.changes.find(c => c.slug === cableSlug);
      if (found) setChange(found);
    });
  }, [cableSlug]);

  // 如果这条海缆没有变化，什么都不渲染
  if (!change) return null;

  // 根据变化类型决定颜色和文字
  const config = {
    NEW: {
      bg: 'rgba(6, 214, 160, 0.12)',
      border: 'rgba(6, 214, 160, 0.4)',
      color: '#06D6A0',
      label: locale === 'zh' ? '新增' : 'NEW',
      glow: 'rgba(6, 214, 160, 0.3)',
    },
    UPDATED: {
      bg: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(59, 130, 246, 0.4)',
      color: '#3B82F6',
      label: locale === 'zh' ? '已更新' : 'UPDATED',
      glow: 'rgba(59, 130, 246, 0.3)',
    },
    REMOVED: {
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(239, 68, 68, 0.4)',
      color: '#EF4444',
      label: locale === 'zh' ? '已下线' : 'REMOVED',
      glow: 'rgba(239, 68, 68, 0.3)',
    },
  }[change.type];

  // tooltip 内容：显示最近导入时间 + 具体变化字段（仅 UPDATED 类型）
  const tooltipText = (() => {
    if (change.type === 'NEW') {
      return locale === 'zh' ? '在最近一次数据更新中新增' : 'Added in the latest data update';
    }
    if (change.type === 'REMOVED') {
      return locale === 'zh' ? '在最近一次数据更新中已移除' : 'Removed in the latest data update';
    }
    if (change.type === 'UPDATED' && change.changedFields && change.changedFields.length > 0) {
      const fields = formatChangedFields(change.changedFields, locale);
      return locale === 'zh'
        ? `最近一次数据更新中有变化：${fields}`
        : `Updated in latest import: ${change.changedFields.join(', ')}`;
    }
    return locale === 'zh' ? '数据有更新' : 'Data updated';
  })();

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* 小标签本体 */}
      <span
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 7px',
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          backgroundColor: config.bg,
          border: `1px solid ${config.border}`,
          color: config.color,
          cursor: 'default',
          userSelect: 'none',
          boxShadow: `0 0 8px ${config.glow}`,
          animation: 'badgePulse 2s ease-in-out infinite',
          // 内联动画，避免全局 CSS 污染
        }}
      >
        {/* 呼吸小圆点 */}
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: config.color,
          boxShadow: `0 0 4px ${config.color}`,
          flexShrink: 0,
        }} />
        {config.label}
      </span>

      {/* Tooltip（hover 时显示详细信息）*/}
      {showTooltip && (
        <div style={{
          position: 'absolute',
          bottom: '120%',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(10, 17, 34, 0.97)',
          border: `1px solid ${config.border}`,
          borderRadius: 6,
          padding: '7px 10px',
          fontSize: 11,
          color: '#CBD5E1',
          whiteSpace: 'nowrap',
          zIndex: 200,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
          lineHeight: 1.5,
        }}>
          {tooltipText}
          {/* 小三角形 */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${config.border}`,
          }} />
        </div>
      )}

      {/* 组件级 keyframes（避免污染全局 CSS）*/}
      <style>{`
        @keyframes badgePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}

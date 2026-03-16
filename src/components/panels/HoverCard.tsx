// src/components/panels/HoverCard.tsx
// 鼠标悬停在海缆上时弹出的预览卡片
// 显示海缆名称、状态、长度等基本信息

'use client';

interface HoverCardProps {
  cable: {
    name: string;
    status: string;
    lengthKm: number | null;
    fiberPairs: number | null;
  } | null;
  position: { x: number; y: number }; // 鼠标位置
}

// 状态对应的颜色和中英文标签
const STATUS_MAP: Record<string, { color: string; label: string }> = {
  IN_SERVICE:         { color: '#06D6A0', label: 'In Service' },
  UNDER_CONSTRUCTION: { color: '#E9C46A', label: 'Under Construction' },
  PLANNED:            { color: '#3B82F6', label: 'Planned' },
  DECOMMISSIONED:     { color: '#6B7280', label: 'Decommissioned' },
};

export default function HoverCard({ cable, position }: HoverCardProps) {
  // 没有悬停的海缆时不显示
  if (!cable) return null;

  const statusInfo = STATUS_MAP[cable.status] || STATUS_MAP.IN_SERVICE;

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x + 16,
        top: position.y - 10,
        backgroundColor: 'rgba(27, 58, 92, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(42, 157, 143, 0.3)',
        borderRadius: 10,
        padding: '12px 16px',
        minWidth: 220,
        maxWidth: 320,
        zIndex: 1000,
        pointerEvents: 'none', // 不要挡住鼠标事件
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* 海缆名称 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7', marginBottom: 8 }}>
        {cable.name}
      </div>

      {/* 状态指示器 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: statusInfo.color,
          boxShadow: `0 0 6px ${statusInfo.color}`,
        }} />
        <span style={{ fontSize: 12, color: statusInfo.color, fontWeight: 500 }}>
          {statusInfo.label}
        </span>
      </div>

      {/* 属性信息 */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#9CA3AF' }}>
        {cable.lengthKm && (
          <span>{cable.lengthKm.toLocaleString()} km</span>
        )}
        {cable.fiberPairs && (
          <span>{cable.fiberPairs} fiber pairs</span>
        )}
      </div>
    </div>
  );
}

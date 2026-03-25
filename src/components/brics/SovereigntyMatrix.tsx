'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── 类型 ────────────────────────────────────────────────

type ConnStatus = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';

interface MemberInfo {
  code: string;
  name: string;
  nameZh: string;
}

interface MatrixCell {
  from: string;
  to: string;
  status: ConnStatus;
  directCableCount: number;
  directCables: string[];
}

interface SovereigntyData {
  members: MemberInfo[];
  matrix: MatrixCell[];
  summary: {
    totalPairs: number;
    direct: number;
    indirect: number;
    transit: number;
    none: number;
    landlocked: number;
  };
}

// ─── 颜色映射 ────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ConnStatus,
  { bg: string; label: string; labelZh: string; emoji: string }
> = {
  direct:     { bg: '#22C55E', label: 'Direct',     labelZh: '直连',        emoji: '●' },
  indirect:   { bg: '#F59E0B', label: 'Via BRICS',   labelZh: 'BRICS 中转', emoji: '◐' },
  transit:    { bg: '#EF4444', label: 'Via Non-BRICS', labelZh: '非 BRICS 中转', emoji: '○' },
  none:       { bg: '#6B7280', label: 'No Route',    labelZh: '无连接',      emoji: '✕' },
  landlocked: { bg: '#374151', label: 'Landlocked',  labelZh: '内陆国',      emoji: '▬' },
};

// ─── 单元格 Tooltip ──────────────────────────────────────

interface TooltipData {
  x: number;
  y: number;
  cell: MatrixCell;
  fromName: string;
  toName: string;
}

function Tooltip({ data }: { data: TooltipData }) {
  const config = STATUS_CONFIG[data.cell.status];
  return (
    <div
      style={{
        position: 'fixed',
        left: data.x + 12,
        top: data.y - 8,
        background: '#0F1D32',
        border: '1px solid rgba(212, 175, 55, 0.3)',
        borderRadius: '8px',
        padding: '12px 16px',
        zIndex: 9999,
        pointerEvents: 'none',
        minWidth: '220px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0E6C8',
          marginBottom: '6px',
        }}
      >
        {data.fromName} → {data.toName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: config.bg,
          }}
        />
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
          {config.labelZh}（{config.label}）
        </span>
      </div>
      {data.cell.directCableCount > 0 && (
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
          直连海缆 {data.cell.directCableCount} 条
          {data.cell.directCables.length > 0 && (
            <span>：{data.cell.directCables.slice(0, 3).join(', ')}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 图例 ────────────────────────────────────────────────

function Legend({ summary }: { summary: SovereigntyData['summary'] }) {
  const items: { status: ConnStatus; count: number }[] = [
    { status: 'direct', count: summary.direct },
    { status: 'indirect', count: summary.indirect },
    { status: 'transit', count: summary.transit },
    { status: 'none', count: summary.none },
    { status: 'landlocked', count: summary.landlocked },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '16px' }}>
      {items.map(({ status, count }) => {
        const cfg = STATUS_CONFIG[status];
        return (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '3px',
                background: cfg.bg,
                opacity: 0.85,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              {cfg.labelZh} — {count} 对
            </span>
          </div>
        );
      })}
      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginLeft: '8px' }}>
        共 {summary.totalPairs} 对
      </span>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────

export default function SovereigntyMatrix() {
  const [data, setData] = useState<SovereigntyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [highlightRow, setHighlightRow] = useState<string | null>(null);
  const [highlightCol, setHighlightCol] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/brics/sovereignty')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 快速查找
  const getCell = useCallback(
    (from: string, to: string): MatrixCell | undefined => {
      return data?.matrix.find((m) => m.from === from && m.to === to);
    },
    [data]
  );

  const getMemberName = useCallback(
    (code: string): string => {
      return data?.members.find((m) => m.code === code)?.nameZh ?? code;
    },
    [data]
  );

  if (loading) {
    return (
      <div
        style={{
          background: 'rgba(26, 45, 74, 0.4)',
          borderRadius: '12px',
          height: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '14px',
        }}
      >
        正在计算数字主权矩阵…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        style={{
          padding: '20px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#EF4444',
          fontSize: '14px',
        }}
      >
        矩阵数据加载失败：{error ?? '未知错误'}
      </div>
    );
  }

  const members = data.members;
  const cellSize = 52;
  const headerWidth = 80;

  return (
    <div>
      {/* ── 矩阵容器 ── */}
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '12px',
          border: '1px solid rgba(212, 175, 55, 0.12)',
          background: 'rgba(15, 29, 50, 0.5)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'inline-block', minWidth: 'fit-content' }}>
          {/* ── 列头 ── */}
          <div style={{ display: 'flex', marginLeft: headerWidth }}>
            {members.map((m) => (
              <div
                key={`col-${m.code}`}
                style={{
                  width: cellSize,
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  color:
                    highlightCol === m.code
                      ? '#D4AF37'
                      : 'rgba(255,255,255,0.5)',
                  paddingBottom: '8px',
                  transition: 'color 0.15s',
                  cursor: 'default',
                }}
              >
                {m.code}
              </div>
            ))}
          </div>

          {/* ── 矩阵行 ── */}
          {members.map((rowMember) => (
            <div
              key={`row-${rowMember.code}`}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              {/* 行标签 */}
              <div
                style={{
                  width: headerWidth,
                  fontSize: '11px',
                  fontWeight: 600,
                  color:
                    highlightRow === rowMember.code
                      ? '#D4AF37'
                      : 'rgba(255,255,255,0.5)',
                  textAlign: 'right',
                  paddingRight: '12px',
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'default',
                }}
                title={rowMember.nameZh}
              >
                {rowMember.nameZh}
              </div>

              {/* 单元格 */}
              {members.map((colMember) => {
                const isSelf = rowMember.code === colMember.code;
                const cell = isSelf
                  ? null
                  : getCell(rowMember.code, colMember.code);
                const config = cell ? STATUS_CONFIG[cell.status] : null;
                const isHighlighted =
                  highlightRow === rowMember.code ||
                  highlightCol === colMember.code;

                return (
                  <div
                    key={`${rowMember.code}-${colMember.code}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isSelf ? 'default' : 'pointer',
                      borderRadius: '4px',
                      margin: '1px',
                      background: isSelf
                        ? 'rgba(212, 175, 55, 0.06)'
                        : config
                        ? `${config.bg}${isHighlighted ? '40' : '25'}`
                        : 'transparent',
                      transition: 'background 0.15s',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (isSelf || !cell) return;
                      setHighlightRow(rowMember.code);
                      setHighlightCol(colMember.code);
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        x: rect.right,
                        y: rect.top,
                        cell,
                        fromName: getMemberName(rowMember.code),
                        toName: getMemberName(colMember.code),
                      });
                    }}
                    onMouseLeave={() => {
                      setHighlightRow(null);
                      setHighlightCol(null);
                      setTooltip(null);
                    }}
                  >
                    {isSelf ? (
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'rgba(212, 175, 55, 0.3)',
                        }}
                      >
                        {rowMember.code}
                      </span>
                    ) : config ? (
                      <>
                        <span
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: config.bg,
                            opacity: 0.85,
                          }}
                        />
                        {cell && cell.directCableCount > 0 && (
                          <span
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              right: '6px',
                              fontSize: '9px',
                              color: 'rgba(255,255,255,0.4)',
                              fontFeatureSettings: '"tnum"',
                            }}
                          >
                            {cell.directCableCount}
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── 图例 + 摘要 ── */}
      <Legend summary={data.summary} />

      {/* ── Tooltip ── */}
      {tooltip && <Tooltip data={tooltip} />}
    </div>
  );
}


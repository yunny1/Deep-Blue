'use client';
// src/app/admin/governance/page.tsx
// 数据治理面板：待绘制路线 / 同步冲突 / 更新日志

import { useEffect, useState, useCallback } from 'react';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface PendingCable {
  id: string;
  name: string;
  slug: string;
  status: string;
  rfsDate: string | null;
  reviewStatus: string | null;
  updatedAt: string;
  _count: { landingStations: number };
}

interface SyncConflict {
  id: string;
  timestamp: string;
  cableSlug: string;
  cableName: string;
  reviewStatus: string;
  conflictFields: Array<{ field: string; current: any; incoming: any }>;
  resolved: boolean;
  resolvedAt?: string;
}

interface SyncLogEntry {
  id: string;
  timestamp: string;
  type: string;
  cableSlug?: string;
  cableName?: string;
  summary: string;
  details?: Record<string, any>;
}

// ── 颜色工具 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#06D6A0',
  UNDER_CONSTRUCTION: '#E9C46A',
  PLANNED: '#3B82F6',
  DECOMMISSIONED: '#D97706',
};
const STATUS_LABELS: Record<string, string> = {
  IN_SERVICE: '在役',
  UNDER_CONSTRUCTION: '在建',
  PLANNED: '规划中',
  DECOMMISSIONED: '已退役',
};
const LOG_TYPE_COLORS: Record<string, string> = {
  sync_run: '#2A9D8F',
  conflict: '#EF4444',
  route_protected: '#E9C46A',
  manually_added_protected: '#8B5CF6',
};
const LOG_TYPE_LABELS: Record<string, string> = {
  sync_run: '同步运行',
  conflict: '数据冲突',
  route_protected: '路线保护',
  manually_added_protected: '人工录入保护',
};

// ── 样式常量 ─────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '12px 16px',
};

const BADGE = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center',
  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12,
  backgroundColor: `${color}18`, color, border: `1px solid ${color}40`,
  letterSpacing: 0.3,
});

// ── 主组件 ───────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const [tab, setTab] = useState<'pending' | 'conflicts' | 'log'>('pending');

  const [pending, setPending]     = useState<PendingCable[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [logs, setLogs]           = useState<SyncLogEntry[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  const [loadingPending,   setLoadingPending]   = useState(false);
  const [loadingLog,       setLoadingLog]       = useState(false);
  const [resolvingId,      setResolvingId]      = useState<string | null>(null);

  // 拉取待绘制路线
  const fetchPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const r = await fetch('/api/admin/pending-routes');
      const d = await r.json();
      setPending(d.cables || []);
    } finally { setLoadingPending(false); }
  }, []);

  // 拉取日志和冲突
  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const r = await fetch('/api/admin/sync-log');
      const d = await r.json();
      setLogs(d.logs || []);
      setConflicts(d.conflicts || []);
      setUnresolvedCount(d.unresolvedCount || 0);
    } finally { setLoadingLog(false); }
  }, []);

  useEffect(() => { fetchPending(); fetchLog(); }, [fetchPending, fetchLog]);

  // 解决冲突
  const resolveConflict = async (conflictId: string) => {
    setResolvingId(conflictId);
    try {
      await fetch('/api/admin/sync-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflictId }),
      });
      await fetchLog();
    } finally { setResolvingId(null); }
  };

  // 导航到路线编辑器
  const goToRouteEditor = (slug: string) => {
    window.open(`/admin/cable-intake?slug=${slug}`, '_blank');
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    background: 'none', border: 'none',
    color: active ? '#2A9D8F' : '#6B7280',
    borderBottom: active ? '2px solid #2A9D8F' : '2px solid transparent',
    transition: 'all 0.2s', position: 'relative',
  });

  const unresolvedPending = conflicts.filter(c => !c.resolved).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#030408', color: '#D1D5DB', fontFamily: 'system-ui, sans-serif' }}>

      {/* 顶部导航 */}
      <div style={{ padding: '16px 32px', borderBottom: '1px solid rgba(42,157,143,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(13,27,42,0.9)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/admin" style={{ color: '#6B7280', fontSize: 13, textDecoration: 'none' }}>← 管理后台</a>
          <span style={{ color: '#374151' }}>|</span>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#EDF2F7', margin: 0 }}>数据治理</h1>
        </div>
        <button onClick={() => { fetchPending(); fetchLog(); }} style={{ fontSize: 12, color: '#2A9D8F', background: 'none', border: '1px solid rgba(42,157,143,0.3)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
          刷新
        </button>
      </div>

      {/* 摘要数字 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '24px 32px 0' }}>
        {[
          { label: '待绘制路线', value: pending.length, color: '#E9C46A', desc: '入库但无路线数据' },
          { label: '未处理冲突', value: unresolvedPending, color: '#EF4444', desc: '同步数据与人工记录冲突' },
          { label: '近期同步记录', value: logs.length, color: '#2A9D8F', desc: '最近 50 条运行日志' },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, padding: '16px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#D1D5DB', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Tab 栏 */}
      <div style={{ display: 'flex', padding: '20px 32px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={tabStyle(tab === 'pending')}   onClick={() => setTab('pending')}>
          待绘制路线
          {pending.length > 0 && <span style={{ marginLeft: 6, ...BADGE('#E9C46A'), fontSize: 9 }}>{pending.length}</span>}
        </button>
        <button style={tabStyle(tab === 'conflicts')} onClick={() => setTab('conflicts')}>
          同步冲突
          {unresolvedPending > 0 && <span style={{ marginLeft: 6, ...BADGE('#EF4444'), fontSize: 9 }}>{unresolvedPending}</span>}
        </button>
        <button style={tabStyle(tab === 'log')}       onClick={() => setTab('log')}>
          更新日志
        </button>
      </div>

      {/* Tab 内容 */}
      <div style={{ padding: '24px 32px' }}>

        {/* ── 待绘制路线 ─────────────────────────────────────────── */}
        {tab === 'pending' && (
          <div>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.6 }}>
              以下海缆已入库但没有路线数据（<code style={{ color: '#E9C46A' }}>routeGeojson = NULL</code>），不会显示在地球上。
              点击「绘制路线」跳转到路线编辑器，完成绘制并保存后自动标记为
              <code style={{ color: '#2A9D8F', marginLeft: 4 }}>ROUTE_FIXED</code>，nightly-sync 不会覆盖。
            </p>

            {loadingPending ? (
              <div style={{ color: '#6B7280', fontSize: 13 }}>加载中...</div>
            ) : pending.length === 0 ? (
              <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14, color: '#2A9D8F', fontWeight: 600 }}>所有海缆都已有路线数据</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map(cable => (
                  <div key={cable.slug} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 16 }}>
                    {/* 状态指示 */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: STATUS_COLORS[cable.status] || '#6B7280', flexShrink: 0 }} />

                    {/* 海缆信息 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7', marginBottom: 3 }}>{cable.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{cable.slug}</span>
                        <span style={BADGE(STATUS_COLORS[cable.status] || '#6B7280')}>{STATUS_LABELS[cable.status] || cable.status}</span>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>{cable._count.landingStations} 个登陆站</span>
                        {cable.rfsDate && (
                          <span style={{ fontSize: 11, color: '#6B7280' }}>RFS {new Date(cable.rfsDate).getFullYear()}</span>
                        )}
                        {cable.reviewStatus && (
                          <span style={BADGE('#8B5CF6')}>{cable.reviewStatus}</span>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <button
                      onClick={() => goToRouteEditor(cable.slug)}
                      style={{
                        padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'rgba(42,157,143,0.12)', border: '1px solid rgba(42,157,143,0.3)',
                        color: '#2A9D8F', transition: 'all 0.15s', flexShrink: 0,
                      }}
                    >
                      绘制路线 →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 同步冲突 ──────────────────────────────────────────── */}
        {tab === 'conflicts' && (
          <div>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.6 }}>
              当 nightly-sync 的数据与你手动维护的字段冲突时，会在这里记录。
              冲突海缆的原始数据不会被覆盖。确认处理后点击「已解决」清除提示。
            </p>

            {loadingLog ? (
              <div style={{ color: '#6B7280', fontSize: 13 }}>加载中...</div>
            ) : conflicts.filter(c => !c.resolved).length === 0 ? (
              <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 14, color: '#2A9D8F', fontWeight: 600 }}>没有待处理冲突</div>
                {conflicts.filter(c => c.resolved).length > 0 && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
                    历史已解决冲突：{conflicts.filter(c => c.resolved).length} 条
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {conflicts.filter(c => !c.resolved).map(conflict => (
                  <div key={conflict.id} style={{ ...CARD, borderColor: 'rgba(239,68,68,0.25)', borderLeft: '3px solid #EF4444' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7', marginBottom: 4 }}>{conflict.cableName}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{conflict.cableSlug}</span>
                          <span style={BADGE('#8B5CF6')}>{conflict.reviewStatus}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>
                            {new Date(conflict.timestamp).toLocaleString('zh-CN')}
                          </span>
                        </div>
                      </div>
                      <button
                        disabled={resolvingId === conflict.id}
                        onClick={() => resolveConflict(conflict.id)}
                        style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.25)',
                          color: '#2A9D8F', fontWeight: 500,
                          opacity: resolvingId === conflict.id ? 0.5 : 1,
                        }}
                      >
                        {resolvingId === conflict.id ? '处理中...' : '已解决'}
                      </button>
                    </div>

                    {/* 冲突字段详情 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>
                        CONFLICTING FIELDS — 同步数据带来以下变化，已被拦截未写入
                      </div>
                      {conflict.conflictFields.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '6px 10px', backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: 6 }}>
                          <span style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace', minWidth: 120 }}>{f.field}</span>
                          <span style={{ fontSize: 11, color: '#06D6A0' }}>
                            当前：{f.current == null ? 'NULL' : String(f.current)}
                          </span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>→</span>
                          <span style={{ fontSize: 11, color: '#EF4444' }}>
                            同步来：{f.incoming == null ? 'NULL' : String(f.incoming)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 更新日志 ──────────────────────────────────────────── */}
        {tab === 'log' && (
          <div>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 1.6 }}>
              每次 nightly-sync 运行后的变更记录，最多保留最近 50 条。
              需要先在 nightly-sync 文件末尾插入日志写入代码，日志才会在这里显示。
            </p>

            {loadingLog ? (
              <div style={{ color: '#6B7280', fontSize: 13 }}>加载中...</div>
            ) : logs.length === 0 ? (
              <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 500 }}>暂无日志</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8, lineHeight: 1.6 }}>
                  nightly-sync 尚未配置日志写入。<br />
                  请将 nightly-sync 文件上传，我来添加对应代码。
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {logs.map(entry => {
                  const color = LOG_TYPE_COLORS[entry.type] || '#6B7280';
                  return (
                    <div key={entry.id} style={{ ...CARD, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={BADGE(color)}>{LOG_TYPE_LABELS[entry.type] || entry.type}</span>
                          {entry.cableName && (
                            <span style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 500 }}>{entry.cableName}</span>
                          )}
                          {entry.cableSlug && (
                            <span style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>{entry.cableSlug}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{entry.summary}</div>
                      </div>
                      <div style={{ fontSize: 11, color: '#4B5563', flexShrink: 0, textAlign: 'right' }}>
                        {new Date(entry.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

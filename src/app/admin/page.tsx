'use client';
// src/app/admin/page.tsx
// 管理后台 v2：新增 PENDING_REVIEW 海缆审核 + DLQ AI 审核

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── 类型 ─────────────────────────────────────────────────────────
interface SyncLog {
  runAt: string; tgTotal: number; snTotal: number;
  snOnlyAdded: number; snOnlySkipped: number;
  conflictsFound: number; snStationsAdded: number; dlqTotal: number;
}
interface DLQItem {
  id: string; rawString: string; originSource: string | null;
  cableId: string | null; errorReason: string | null;
  status: string; retryCount: number; createdAt: string;
  aiSuggestedPayload?: {
    standardizedCity: string; countryCode: string;
    lat: number; lng: number; confidence: number; reasoning: string;
  } | null;
}
interface PendingCable {
  id: string; name: string; slug: string;
  lengthKm: number | null; rfsDate: string | null;
  _count: { landingStations: number };
  landingStations: Array<{ landingStation: { name: string; countryCode: string } }>;
  similarCables: Array<{ id: string; name: string; status: string; lengthKm: number | null; _count: { landingStations: number } }>;
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'logs' | 'dlq' | 'pending' | 'ai_audit'>('logs');

  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [dlqItems, setDlqItems] = useState<DLQItem[]>([]);
  const [dlqTotal, setDlqTotal] = useState(0);
  const [dlqPage, setDlqPage] = useState(1);
  const [dlqLoading, setDlqLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editCC, setEditCC] = useState('');
  const [editCity, setEditCity] = useState('');
  const [saving, setSaving] = useState(false);

  const [pendingCables, setPendingCables] = useState<PendingCable[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [aiAuditItems, setAiAuditItems] = useState<DLQItem[]>([]);
  const [aiAuditTotal, setAiAuditTotal] = useState(0);
  const [aiAuditLoading, setAiAuditLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } finally { setLogsLoading(false); }
  }, []);

  const loadDLQ = useCallback(async (status = 'PENDING', page = 1) => {
    setDlqLoading(true);
    try {
      const res = await fetch(`/api/admin/dlq?status=${status}&page=${page}`);
      const data = await res.json();
      setDlqItems(data.items || []); setDlqTotal(data.total || 0);
    } finally { setDlqLoading(false); }
  }, []);

  const loadPending = useCallback(async (page = 1) => {
    setPendingLoading(true);
    try {
      const res = await fetch(`/api/admin/pending-review?page=${page}`);
      const data = await res.json();
      setPendingCables(data.items || []); setPendingTotal(data.total || 0);
    } finally { setPendingLoading(false); }
  }, []);

  const loadAiAudit = useCallback(async () => {
    setAiAuditLoading(true);
    try {
      const res = await fetch(`/api/admin/dlq?status=NEEDS_HUMAN_AUDIT&page=1`);
      const data = await res.json();
      setAiAuditItems(data.items || []); setAiAuditTotal(data.total || 0);
    } finally { setAiAuditLoading(false); }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    if (tab === 'dlq') loadDLQ('PENDING', dlqPage);
    if (tab === 'pending') loadPending(pendingPage);
    if (tab === 'ai_audit') loadAiAudit();
  }, [tab, dlqPage, pendingPage]);

  const logout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
  };

  const handleResolve = async (id: string) => {
    if (!editLat || !editLng || !editCC) return;
    setSaving(true);
    try {
      await fetch('/api/admin/dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, lat: parseFloat(editLat), lng: parseFloat(editLng), countryCode: editCC.toUpperCase(), standardizedCity: editCity }),
      });
      setEditingId(null);
      loadDLQ('PENDING', dlqPage);
    } finally { setSaving(false); }
  };

  // 批准 AI 推理的坐标
  const handleApproveAI = async (item: DLQItem) => {
    if (!item.aiSuggestedPayload) return;
    setSaving(true);
    try {
      await fetch('/api/admin/dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          lat: item.aiSuggestedPayload.lat,
          lng: item.aiSuggestedPayload.lng,
          countryCode: item.aiSuggestedPayload.countryCode,
          standardizedCity: item.aiSuggestedPayload.standardizedCity,
        }),
      });
      loadAiAudit();
    } finally { setSaving(false); }
  };

  const handleIgnoreSelected = async () => {
    if (!selected.size) return;
    await fetch('/api/admin/dlq', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }) });
    setSelected(new Set()); loadDLQ('PENDING', dlqPage);
  };

  // PENDING_REVIEW 操作
  const handlePendingAction = async (id: string, action: string, mergeIntoId?: string) => {
    setActionLoading(id);
    try {
      const res = await fetch('/api/admin/pending-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, mergeIntoId }),
      });
      const data = await res.json();
      if (data.success) loadPending(pendingPage);
    } finally { setActionLoading(null); }
  };

  const TABS = [
    { key: 'logs',      label: '同步日志' },
    { key: 'pending',   label: `待审核海缆${pendingTotal > 0 ? ` (${pendingTotal})` : ''}` },
    { key: 'ai_audit',  label: `AI坐标审核${aiAuditTotal > 0 ? ` (${aiAuditTotal})` : ''}` },
    { key: 'dlq',       label: `坐标DLQ${dlqTotal > 0 ? ` (${dlqTotal})` : ''}` },
  ];

  const itemStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: 10, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>
      <nav style={{ height: 56, backgroundColor: 'rgba(13,27,42,0.98)', borderBottom: '1px solid rgba(42,157,143,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🌊</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 11, color: '#2A9D8F', padding: '3px 8px', borderRadius: 5, backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.2)' }}>管理后台</span>
        </div>
        <button onClick={logout} style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>退出登录</button>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>

        {/* 统计卡片 */}
        {logs[0] && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'TeleGeography', value: logs[0].tgTotal, color: '#2A9D8F' },
              { label: 'SN补充入库', value: logs[0].snOnlyAdded, color: '#06D6A0' },
              { label: '待审核海缆', value: pendingTotal, color: '#E9C46A' },
              { label: 'AI坐标待审', value: aiAuditTotal, color: '#8B5CF6' },
              { label: 'DLQ待处理', value: dlqTotal, color: '#EF4444' },
            ].map(card => (
              <div key={card.label} style={{ flex: 1, minWidth: 130, padding: '16px 20px', backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${card.color}30`, borderRadius: 10 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, color: tab === t.key ? '#2A9D8F' : '#6B7280', background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? '2px solid #2A9D8F' : '2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 同步日志 ── */}
        {tab === 'logs' && (
          <div>
            {logsLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            : logs.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>暂无日志</div>
            : logs.map((log, i) => (
              <div key={i} style={itemStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#EDF2F7' }}>{new Date(log.runAt).toLocaleString('zh-CN')}</span>
                  {i === 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.15)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.3)' }}>最新</span>}
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#9CA3AF' }}>
                  <span>TG: <b style={{ color: '#2A9D8F' }}>{log.tgTotal}</b></span>
                  <span>SN入库: <b style={{ color: '#06D6A0' }}>{log.snOnlyAdded}</b></span>
                  <span>冲突仲裁: <b style={{ color: '#E9C46A' }}>{log.conflictsFound}</b></span>
                  <span>SN补充站: <b style={{ color: '#3B82F6' }}>{log.snStationsAdded}</b></span>
                  <span>DLQ: <b style={{ color: log.dlqTotal > 0 ? '#EF4444' : '#6B7280' }}>{log.dlqTotal}</b></span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PENDING_REVIEW 海缆审核 ── */}
        {tab === 'pending' && (
          <div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.6 }}>
              这些海缆来自 SN，与 TG 某条海缆名称相似度在 60-85 分之间。<br/>
              请确认它们是否是同一条缆（合并）、真正独立的新缆（保留）、还是重复记录（丢弃）。
            </div>
            {pendingLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            : pendingCables.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div>没有待审核的海缆</div>
              </div>
            ) : pendingCables.map(cable => (
              <div key={cable.id} style={{ ...itemStyle, border: '1px solid rgba(233,196,106,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#EDF2F7' }}>{cable.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(233,196,106,0.1)', color: '#E9C46A', border: '1px solid rgba(233,196,106,0.3)' }}>PENDING_REVIEW</span>
                    <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                      {cable.lengthKm ? `${cable.lengthKm.toLocaleString()} km` : '长度未知'}
                      {' · '}
                      {cable._count.landingStations} 个登陆站
                      {cable.rfsDate ? ` · ${new Date(cable.rfsDate).getFullYear()}年投产` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#4B5563', marginTop: 4 }}>
                      登陆站: {cable.landingStations.slice(0, 3).map(ls => ls.landingStation.name).join('、')}
                      {cable.landingStations.length > 3 && ` 等${cable.landingStations.length}个`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handlePendingAction(cable.id, 'keep')} disabled={actionLoading === cable.id}
                      style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(6,214,160,0.1)', border: '1px solid rgba(6,214,160,0.3)', color: '#06D6A0', cursor: 'pointer' }}>
                      ✓ 保留独立
                    </button>
                    <button onClick={() => handlePendingAction(cable.id, 'discard')} disabled={actionLoading === cable.id}
                      style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer' }}>
                      ✗ 丢弃重复
                    </button>
                  </div>
                </div>

                {/* 相似的 TG 海缆 */}
                {cable.similarCables.length > 0 && (
                  <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>疑似同源的 TG 海缆</div>
                    {cable.similarCables.map(sim => (
                      <div key={sim.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div>
                          <span style={{ fontSize: 13, color: '#EDF2F7' }}>{sim.name}</span>
                          <span style={{ marginLeft: 8, fontSize: 10, color: '#6B7280' }}>
                            {sim.lengthKm ? `${sim.lengthKm.toLocaleString()}km` : ''} · {sim._count.landingStations}站
                          </span>
                        </div>
                        <button onClick={() => handlePendingAction(cable.id, 'merge', sim.id)} disabled={actionLoading === cable.id}
                          style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3B82F6', cursor: 'pointer' }}>
                          合并到此缆
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {pendingTotal > 20 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
                {pendingPage > 1 && <button onClick={() => setPendingPage(p => p - 1)} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>上一页</button>}
                <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>{pendingPage} / {Math.ceil(pendingTotal / 20)}</span>
                {pendingPage < Math.ceil(pendingTotal / 20) && <button onClick={() => setPendingPage(p => p + 1)} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>下一页</button>}
              </div>
            )}
          </div>
        )}

        {/* ── AI 坐标审核 ── */}
        {tab === 'ai_audit' && (
          <div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14, lineHeight: 1.6 }}>
              MiniMax AI 已推理出这些站点的坐标，置信度 ≥ 60%。<br/>
              确认后坐标将写入数据库，拒绝后标记为人工待处理。
            </div>
            {aiAuditLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            : aiAuditItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div>没有待审核的 AI 推理结果</div>
              </div>
            ) : aiAuditItems.map(item => (
              <div key={item.id} style={{ ...itemStyle, border: '1px solid rgba(139,92,246,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7', marginBottom: 6 }}>{item.rawString}</div>
                    {item.aiSuggestedPayload && (
                      <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.8 }}>
                        <div>AI推理城市: <span style={{ color: '#8B5CF6', fontWeight: 600 }}>{item.aiSuggestedPayload.standardizedCity}</span> ({item.aiSuggestedPayload.countryCode})</div>
                        <div>坐标: {item.aiSuggestedPayload.lat.toFixed(4)}, {item.aiSuggestedPayload.lng.toFixed(4)}</div>
                        <div>置信度: <span style={{ color: item.aiSuggestedPayload.confidence >= 80 ? '#06D6A0' : '#E9C46A' }}>{item.aiSuggestedPayload.confidence}%</span></div>
                        <div style={{ color: '#4B5563', fontSize: 11 }}>{item.aiSuggestedPayload.reasoning}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handleApproveAI(item)} disabled={saving}
                      style={{ padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', color: '#8B5CF6', cursor: 'pointer' }}>
                      ✓ 批准
                    </button>
                    <button onClick={async () => {
                      await fetch('/api/admin/dlq', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [item.id] }) });
                      loadAiAudit();
                    }} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6B7280', cursor: 'pointer' }}>
                      忽略
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DLQ 待处理坐标 ── */}
        {tab === 'dlq' && (
          <div>
            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button onClick={handleIgnoreSelected} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', cursor: 'pointer' }}>
                  忽略所选 ({selected.size})
                </button>
              </div>
            )}
            {dlqLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            : dlqItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div>没有待确认的坐标</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>共 {dlqTotal} 条 · 第 {dlqPage} 页 · 确认后坐标自动入库并写入字典缓存</div>
                {dlqItems.map(item => (
                  <div key={item.id} style={{ ...itemStyle, ...(editingId === item.id ? { border: '1px solid rgba(42,157,143,0.3)' } : {}) }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => { const s = new Set(selected); s.has(item.id) ? s.delete(item.id) : s.add(item.id); setSelected(s); }} style={{ marginTop: 3, cursor: 'pointer' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7' }}>{item.rawString}</span>
                          {item.cableId && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>{item.cableId}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>来源: {item.originSource || '—'} · 重试: {item.retryCount}次 · {item.errorReason}</div>

                        {editingId === item.id && (
                          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            {[
                              { label: '城市名', value: editCity, set: setEditCity, placeholder: 'Marseille', width: 140 },
                              { label: '国家代码', value: editCC, set: setEditCC, placeholder: 'FR', width: 90 },
                              { label: '纬度', value: editLat, set: setEditLat, placeholder: '43.2965', width: 110 },
                              { label: '经度', value: editLng, set: setEditLng, placeholder: '5.3698', width: 110 },
                            ].map(f => (
                              <div key={f.label}>
                                <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 3 }}>{f.label}</div>
                                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                                  style={{ width: f.width, height: 34, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(42,157,143,0.3)', padding: '0 10px', color: '#EDF2F7', fontSize: 12, outline: 'none' }} />
                              </div>
                            ))}
                            <button onClick={() => handleResolve(item.id)} disabled={saving}
                              style={{ height: 34, padding: '0 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, backgroundColor: '#2A9D8F', border: 'none', color: '#fff', cursor: 'pointer' }}>
                              {saving ? '保存...' : '确认'}
                            </button>
                            <button onClick={() => setEditingId(null)} style={{ height: 34, padding: '0 12px', borderRadius: 6, fontSize: 12, backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6B7280', cursor: 'pointer' }}>取消</button>
                          </div>
                        )}
                      </div>
                      {editingId !== item.id && (
                        <button onClick={() => { setEditingId(item.id); setEditCity(item.rawString.split(',')[0].trim()); setEditCC(''); setEditLat(''); setEditLng(''); }}
                          style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.25)', color: '#2A9D8F', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          输入坐标
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {dlqTotal > 50 && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
                    {dlqPage > 1 && <button onClick={() => setDlqPage(p => p - 1)} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>上一页</button>}
                    <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>{dlqPage} / {Math.ceil(dlqTotal / 50)}</span>
                    {dlqPage < Math.ceil(dlqTotal / 50) && <button onClick={() => setDlqPage(p => p + 1)} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>下一页</button>}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

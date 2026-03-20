'use client';
// src/app/admin/page.tsx

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── 类型 ─────────────────────────────────────────────────────────
interface SyncLog {
  runAt: string;
  tgTotal: number; snTotal: number;
  snOnlyAdded: number; snOnlySkipped: number;
  conflictsFound: number; snStationsAdded: number;
  dlqCount: number;
}

interface DLQItem {
  id: string;
  rawString: string;
  originSource: string | null;
  cableId: string | null;
  errorReason: string | null;
  status: string;
  retryCount: number;
  createdAt: string;
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'logs' | 'dlq' | 'ignored'>('logs');

  // 同步日志
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  // DLQ
  const [dlqItems, setDlqItems] = useState<DLQItem[]>([]);
  const [dlqTotal, setDlqTotal] = useState(0);
  const [dlqPage, setDlqPage] = useState(1);
  const [dlqLoading, setDlqLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 编辑坐标
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editCC, setEditCC] = useState('');
  const [editCity, setEditCity] = useState('');
  const [saving, setSaving] = useState(false);

  // 加载同步日志
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/admin/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // 加载 DLQ
  const loadDLQ = useCallback(async (status = 'PENDING', page = 1) => {
    setDlqLoading(true);
    try {
      const res = await fetch(`/api/admin/dlq?status=${status}&page=${page}`);
      const data = await res.json();
      setDlqItems(data.items || []);
      setDlqTotal(data.total || 0);
    } finally {
      setDlqLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => {
    if (tab === 'dlq') loadDLQ('PENDING', dlqPage);
    if (tab === 'ignored') loadDLQ('IGNORED', 1);
  }, [tab, dlqPage, loadDLQ]);

  // 退出登录
  const logout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
  };

  // 确认坐标
  const handleResolve = async (id: string) => {
    if (!editLat || !editLng || !editCC) return;
    setSaving(true);
    try {
      await fetch('/api/admin/dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          lat: parseFloat(editLat),
          lng: parseFloat(editLng),
          countryCode: editCC.toUpperCase(),
          standardizedCity: editCity,
        }),
      });
      setEditingId(null);
      loadDLQ('PENDING', dlqPage);
    } finally {
      setSaving(false);
    }
  };

  // 批量忽略
  const handleIgnoreSelected = async () => {
    if (!selected.size) return;
    await fetch('/api/admin/dlq', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    });
    setSelected(new Set());
    loadDLQ('PENDING', dlqPage);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (item: DLQItem) => {
    setEditingId(item.id);
    setEditLat('');
    setEditLng('');
    setEditCC('');
    setEditCity(item.rawString.split(',')[0].trim());
  };

  // ── UI ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1B2A', color: '#EDF2F7' }}>

      {/* 导航栏 */}
      <nav style={{
        height: 56, backgroundColor: 'rgba(13,27,42,0.98)',
        borderBottom: '1px solid rgba(42,157,143,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🌊</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#EDF2F7' }}>DEEP BLUE</span>
          </a>
          <span style={{ fontSize: 11, color: '#2A9D8F', padding: '3px 8px', borderRadius: 5, backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.2)' }}>
            管理后台
          </span>
        </div>
        <button onClick={logout} style={{ fontSize: 12, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>
          退出登录
        </button>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px' }}>

        {/* 统计卡片（取最新一次同步）*/}
        {logs[0] && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'TeleGeography', value: logs[0].tgTotal, color: '#2A9D8F' },
              { label: 'SN补充入库', value: logs[0].snOnlyAdded, color: '#06D6A0' },
              { label: '字段冲突仲裁', value: logs[0].conflictsFound, color: '#E9C46A' },
              { label: 'SN补充登陆站', value: logs[0].snStationsAdded, color: '#3B82F6' },
              { label: '待确认坐标', value: logs[0].dlqCount, color: '#EF4444' },
            ].map(card => (
              <div key={card.label} style={{
                flex: 1, minWidth: 140, padding: '16px 20px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: `1px solid ${card.color}30`, borderRadius: 10,
              }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 切换 */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
          {[
            { key: 'logs', label: '同步日志' },
            { key: 'dlq', label: `待确认坐标 ${dlqTotal > 0 && tab !== 'dlq' ? `(${dlqTotal})` : ''}` },
            { key: 'ignored', label: '已忽略' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 500,
              color: tab === t.key ? '#2A9D8F' : '#6B7280',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid #2A9D8F' : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 同步日志 ── */}
        {tab === 'logs' && (
          <div>
            {logsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>暂无日志（Redis 未配置或无数据）</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {logs.map((log, i) => (
                  <div key={i} style={{
                    padding: '16px 20px', borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#EDF2F7' }}>
                        {new Date(log.runAt).toLocaleString('zh-CN')}
                      </span>
                      {i === 0 && (
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, backgroundColor: 'rgba(42,157,143,0.15)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.3)' }}>
                          最新
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#9CA3AF' }}>
                      <span>TG: <b style={{ color: '#2A9D8F' }}>{log.tgTotal}</b></span>
                      <span>SN入库: <b style={{ color: '#06D6A0' }}>{log.snOnlyAdded}</b></span>
                      <span>SN跳过: <b style={{ color: '#6B7280' }}>{log.snOnlySkipped}</b></span>
                      <span>冲突仲裁: <b style={{ color: '#E9C46A' }}>{log.conflictsFound}</b></span>
                      <span>SN补充站: <b style={{ color: '#3B82F6' }}>{log.snStationsAdded}</b></span>
                      <span>待确认坐标: <b style={{ color: log.dlqCount > 0 ? '#EF4444' : '#6B7280' }}>{log.dlqCount}</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DLQ 待确认 / 已忽略 ── */}
        {(tab === 'dlq' || tab === 'ignored') && (
          <div>
            {tab === 'dlq' && selected.size > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <button onClick={handleIgnoreSelected} style={{
                  padding: '8px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                  backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#EF4444', cursor: 'pointer',
                }}>
                  忽略所选 ({selected.size})
                </button>
                <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>
                  忽略后该站名不再出现在待确认列表
                </span>
              </div>
            )}

            {dlqLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#6B7280' }}>加载中...</div>
            ) : dlqItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div>{tab === 'dlq' ? '没有待确认的坐标' : '没有已忽略的记录'}</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }}>
                  共 {dlqTotal} 条 · 第 {dlqPage} 页
                  {tab === 'dlq' && <span style={{ marginLeft: 8 }}>确认后坐标将自动入库，下次同步直接命中缓存</span>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dlqItems.map(item => (
                    <div key={item.id} style={{
                      padding: '14px 16px', borderRadius: 10,
                      backgroundColor: editingId === item.id ? 'rgba(42,157,143,0.05)' : 'rgba(255,255,255,0.02)',
                      border: editingId === item.id ? '1px solid rgba(42,157,143,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        {tab === 'dlq' && (
                          <input type="checkbox" checked={selected.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            style={{ marginTop: 3, cursor: 'pointer' }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#EDF2F7' }}>{item.rawString}</span>
                            {item.cableId && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>
                                {item.cableId}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: '#6B7280' }}>
                            来源: {item.originSource || '—'} · 重试: {item.retryCount} 次 · {item.errorReason}
                          </div>

                          {/* 编辑表单 */}
                          {editingId === item.id && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                              {[
                                { label: '城市名', value: editCity, set: setEditCity, placeholder: 'Marseille', width: 140 },
                                { label: '国家代码 (ISO)', value: editCC, set: setEditCC, placeholder: 'FR', width: 90 },
                                { label: '纬度', value: editLat, set: setEditLat, placeholder: '43.2965', width: 110 },
                                { label: '经度', value: editLng, set: setEditLng, placeholder: '5.3698', width: 110 },
                              ].map(f => (
                                <div key={f.label}>
                                  <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 3 }}>{f.label}</div>
                                  <input value={f.value} onChange={e => f.set(e.target.value)}
                                    placeholder={f.placeholder}
                                    style={{
                                      width: f.width, height: 34, borderRadius: 6,
                                      backgroundColor: 'rgba(255,255,255,0.06)',
                                      border: '1px solid rgba(42,157,143,0.3)',
                                      padding: '0 10px', color: '#EDF2F7', fontSize: 12, outline: 'none',
                                    }}
                                  />
                                </div>
                              ))}
                              <button onClick={() => handleResolve(item.id)} disabled={saving}
                                style={{
                                  height: 34, padding: '0 16px', borderRadius: 6, fontSize: 12,
                                  fontWeight: 600, backgroundColor: '#2A9D8F', border: 'none',
                                  color: '#fff', cursor: 'pointer',
                                }}>
                                {saving ? '保存...' : '确认'}
                              </button>
                              <button onClick={() => setEditingId(null)}
                                style={{
                                  height: 34, padding: '0 12px', borderRadius: 6, fontSize: 12,
                                  backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#6B7280', cursor: 'pointer',
                                }}>
                                取消
                              </button>
                            </div>
                          )}
                        </div>

                        {tab === 'dlq' && editingId !== item.id && (
                          <button onClick={() => startEdit(item)} style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            backgroundColor: 'rgba(42,157,143,0.1)', border: '1px solid rgba(42,157,143,0.25)',
                            color: '#2A9D8F', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                            输入坐标
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 分页 */}
                {dlqTotal > 50 && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20 }}>
                    {dlqPage > 1 && (
                      <button onClick={() => setDlqPage(p => p - 1)}
                        style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>
                        上一页
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>
                      {dlqPage} / {Math.ceil(dlqTotal / 50)}
                    </span>
                    {dlqPage < Math.ceil(dlqTotal / 50) && (
                      <button onClick={() => setDlqPage(p => p + 1)}
                        style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#9CA3AF', cursor: 'pointer' }}>
                        下一页
                      </button>
                    )}
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

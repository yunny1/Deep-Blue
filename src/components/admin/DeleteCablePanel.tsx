'use client';
// src/components/admin/DeleteCablePanel.tsx
// 管理后台：搜索并删除海缆

import { useState, useCallback, useRef } from 'react';

const GOLD   = '#D4AF37';
const RED    = '#F87171';
const CARD   = 'rgba(26,45,74,.5)';
const BORDER = 'rgba(255,255,255,.08)';

interface CableResult {
  id: string;
  name: string;
  slug: string;
  status: string;
  lengthKm: number | null;
  rfsDate: string | null;
  _count: { landingStations: number };
}

const STATUS_LABEL: Record<string, string> = {
  IN_SERVICE: '在役', UNDER_CONSTRUCTION: '建设中',
  PLANNED: '计划中', RETIRED: '退役', DECOMMISSIONED: '退役',
};

export default function DeleteCablePanel() {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<CableResult[]>([]);
  const [searching,setSearching]= useState(false);
  const [selected, setSelected] = useState<CableResult | null>(null);
  const [confirm,  setConfirm]  = useState('');   // 用户输入 slug 确认
  const [deleting, setDeleting] = useState(false);
  const [msg,      setMsg]      = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 防抖搜索
  const handleInput = useCallback((val: string) => {
    setQuery(val);
    setSelected(null);
    setConfirm('');
    setMsg('');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/admin/delete-cable?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setResults(data.cables ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }, []);

  const handleDelete = async () => {
    if (!selected || confirm !== selected.slug) return;
    setDeleting(true); setMsg('');
    try {
      const res  = await fetch('/api/admin/delete-cable', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug: selected.slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✓ 已删除「${data.deleted}」。请前往 Cloudflare Purge Everything 清理 CDN 缓存。`);
      setSelected(null); setConfirm(''); setQuery(''); setResults([]);
    } catch (e: unknown) {
      setMsg(`✗ 删除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ marginTop: 24, background: CARD,
      border: '1px solid rgba(248,113,113,.2)', borderRadius: 14,
      backdropFilter: 'blur(12px)', padding: '20px 24px',
      fontFamily: "'DM Sans',system-ui,sans-serif" }}>

      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
        textTransform: 'uppercase', color: `${RED}BB`, marginBottom: 6 }}>
        🗑 删除海缆
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14, lineHeight: 1.6 }}>
        搜索海缆名称或 slug，选中后输入 slug 二次确认，再点删除。删除不可恢复，请谨慎操作。
      </p>

      {/* 搜索框 */}
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        placeholder="输入海缆名称或 slug 搜索…"
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`,
          borderRadius: 8, color: '#E2E8F0', fontSize: 13,
          padding: '9px 12px', outline: 'none',
          fontFamily: "'DM Sans',system-ui,sans-serif",
        }}
      />

      {/* 搜索结果 */}
      {searching && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.35)' }}>搜索中…</div>
      )}

      {!searching && results.length > 0 && !selected && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6,
          maxHeight: 280, overflowY: 'auto' }}>
          {results.map(c => (
            <div key={c.id} onClick={() => { setSelected(c); setConfirm(''); setMsg(''); }}
              style={{
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,.02)',
                transition: 'all .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.02)')}>
              <div style={{ display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(248,113,113,.12)', color: RED }}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', display: 'flex', gap: 12 }}>
                <span>slug: {c.slug}</span>
                {c.lengthKm && <span>{c.lengthKm.toLocaleString()} km</span>}
                <span>{c._count.landingStations} 个登陆站</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!searching && results.length === 0 && query.trim() && !selected && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.25)' }}>
          未找到相关海缆
        </div>
      )}

      {/* 确认删除区 */}
      {selected && (
        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
          background: 'rgba(248,113,113,.07)', border: '1px solid rgba(248,113,113,.25)' }}>
          <div style={{ fontSize: 13, color: RED, fontWeight: 600, marginBottom: 6 }}>
            ⚠ 即将删除：{selected.name}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 12, lineHeight: 1.6 }}>
            slug: <strong style={{ color: 'rgba(255,255,255,.6)' }}>{selected.slug}</strong>
            　·　{selected._count.landingStations} 个登陆站关联将一并删除　·　此操作不可恢复
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginBottom: 6 }}>
            请输入 slug「<strong style={{ color: RED }}>{selected.slug}</strong>」确认：
          </div>
          <input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={`输入 ${selected.slug} 确认`}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,.05)',
              border: `1px solid ${confirm === selected.slug ? 'rgba(248,113,113,.5)' : BORDER}`,
              borderRadius: 7, color: '#E2E8F0', fontSize: 13,
              padding: '8px 12px', outline: 'none', marginBottom: 10,
              fontFamily: 'monospace',
            }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setSelected(null); setConfirm(''); }}
              style={{ padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`,
                color: 'rgba(255,255,255,.5)', fontSize: 13 }}>
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={confirm !== selected.slug || deleting}
              style={{
                padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600,
                cursor: confirm === selected.slug && !deleting ? 'pointer' : 'not-allowed',
                background: confirm === selected.slug ? RED : 'rgba(248,113,113,.2)',
                border: 'none', color: confirm === selected.slug ? '#0A1628' : RED,
                opacity: deleting ? 0.6 : 1, transition: 'all .2s',
              }}>
              {deleting ? '删除中…' : '确认删除'}
            </button>
          </div>
        </div>
      )}

      {/* 结果消息 */}
      {msg && (
        <div style={{ marginTop: 12, padding: '9px 14px', borderRadius: 8, fontSize: 12,
          lineHeight: 1.6,
          background: msg.startsWith('✓') ? 'rgba(16,112,86,.2)' : 'rgba(120,20,20,.2)',
          border: `1px solid ${msg.startsWith('✓') ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)'}`,
          color: msg.startsWith('✓') ? '#4ade80' : RED }}>
          {msg}
        </div>
      )}
    </div>
  );
}

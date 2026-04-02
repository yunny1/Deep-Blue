'use client';
// src/app/admin/cable-intake/page.tsx
//
// 海缆智能录入页面：
// 1. 上传图片/文字 → Qwen AI 自动提取字段
// 2. 可手动修改所有字段
// 3. 模糊搜索现有库中相似海缆，决定合并或新建
// 4. 保存时打上 MANUALLY_ADDED 标记，不被 nightly-sync 覆盖
// 5. 新增数据自动影响全站统计（无需额外处理，Prisma 查询会自动包含）
// 6. xlsx 路径数据上传（从主页面移入管理后台）

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ── 海缆字段完整定义（与 Prisma schema 对齐）──────────────────────────────────
const CABLE_FIELDS: { key: string; label: string; type: 'text' | 'number' | 'select' | 'textarea'; options?: string[] }[] = [
  { key: 'name',          label: '海缆名称',          type: 'text' },
  { key: 'slug',          label: 'Slug（唯一标识）',   type: 'text' },
  { key: 'status',        label: '状态',              type: 'select',
    options: ['IN_SERVICE','UNDER_CONSTRUCTION','PLANNED','RETIRED','DECOMMISSIONED'] },
  { key: 'lengthKm',      label: '长度 (km)',          type: 'number' },
  { key: 'capacityTbps',  label: '设计容量 (Tbps)',    type: 'number' },
  { key: 'fiberPairs',    label: '光纤对数',           type: 'number' },
  { key: 'rfsDate',       label: '投产年份',           type: 'text' },
  { key: 'vendor',        label: '建造商',             type: 'text' },
  { key: 'owners',        label: '运营商（逗号分隔）', type: 'textarea' },
  { key: 'url',           label: '官方链接',           type: 'text' },
  { key: 'notes',         label: '备注',               type: 'textarea' },
];

type FieldValues = Record<string, string>;
type SimilarCable = { slug: string; name: string; status: string; lengthKm: number | null; vendor: string | null };

// ── 样式常量 ─────────────────────────────────────────────────────────────────
const BG   = '#0A1628';
const CARD = 'rgba(26,45,74,.5)';
const GOLD = '#D4AF37';
const BORDER = 'rgba(255,255,255,.1)';
const inputStyle: React.CSSProperties = {
  width:'100%', background:'rgba(255,255,255,.05)', border:`1px solid ${BORDER}`,
  borderRadius:6, color:'#E2E8F0', fontSize:13, padding:'8px 10px', outline:'none',
  fontFamily:"'DM Sans',system-ui,sans-serif", boxSizing:'border-box',
};

export default function CableIntakePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  const [fields,        setFields]        = useState<FieldValues>({});
  const [extracting,    setExtracting]    = useState(false);
  const [extractLog,    setExtractLog]    = useState('');
  const [searching,     setSearching]     = useState(false);
  const [similar,       setSimilar]       = useState<SimilarCable[]>([]);
  const [mergeTarget,   setMergeTarget]   = useState<string | null>(null); // slug 或 null
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState('');
  const [xlsxMsg,       setXlsxMsg]       = useState('');

  const setField = (key: string, val: string) =>
    setFields(prev => ({ ...prev, [key]: val }));

  // ── AI 提取：上传文件 → Qwen → 自动填充字段 ─────────────────────────────
  const handleFileExtract = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractLog('正在调用 AI 提取字段…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/cable-extract', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // 将 AI 返回的字段合并进当前表单
      const extracted: FieldValues = {};
      CABLE_FIELDS.forEach(f => {
        if (data[f.key] !== undefined && data[f.key] !== null) {
          extracted[f.key] = String(data[f.key]);
        }
      });
      setFields(prev => ({ ...prev, ...extracted }));
      setExtractLog(`✓ 提取成功，已自动填充 ${Object.keys(extracted).length} 个字段，请检查并手动修正。`);

      // 自动触发模糊搜索
      if (extracted.name) await doSearch(extracted.name);
    } catch (e: unknown) {
      setExtractLog(`✗ 提取失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExtracting(false);
    }
  }, []);

  // ── 模糊搜索现有海缆 ────────────────────────────────────────────────────
  const doSearch = async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/cable-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSimilar(data.cables ?? []);
    } catch {
      setSimilar([]);
    } finally {
      setSearching(false);
    }
  };

  // ── 保存（新建 or 合并）─────────────────────────────────────────────────
  const handleSave = async () => {
    if (!fields.name?.trim()) { setSaveMsg('✗ 海缆名称为必填项'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const payload = { ...fields, mergeIntoSlug: mergeTarget };
      const res = await fetch('/api/admin/cable-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSaveMsg(`✓ 已保存（slug: ${data.slug}）。该条目已打上 MANUALLY_ADDED 标记，不会被 nightly-sync 覆盖。`);
      // 重置表单
      setTimeout(() => { setFields({}); setSimilar([]); setMergeTarget(null); setSaveMsg(''); }, 4000);
    } catch (e: unknown) {
      setSaveMsg(`✗ 保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── xlsx 路径数据上传（从主页面移入管理后台）─────────────────────────────
  const handleXlsxUpload = async (file: File) => {
    setXlsxMsg('正在解析 xlsx…');
    const XLSX = await import('xlsx');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf);
    const ws   = wb.Sheets['路径汇总'];
    if (!ws) { setXlsxMsg('✗ 找不到"路径汇总"工作表'); return; }
    const data = XLSX.utils.sheet_to_json(ws);
    try {
      const res = await fetch('/api/admin/sovereign-routes-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: data }),
      });
      if (!res.ok) throw new Error(await res.text());
      setXlsxMsg(`✓ 已上传 ${data.length} 条路径数据`);
    } catch (e: unknown) {
      // 如果后端 API 未实现，提示用户
      setXlsxMsg(`注意：数据已解析（${data.length} 条），但上传 API 尚未实现。如需持久化，请联系开发者添加 /api/admin/sovereign-routes-upload 端点。`);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:BG, color:'#E8E0D0',
      fontFamily:"'DM Sans',system-ui,sans-serif", padding:'32px' }}>

      {/* 顶部导航 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32 }}>
        <div>
          <button onClick={() => router.push('/admin')}
            style={{ background:'none', border:'none', color:'#9CA3AF', cursor:'pointer',
              fontSize:13, marginBottom:8, padding:0 }}>← 返回管理后台</button>
          <h1 style={{ fontSize:26, fontWeight:700, color:'#F0E6C8', margin:0,
            fontFamily:"'Playfair Display',serif" }}>海缆智能录入</h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,.35)', margin:'4px 0 0' }}>
            上传资料 → AI 提取字段 → 模糊匹配 → 合并或新建 · MANUALLY_ADDED 标记保护，不被同步覆盖
          </p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, maxWidth:1400 }}>

        {/* ── 左列：AI 提取 + 表单 ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* 上传区 */}
          <div style={{ background:CARD, border:`1px solid ${GOLD}20`, borderRadius:14,
            backdropFilter:'blur(12px)', padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
              color:`${GOLD}80`, marginBottom:12 }}>第一步：上传海缆资料</div>
            <p style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginBottom:14, lineHeight:1.6 }}>
              支持图片（截图、照片）或文本文件。AI 将自动提取海缆名称、建造商、容量、投产年份等字段。
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileExtract(f); }}
              style={{ border:`2px dashed ${GOLD}30`, borderRadius:10, padding:'28px 20px',
                textAlign:'center', cursor:'pointer', transition:'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor=`${GOLD}60`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor=`${GOLD}30`)}>
              <div style={{ fontSize:24, marginBottom:8 }}>📎</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,.6)' }}>点击或拖拽上传图片 / TXT / PDF</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:4 }}>
                支持：JPG / PNG / WEBP / TXT / PDF
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.txt,.pdf" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileExtract(f); e.target.value=''; }} />

            {extractLog && (
              <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, fontSize:12,
                background: extractLog.startsWith('✓') ? 'rgba(16,112,86,.2)' : extractLog.startsWith('✗') ? 'rgba(120,20,20,.2)' : 'rgba(40,60,90,.3)',
                border: `1px solid ${extractLog.startsWith('✓') ? 'rgba(74,222,128,.2)' : extractLog.startsWith('✗') ? 'rgba(248,113,113,.2)' : 'rgba(255,255,255,.1)'}`,
                color: extractLog.startsWith('✓') ? '#4ade80' : extractLog.startsWith('✗') ? '#f87171' : 'rgba(255,255,255,.6)' }}>
                {extracting ? '⏳ ' : ''}{extractLog}
              </div>
            )}
          </div>

          {/* 字段表单 */}
          <div style={{ background:CARD, border:`1px solid rgba(255,255,255,.06)`, borderRadius:14,
            backdropFilter:'blur(12px)', padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
              color:`${GOLD}80`, marginBottom:16 }}>第二步：确认 / 手动修改字段</div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {CABLE_FIELDS.map(f => (
                <div key={f.key} style={{ gridColumn: f.type==='textarea' ? '1/-1' : 'auto' }}>
                  <label style={{ display:'block', fontSize:11, color:'rgba(255,255,255,.4)',
                    marginBottom:4, fontWeight:500 }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={fields[f.key]??''} onChange={e => setField(f.key, e.target.value)}
                      style={{ ...inputStyle }}>
                      <option value="">— 请选择 —</option>
                      {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={fields[f.key]??''} onChange={e => setField(f.key, e.target.value)}
                      rows={3} style={{ ...inputStyle, resize:'vertical', lineHeight:1.5 }} />
                  ) : (
                    <input type={f.type} value={fields[f.key]??''} onChange={e => setField(f.key, e.target.value)}
                      style={inputStyle} placeholder={`输入${f.label}`} />
                  )}
                </div>
              ))}
            </div>

            {/* 手动触发模糊搜索 */}
            <button
              onClick={() => doSearch(fields.name ?? '')}
              disabled={searching || !fields.name}
              style={{ marginTop:16, padding:'8px 18px', background:`${GOLD}15`,
                border:`1px solid ${GOLD}35`, borderRadius:7, color:GOLD, cursor:'pointer',
                fontSize:13, fontWeight:500, transition:'all .2s' }}>
              {searching ? '搜索中…' : '🔍 搜索相似海缆'}
            </button>
          </div>
        </div>

        {/* ── 右列：相似匹配 + 保存 + xlsx ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* 相似海缆匹配 */}
          <div style={{ background:CARD, border:`1px solid rgba(255,255,255,.06)`, borderRadius:14,
            backdropFilter:'blur(12px)', padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
              color:`${GOLD}80`, marginBottom:12 }}>第三步：相似海缆匹配</div>

            {similar.length === 0 ? (
              <div style={{ padding:'24px 0', textAlign:'center', color:'rgba(255,255,255,.25)', fontSize:13 }}>
                {searching ? '搜索中…' : '输入名称后点击"搜索相似海缆"'}
              </div>
            ) : (
              <>
                <p style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginBottom:12, lineHeight:1.6 }}>
                  找到 {similar.length} 条相似记录，请选择合并目标（或不合并，单独新建）：
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:320, overflowY:'auto' }}>
                  {/* 不合并选项 */}
                  <div onClick={() => setMergeTarget(null)}
                    style={{ padding:'10px 14px', borderRadius:8, cursor:'pointer', transition:'all .15s',
                      border: mergeTarget===null ? `1px solid ${GOLD}50` : '1px solid rgba(255,255,255,.08)',
                      background: mergeTarget===null ? `${GOLD}0d` : 'transparent' }}>
                    <div style={{ fontSize:13, color:'rgba(255,255,255,.8)', fontWeight:500, marginBottom:2 }}>
                      ➕ 单独新建（不合并）
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,.35)' }}>
                      作为全新海缆录入数据库
                    </div>
                  </div>

                  {similar.map(c => (
                    <div key={c.slug} onClick={() => setMergeTarget(c.slug)}
                      style={{ padding:'10px 14px', borderRadius:8, cursor:'pointer', transition:'all .15s',
                        border: mergeTarget===c.slug ? `1px solid ${GOLD}50` : '1px solid rgba(255,255,255,.08)',
                        background: mergeTarget===c.slug ? `${GOLD}0d` : 'transparent' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:13, color:'rgba(255,255,255,.85)', fontWeight:500 }}>{c.name}</span>
                        <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4,
                          background:'rgba(42,157,143,.15)', color:'#2A9D8F', border:'1px solid rgba(42,157,143,.2)' }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,.35)', display:'flex', gap:12 }}>
                        <span>slug: {c.slug}</span>
                        {c.lengthKm && <span>{c.lengthKm.toLocaleString()} km</span>}
                        {c.vendor && <span>{c.vendor}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 保存操作 */}
          <div style={{ background:CARD, border:`1px solid rgba(255,255,255,.06)`, borderRadius:14,
            backdropFilter:'blur(12px)', padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
              color:`${GOLD}80`, marginBottom:16 }}>第四步：保存到数据库</div>

            <div style={{ padding:'10px 14px', background:'rgba(212,175,55,.07)',
              border:`1px solid ${GOLD}20`, borderRadius:8, fontSize:12, color:'rgba(255,255,255,.5)',
              lineHeight:1.6, marginBottom:16 }}>
              <strong style={{ color:`${GOLD}BB` }}>
                {mergeTarget ? `合并模式：` : '新建模式：'}
              </strong>
              {mergeTarget
                ? `将当前表单数据合并到已有记录（${mergeTarget}），保留原有路由坐标，更新其余字段。`
                : '作为全新海缆记录保存，自动打上 reviewStatus=MANUALLY_ADDED 标记，nightly-sync 将跳过覆盖。'}
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{ width:'100%', padding:'10px', borderRadius:8,
                background: saving ? 'rgba(212,175,55,.2)' : `${GOLD}`,
                border:'none', color: saving ? GOLD : '#0A1628', fontSize:14, fontWeight:700,
                cursor: saving ? 'not-allowed' : 'pointer', transition:'all .2s' }}>
              {saving ? '保存中…' : mergeTarget ? '✓ 合并并保存' : '✓ 新建并保存'}
            </button>

            {saveMsg && (
              <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, fontSize:12,
                background: saveMsg.startsWith('✓') ? 'rgba(16,112,86,.2)' : 'rgba(120,20,20,.2)',
                border: `1px solid ${saveMsg.startsWith('✓') ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)'}`,
                color: saveMsg.startsWith('✓') ? '#4ade80' : '#f87171', lineHeight:1.6 }}>
                {saveMsg}
              </div>
            )}
          </div>

          {/* xlsx 路径数据上传（从主页面移入）*/}
          <div style={{ background:CARD, border:`1px solid rgba(255,255,255,.06)`, borderRadius:14,
            backdropFilter:'blur(12px)', padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase',
              color:`${GOLD}80`, marginBottom:8 }}>主权路径数据更新</div>
            <p style={{ fontSize:12, color:'rgba(255,255,255,.35)', marginBottom:14, lineHeight:1.6 }}>
              上传从金砖仪表盘导出的路径汇总 .xlsx 文件，更新自主权网络图谱数据。打分分值调整后重新导出上传即可同步。
            </p>
            <div onClick={() => xlsxRef.current?.click()}
              style={{ border:`1px dashed rgba(255,255,255,.15)`, borderRadius:8,
                padding:'16px', textAlign:'center', cursor:'pointer', transition:'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor='rgba(212,175,55,.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor='rgba(255,255,255,.15)')}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.5)' }}>点击上传 .xlsx（路径汇总工作表）</div>
            </div>
            <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleXlsxUpload(f); e.target.value=''; }} />
            {xlsxMsg && (
              <div style={{ marginTop:10, padding:'7px 12px', borderRadius:7, fontSize:12,
                background:'rgba(40,60,90,.4)', color:'rgba(255,255,255,.7)', lineHeight:1.5 }}>
                {xlsxMsg}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
// src/app/admin/cable-intake/page.tsx  v3
//
// 升级：登陆站录入改用鱼骨拓扑编辑器
//   - 主干按物理顺序排列，支线单独分叉
//   - 拓扑编辑器自动计算 GeoJSON，无需手动粘贴
//   - 字段对比合并面板、AI 提取等原有功能保留

import { useState, useRef, useCallback, useEffect } from 'react';
import NewsInitButton from '@/components/admin/NewsInitButton';
import GenerateRoutesButton from '@/components/admin/GenerateRoutesButton';
import CableTopologyEditor, { type TopologyResult } from '@/components/admin/CableTopologyEditor';
import SmoothRouteButton from '@/components/admin/SmoothRouteButton';
import StationCoordsEditor from '@/components/admin/StationCoordsEditor';
import SmartRouteButton from '@/components/admin/SmartRouteButton';
import { useRouter } from 'next/navigation';
import SovereignRouteCompare from '@/components/admin/SovereignRouteCompare';

// ── 可编辑的基础字段 ─────────────────────────────────────────────────────────
const CABLE_FIELDS: {
  key: string; label: string;
  type: 'text' | 'number' | 'select' | 'textarea'; options?: string[];
}[] = [
  { key: 'name',         label: '海缆名称',          type: 'text' },
  { key: 'slug',         label: 'Slug（唯一标识）',   type: 'text' },
  { key: 'status',       label: '状态',              type: 'select',
    options: ['IN_SERVICE','UNDER_CONSTRUCTION','PLANNED','RETIRED','DECOMMISSIONED'] },
  { key: 'lengthKm',     label: '长度 (km)',          type: 'number' },
  { key: 'capacityTbps', label: '设计容量 (Tbps)',    type: 'number' },
  { key: 'fiberPairs',   label: '光纤对数',           type: 'number' },
  { key: 'rfsDate',      label: '投产年份',           type: 'text' },
  { key: 'vendor',       label: '建造商',             type: 'text' },
  { key: 'owners',       label: '运营商（逗号分隔）', type: 'textarea' },
  { key: 'url',          label: '官方链接',           type: 'text' },
  { key: 'notes',        label: '备注',               type: 'textarea' },
];

// 字段对比面板只对比这些字段（slug 是系统生成的不参与对比）
const COMPARE_FIELDS = CABLE_FIELDS.filter(f => f.key !== 'slug');

// ── 类型定义 ──────────────────────────────────────────────────────────────────
type FieldValues = Record<string, string>;

interface SimilarCable {
  slug: string; name: string; status: string;
  lengthKm: number | null; vendor: string | null;
}

interface DbCableDetail {
  slug: string; name: string; status: string | null;
  lengthKm: string | null; capacityTbps: string | null;
  fiberPairs: string | null; rfsDate: string | null;
  vendor: string | null; owners: string | null;
  notes: string | null; hasRouteGeojson: boolean;
  isApproximateRoute: boolean;
  landingStations: { id: string; name: string; nameZh: string | null; city: string | null; countryCode: string; lat: number | null; lng: number | null }[];
}

// ── 样式常量 ─────────────────────────────────────────────────────────────────
const BG     = '#0A1628';
const CARD   = 'rgba(26,45,74,.5)';
const GOLD   = '#D4AF37';
const BORDER = 'rgba(255,255,255,.1)';
const GREEN  = '#22C55E';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`,
  borderRadius: 6, color: '#E2E8F0', fontSize: 13, padding: '8px 10px', outline: 'none',
  fontFamily: "'DM Sans',system-ui,sans-serif", boxSizing: 'border-box',
};

// ── 字段对比面板子组件 ────────────────────────────────────────────────────────
// 左列：DB 中的现有值；右列：表单中的新值。
// 点击某列即选择该值作为最终保存值，选中态用金色（DB）或绿色（新值）高亮。
function FieldComparePanel({
  dbData,
  newFields,
  choices,
  onChoose,
}: {
  dbData:    DbCableDetail;
  newFields: FieldValues;
  choices:   Record<string, 'db' | 'new'>;
  onChoose:  (key: string, side: 'db' | 'new') => void;
}) {
  return (
    <div>
      {/* 表头 */}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: 8,
        marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>字段</div>
        <div style={{ fontSize: 11, color: `${GOLD}AA`, fontWeight: 600 }}>
          📁 数据库现有（点击选择）
        </div>
        <div style={{ fontSize: 11, color: '#4ade80AA', fontWeight: 600 }}>
          ✏️ 新提取 / 手动填写（点击选择）
        </div>
      </div>

      {/* 逐行字段对比 */}
      {COMPARE_FIELDS.map(f => {
        const dbVal  = (dbData as unknown as Record<string, string | null>)[f.key] ?? null;
        const newVal = newFields[f.key] ?? null;
        const chosen = choices[f.key] ?? (dbVal ? 'db' : 'new');
        const neitherHasValue = !dbVal && !newVal;

        // routeGeojson 特殊显示：太大了不展示原始值
        const isRoute = f.key === 'routeGeojson'; // 这个字段不在 COMPARE_FIELDS 里，仅作参考

        return (
          <div key={f.key} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 1fr',
            gap: 8, marginBottom: 6, alignItems: 'stretch',
          }}>
            {/* 字段名 */}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)',
              paddingTop: 8, fontWeight: 500 }}>{f.label}</div>

            {/* DB 值 */}
            <div onClick={() => !neitherHasValue && dbVal && onChoose(f.key, 'db')}
              style={{
                padding: '7px 10px', borderRadius: 7,
                border: `1px solid ${chosen === 'db' && dbVal ? GOLD + '60' : 'rgba(255,255,255,.06)'}`,
                background: chosen === 'db' && dbVal ? `${GOLD}10` : 'rgba(255,255,255,.02)',
                cursor: dbVal ? 'pointer' : 'default',
                fontSize: 12, color: dbVal ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.2)',
                transition: 'all .12s', wordBreak: 'break-all',
              }}>
              {dbVal ?? '—'}
              {f.key === 'status' && dbData.hasRouteGeojson && f.key !== 'status' ? null : null}
            </div>

            {/* 新值 */}
            <div onClick={() => !neitherHasValue && newVal && onChoose(f.key, 'new')}
              style={{
                padding: '7px 10px', borderRadius: 7,
                border: `1px solid ${chosen === 'new' && newVal ? '#4ade8060' : 'rgba(255,255,255,.06)'}`,
                background: chosen === 'new' && newVal ? 'rgba(74,222,128,.08)' : 'rgba(255,255,255,.02)',
                cursor: newVal ? 'pointer' : 'default',
                fontSize: 12, color: newVal ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.2)',
                transition: 'all .12s', wordBreak: 'break-all',
              }}>
              {newVal ?? '—'}
            </div>
          </div>
        );
      })}

      {/* routeGeojson 特殊行（只展示有/无状态）*/}
      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', paddingTop: 8, fontWeight: 500 }}>
          路由坐标
        </div>
        <div style={{
          padding: '7px 10px', borderRadius: 7, fontSize: 12,
          border: `1px solid rgba(255,255,255,.06)`,
          background: dbData.hasRouteGeojson ? 'rgba(74,222,128,.06)' : 'rgba(255,255,255,.02)',
          color: dbData.hasRouteGeojson ? '#4ade80' : 'rgba(255,255,255,.25)',
        }}>
          {dbData.hasRouteGeojson
            ? `✓ 已有坐标${dbData.isApproximateRoute ? '（近似路由）' : ''}`
            : '— 无坐标'}
        </div>
        <div style={{
          padding: '7px 10px', borderRadius: 7, fontSize: 12,
          border: `1px solid rgba(255,255,255,.06)`,
          background: newFields.routeGeojson ? 'rgba(74,222,128,.06)' : 'rgba(255,255,255,.02)',
          color: newFields.routeGeojson ? '#4ade80' : 'rgba(255,255,255,.25)',
        }}>
          {newFields.routeGeojson ? '✓ 已粘贴新坐标（将覆盖旧坐标）' : '— 未输入'}
        </div>
      </div>

      {/* 登陆站提示 */}
      <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 7,
        background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.2)',
        fontSize: 11, color: 'rgba(147,197,253,.7)', lineHeight: 1.6 }}>
        登陆站关联会追加（不删除库中已有关联）。合并后两侧的登陆站都会保留。
      </div>
    </div>
  );
}

// ── 主页面组件 ────────────────────────────────────────────────────────────────
export default function CableIntakePage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  // 基础字段状态
  const [fields,      setFields]      = useState<FieldValues>({});
  const [extracting,  setExtracting]  = useState(false);
  const [extractLog,  setExtractLog]  = useState('');
  const [searching,   setSearching]   = useState(false);
  const [similar,     setSimilar]     = useState<SimilarCable[]>([]);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState('');
  const [xlsxMsg,     setXlsxMsg]     = useState('');

  // 登陆站拓扑状态（鱼骨编辑器输出）
  const [topologyResult, setTopologyResult] = useState<TopologyResult | null>(null);

  // 字段对比面板状态（只有选了 mergeTarget 才会有数据）
  const [dbCableData,  setDbCableData]  = useState<DbCableDetail | null>(null);
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'db' | 'new'>>({});
  const [loadingDb,    setLoadingDb]    = useState(false);

  const setField = (key: string, val: string) =>
    setFields(prev => ({ ...prev, [key]: val }));

  // ── 当 mergeTarget 变化时，自动拉取 DB 中的完整数据 ──────────────────────
  useEffect(() => {
    if (!mergeTarget) {
      setDbCableData(null);
      setFieldChoices({});
      return;
    }
    setLoadingDb(true);
    fetch(`/api/admin/cable-detail?slug=${encodeURIComponent(mergeTarget)}`)
      .then(r => r.json())
      .then((data: DbCableDetail) => {
        setDbCableData(data);
        const init: Record<string, 'db' | 'new'> = {};
        COMPARE_FIELDS.forEach(f => {
          const dbVal = (data as unknown as Record<string, string | null>)[f.key];
          init[f.key] = dbVal ? 'db' : 'new';
        });
        setFieldChoices(init);
        // 注意：DB 里的登陆站现在通过拓扑编辑器管理，不再自动注入 selectedStations
      })
      .catch(console.error)
      .finally(() => setLoadingDb(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergeTarget]);

  // ── AI 提取：上传文件 → Qwen → 自动填充字段 ─────────────────────────────
  const handleFileExtract = useCallback(async (file: File) => {
    setExtracting(true);
    setExtractLog('正在调用 AI 提取字段…');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res  = await fetch('/api/admin/cable-extract', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const extracted: FieldValues = {};
      CABLE_FIELDS.forEach(f => {
        if (data[f.key] !== undefined && data[f.key] !== null)
          extracted[f.key] = String(data[f.key]);
      });
      setFields(prev => ({ ...prev, ...extracted }));
      setExtractLog(`✓ 提取成功，已自动填充 ${Object.keys(extracted).length} 个字段，请检查并手动修正。`);

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
      const res  = await fetch(`/api/admin/cable-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSimilar(data.cables ?? []);
    } catch { setSimilar([]); }
    finally   { setSearching(false); }
  };

  // ── 构建最终保存的字段值（对比面板选择的优先，否则用表单值）────────────────
  const buildFinalFields = (): FieldValues => {
    if (!mergeTarget || !dbCableData) return fields;

    const result: FieldValues = { ...fields };
    COMPARE_FIELDS.forEach(f => {
      const choice = fieldChoices[f.key] ?? 'new';
      if (choice === 'db') {
        const dbVal = (dbCableData as unknown as Record<string, string | null>)[f.key];
        if (dbVal) result[f.key] = dbVal;
        else delete result[f.key];
      }
      // 'new' 时保留表单中的值，不做额外处理
    });
    return result;
  };

  // ── 保存 ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const finalFields = buildFinalFields();
    if (!finalFields.name?.trim()) { setSaveMsg('✗ 海缆名称为必填项'); return; }

    // 如果拓扑编辑器已经生成了 GeoJSON，优先使用它（比手动粘贴的更可靠）
    const geojsonStr = topologyResult?.geojson
      ? JSON.stringify(topologyResult.geojson)
      : finalFields.routeGeojson;

    setSaving(true); setSaveMsg('');
    try {
      const payload = {
        ...finalFields,
        routeGeojson:      geojsonStr,
        landingStationIds: topologyResult?.allStationIds ?? [],
        mergeIntoSlug:     mergeTarget,
      };
      const res = await fetch('/api/admin/cable-save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSaveMsg(`✓ 已保存（slug: ${data.slug}）。该条目已打上 MANUALLY_ADDED 标记，nightly-sync 不会覆盖。`);
      setTimeout(() => {
        setFields({}); setSimilar([]); setMergeTarget(null);
        setSaveMsg(''); setTopologyResult(null);
        setDbCableData(null); setFieldChoices({});
      }, 4000);
    } catch (e: unknown) {
      setSaveMsg(`✗ 保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── xlsx 主权路径上传 ─────────────────────────────────────────────────────
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ routes: data }),
      });
      if (!res.ok) throw new Error(await res.text());
      setXlsxMsg(`✓ 已上传 ${data.length} 条路径数据`);
    } catch (e: unknown) {
      setXlsxMsg(`✗ 上传失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ── 选择合并目标，同时清理对比状态 ──────────────────────────────────────
  const selectMergeTarget = (slug: string | null) => {
    setMergeTarget(slug);
    if (!slug) { setDbCableData(null); setFieldChoices({}); }
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: BG, color: '#E8E0D0',
      fontFamily: "'DM Sans',system-ui,sans-serif", padding: '32px' }}>

      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <button onClick={() => router.push('/admin')}
            style={{ background: 'none', border: 'none', color: '#9CA3AF',
              cursor: 'pointer', fontSize: 13, marginBottom: 8, padding: 0 }}>
            ← 返回管理后台
          </button>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#F0E6C8', margin: 0,
            fontFamily: "'Playfair Display',serif" }}>海缆智能录入</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,.35)', margin: '4px 0 0' }}>
            上传资料 → AI 提取字段 → 选择登陆站 → 模糊匹配 → 字段对比合并 · MANUALLY_ADDED 标记保护
          </p>
        </div>
      </div>

      {/* 主内容：双列布局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 1400 }}>

        {/* ── 左列：AI 提取 + 表单 + 登陆站 + routeGeojson ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 第一步：上传区 */}
          <div style={{ background: CARD, border: `1px solid ${GOLD}20`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 12 }}>
              第一步：上传海缆资料
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 14, lineHeight: 1.6 }}>
              支持图片（截图、照片）或文本文件。AI 将自动提取海缆名称、建造商、容量、投产年份等字段。
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileExtract(f); }}
              style={{ border: `2px dashed ${GOLD}30`, borderRadius: 10, padding: '28px 20px',
                textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${GOLD}60`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = `${GOLD}30`)}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📎</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>点击或拖拽上传图片 / TXT / PDF</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
                支持：JPG / PNG / WEBP / TXT / PDF
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.txt,.pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileExtract(f); e.target.value = ''; }} />
            {extractLog && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: extractLog.startsWith('✓') ? 'rgba(16,112,86,.2)'
                  : extractLog.startsWith('✗') ? 'rgba(120,20,20,.2)' : 'rgba(40,60,90,.3)',
                border: `1px solid ${extractLog.startsWith('✓') ? 'rgba(74,222,128,.2)'
                  : extractLog.startsWith('✗') ? 'rgba(248,113,113,.2)' : 'rgba(255,255,255,.1)'}`,
                color: extractLog.startsWith('✓') ? '#4ade80'
                  : extractLog.startsWith('✗') ? '#f87171' : 'rgba(255,255,255,.6)' }}>
                {extracting ? '⏳ ' : ''}{extractLog}
              </div>
            )}
          </div>

          {/* 第二步：字段表单 */}
          <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 16 }}>
              第二步：确认 / 手动修改字段
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {CABLE_FIELDS.map(f => (
                <div key={f.key} style={{ gridColumn: f.type === 'textarea' ? '1/-1' : 'auto' }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,.4)',
                    marginBottom: 4, fontWeight: 500 }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={fields[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}
                      style={{ ...inputStyle }}>
                      <option value="">— 请选择 —</option>
                      {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea value={fields[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}
                      rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                  ) : (
                    <input type={f.type} value={fields[f.key] ?? ''} onChange={e => setField(f.key, e.target.value)}
                      style={inputStyle} placeholder={`输入${f.label}`} />
                  )}
                </div>
              ))}
            </div>

            {/* 手动触发模糊搜索 */}
            <button onClick={() => doSearch(fields.name ?? '')}
              disabled={searching || !fields.name}
              style={{ marginTop: 16, padding: '8px 18px', background: `${GOLD}15`,
                border: `1px solid ${GOLD}35`, borderRadius: 7, color: GOLD, cursor: 'pointer',
                fontSize: 13, fontWeight: 500, transition: 'all .2s',
                opacity: (!fields.name || searching) ? 0.5 : 1 }}>
              {searching ? '搜索中…' : '🔍 搜索相似海缆'}
            </button>
          </div>

          {/* 第二步·补充：海缆路径拓扑结构（鱼骨编辑器）*/}
          <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 6 }}>
              海缆路径拓扑结构
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14, lineHeight: 1.6 }}>
              按物理顺序在<strong style={{ color: 'rgba(255,255,255,.55)' }}>主干</strong>上添加登陆站（从一端到另一端）。
              有 spur 支线的话点站点下方的 <strong style={{ color: '#34D399' }}>↓</strong> 添加支线。
              系统会自动计算路由 GeoJSON，保存时直接写入数据库，地球立即显示。
            </p>
            <CableTopologyEditor
              onChange={result => {
                setTopologyResult(result);
                // 同步更新 routeGeojson 预览框（方便用户验证和手动微调）
                if (result.geojson) {
                  setField('routeGeojson', JSON.stringify(result.geojson, null, 2));
                }
              }}
            />

            {/* 根据已选登陆站坐标立即生成近似路由 — 始终显示，slug 缺失时给出提示 */}
            <div style={{ marginTop: 16, paddingTop: 14,
              borderTop: '1px solid rgba(255,255,255,.06)' }}>
              {fields.slug ? (
                <>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)',
                    marginBottom: 10, lineHeight: 1.6 }}>
                    如果需要跳过拓扑编辑器、直接用登陆站坐标生成近似路由（经度排序），也可点击下方按钮。
                  </p>
                  <GenerateRoutesButton slug={fields.slug} />
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,.02)',
                  border: '1px solid rgba(255,255,255,.06)' }}>
                  <span style={{ fontSize: 20, opacity: 0.3 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontWeight: 500 }}>
                      快速生成近似路由（经度排序）
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.2)', marginTop: 3 }}>
                      请先填写上方 Slug 字段后激活，或使用上面的拓扑编辑器指定精确顺序
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 登陆站坐标编辑器 */}
          <StationCoordsEditor />

          {/* 第二步·补充：路由坐标（routeGeojson）输入 */}
          <div style={{ background: CARD, border: `1px solid rgba(59,130,246,.15)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'rgba(147,197,253,.8)', marginBottom: 6 }}>
              路由坐标 GeoJSON（使海缆出现在地球 + 搜索）
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 12, lineHeight: 1.6 }}>
              粘贴从 TeleGeography 或其他来源获取的 GeoJSON Geometry 对象（LineString 或 MultiLineString）。
              保存后海缆线路将显示在主页 3D 地球和自主权图谱地图上，并可被搜索索引到。
            </p>
            <textarea
              value={fields.routeGeojson ?? ''}
              onChange={e => setField('routeGeojson', e.target.value)}
              rows={5}
              placeholder={'{"type":"LineString","coordinates":[[lon,lat],[lon,lat],...]}'}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'monospace', fontSize: 11 }}
            />
            {fields.routeGeojson && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                {(() => {
                  try {
                    JSON.parse(fields.routeGeojson);
                    return <span style={{ color: '#4ade80' }}>✓ JSON 格式合法</span>;
                  } catch {
                    return <span style={{ color: '#f87171' }}>✗ JSON 格式错误，请检查</span>;
                  }
                })()}
              </div>
            )}

            {/* 路由工具：智能路由（参考数据库） + 陆地平滑，只需 slug 即可触发 */}
            {fields.slug && (
              <div style={{ marginTop: 14, paddingTop: 14,
                borderTop: '1px solid rgba(255,255,255,.06)',
                display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)',
                  margin: 0, lineHeight: 1.6 }}>
                  路由保存后如果地图上仍有穿越陆地或跨大陆的问题，使用下方工具修复：
                </p>
                {/* 推荐优先使用智能路由 */}
                <SmartRouteButton slug={fields.slug} />
                {/* 备用：纯算法平滑（不依赖参考缆，但对复杂海峡效果有限）*/}
                <SmoothRouteButton slug={fields.slug} />
              </div>
            )}
          </div>
        </div>

        {/* ── 右列：相似匹配 / 字段对比 + 保存 + xlsx ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 第三步：相似海缆匹配 或 字段对比面板 */}
          <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>

            {/* 未选合并目标时：展示搜索结果列表 */}
            {!mergeTarget && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
                  textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 12 }}>
                  第三步：相似海缆匹配
                </div>
                {similar.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center',
                    color: 'rgba(255,255,255,.25)', fontSize: 13 }}>
                    {searching ? '搜索中…' : '输入名称后点击"搜索相似海缆"'}
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 12, lineHeight: 1.6 }}>
                      找到 {similar.length} 条相似记录。选择一条进行字段对比，或选择单独新建：
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                      <div onClick={() => selectMergeTarget(null)}
                        style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                          border: '1px solid rgba(255,255,255,.08)', background: 'transparent' }}>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 500, marginBottom: 2 }}>
                          ➕ 单独新建（不合并）
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>
                          作为全新海缆录入数据库
                        </div>
                      </div>
                      {similar.map(c => (
                        <div key={c.slug} onClick={() => selectMergeTarget(c.slug)}
                          style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                            border: '1px solid rgba(255,255,255,.08)', background: 'transparent',
                            transition: 'all .15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${GOLD}08`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                          <div style={{ display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
                              {c.name}
                            </span>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4,
                              background: 'rgba(42,157,143,.15)', color: '#2A9D8F',
                              border: '1px solid rgba(42,157,143,.2)' }}>{c.status}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', display: 'flex', gap: 12 }}>
                            <span>slug: {c.slug}</span>
                            {c.lengthKm && <span>{c.lengthKm.toLocaleString()} km</span>}
                            {c.vendor && <span>{c.vendor}</span>}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 11, color: `${GOLD}90` }}>
                            点击 → 进入字段对比模式 ›
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* 已选合并目标时：展示字段对比面板 */}
            {mergeTarget && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
                      textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 4 }}>
                      字段对比合并 — {mergeTarget}
                    </div>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', margin: 0, lineHeight: 1.6 }}>
                      点击某一列中的值即选择该值。金色 = 保留库中现有值；绿色 = 使用新值。
                    </p>
                  </div>
                  <button onClick={() => selectMergeTarget(null)}
                    style={{ background: 'none', border: `1px solid rgba(255,255,255,.15)`,
                      color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 12,
                      padding: '5px 12px', borderRadius: 6, flexShrink: 0 }}>
                    ← 返回列表
                  </button>
                </div>

                {loadingDb ? (
                  <div style={{ textAlign: 'center', padding: '32px 0',
                    color: 'rgba(255,255,255,.35)', fontSize: 13 }}>
                    正在加载库中数据…
                  </div>
                ) : dbCableData ? (
                  <FieldComparePanel
                    dbData={dbCableData}
                    newFields={fields}
                    choices={fieldChoices}
                    onChoose={(key, side) =>
                      setFieldChoices(prev => ({ ...prev, [key]: side }))
                    }
                  />
                ) : (
                  <div style={{ color: '#f87171', fontSize: 13 }}>加载失败，请刷新重试</div>
                )}
              </>
            )}
          </div>

          {/* 第四步：保存到数据库 */}
          <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 16 }}>
              第四步：保存到数据库
            </div>

            {/* 状态摘要（保存前让用户确认） */}
            <div style={{ padding: '10px 14px', background: 'rgba(212,175,55,.07)',
              border: `1px solid ${GOLD}20`, borderRadius: 8, fontSize: 12,
              color: 'rgba(255,255,255,.5)', lineHeight: 1.6, marginBottom: 16 }}>
              <strong style={{ color: `${GOLD}BB` }}>
                {mergeTarget ? `合并模式：${mergeTarget}` : '新建模式'}
              </strong>
              <br />
              {mergeTarget
                ? '将对比结果写入已有记录，登陆站追加关联，routeGeojson 覆盖（如已输入）。'
                : '作为全新海缆记录保存，打上 MANUALLY_ADDED 标记，nightly-sync 不会覆盖。'}
              {topologyResult && topologyResult.allStationIds.length > 0 && (
                <><br />将关联 {topologyResult.allStationIds.length} 个登陆站（来自拓扑编辑器）。</>
              )}
              {topologyResult?.geojson && (
                <><br /><span style={{ color: GREEN }}>✓ 拓扑编辑器已生成路由，保存后地球将显示该缆。</span></>
              )}
            </div>

            <button onClick={handleSave} disabled={saving}
              style={{ width: '100%', padding: '10px', borderRadius: 8,
                background: saving ? 'rgba(212,175,55,.2)' : GOLD,
                border: 'none', color: saving ? GOLD : '#0A1628',
                fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', transition: 'all .2s' }}>
              {saving ? '保存中…' : mergeTarget ? '✓ 对比合并并保存' : '✓ 新建并保存'}
            </button>

            {saveMsg && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                background: saveMsg.startsWith('✓') ? 'rgba(16,112,86,.2)' : 'rgba(120,20,20,.2)',
                border: `1px solid ${saveMsg.startsWith('✓') ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)'}`,
                color: saveMsg.startsWith('✓') ? '#4ade80' : '#f87171', lineHeight: 1.6 }}>
                {saveMsg}
              </div>
            )}
          </div>

          {/* xlsx 路径数据上传 */}
          <div style={{ background: CARD, border: `1px solid rgba(255,255,255,.06)`, borderRadius: 14,
            backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 8 }}>
              主权路径数据更新
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14, lineHeight: 1.6 }}>
              上传路径汇总 .xlsx 文件，更新自主权网络图谱数据。打分调整后重新导出上传即可同步。
            </p>
            <div onClick={() => xlsxRef.current?.click()}
              style={{ border: '1px dashed rgba(255,255,255,.15)', borderRadius: 8,
                padding: '16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(212,175,55,.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.15)')}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>点击上传 .xlsx（路径汇总工作表）</div>
            </div>
            <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleXlsxUpload(f); e.target.value = ''; }} />
            {xlsxMsg && (
              <div style={{ marginTop: 10, padding: '7px 12px', borderRadius: 7, fontSize: 12,
                background: 'rgba(40,60,90,.4)', color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>
                {xlsxMsg}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新闻初始化 */}
      <div style={{ marginTop: 24, background: CARD, border: '1px solid rgba(139,92,246,.2)',
        borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: '#8B5CF6', marginBottom: 8 }}>
          海缆新闻初始化（首次部署执行一次）
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', marginBottom: 14, lineHeight: 1.6 }}>
          为全部保留海缆搜索近两年新闻并缓存到 Redis。约需 1-2 分钟，之后每天凌晨 2 点自动更新。
        </p>
        <button id="init-news-btn"
          onClick={async () => {
            if (!confirm('确认触发新闻初始化？约需 1-2 分钟。')) return;
            const btn = document.getElementById('init-news-btn') as HTMLButtonElement;
            btn.disabled = true; btn.textContent = '初始化中，请耐心等待…';
            try {
              const res  = await fetch('/api/admin/init-cable-news', { method: 'POST' });
              const data = await res.json();
              alert(data.success
                ? `✓ 完成！已为 ${data.initialized} 条海缆初始化新闻缓存。`
                : `失败：${data.error}`);
            } catch { alert('网络错误，请检查控制台'); }
            finally { btn.disabled = false; btn.textContent = '触发新闻初始化'; }
          }}
          style={{ padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(139,92,246,.15)', border: '1px solid rgba(139,92,246,.4)',
            color: '#8B5CF6', fontSize: 13, fontWeight: 500 }}>
          触发新闻初始化
        </button>
      </div>

      <SovereignRouteCompare />
      <NewsInitButton />
    </div>
  );
}

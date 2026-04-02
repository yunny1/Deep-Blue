'use client';
// src/components/admin/SovereignRouteCompare.tsx  v3
//
// 新增：
// 1. "清除Redis数据"按钮，解决脏数据问题
// 2. 上传后显示"解析预览"——让用户看到第一行数据被解析成什么，
//    便于诊断列名不匹配的问题
// 3. 无效行展示保持 v2 的逻辑

import { useState, useCallback } from 'react';

interface SovereignRoute {
  id: string; from: string; to: string; path: string;
  cables: string; riskScores: string; maxRisk: number; avgRisk: number;
  segments: number; safety: string;
}

interface InvalidRow {
  rowIndex: number;
  rawData: Record<string, unknown>;
  issues: string[];
}

type DiffStatus = 'added' | 'modified' | 'removed';
interface DiffItem {
  status: DiffStatus;
  route: SovereignRoute;
  oldRoute?: SovereignRoute;
  confirmed?: boolean;
  skipped?: boolean;
}

// ── 必须存在的列名（缺任何一个都会导致解析失败）───────────────────────────
const REQUIRED_COLUMNS = ['路径ID', '甲方', '乙方', '各段保留海缆', '是否安全'];
const ALL_COLUMNS = [
  '路径ID', '甲方', '乙方', '路径节点序列',
  '保留段数', '各段保留海缆', '各段风险评分',
  '路径最大单段风险', '路径平均单段风险', '西方核心中转数', '是否安全',
];

function validateRow(r: Record<string, unknown>, rowIndex: number): InvalidRow | null {
  const issues: string[] = [];
  if (!String(r['路径ID']      ?? '').trim()) issues.push('路径ID 为空');
  if (!String(r['甲方']        ?? '').trim()) issues.push('甲方 为空');
  if (!String(r['乙方']        ?? '').trim()) issues.push('乙方 为空');
  if (!String(r['各段保留海缆'] ?? '').trim()) issues.push('各段保留海缆 为空');
  if (!String(r['是否安全']    ?? '').trim()) issues.push('是否安全 为空');
  return issues.length === 0 ? null : { rowIndex, rawData: r, issues };
}

function parseRow(r: Record<string, unknown>): SovereignRoute {
  const path = String(r['路径节点序列'] ?? '');
  return {
    id:         String(r['路径ID']          ?? ''),
    from:       String(r['甲方']            ?? ''),
    to:         String(r['乙方']            ?? ''),
    path,
    nodes:      path.split(' → '), 
    cables:     String(r['各段保留海缆']    ?? ''),
    riskScores: String(r['各段风险评分']    ?? ''),
    maxRisk:    Number(r['路径最大单段风险'] ?? 0),
    avgRisk:    Number(r['路径平均单段风险'] ?? 0),
    segments:   Number(r['保留段数']         ?? 0),
    safety:     String(r['是否安全']         ?? ''),
  };
}

function getChangedFields(o: SovereignRoute, n: SovereignRoute): string[] {
  const fields: Array<keyof SovereignRoute> = ['cables','riskScores','maxRisk','avgRisk','segments','safety','path'];
  return fields.filter(f => String(o[f]) !== String(n[f]));
}

const CARD_BG = 'rgba(26,45,74,.5)';
const GOLD    = '#D4AF37';
const STATUS_STYLES: Record<DiffStatus, { label: string; bg: string; color: string; border: string }> = {
  added:    { label:'新增', bg:'rgba(34,197,94,.12)',  color:'#22C55E', border:'rgba(34,197,94,.3)'  },
  modified: { label:'修改', bg:'rgba(234,179,8,.12)',  color:'#EAB308', border:'rgba(234,179,8,.3)'  },
  removed:  { label:'删除', bg:'rgba(239,68,68,.12)',  color:'#EF4444', border:'rgba(239,68,68,.3)'  },
};

export default function SovereignRouteCompare() {
  const [downloading,    setDownloading]    = useState(false);
  const [resetting,      setResetting]      = useState(false);
  const [comparing,      setComparing]      = useState(false);
  const [invalidRows,    setInvalidRows]    = useState<InvalidRow[]>([]);
  const [parsedColumns,  setParsedColumns]  = useState<string[] | null>(null); // 解析到的列名
  const [parsePreview,   setParsePreview]   = useState<SovereignRoute | null>(null); // 第一行预览
  const [diffItems,      setDiffItems]      = useState<DiffItem[] | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [saveResult,     setSaveResult]     = useState<string | null>(null);
  const [currentRoutes,  setCurrentRoutes]  = useState<SovereignRoute[] | null>(null);
  const [showInvalid,    setShowInvalid]    = useState(true);
  const [showDiag,       setShowDiag]       = useState(false); // 展开列名诊断

  // ── 下载当前数据 ─────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/admin/sovereign-routes-download');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `sovereign-routes-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('下载失败：' + e); }
    finally { setDownloading(false); }
  };

  // ── 清除 Redis 脏数据 ────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!window.confirm(
      '确认清除 Redis 里的主权路径数据吗？\n\n' +
      '清除后，自主权图谱页面将显示代码内置的静态数据（含俄罗斯路径）。\n' +
      '之后请重新上传你的 Excel 文件来覆盖静态数据。'
    )) return;

    setResetting(true);
    try {
      const res  = await fetch('/api/admin/reset-sovereign-routes', { method: 'POST' });
      const data = await res.json();
      setSaveResult(data.success
        ? '✓ ' + data.message
        : '✗ ' + data.message
      );
      // 清空本地状态，让用户重新开始
      setDiffItems(null);
      setInvalidRows([]);
      setParsedColumns(null);
      setParsePreview(null);
    } catch (e) {
      setSaveResult('✗ 请求失败：' + e);
    } finally {
      setResetting(false);
    }
  };

  // ── 上传并对比 ───────────────────────────────────────────────────────────
  const handleUploadAndCompare = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setComparing(true);
    setSaveResult(null);
    setInvalidRows([]);
    setDiffItems(null);
    setParsedColumns(null);
    setParsePreview(null);

    try {
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(await file.arrayBuffer());
      const ws   = wb.Sheets['路径汇总'];
      if (!ws) {
        alert('找不到"路径汇总"工作表，请确认文件格式正确。\n工作表名必须为"路径汇总"（注意中文）。');
        setComparing(false);
        return;
      }

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      if (raw.length === 0) {
        setSaveResult('⚠ 工作表是空的，没有读取到任何数据行');
        setComparing(false);
        return;
      }

      // 诊断：记录实际解析到的列名，方便比对
      const detectedCols = Object.keys(raw[0]);
      setParsedColumns(detectedCols);

      // 检查是否缺少必要列
      const missingCols = REQUIRED_COLUMNS.filter(c => !detectedCols.includes(c));
      if (missingCols.length > 0) {
        setSaveResult(
          `✗ Excel 列名与预期不匹配，以下必要列未找到：${missingCols.join('、')}。\n` +
          `请展开"列名诊断"查看详情。`
        );
        setShowDiag(true);
        setComparing(false);
        return;
      }

      // 行级验证
      const validRows:  Record<string, unknown>[] = [];
      const badRows:    InvalidRow[]              = [];
      raw.forEach((row, idx) => {
        const problem = validateRow(row, idx + 2);
        if (problem) badRows.push(problem);
        else validRows.push(row);
      });

      setInvalidRows(badRows);

      if (validRows.length === 0) {
        setSaveResult(`⚠ 没有读取到任何有效行（共 ${raw.length} 行，全部无效）。请展开"列名诊断"确认列名。`);
        setShowDiag(true);
        setComparing(false);
        return;
      }

      const newRoutes = validRows.map(parseRow);
      // 显示第一行解析结果，方便用户确认字段是否正确
      setParsePreview(newRoutes[0]);

      // 读取当前数据做对比
      const curRes    = await fetch('/api/sovereign-network/routes');
      const curData   = await curRes.json();
      const curRoutes: SovereignRoute[] = curData.routes ?? [];
      setCurrentRoutes(curRoutes);

      const curMap = new Map(curRoutes.map(r => [r.id, r]));
      const newMap = new Map(newRoutes.map(r => [r.id, r]));
      const diffs: DiffItem[] = [];

      for (const [id, newR] of newMap) {
        if (!curMap.has(id)) diffs.push({ status: 'added', route: newR });
      }
      for (const [id, newR] of newMap) {
        const oldR = curMap.get(id);
        if (oldR && getChangedFields(oldR, newR).length > 0) {
          diffs.push({ status: 'modified', route: newR, oldRoute: oldR });
        }
      }
      for (const [id, oldR] of curMap) {
        if (!newMap.has(id)) diffs.push({ status: 'removed', route: oldR });
      }

      if (diffs.length === 0 && badRows.length === 0) {
        setSaveResult('✓ 数据完全一致，无需更新');
      } else if (diffs.length === 0) {
        setSaveResult(`有效数据与当前一致，但发现 ${badRows.length} 行无效数据`);
      } else {
        setDiffItems(diffs.map(d => ({ ...d, confirmed: false, skipped: false })));
      }
    } catch (err) {
      alert('解析失败：' + err);
    } finally {
      setComparing(false);
    }
  }, []);

  const toggleItem = (idx: number, action: 'confirm' | 'skip') => {
    setDiffItems(prev => prev?.map((item, i) =>
      i !== idx ? item : {
        ...item,
        confirmed: action === 'confirm' ? !item.confirmed : false,
        skipped:   action === 'skip'    ? !item.skipped   : false,
      }
    ) ?? null);
  };

  const confirmAll = () => {
    setDiffItems(prev => prev?.map(item => ({
      ...item, confirmed: item.status !== 'removed', skipped: false,
    })) ?? null);
  };

  const handleSubmit = async () => {
    if (!diffItems || !currentRoutes) return;
    setSaving(true);

    const curMap = new Map(currentRoutes.map(r => [r.id, r]));
    for (const item of diffItems) {
      if (!item.confirmed) continue;
      if (item.status === 'added' || item.status === 'modified') curMap.set(item.route.id, item.route);
      else if (item.status === 'removed') curMap.delete(item.route.id);
    }
    const allRoutes = Array.from(curMap.values());

// 诊断：在浏览器控制台输出前5条，帮你判断字段是否被正确解析
console.log('[SovereignRouteCompare] 准备提交，前5条路径：', 
  allRoutes.slice(0, 5).map(r => ({
    id: r.id,
    from: r.from,
    to: r.to,
    cablesPreview: (r.cables ?? '').slice(0, 30),
  }))
);
console.log('[SovereignRouteCompare] 总条数：', allRoutes.length);

// 过滤掉任何 from/to/cables 为空的路径（防止脏数据混入）
const finalRoutes = allRoutes.filter(
  r => r.from?.trim() && r.to?.trim() && (r.cables ?? '').trim()
);

// 如果过滤后数量变少了，说明有问题，也输出一下
if (finalRoutes.length < allRoutes.length) {
  console.warn(
    `[SovereignRouteCompare] ⚠ 过滤掉了 ${allRoutes.length - finalRoutes.length} 条空字段路径`
  );
}

    try {
      const res  = await fetch('/api/admin/sovereign-routes-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: finalRoutes }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        const cnt = diffItems.filter(i => i.confirmed).length;
        setSaveResult(
          `✓ 已确认 ${cnt} 条变更，共 ${finalRoutes.length} 条路径已保存到 Redis。` +
          (invalidRows.length > 0 ? `（${invalidRows.length} 条无效行已排除）` : '') +
          ` 刷新自主权图谱页面即可看到最新数据。`
        );
        setDiffItems(null);
      } else {
        setSaveResult(`✗ 保存失败：${data.error ?? '未知错误'}`);
      }
    } catch (err) {
      setSaveResult(`✗ 网络错误：${err}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmedCount = diffItems?.filter(i => i.confirmed).length ?? 0;

  return (
    <div style={{ background: CARD_BG, border: `1px solid rgba(212,175,55,.15)`, borderRadius: 14, backdropFilter: 'blur(12px)', padding: '20px 24px', marginBottom: 20 }}>

      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: `${GOLD}80`, marginBottom: 8 }}>
        主权路径数据更新
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F0E6C8', margin: '0 0 6px', fontFamily: "'Playfair Display',serif" }}>
        下载 → 编辑 → 上传对比 → 逐条确认
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 16, lineHeight: 1.6 }}>
        Excel 必须包含名为"路径汇总"的工作表，且列名需与模板完全一致。
        上传后系统会自动做行级验证，无效行单独展示，不会写入系统。
      </p>

      {/* 操作按钮行 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={handleDownload} disabled={downloading} style={{
          padding: '8px 16px', borderRadius: 8, cursor: downloading ? 'not-allowed' : 'pointer',
          background: 'rgba(212,175,55,.1)', border: `1px solid ${GOLD}30`, color: GOLD,
          fontSize: 12, fontWeight: 500, opacity: downloading ? 0.6 : 1,
        }}>
          {downloading ? '⏳ 生成中…' : '⬇ 下载当前数据'}
        </button>

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)',
          borderRadius: 8, cursor: comparing ? 'not-allowed' : 'pointer',
          color: '#60A5FA', fontSize: 12, fontWeight: 500, opacity: comparing ? 0.6 : 1,
        }}>
          {comparing ? '⏳ 解析中…' : '⬆ 上传新版并对比'}
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={handleUploadAndCompare} disabled={comparing} />
        </label>

        {/* 清除脏数据按钮 */}
        <button onClick={handleReset} disabled={resetting} style={{
          padding: '8px 16px', borderRadius: 8, cursor: resetting ? 'not-allowed' : 'pointer',
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
          color: '#f87171', fontSize: 12, fontWeight: 500, opacity: resetting ? 0.6 : 1,
          marginLeft: 'auto',
        }}>
          {resetting ? '⏳ 清除中…' : '🗑 清除 Redis 数据'}
        </button>
      </div>

      {/* 提示：清除按钮说明 */}
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,.25)', marginBottom: 16, marginTop: -8 }}>
        如果页面显示空数据或旧数据，点"清除 Redis 数据"重置，然后重新上传。
      </p>

      {/* 操作结果提示 */}
      {saveResult && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: saveResult.startsWith('✓') ? 'rgba(34,197,94,.12)' : saveResult.startsWith('⚠') ? 'rgba(251,191,36,.1)' : 'rgba(239,68,68,.1)',
          color:      saveResult.startsWith('✓') ? '#22C55E' : saveResult.startsWith('⚠') ? '#fbbf24' : '#f87171',
          border:     `1px solid ${saveResult.startsWith('✓') ? 'rgba(34,197,94,.2)' : saveResult.startsWith('⚠') ? 'rgba(251,191,36,.2)' : 'rgba(239,68,68,.2)'}`,
          display: 'flex', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ flex: 1, whiteSpace: 'pre-wrap' as const }}>{saveResult}</span>
          <button onClick={() => setSaveResult(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* 列名诊断（仅在上传后展示）*/}
      {parsedColumns && (
        <div style={{ marginBottom: 16, border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            padding: '8px 14px', background: 'rgba(255,255,255,.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              🔍 列名诊断 — 共读取到 {parsedColumns.length} 列
            </span>
            <button onClick={() => setShowDiag(v => !v)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 11 }}>
              {showDiag ? '收起' : '展开'}
            </button>
          </div>

          {showDiag && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginBottom: 8 }}>
                绿色 = 已找到；红色 = 缺失（会导致该字段解析为空）
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 }}>
                {ALL_COLUMNS.map(col => {
                  const found = parsedColumns.includes(col);
                  const required = REQUIRED_COLUMNS.includes(col);
                  return (
                    <span key={col} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 5,
                      background: found ? 'rgba(34,197,94,.12)' : required ? 'rgba(239,68,68,.15)' : 'rgba(255,255,255,.05)',
                      color:      found ? '#22C55E'              : required ? '#f87171'              : 'rgba(255,255,255,.35)',
                      border:     `1px solid ${found ? 'rgba(34,197,94,.2)' : required ? 'rgba(239,68,68,.25)' : 'rgba(255,255,255,.08)'}`,
                    }}>
                      {found ? '✓' : '✗'} {col}{required && !found ? ' *必填' : ''}
                    </span>
                  );
                })}
              </div>
              {/* 第一行解析预览 */}
              {parsePreview && (
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', marginBottom: 6 }}>
                    第一行数据解析结果预览（请确认字段是否正确）：
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {([
                      ['路径ID', parsePreview.id],
                      ['甲方', parsePreview.from],
                      ['乙方', parsePreview.to],
                      ['各段保留海缆', parsePreview.cables.slice(0, 40) + (parsePreview.cables.length > 40 ? '…' : '')],
                      ['是否安全', parsePreview.safety],
                      ['最大风险', String(parsePreview.maxRisk)],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.06)' }}>
                        <span style={{ color: 'rgba(255,255,255,.35)' }}>{k}：</span>
                        <span style={{ color: v ? 'rgba(255,255,255,.75)' : '#f87171' }}>{v || '（空）'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 无效行报告 */}
      {invalidRows.length > 0 && (
        <div style={{ marginBottom: 20, border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'rgba(239,68,68,.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
              ⚠️ {invalidRows.length} 行无效数据（不会写入系统）
            </span>
            <button onClick={() => setShowInvalid(v => !v)} style={{ background: 'none', border: '1px solid rgba(255,255,255,.1)', borderRadius: 5, padding: '2px 8px', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 11 }}>
              {showInvalid ? '收起' : '展开'}
            </button>
          </div>
          {showInvalid && (
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(239,68,68,.06)', borderBottom: '1px solid rgba(239,68,68,.2)' }}>
                    {['行号', '路径ID', '甲方', '乙方', '问题'].map(h => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#f87171', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <td style={{ padding: '6px 12px', color: '#f87171', fontFamily: 'monospace' }}>第 {row.rowIndex} 行</td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)' }}>{String(row.rawData['路径ID'] ?? '（空）')}</td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)' }}>{String(row.rawData['甲方'] ?? '（空）')}</td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)' }}>{String(row.rawData['乙方'] ?? '（空）')}</td>
                      <td style={{ padding: '6px 12px', color: '#fbbf24' }}>{row.issues.join('；')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 差异对比列表 */}
      {diffItems && diffItems.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              共 <strong style={{ color: '#F0E6C8' }}>{diffItems.length}</strong> 处差异 ·
              已确认 <strong style={{ color: '#22C55E' }}>{confirmedCount}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmAll} style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)', color: '#22C55E',
              }}>全部确认（不含删除）</button>
              <button onClick={handleSubmit} disabled={saving || confirmedCount === 0} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: confirmedCount === 0 ? 'not-allowed' : 'pointer',
                background: confirmedCount > 0 ? `${GOLD}20` : 'rgba(255,255,255,.05)',
                border: `1px solid ${confirmedCount > 0 ? `${GOLD}40` : 'rgba(255,255,255,.1)'}`,
                color: confirmedCount > 0 ? GOLD : '#6B7280',
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? '⏳ 保存中…' : `提交 ${confirmedCount} 条确认`}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {diffItems.slice(0, 80).map((item, idx) => {
              const st = STATUS_STYLES[item.status];
              return (
                <div key={idx} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: item.confirmed ? 'rgba(34,197,94,.06)' : item.skipped ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${item.confirmed ? 'rgba(34,197,94,.2)' : item.skipped ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.07)'}`,
                  opacity: item.skipped ? 0.45 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, background: st.bg, color: st.color, border: `1px solid ${st.border}`, flexShrink: 0 }}>{st.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>{item.route.from} → {item.route.to}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.route.path}</div>
                      {item.status === 'modified' && item.oldRoute && (() => {
                        const changed = getChangedFields(item.oldRoute, item.route);
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginTop: 4 }}>
                            {changed.map(field => (
                              <div key={field} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(234,179,8,.1)', color: '#EAB308', border: '1px solid rgba(234,179,8,.2)' }}>
                                {field}：
                                <span style={{ textDecoration: 'line-through', opacity: .6, marginRight: 3 }}>
                                  {String((item.oldRoute as unknown as Record<string,unknown>)[field])}
                                </span>
                                → {String((item.route as unknown as Record<string,unknown>)[field])}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {!item.skipped ? (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleItem(idx, 'confirm')} style={{
                          padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                          background: item.confirmed ? 'rgba(34,197,94,.2)' : 'rgba(34,197,94,.08)',
                          border: `1px solid ${item.confirmed ? 'rgba(34,197,94,.4)' : 'rgba(34,197,94,.2)'}`, color: '#22C55E',
                        }}>{item.confirmed ? '✓ 已确认' : '确认'}</button>
                        <button onClick={() => toggleItem(idx, 'skip')} style={{
                          padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#6B7280',
                        }}>跳过</button>
                      </div>
                    ) : (
                      <button onClick={() => toggleItem(idx, 'skip')} style={{
                        padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                        background: 'none', border: '1px solid rgba(255,255,255,.08)', color: '#4B5563',
                      }}>撤销跳过</button>
                    )}
                  </div>
                </div>
              );
            })}
            {diffItems.length > 80 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.3)', padding: '8px 0' }}>
                仅显示前 80 条 · 共 {diffItems.length} 条差异
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

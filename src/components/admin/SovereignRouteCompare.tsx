'use client';
// src/components/admin/SovereignRouteCompare.tsx  v2
//
// 核心改动：
// 1. 解析 Excel 后立刻做行级验证，无效行单独展示，不进入对比流程
// 2. 只有有效行才参与 diff 对比和最终提交
// 3. 用户在确认前就能看到哪些数据有问题，以及问题原因
// 4. routes API 不再需要做校验和兜底，这里做好源头把关

import { useState, useCallback } from 'react';

interface SovereignRoute {
  id: string; from: string; to: string; path: string;
  cables: string; riskScores: string; maxRisk: number; avgRisk: number;
  segments: number; safety: string;
}

interface InvalidRow {
  rowIndex: number;       // Excel 里的行号（从 2 开始，1 是表头）
  rawData: Record<string, unknown>;
  issues: string[];       // 具体哪些字段有问题
}

type DiffStatus = 'added' | 'modified' | 'removed';
interface DiffItem {
  status: DiffStatus;
  route: SovereignRoute;
  oldRoute?: SovereignRoute;
  confirmed?: boolean;
  skipped?: boolean;
}

// ── 行级验证：检查一行 Excel 数据是否包含必要字段 ─────────────────────────
function validateRow(r: Record<string, unknown>, rowIndex: number): InvalidRow | null {
  const issues: string[] = [];

  const id      = String(r['路径ID']      ?? '').trim();
  const from    = String(r['甲方']        ?? '').trim();
  const to      = String(r['乙方']        ?? '').trim();
  const cables  = String(r['各段保留海缆'] ?? '').trim();
  const safety  = String(r['是否安全']    ?? '').trim();

  if (!id)     issues.push('路径ID 为空');
  if (!from)   issues.push('甲方 为空');
  if (!to)     issues.push('乙方 为空');
  if (!cables) issues.push('各段保留海缆 为空');
  if (!safety) issues.push('是否安全 为空');

  if (issues.length === 0) return null;  // 有效行
  return { rowIndex, rawData: r, issues };
}

// ── 把有效的 Excel 行转成 SovereignRoute 对象 ──────────────────────────────
function parseRow(r: Record<string, unknown>): SovereignRoute {
  const path = String(r['路径节点序列'] ?? '');
  return {
    id:         String(r['路径ID']         ?? ''),
    from:       String(r['甲方']           ?? ''),
    to:         String(r['乙方']           ?? ''),
    path,
    cables:     String(r['各段保留海缆']   ?? ''),
    riskScores: String(r['各段风险评分']   ?? ''),
    maxRisk:    Number(r['路径最大单段风险'] ?? 0),
    avgRisk:    Number(r['路径平均单段风险'] ?? 0),
    segments:   Number(r['保留段数']        ?? 0),
    safety:     String(r['是否安全']        ?? ''),
  };
}

function getChangedFields(oldR: SovereignRoute, newR: SovereignRoute): string[] {
  const fields: Array<keyof SovereignRoute> = [
    'cables', 'riskScores', 'maxRisk', 'avgRisk', 'segments', 'safety', 'path',
  ];
  return fields.filter(f => String(oldR[f]) !== String(newR[f]));
}

// ── 样式常量 ─────────────────────────────────────────────────────────────────
const CARD_BG = 'rgba(26,45,74,.5)';
const GOLD    = '#D4AF37';

const STATUS_STYLES: Record<DiffStatus, { label: string; bg: string; color: string; border: string }> = {
  added:    { label: '新增', bg: 'rgba(34,197,94,.12)',  color: '#22C55E', border: 'rgba(34,197,94,.3)' },
  modified: { label: '修改', bg: 'rgba(234,179,8,.12)',  color: '#EAB308', border: 'rgba(234,179,8,.3)' },
  removed:  { label: '删除', bg: 'rgba(239,68,68,.12)',  color: '#EF4444', border: 'rgba(239,68,68,.3)' },
};

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function SovereignRouteCompare() {
  const [downloading,   setDownloading]   = useState(false);
  const [comparing,     setComparing]     = useState(false);
  const [invalidRows,   setInvalidRows]   = useState<InvalidRow[]>([]);
  const [diffItems,     setDiffItems]     = useState<DiffItem[] | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [saveResult,    setSaveResult]    = useState<string | null>(null);
  const [currentRoutes, setCurrentRoutes] = useState<SovereignRoute[] | null>(null);
  const [showInvalid,   setShowInvalid]   = useState(true);

  // ── 下载当前数据 ───────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res  = await fetch('/api/admin/sovereign-routes-download');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `sovereign-routes-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('下载失败：' + e);
    } finally {
      setDownloading(false);
    }
  };

  // ── 上传并对比 ─────────────────────────────────────────────────────────────
  const handleUploadAndCompare = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setComparing(true);
    setSaveResult(null);
    setInvalidRows([]);
    setDiffItems(null);

    try {
      const XLSX = await import('xlsx');
      const wb   = XLSX.read(await file.arrayBuffer());
      const ws   = wb.Sheets['路径汇总'];
      if (!ws) {
        alert('找不到"路径汇总"工作表，请确认文件格式');
        setComparing(false);
        return;
      }

      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      // ── 第一步：行级验证，分出有效行和无效行 ─────────────────────────────
      const validRows:   Record<string, unknown>[] = [];
      const badRows:     InvalidRow[]              = [];

      raw.forEach((row, idx) => {
        const problem = validateRow(row, idx + 2);  // +2 因为第1行是表头
        if (problem) {
          badRows.push(problem);
        } else {
          validRows.push(row);
        }
      });

      setInvalidRows(badRows);

      if (validRows.length === 0) {
        setSaveResult('⚠ 上传的表格中没有任何有效行，请检查列名是否正确（需包含：路径ID、甲方、乙方、各段保留海缆、是否安全）');
        setComparing(false);
        return;
      }

      // ── 第二步：把有效行解析成 SovereignRoute ────────────────────────────
      const newRoutes = validRows.map(parseRow);

      // ── 第三步：读取当前路径数据做对比 ──────────────────────────────────
      const curRes    = await fetch('/api/sovereign-network/routes');
      const curData   = await curRes.json();
      const curRoutes: SovereignRoute[] = curData.routes ?? [];
      setCurrentRoutes(curRoutes);

      const curMap  = new Map(curRoutes.map(r => [r.id, r]));
      const newMap  = new Map(newRoutes.map(r => [r.id, r]));
      const diffs:  DiffItem[] = [];

      // 新增的路径
      for (const [id, newR] of newMap) {
        if (!curMap.has(id)) diffs.push({ status: 'added', route: newR });
      }
      // 修改的路径
      for (const [id, newR] of newMap) {
        const oldR = curMap.get(id);
        if (oldR && getChangedFields(oldR, newR).length > 0) {
          diffs.push({ status: 'modified', route: newR, oldRoute: oldR });
        }
      }
      // 删除的路径
      for (const [id, oldR] of curMap) {
        if (!newMap.has(id)) diffs.push({ status: 'removed', route: oldR });
      }

      if (diffs.length === 0 && badRows.length === 0) {
        setSaveResult('✓ 数据完全一致，无需更新');
      } else if (diffs.length === 0) {
        setSaveResult(`有效数据与当前一致，但发现 ${badRows.length} 行无效数据（见下方详情）`);
      } else {
        setDiffItems(diffs.map(d => ({ ...d, confirmed: false, skipped: false })));
      }
    } catch (err) {
      alert('解析失败：' + err);
    } finally {
      setComparing(false);
    }
  }, []);

  // ── 确认/跳过单条差异 ──────────────────────────────────────────────────────
  const toggleItem = (idx: number, action: 'confirm' | 'skip') => {
    setDiffItems(prev => prev?.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        confirmed: action === 'confirm' ? !item.confirmed : false,
        skipped:   action === 'skip'    ? !item.skipped   : false,
      };
    }) ?? null);
  };

  const confirmAll = () => {
    setDiffItems(prev => prev?.map(item => ({
      ...item,
      confirmed: item.status !== 'removed',
      skipped:   false,
    })) ?? null);
  };

  // ── 提交确认的变更 ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!diffItems || !currentRoutes) return;
    setSaving(true);

    const curMap = new Map(currentRoutes.map(r => [r.id, r]));
    for (const item of diffItems) {
      if (!item.confirmed) continue;
      if (item.status === 'added' || item.status === 'modified') {
        curMap.set(item.route.id, item.route);
      } else if (item.status === 'removed') {
        curMap.delete(item.route.id);
      }
    }

    const finalRoutes = Array.from(curMap.values());

    try {
      const res  = await fetch('/api/admin/sovereign-routes-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: finalRoutes }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        const confirmedCount = diffItems.filter(i => i.confirmed).length;
        setSaveResult(
          `✓ 已确认 ${confirmedCount} 条变更，共 ${finalRoutes.length} 条有效路径已保存到 Redis。` +
          (invalidRows.length > 0 ? `（${invalidRows.length} 条无效行已被跳过，见上方详情）` : '') +
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
    <div style={{
      background: CARD_BG, border: `1px solid rgba(212,175,55,.15)`,
      borderRadius: 14, backdropFilter: 'blur(12px)',
      padding: '20px 24px', marginBottom: 20,
    }}>
      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: `${GOLD}80`, marginBottom: 8 }}>
        主权路径数据更新
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F0E6C8', margin: '0 0 6px', fontFamily: "'Playfair Display',serif" }}>
        下载 → 编辑 → 上传对比 → 逐条确认
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 16, lineHeight: 1.6 }}>
        上传时会对每行数据进行验证。无效行（字段缺失）会在下方单独列出，
        不会进入对比流程，也不会被写入系统。有效行的变更需要你逐条确认后才生效。
      </p>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={handleDownload} disabled={downloading} style={{
          padding: '8px 18px', borderRadius: 8, cursor: downloading ? 'not-allowed' : 'pointer',
          background: 'rgba(212,175,55,.1)', border: `1px solid ${GOLD}30`, color: GOLD,
          fontSize: 13, fontWeight: 500, opacity: downloading ? 0.6 : 1,
        }}>
          {downloading ? '⏳ 生成中…' : '⬇ 下载当前路径数据'}
        </button>

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px',
          background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)',
          borderRadius: 8, cursor: comparing ? 'not-allowed' : 'pointer',
          color: '#60A5FA', fontSize: 13, fontWeight: 500, opacity: comparing ? 0.6 : 1,
        }}>
          {comparing ? '⏳ 解析中…' : '⬆ 上传新版并对比差异'}
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={handleUploadAndCompare} disabled={comparing} />
        </label>
      </div>

      {/* 保存结果提示 */}
      {saveResult && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12,
          background: saveResult.startsWith('✓') ? 'rgba(34,197,94,.12)' : 'rgba(251,191,36,.12)',
          color:      saveResult.startsWith('✓') ? '#22C55E' : '#fbbf24',
          border:     `1px solid ${saveResult.startsWith('✓') ? 'rgba(34,197,94,.2)' : 'rgba(251,191,36,.2)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ flex: 1 }}>{saveResult}</span>
          <button onClick={() => setSaveResult(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* ── 无效行报告（最重要的反馈区域）──────────────────────────────────── */}
      {invalidRows.length > 0 && (
        <div style={{
          marginBottom: 20, border: '1px solid rgba(239,68,68,.3)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', background: 'rgba(239,68,68,.1)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                发现 {invalidRows.length} 行无效数据
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
                这些行不会被写入系统，请修正后重新上传
              </span>
            </div>
            <button onClick={() => setShowInvalid(v => !v)} style={{
              background: 'none', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 5, padding: '2px 8px', color: 'rgba(255,255,255,.4)',
              cursor: 'pointer', fontSize: 11,
            }}>
              {showInvalid ? '收起' : '展开'}
            </button>
          </div>

          {showInvalid && (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(239,68,68,.06)', borderBottom: '1px solid rgba(239,68,68,.2)' }}>
                    {['行号', '路径ID', '甲方', '乙方', '问题描述'].map(h => (
                      <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#f87171', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', background: i % 2 === 0 ? 'rgba(239,68,68,.03)' : 'transparent' }}>
                      <td style={{ padding: '6px 12px', color: '#f87171', fontFamily: 'monospace' }}>第 {row.rowIndex} 行</td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(row.rawData['路径ID'] ?? '（空）')}
                      </td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)' }}>
                        {String(row.rawData['甲方'] ?? '（空）')}
                      </td>
                      <td style={{ padding: '6px 12px', color: 'rgba(255,255,255,.5)' }}>
                        {String(row.rawData['乙方'] ?? '（空）')}
                      </td>
                      <td style={{ padding: '6px 12px', color: '#fbbf24' }}>
                        {row.issues.join('；')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 差异对比列表 ──────────────────────────────────────────────────────── */}
      {diffItems && diffItems.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              共 <strong style={{ color: '#F0E6C8' }}>{diffItems.length}</strong> 处差异 ·
              已确认 <strong style={{ color: '#22C55E' }}>{confirmedCount}</strong>
              {invalidRows.length > 0 && (
                <span style={{ marginLeft: 12, color: '#fbbf24' }}>
                  ⚠ {invalidRows.length} 行无效数据已排除（见上方）
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmAll} style={{
                padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)', color: '#22C55E',
              }}>
                全部确认（不含删除）
              </button>
              <button onClick={handleSubmit} disabled={saving || confirmedCount === 0} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: confirmedCount === 0 ? 'not-allowed' : 'pointer',
                background: confirmedCount > 0 ? `${GOLD}20` : 'rgba(255,255,255,.05)',
                border:     `1px solid ${confirmedCount > 0 ? `${GOLD}40` : 'rgba(255,255,255,.1)'}`,
                color:      confirmedCount > 0 ? GOLD : '#6B7280',
                opacity:    saving ? 0.6 : 1,
              }}>
                {saving ? '⏳ 保存中…' : `提交 ${confirmedCount} 条确认`}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {diffItems.slice(0, 50).map((item, idx) => {
              const st = STATUS_STYLES[item.status];
              return (
                <div key={idx} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: item.confirmed ? 'rgba(34,197,94,.06)' : item.skipped ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${item.confirmed ? 'rgba(34,197,94,.2)' : item.skipped ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.07)'}`,
                  opacity: item.skipped ? 0.45 : 1, transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                          background: st.bg, color: st.color, border: `1px solid ${st.border}`, flexShrink: 0 }}>
                          {st.label}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>
                          {item.route.from} → {item.route.to}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'monospace', marginBottom: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.route.path}
                      </div>
                      {item.status === 'modified' && item.oldRoute && (() => {
                        const changed = getChangedFields(item.oldRoute, item.route);
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {changed.map(field => (
                              <div key={field} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                background: 'rgba(234,179,8,.1)', color: '#EAB308', border: '1px solid rgba(234,179,8,.2)' }}>
                                {field}：
                                <span style={{ textDecoration: 'line-through', opacity: .6, marginRight: 3 }}>
                                  {String((item.oldRoute as unknown as Record<string, unknown>)[field])}
                                </span>
                                → {String((item.route as unknown as Record<string, unknown>)[field])}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {item.status === 'added' && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                          {item.route.safety} · 最大风险 {item.route.maxRisk} · {item.route.segments} 段
                        </div>
                      )}
                    </div>
                    {!item.skipped ? (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleItem(idx, 'confirm')} style={{
                          padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                          background: item.confirmed ? 'rgba(34,197,94,.2)' : 'rgba(34,197,94,.08)',
                          border: `1px solid ${item.confirmed ? 'rgba(34,197,94,.4)' : 'rgba(34,197,94,.2)'}`,
                          color: '#22C55E',
                        }}>
                          {item.confirmed ? '✓ 已确认' : '确认'}
                        </button>
                        <button onClick={() => toggleItem(idx, 'skip')} style={{
                          padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                          background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#6B7280',
                        }}>
                          跳过
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => toggleItem(idx, 'skip')} style={{
                        padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                        background: 'none', border: '1px solid rgba(255,255,255,.08)', color: '#4B5563',
                      }}>
                        撤销跳过
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {diffItems.length > 50 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.3)', padding: '8px 0' }}>
                仅显示前 50 条 · 共 {diffItems.length} 条差异
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

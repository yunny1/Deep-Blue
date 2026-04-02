'use client';
// src/components/admin/SovereignRouteCompare.tsx
//
// 主权路径数据对比确认组件：
// 1. 下载当前数据（Excel 格式，与原始上传格式完全一致）
// 2. 上传新版 Excel → 解析后与当前数据对比
// 3. 展示差异列表（新增/修改/删除）
// 4. 逐条确认，确认后写入 Redis（MANUALLY_ADDED 保护）

import { useState, useCallback } from 'react';

// 路径数据的类型（与 sovereign-routes.ts 保持一致）
interface SovereignRoute {
  id: string; from: string; to: string; path: string;
  cables: string; riskScores: string; maxRisk: number; avgRisk: number;
  segments: number; safety: string;
}

// 对比结果类型
type DiffStatus = 'added' | 'modified' | 'removed';
interface DiffItem {
  status:   DiffStatus;
  route:    SovereignRoute;           // 新数据（removed 时为旧数据）
  oldRoute?: SovereignRoute;          // 修改时的旧数据，方便对比显示
  confirmed?: boolean;
  skipped?: boolean;
}

// 修改了哪些字段
function getChangedFields(oldR: SovereignRoute, newR: SovereignRoute): string[] {
  const fields: Array<keyof SovereignRoute> = ['cables','riskScores','maxRisk','avgRisk','segments','safety','path'];
  return fields.filter(f => String(oldR[f]) !== String(newR[f]));
}

const CARD_BG = 'rgba(26,45,74,.5)';
const GOLD    = '#D4AF37';

const STATUS_STYLES: Record<DiffStatus, { label: string; bg: string; color: string; border: string }> = {
  added:    { label:'新增', bg:'rgba(34,197,94,.12)',  color:'#22C55E', border:'rgba(34,197,94,.3)' },
  modified: { label:'修改', bg:'rgba(234,179,8,.12)',  color:'#EAB308', border:'rgba(234,179,8,.3)' },
  removed:  { label:'删除', bg:'rgba(239,68,68,.12)',  color:'#EF4444', border:'rgba(239,68,68,.3)' },
};

export default function SovereignRouteCompare() {
  const [downloading,    setDownloading]    = useState(false);
  const [comparing,      setComparing]      = useState(false);
  const [diffItems,      setDiffItems]      = useState<DiffItem[] | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [saveResult,     setSaveResult]     = useState<string | null>(null);
  const [currentRoutes,  setCurrentRoutes]  = useState<SovereignRoute[] | null>(null);

  // ── 下载当前数据 ──────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/admin/sovereign-routes-download');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `sovereign-routes-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('下载失败：' + e);
    } finally {
      setDownloading(false);
    }
  };

  // ── 上传新 Excel 并对比 ────────────────────────────────────────────────────
  const handleUploadAndCompare = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setComparing(true);
    setSaveResult(null);

    try {
      const XLSX   = await import('xlsx');
      const wb     = XLSX.read(await file.arrayBuffer());
      const ws     = wb.Sheets['路径汇总'];
      if (!ws) { alert('找不到"路径汇总"工作表，请确认文件格式正确'); setComparing(false); return; }

      const raw    = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      const newRoutes: SovereignRoute[] = raw.map(r => {
        const path = String(r['路径节点序列'] ?? '');
        return {
          id:         String(r['路径ID'] ?? ''),
          from:       String(r['甲方'] ?? ''),
          to:         String(r['乙方'] ?? ''),
          path,
          nodes:      path.split(' → '),
          cables:     String(r['各段保留海缆'] ?? ''),
          riskScores: String(r['各段风险评分'] ?? ''),
          maxRisk:    Number(r['路径最大单段风险'] ?? 0),
          avgRisk:    Number(r['路径平均单段风险'] ?? 0),
          segments:   Number(r['保留段数'] ?? 0),
          safety:     String(r['是否安全'] ?? ''),
        } as SovereignRoute;
      });

      // 读取当前数据（从 API）
      const curRes  = await fetch('/api/sovereign-network/routes');
      const curData = await curRes.json();
      const curRoutes: SovereignRoute[] = curData.routes ?? [];
      setCurrentRoutes(curRoutes);

      // 建立旧数据的 ID → route 索引
      const curMap  = new Map(curRoutes.map(r => [r.id, r]));
      const newMap  = new Map(newRoutes.map(r => [r.id, r]));

      const diffs: DiffItem[] = [];

      // 新增的路径
      for (const [id, newR] of newMap) {
        if (!curMap.has(id)) {
          diffs.push({ status: 'added', route: newR });
        }
      }

      // 修改的路径
      for (const [id, newR] of newMap) {
        const oldR = curMap.get(id);
        if (oldR) {
          const changed = getChangedFields(oldR, newR);
          if (changed.length > 0) {
            diffs.push({ status: 'modified', route: newR, oldRoute: oldR });
          }
        }
      }

      // 删除的路径
      for (const [id, oldR] of curMap) {
        if (!newMap.has(id)) {
          diffs.push({ status: 'removed', route: oldR });
        }
      }

      if (diffs.length === 0) {
        setSaveResult('✓ 数据完全一致，无需更新');
      } else {
        setDiffItems(diffs.map(d => ({ ...d, confirmed: false, skipped: false })));
      }
    } catch (err) {
      alert('解析失败：' + err);
    } finally {
      setComparing(false);
    }
  }, []);

  // ── 确认/跳过单条 ─────────────────────────────────────────────────────────
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

  // ── 一键全部确认 ──────────────────────────────────────────────────────────
  const confirmAll = () => {
    setDiffItems(prev => prev?.map(item => ({
      ...item,
      confirmed: item.status !== 'removed', // 删除操作默认不全选（危险操作）
      skipped:   false,
    })) ?? null);
  };

  // ── 提交确认的变更 ─────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!diffItems || !currentRoutes) return;
    setSaving(true);

    // 构建最终路径列表：从当前数据出发，应用确认的变更
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
      const res = await fetch('/api/admin/sovereign-routes-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: finalRoutes }),
      });
      const data = await res.json();
      if (data.success) {
        const confirmedCount = diffItems.filter(i => i.confirmed).length;
        setSaveResult(`✓ 已确认 ${confirmedCount} 条变更，共 ${finalRoutes.length} 条路径已保存到 Redis。页面刷新即生效。`);
        setDiffItems(null);
      } else {
        setSaveResult(`✗ 保存失败：${data.error}`);
      }
    } catch (err) {
      setSaveResult(`✗ 网络错误：${err}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmedCount = diffItems?.filter(i => i.confirmed).length ?? 0;
  const pendingCount   = diffItems?.filter(i => !i.confirmed && !i.skipped).length ?? 0;

  return (
    <div style={{ background: CARD_BG, border: `1px solid rgba(212,175,55,.15)`, borderRadius: 14, backdropFilter: 'blur(12px)', padding: '20px 24px', marginBottom: 20 }}>

      {/* 标题 */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: `${GOLD}80`, marginBottom: 8 }}>
        主权路径数据更新
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F0E6C8', margin: '0 0 8px', fontFamily: "'Playfair Display',serif" }}>
        下载 → 编辑 → 上传对比 → 逐条确认
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 16, lineHeight: 1.6 }}>
        先下载当前数据（格式与原始 Excel 完全一致），在表格里修改打分或新增路径，再上传——系统会自动找出差异，让你逐条确认是否采纳。确认的条目保存到 Redis（365天），受 MANUALLY_ADDED 保护，nightly-sync 不会覆盖。
      </p>

      {/* 第一步：下载 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center', marginBottom: 14 }}>
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{ padding: '8px 18px', borderRadius: 8, cursor: downloading ? 'not-allowed' : 'pointer',
            background: 'rgba(212,175,55,.1)', border: `1px solid ${GOLD}30`, color: GOLD,
            fontSize: 13, fontWeight: 500, opacity: downloading ? 0.6 : 1 }}>
          {downloading ? '⏳ 生成中…' : '⬇ 下载当前路径数据'}
        </button>

        {/* 第二步：上传对比 */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px',
          background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)',
          borderRadius: 8, cursor: comparing ? 'not-allowed' : 'pointer',
          color: '#60A5FA', fontSize: 13, fontWeight: 500,
          opacity: comparing ? 0.6 : 1 }}>
          {comparing ? '⏳ 对比中…' : '⬆ 上传新版并对比差异'}
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={handleUploadAndCompare} disabled={comparing} />
        </label>
      </div>

      {/* 保存结果提示 */}
      {saveResult && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, fontSize: 12,
          background: saveResult.startsWith('✓') ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
          color: saveResult.startsWith('✓') ? '#22C55E' : '#f87171',
          border: `1px solid ${saveResult.startsWith('✓') ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
          {saveResult}
        </div>
      )}

      {/* 差异列表 */}
      {diffItems && diffItems.length > 0 && (
        <div>
          {/* 汇总栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              共发现 <strong style={{ color: '#F0E6C8' }}>{diffItems.length}</strong> 处差异 ·
              已确认 <strong style={{ color: '#22C55E' }}>{confirmedCount}</strong> ·
              待处理 <strong style={{ color: '#EAB308' }}>{pendingCount}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmAll}
                style={{ padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)', color: '#22C55E' }}>
                全部确认（不含删除）
              </button>
              <button onClick={handleSubmit} disabled={saving || confirmedCount === 0}
                style={{ padding: '5px 14px', borderRadius: 6, cursor: confirmedCount === 0 ? 'not-allowed' : 'pointer',
                  fontSize: 11, fontWeight: 600, background: confirmedCount > 0 ? `${GOLD}20` : 'rgba(255,255,255,.05)',
                  border: `1px solid ${confirmedCount > 0 ? `${GOLD}40` : 'rgba(255,255,255,.1)'}`,
                  color: confirmedCount > 0 ? GOLD : '#6B7280',
                  opacity: saving ? 0.6 : 1 }}>
                {saving ? '⏳ 保存中…' : `提交 ${confirmedCount} 条确认`}
              </button>
            </div>
          </div>

          {/* 差异卡片列表（最多显示 50 条，超出折叠） */}
          <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {diffItems.slice(0, 50).map((item, idx) => {
              const st = STATUS_STYLES[item.status];
              const isConfirmed = !!item.confirmed;
              const isSkipped   = !!item.skipped;
              return (
                <div key={idx} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: isConfirmed ? 'rgba(34,197,94,.06)' : isSkipped ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.03)',
                  border: `1px solid ${isConfirmed ? 'rgba(34,197,94,.2)' : isSkipped ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.07)'}`,
                  opacity: isSkipped ? 0.45 : 1,
                  transition: 'all .15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      {/* 状态 badge + 路径 ID */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                          background: st.bg, color: st.color, border: `1px solid ${st.border}`, flexShrink: 0 }}>
                          {st.label}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.route.from} → {item.route.to}
                        </span>
                      </div>

                      {/* 路径节点 */}
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'monospace', marginBottom: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.route.path}
                      </div>

                      {/* 修改时显示哪些字段变了 */}
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
                                →
                                <span style={{ marginLeft: 3 }}>
                                  {String((item.route as unknown as Record<string,unknown>)[field])}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* 新增时显示关键信息 */}
                      {item.status === 'added' && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                          {item.route.safety} · 最大风险 {item.route.maxRisk} · {item.route.segments} 段
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    {!isSkipped && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleItem(idx, 'confirm')}
                          style={{ padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                            background: isConfirmed ? 'rgba(34,197,94,.2)' : 'rgba(34,197,94,.08)',
                            border: `1px solid ${isConfirmed ? 'rgba(34,197,94,.4)' : 'rgba(34,197,94,.2)'}`,
                            color: '#22C55E' }}>
                          {isConfirmed ? '✓ 已确认' : '确认'}
                        </button>
                        <button onClick={() => toggleItem(idx, 'skip')}
                          style={{ padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', color: '#6B7280' }}>
                          跳过
                        </button>
                      </div>
                    )}
                    {isSkipped && (
                      <button onClick={() => toggleItem(idx, 'skip')}
                        style={{ padding: '4px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                          background: 'none', border: '1px solid rgba(255,255,255,.08)', color: '#4B5563' }}>
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

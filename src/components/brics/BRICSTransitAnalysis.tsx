'use client';
// src/components/brics/BRICSTransitAnalysis.tsx
//
// BRICS 中转路径主权分析表
//
// 产品设计逻辑：
// 用一个 11×11 热力矩阵作为导航入口，每格颜色代表该国家对
// 的"最优可达路径"的主权等级。点击格子展开路径详情。
// 路径详情以"通道卡片"形式展示，每张卡片是一条完整路径，
// 从左到右显示每段的海缆和主权状态。
// 最弱链条原则：一条路上有任何一段是西方主导，整条路亮红色。

import { useEffect, useState, useMemo } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

// ── 类型定义 ─────────────────────────────────────────────────────
type SovereigntyLevel = 'sovereign' | 'partial' | 'dependent' | 'unknown';

interface SovereigntyResult {
  level: SovereigntyLevel;
  score: number;
  label_zh: string; label_en: string;
  reason_zh: string; reason_en: string;
}

interface CableDetail {
  slug: string; name: string; status: string;
  lengthKm: number | null; rfsYear: number | null;
  vendor: string | null; operators: string[];
  sovereignty: SovereigntyResult;
}

interface PathSegment {
  from: string; to: string;
  fromName: string; fromNameZh: string;
  toName: string; toNameZh: string;
  cables: CableDetail[];
  bestCableSovereignty: SovereigntyResult;
}

interface TransitPath {
  hopCount: number;
  transitCountries: { code: string; name: string; nameZh: string; isBRICS: boolean }[];
  allTransitBRICS: boolean;
  segments: PathSegment[];
  pathSovereignty: SovereigntyResult;
  pathSovereigntyScore: number;
}

interface PairResult {
  from: string; to: string;
  fromName: string; fromNameZh: string;
  toName: string; toNameZh: string;
  fromTier: string; toTier: string;
  isLandlocked: boolean;
  paths: TransitPath[];
  bestPath: TransitPath | null;
  hasSovereignPath: boolean;
  directConnected: boolean;
}

interface ApiResponse {
  pairs: PairResult[];
  members: { code: string; name: string; nameZh: string }[];
  summary: {
    totalPairs: number; directConnected: number;
    hasSovereignPath: number; noSovereignPath: number; landlocked: number;
  };
}

// ── 颜色系统 ─────────────────────────────────────────────────────
const SOV_COLORS: Record<SovereigntyLevel, {
  bg: string; text: string; border: string; dot: string; cell: string;
}> = {
  sovereign: { bg: 'rgba(34,197,94,0.12)', text: '#22C55E', border: 'rgba(34,197,94,0.35)', dot: '#22C55E', cell: 'rgba(34,197,94,0.25)' },
  partial:   { bg: 'rgba(234,179,8,0.12)', text: '#EAB308', border: 'rgba(234,179,8,0.35)',  dot: '#EAB308', cell: 'rgba(234,179,8,0.20)'  },
  dependent: { bg: 'rgba(239,68,68,0.12)', text: '#EF4444', border: 'rgba(239,68,68,0.35)',  dot: '#EF4444', cell: 'rgba(239,68,68,0.20)'  },
  unknown:   { bg: 'rgba(107,114,128,0.08)', text: '#6B7280', border: 'rgba(107,114,128,0.25)', dot: '#6B7280', cell: 'rgba(107,114,128,0.12)' },
};

const SOV_LABELS_ZH: Record<SovereigntyLevel, string> = {
  sovereign: '主权安全', partial: '混合依赖', dependent: '西方主导', unknown: '待分析',
};
const SOV_LABELS_EN: Record<SovereigntyLevel, string> = {
  sovereign: 'Sovereign', partial: 'Partial', dependent: 'Dependent', unknown: 'Unknown',
};

// ── 子组件：主权徽章 ─────────────────────────────────────────────
function SovBadge({ level, isZh, size = 'sm' }: { level: SovereigntyLevel; isZh: boolean; size?: 'sm' | 'lg' }) {
  const col = SOV_COLORS[level];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'lg' ? '4px 10px' : '2px 7px',
      borderRadius: 10,
      backgroundColor: col.bg, border: `1px solid ${col.border}`,
      fontSize: size === 'lg' ? 12 : 10, fontWeight: 600, color: col.text,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: size === 'lg' ? 6 : 5, height: size === 'lg' ? 6 : 5, borderRadius: '50%', backgroundColor: col.dot }} />
      {isZh ? SOV_LABELS_ZH[level] : SOV_LABELS_EN[level]}
    </span>
  );
}

// ── 子组件：路径可视化卡片 ───────────────────────────────────────
// 把一条路径渲染成水平的"链条"图：国家 ──[海缆名]──→ 国家
function PathCard({
  path, isZh, defaultExpanded = false,
}: {
  path: TransitPath; isZh: boolean; defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const col = SOV_COLORS[path.pathSovereignty.level];

  const hopLabel = path.hopCount === 1
    ? (isZh ? '直连' : 'Direct')
    : isZh ? `${path.hopCount - 1}段中转` : `${path.hopCount - 1} transit`;

  return (
    <div style={{
      border: `1px solid ${col.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: col.bg,
      marginBottom: 8,
    }}>
      {/* 路径摘要行（可点击折叠） */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          flexWrap: 'wrap',
        }}
      >
        {/* 路径类型标签 */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
          backgroundColor: 'rgba(255,255,255,0.08)', color: '#9CA3AF',
          flexShrink: 0,
        }}>{hopLabel}</span>

        {/* 路径节点序列（水平展示） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {path.segments.map((seg, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* 起点（只在第一段显示） */}
              {idx === 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F0E6C8' }}>
                  {isZh ? seg.fromNameZh : seg.fromName}
                </span>
              )}
              {/* 段：箭头 + 最优海缆名 + 主权颜色 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ color: SOV_COLORS[seg.bestCableSovereignty.level].dot, fontSize: 14 }}>──</span>
                <span style={{
                  fontSize: 10, color: SOV_COLORS[seg.bestCableSovereignty.level].text,
                  maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {seg.cables[0]?.name ?? (isZh ? '无数据' : 'No data')}
                </span>
                <span style={{ color: SOV_COLORS[seg.bestCableSovereignty.level].dot, fontSize: 14 }}>──▶</span>
              </div>
              {/* 终点（中转国或最终目的地） */}
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: seg.to === path.segments[path.segments.length - 1].to
                  ? '#F0E6C8'
                  : path.transitCountries.find(t => t.code === seg.to)?.isBRICS
                    ? C.goldLight : '#F87171', // 非BRICS中转用红色提示
              }}>
                {isZh ? seg.toNameZh : seg.toName}
              </span>
            </div>
          ))}
        </div>

        {/* 右侧：主权评级 + 折叠箭头 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <SovBadge level={path.pathSovereignty.level} isZh={isZh} />
          <span style={{ fontSize: 12, color: '#4B5563' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* 展开详情：每段的完整信息 */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${col.border}`,
          padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* 中转节点主权提示 */}
          {path.transitCountries.length > 0 && (
            <div style={{
              fontSize: 11, padding: '6px 10px', borderRadius: 6,
              backgroundColor: path.allTransitBRICS
                ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: path.allTransitBRICS ? '#22C55E' : '#EF4444',
              border: `1px solid ${path.allTransitBRICS ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {path.allTransitBRICS
                ? (isZh ? '✓ 所有中转节点均为金砖国家，物理基础设施主权可控' : '✓ All transit nodes are BRICS countries — physical infrastructure is sovereign')
                : (isZh
                    ? `⚠ 中转经过非金砖国家：${path.transitCountries.filter(t => !t.isBRICS).map(t => isZh ? t.nameZh : t.name).join('、')}，存在被监听风险`
                    : `⚠ Non-BRICS transit through: ${path.transitCountries.filter(t => !t.isBRICS).map(t => t.name).join(', ')} — interception risk`
                  )
              }
            </div>
          )}

          {/* 每段详情 */}
          {path.segments.map((seg, idx) => (
            <div key={idx}>
              {/* 段标题 */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {isZh
                  ? `第 ${idx + 1} 段：${seg.fromNameZh} → ${seg.toNameZh}`
                  : `Segment ${idx + 1}: ${seg.fromName} → ${seg.toName}`}
                <span style={{ marginLeft: 8, textTransform: 'none', fontWeight: 400, color: '#4B5563' }}>
                  ({seg.cables.length} {isZh ? '条可用海缆' : 'available cables'})
                </span>
              </div>

              {/* 该段的可用海缆列表 */}
              {seg.cables.length === 0 ? (
                <div style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic' }}>
                  {isZh ? '无海缆数据' : 'No cable data available'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {seg.cables.map((cable, ci) => {
                    const cc = SOV_COLORS[cable.sovereignty.level];
                    return (
                      <div key={cable.slug} style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 90px 1.2fr 1.4fr 110px',
                        alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 7,
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${cc.border}20`,
                        // 最优海缆（第一条）有轻微强调
                        outline: ci === 0 ? `1px solid ${cc.border}` : 'none',
                      }}>
                        {/* 海缆名称 */}
                        <div>
                          <a href={`/?cable=${cable.slug}`}
                            style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0', textDecoration: 'none' }}
                            onMouseOver={e => (e.currentTarget.style.color = C.goldLight)}
                            onMouseOut={e => (e.currentTarget.style.color = '#E2E8F0')}>
                            {cable.name}
                          </a>
                          {ci === 0 && (
                            <span style={{ marginLeft: 6, fontSize: 9, color: C.gold, fontWeight: 700 }}>
                              {isZh ? '最优' : 'BEST'}
                            </span>
                          )}
                          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2 }}>
                            {cable.status.replace(/_/g, ' ')}
                            {cable.lengthKm ? ` · ${cable.lengthKm.toLocaleString()} km` : ''}
                            {cable.rfsYear ? ` · ${cable.rfsYear}` : ''}
                          </div>
                        </div>
                        {/* 主权评分 */}
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: cc.text, lineHeight: 1 }}>
                            {cable.sovereignty.score}
                          </div>
                          <div style={{ fontSize: 9, color: '#4B5563', marginTop: 2 }}>
                            {isZh ? '主权分' : 'score'}
                          </div>
                        </div>
                        {/* 建造商 */}
                        <div>
                          <div style={{ fontSize: 9, color: '#4B5563', marginBottom: 2 }}>
                            {isZh ? '建造商' : 'Vendor'}
                          </div>
                          <div style={{ fontSize: 11, color: '#D1D5DB' }}>
                            {cable.vendor || '—'}
                          </div>
                        </div>
                        {/* 运营商 */}
                        <div>
                          <div style={{ fontSize: 9, color: '#4B5563', marginBottom: 2 }}>
                            {isZh ? '运营商' : 'Operators'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {cable.operators.slice(0, 2).map(op => (
                              <span key={op} style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                                backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F',
                                border: '1px solid rgba(42,157,143,0.15)',
                              }}>{op}</span>
                            ))}
                            {cable.operators.length > 2 && (
                              <span style={{ fontSize: 9, color: '#6B7280' }}>+{cable.operators.length - 2}</span>
                            )}
                            {cable.operators.length === 0 && <span style={{ fontSize: 9, color: '#4B5563' }}>—</span>}
                          </div>
                        </div>
                        {/* 主权评级 */}
                        <div>
                          <SovBadge level={cable.sovereignty.level} isZh={isZh} />
                          <div style={{ fontSize: 9, color: '#4B5563', marginTop: 3, lineHeight: 1.4 }}>
                            {isZh ? cable.sovereignty.reason_zh : cable.sovereignty.reason_en}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 子组件：热力矩阵单元格 ───────────────────────────────────────
function MatrixCell({
  pair, isSelected, onClick, showCode,
}: {
  pair: PairResult | null; isSelected: boolean; onClick: () => void; showCode: string;
}) {
  if (!pair) {
    // 对角线或无效格子
    return (
      <div style={{
        width: 36, height: 36, borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
      }} />
    );
  }

  if (pair.isLandlocked) {
    return (
      <div title={`${pair.fromName} ↔ ${pair.toName}: Landlocked`}
        style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, color: '#374151' }}>—</span>
      </div>
    );
  }

  const level = pair.bestPath?.pathSovereignty.level ?? 'unknown';
  const col = SOV_COLORS[level];
  const directDot = pair.directConnected;

  return (
    <div
      onClick={onClick}
      title={`${pair.fromName} ↔ ${pair.toName}\n${pair.paths.length} paths | Best: ${SOV_LABELS_EN[level]}`}
      style={{
        width: 36, height: 36, borderRadius: 4, cursor: 'pointer',
        backgroundColor: isSelected ? col.cell : `${col.cell}80`,
        border: `1px solid ${isSelected ? col.dot : col.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', transition: 'all 0.15s',
        transform: isSelected ? 'scale(1.15)' : 'scale(1)',
        boxShadow: isSelected ? `0 0 12px ${col.dot}50` : 'none',
      }}
      onMouseOver={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
      onMouseOut={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
    >
      {/* 跳数数字 */}
      <span style={{ fontSize: 11, fontWeight: 700, color: col.text }}>
        {pair.paths.length}
      </span>
      {/* 直连小点 */}
      {directDot && (
        <span style={{
          position: 'absolute', top: 3, right: 3,
          width: 5, height: 5, borderRadius: '50%', backgroundColor: col.dot,
        }} />
      )}
    </div>
  );
}

// ── CSV 导出 ─────────────────────────────────────────────────────
function exportTransitCSV(pairs: PairResult[], isZh: boolean) {
  // 完整展开：每条路径 × 每段 × 每条候选海缆 = 独立一行
  // 分析师可在 Excel 里按任意维度透视
  const headers = isZh
    ? ['甲方代码','甲方','乙方代码','乙方','路径类型','路径节点序列',
       '中转国是否全为金砖','路径整体主权','路径主权分',
       '段序号','本段起点','本段终点',
       '海缆名称','海缆状态','长度(km)','RFS年份',
       '建造商','运营商','本段主权','本段主权分','本段主权说明',
       '是否为该段最优海缆']
    : ['From Code','From','To Code','To','Path Type','Path Nodes',
       'All Transit BRICS','Path Sovereignty','Path Score',
       'Seg#','Seg From','Seg To',
       'Cable Name','Cable Status','Length(km)','RFS Year',
       'Vendor','Operators','Seg Sovereignty','Seg Score','Sov Reason',
       'Is Best Cable'];

  const rows: string[][] = [headers];

  for (const pair of pairs) {
    if (pair.isLandlocked || pair.paths.length === 0) continue;

    for (const path of pair.paths) {
      // 路径类型：直连 / 1段中转 / 2段中转
      const pathType = path.hopCount === 1
        ? (isZh ? '直连' : 'Direct')
        : isZh ? `${path.hopCount - 1}段中转` : `${path.hopCount - 1}-hop transit`;

      // ✅ 路径节点序列：起点 → [中转国] → 终点（包含起点）
      const nodeSeq = [
        isZh ? pair.fromNameZh : pair.fromName,
        ...path.transitCountries.map(t => isZh ? t.nameZh : t.name),
        isZh ? pair.toNameZh : pair.toName,
      ].join(' → ');

      for (let si = 0; si < path.segments.length; si++) {
        const seg = path.segments[si];

        if (seg.cables.length === 0) {
          // 该段无海缆数据，输出占位行，让分析师知道这段数据缺失
          rows.push([
            pair.from, isZh ? pair.fromNameZh : pair.fromName,
            pair.to,   isZh ? pair.toNameZh   : pair.toName,
            pathType, nodeSeq,
            path.allTransitBRICS ? 'Y' : 'N',
            isZh ? path.pathSovereignty.label_zh : path.pathSovereignty.label_en,
            path.pathSovereigntyScore.toString(),
            (si + 1).toString(),
            isZh ? seg.fromNameZh : seg.fromName,
            isZh ? seg.toNameZh   : seg.toName,
            isZh ? '无海缆数据' : 'No cable data',
            '', '', '', '', '',
            isZh ? seg.bestCableSovereignty.label_zh : seg.bestCableSovereignty.label_en,
            seg.bestCableSovereignty.score.toString(),
            isZh ? seg.bestCableSovereignty.reason_zh : seg.bestCableSovereignty.reason_en,
            '',
          ]);
          continue;
        }

        // ✅ 展开该段所有候选海缆，第一条标记"最优"
        for (let ci = 0; ci < seg.cables.length; ci++) {
          const cable = seg.cables[ci];
          rows.push([
            pair.from, isZh ? pair.fromNameZh : pair.fromName,
            pair.to,   isZh ? pair.toNameZh   : pair.toName,
            pathType, nodeSeq,
            path.allTransitBRICS ? 'Y' : 'N',
            isZh ? path.pathSovereignty.label_zh : path.pathSovereignty.label_en,
            path.pathSovereigntyScore.toString(),
            (si + 1).toString(),
            isZh ? seg.fromNameZh : seg.fromName,
            isZh ? seg.toNameZh   : seg.toName,
            cable.name,
            cable.status.replace(/_/g, ' '),
            cable.lengthKm?.toString() ?? '',
            cable.rfsYear?.toString() ?? '',
            cable.vendor ?? '',
            cable.operators.join(' | '),
            isZh ? cable.sovereignty.label_zh : cable.sovereignty.label_en,
            cable.sovereignty.score.toString(),
            isZh ? cable.sovereignty.reason_zh : cable.sovereignty.reason_en,
            ci === 0 ? 'Y' : 'N',
          ]);
        }
      }
    }
  }

  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deep-blue-brics-transit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}




// ── 主组件 ───────────────────────────────────────────────────────
export default function BRICSTransitAnalysis() {
  const { tb, isZh } = useBRICS();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
  const [pathFilter, setPathFilter] = useState<SovereigntyLevel | 'all'>('all');

  useEffect(() => {
    fetch('/api/brics/transit-analysis')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(isZh ? '数据加载失败' : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  // 构建 pair map 便于快速查找
  const pairMap = useMemo(() => {
    if (!data) return new Map<string, PairResult>();
    const m = new Map<string, PairResult>();
    for (const pair of data.pairs) {
      m.set(`${pair.from}|${pair.to}`, pair);
      m.set(`${pair.to}|${pair.from}`, pair); // 双向
    }
    return m;
  }, [data]);

  const selectedPair = selectedPairKey ? pairMap.get(selectedPairKey) ?? null : null;

  // 过滤当前选中对的路径
  const filteredPaths = useMemo(() => {
    if (!selectedPair) return [];
    return selectedPair.paths.filter(p =>
      pathFilter === 'all' || p.pathSovereignty.level === pathFilter
    );
  }, [selectedPair, pathFilter]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(212,175,55,0.2)', borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {isZh ? '正在计算金砖国家中转路径主权评估（可能需要5-10秒）...' : 'Computing BRICS transit path sovereignty (may take 5-10s)...'}
    </div>
  );

  if (error) return <div style={{ padding: 20, color: '#EF4444', textAlign: 'center' }}>{error}</div>;
  if (!data) return null;

  const { summary, members } = data;

  return (
    <div>
      {/* ── 功能说明 ─────────────────────────────────────────── */}
      <div style={{
        backgroundColor: 'rgba(26,45,74,0.3)', border: `1px solid ${C.gold}10`,
        borderRadius: 10, padding: '12px 16px', marginBottom: 20,
        fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8,
      }}>
        {isZh
          ? `本分析枚举了 11 个金砖成员国之间所有"两段中转以内"的通信路径，对每段所用海缆进行主权评级，并取最弱链条作为整条路径的主权等级。热力矩阵每格的数字代表该国家对的可用路径总数，右上角小点代表存在直连。点击任意格子查看详细路径分析。`
          : `This analysis enumerates all communication paths between the 11 BRICS members with up to 2 transit hops. Each cable segment is sovereignty-rated, and the weakest link determines the overall path rating. The number in each cell shows total available paths; the dot indicates a direct connection. Click any cell to explore paths.`
        }
      </div>

      {/* ── 汇总统计卡片 ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: isZh ? '分析国家对' : 'Pairs Analyzed', value: summary.totalPairs, color: C.gold },
          { label: isZh ? '存在直连' : 'Direct Connection', value: summary.directConnected, color: '#22C55E' },
          { label: isZh ? '有主权安全路径' : 'Has Sovereign Path', value: summary.hasSovereignPath, color: '#22C55E' },
          { label: isZh ? '无主权安全路径' : 'No Sovereign Path', value: summary.noSovereignPath, color: '#EF4444' },
          { label: isZh ? '内陆国（跳过）' : 'Landlocked (skip)', value: summary.landlocked, color: '#6B7280' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            backgroundColor: 'rgba(26,45,74,0.5)', border: `1px solid ${C.gold}15`,
            borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 图例 ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#4B5563', fontWeight: 600 }}>
          {isZh ? '最优路径主权：' : 'Best path sovereignty:'}
        </span>
        {(['sovereign', 'partial', 'dependent', 'unknown'] as SovereigntyLevel[]).map(lv => (
          <div key={lv} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: SOV_COLORS[lv].cell, border: `1px solid ${SOV_COLORS[lv].border}` }} />
            <span style={{ fontSize: 11, color: SOV_COLORS[lv].text }}>
              {isZh ? SOV_LABELS_ZH[lv] : SOV_LABELS_EN[lv]}
            </span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: '#4B5563' }}>
          {isZh ? '· 格内数字=路径总数 · 右上点=有直连' : '· Number=path count · Dot=direct'}
        </span>
      </div>

      {/* ── 热力矩阵 + 右侧详情（左右布局） ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedPair ? '420px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

        {/* 左：热力矩阵 */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'inline-block', minWidth: 500 }}>
            {/* 列标题（国家代码） */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 3, paddingLeft: 82 }}>
              {members.map(m => (
                <div key={m.code} style={{
                  width: 36,
                  height: 72,           // 给竖排文字足够高度
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  paddingBottom: 4,
                }}>
                  <span style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)', // 让文字从下往上读
                    fontSize: 9, fontWeight: 700,
                    color: '#9CA3AF',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>
                    {isZh ? m.nameZh : m.code}
                  </span>
                </div>
              ))}
            </div>

            {/* 行：每个成员国 */}
            {members.map(rowMember => (
              <div key={rowMember.code} style={{ display: 'flex', gap: 3, marginBottom: 3, alignItems: 'center' }}>
                {/* 行标题 */}
                <div style={{
                  width: 76, fontSize: 9, fontWeight: 700, color: '#6B7280',
                  textAlign: 'right', paddingRight: 6,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  letterSpacing: '0.04em',
                }}>
                  {isZh ? rowMember.nameZh.slice(0, 4) : rowMember.code}
                </div>

                {/* 每列的单元格 */}
                {members.map(colMember => {
                  if (rowMember.code === colMember.code) {
                    // 对角线：显示国家名缩写
                    return (
                      <div key={colMember.code} style={{
                        width: 36, height: 36, borderRadius: 4,
                        backgroundColor: `${C.gold}08`,
                        border: `1px solid ${C.gold}15`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: C.gold }}>{colMember.code}</span>
                      </div>
                    );
                  }
                  const pairKey = `${rowMember.code}|${colMember.code}`;
                  const pair = pairMap.get(pairKey) ?? null;
                  const isSelected = selectedPairKey === pairKey || selectedPairKey === `${colMember.code}|${rowMember.code}`;
                  return (
                    <MatrixCell
                      key={colMember.code}
                      pair={pair}
                      isSelected={isSelected}
                      showCode={colMember.code}
                      onClick={() => {
                        const key = pair ? `${pair.from}|${pair.to}` : pairKey;
                        setSelectedPairKey(isSelected ? null : key);
                        setPathFilter('all');
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 右：选中国家对的路径详情 */}
        {selectedPair && (
          <div style={{
            backgroundColor: 'rgba(10,18,36,0.7)', borderRadius: 12,
            border: `1px solid ${C.gold}15`, padding: 16, minHeight: 400,
          }}>
            {/* 详情标题 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#F0E6C8', marginBottom: 4 }}>
                {isZh ? selectedPair.fromNameZh : selectedPair.fromName}
                <span style={{ margin: '0 8px', color: '#4B5563' }}>↔</span>
                {isZh ? selectedPair.toNameZh : selectedPair.toName}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>
                  {selectedPair.paths.length} {isZh ? '条可达路径' : 'reachable paths'}
                </span>
                {selectedPair.directConnected && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
                    {isZh ? '✓ 有直连' : '✓ Direct'}
                  </span>
                )}
                {selectedPair.hasSovereignPath && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
                    {isZh ? '✓ 存在主权安全路径' : '✓ Sovereign path exists'}
                  </span>
                )}
                {!selectedPair.hasSovereignPath && !selectedPair.isLandlocked && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                    {isZh ? '⚠ 无主权安全路径' : '⚠ No sovereign path'}
                  </span>
                )}
              </div>
            </div>

            {/* 路径过滤 + 导出 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['all', 'sovereign', 'partial', 'dependent'] as const).map(lv => {
                  const count = lv === 'all'
                    ? selectedPair.paths.length
                    : selectedPair.paths.filter(p => p.pathSovereignty.level === lv).length;
                  const col = lv === 'all' ? '#6B7280' : SOV_COLORS[lv].text;
                  return (
                    <button key={lv} onClick={() => setPathFilter(lv)}
                      style={{
                        padding: '4px 10px', borderRadius: 14, fontSize: 10, cursor: 'pointer',
                        fontWeight: 500,
                        border: `1px solid ${pathFilter === lv ? col : 'rgba(255,255,255,0.1)'}`,
                        backgroundColor: pathFilter === lv ? `${col}15` : 'transparent',
                        color: pathFilter === lv ? col : '#6B7280',
                      }}>
                      {lv === 'all' ? (isZh ? '全部' : 'All') : (isZh ? SOV_LABELS_ZH[lv] : SOV_LABELS_EN[lv])}
                      {count > 0 && ` (${count})`}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => exportTransitCSV(data.pairs, isZh)}
                style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, cursor: 'pointer', fontWeight: 600, border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}08`, color: C.gold }}>
                ⬇ {isZh ? '导出全部CSV' : 'Export All CSV'}
              </button>
            </div>

            {/* 路径卡片列表 */}
            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {filteredPaths.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                  {isZh ? '无符合条件的路径' : 'No paths match the filter'}
                </div>
              ) : filteredPaths.map((path, idx) => (
                <PathCard
                  key={idx}
                  path={path}
                  isZh={isZh}
                  defaultExpanded={idx === 0} // 默认展开最优路径
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 无选中时的提示 */}
      {!selectedPair && (
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#374151' }}>
          {isZh ? '↑ 点击上方矩阵中的任意格子，查看该国家对的完整中转路径主权分析' : '↑ Click any cell in the matrix above to view full transit path sovereignty analysis for that country pair'}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.15)', lineHeight: 1.6 }}>
        {isZh
          ? '路径枚举范围：最多2段中转（3跳），每对最多20条路径。主权评级基于建造商和运营商国籍，仅供参考。数据来源：TeleGeography · Deep Blue'
          : 'Path enumeration: up to 2 transits (3 hops), max 20 paths per pair. Sovereignty ratings based on vendor/operator nationality, for reference only. Source: TeleGeography · Deep Blue'}
      </div>
    </div>
  );
}

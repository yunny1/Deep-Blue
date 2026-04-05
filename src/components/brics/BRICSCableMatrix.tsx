'use client';
// src/components/brics/BRICSCableMatrix.tsx
// BRICS 海缆主权分析表
// 展示每对金砖国家之间的直连海缆、建造商、运营商、主权评级
// 这是 Deep Blue 的核心分析工具，帮助分析师识别战略依赖风险

import { useEffect, useState, useMemo } from 'react';
import { useBRICS } from '@/lib/brics-i18n';
import { BRICS_COLORS as C } from '@/lib/brics-constants';

// ── 类型定义 ─────────────────────────────────────────────────────
type SovereigntyLevel = 'sovereign' | 'partial' | 'dependent' | 'unknown';

interface CableDetail {
  slug: string;
  name: string;
  status: string;
  lengthKm: number | null;
  rfsYear: number | null;
  vendor: string | null;
  operators: string[];
  sovereignty: {
    level: SovereigntyLevel;
    label_zh: string;
    label_en: string;
    score: number;
    reason_zh: string;
    reason_en: string;
  };
}

interface CountryPair {
  from: string; to: string;
  fromName: string; fromNameZh: string;
  toName: string; toNameZh: string;
  fromTier: 'member' | 'partner';
  toTier: 'member' | 'partner';
  cables: CableDetail[];
  avgSovereigntyScore: number;
  dominantSovereignty: SovereigntyLevel;
}

interface MatrixData {
  pairs: CountryPair[];
  summary: {
    totalPairs: number;
    memberPairs: number;
    sovereignty: { sovereign: number; partial: number; dependent: number; unknown: number };
    totalCables: number;
  };
}

// ── 颜色常量（主权等级对应颜色） ────────────────────────────────────
const SOV_COLORS: Record<SovereigntyLevel, { bg: string; text: string; border: string; dot: string }> = {
  sovereign:  { bg: 'rgba(34,197,94,0.1)',  text: '#22C55E', border: 'rgba(34,197,94,0.3)',  dot: '#22C55E' },
  partial:    { bg: 'rgba(234,179,8,0.1)',  text: '#EAB308', border: 'rgba(234,179,8,0.3)',  dot: '#EAB308' },
  dependent:  { bg: 'rgba(239,68,68,0.1)',  text: '#EF4444', border: 'rgba(239,68,68,0.3)',  dot: '#EF4444' },
  unknown:    { bg: 'rgba(107,114,128,0.1)', text: '#6B7280', border: 'rgba(107,114,128,0.3)', dot: '#6B7280' },
};

const STATUS_COLORS: Record<string, string> = {
  IN_SERVICE: '#22C55E', UNDER_CONSTRUCTION: '#3B82F6',
  PLANNED: '#F59E0B', DECOMMISSIONED: '#6B7280',
};

// ── CSV 导出 ─────────────────────────────────────────────────────
function exportToCSV(pairs: CountryPair[], isZh: boolean) {
  const headers = isZh
    ? ['甲方代码','甲方','乙方代码','乙方','甲方身份','乙方身份','海缆名称','状态','长度(km)','RFS年份','建造商','运营商','主权评级','主权说明','评分(0-100)']
    : ['From Code','From Country','To Code','To Country','From Tier','To Tier','Cable Name','Status','Length(km)','RFS Year','Vendor/Builder','Operators','Sovereignty','Sovereignty Reason','Score(0-100)'];

  const rows: string[][] = [headers];

  for (const pair of pairs) {
    for (const cable of pair.cables) {
      rows.push([
        pair.from,
        isZh ? pair.fromNameZh : pair.fromName,
        pair.to,
        isZh ? pair.toNameZh : pair.toName,
        isZh ? (pair.fromTier === 'member' ? '成员国' : '伙伴国') : pair.fromTier,
        isZh ? (pair.toTier === 'member' ? '成员国' : '伙伴国') : pair.toTier,
        cable.name,
        cable.status,
        cable.lengthKm?.toString() || '',
        cable.rfsYear?.toString() || '',
        cable.vendor || '',
        cable.operators.join(' | '),
        isZh ? cable.sovereignty.label_zh : cable.sovereignty.label_en,
        isZh ? cable.sovereignty.reason_zh : cable.sovereignty.reason_en,
        cable.sovereignty.score.toString(),
      ]);
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
  a.download = `deep-blue-brics-cable-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 主权评分条 ───────────────────────────────────────────────────
function SovereigntyBar({ score, level }: { score: number; level: SovereigntyLevel }) {
  const col = SOV_COLORS[level];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div style={{ width: `${score}%`, height: '100%', borderRadius: 2, backgroundColor: col.dot, transition: 'width 0.8s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: col.text, minWidth: 26, textAlign: 'right', fontFeatureSettings: '"tnum"' }}>{score}</span>
    </div>
  );
}

// ── 主权徽章 ─────────────────────────────────────────────────────
function SovBadge({ level, label }: { level: SovereigntyLevel; label: string }) {
  const col = SOV_COLORS[level];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 10,
      backgroundColor: col.bg, border: `1px solid ${col.border}`, fontSize: 10, fontWeight: 600, color: col.text, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: col.dot }} />
      {label}
    </span>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────
export default function BRICSCableMatrix() {
  const { tb, isZh } = useBRICS();
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 过滤控制
  const [tierFilter, setTierFilter] = useState<'member-only' | 'all'>('member-only');
  const [sovFilter, setSovFilter] = useState<SovereigntyLevel | 'all'>('all');
  const [expandedPair, setExpandedPair] = useState<string | null>(null); // 展开某一行查看详情

  useEffect(() => {
    fetch('/api/brics/cable-matrix')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError(isZh ? '数据加载失败' : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  // 过滤后的国家对列表
  const filteredPairs = useMemo(() => {
    if (!data) return [];
    return data.pairs.filter(pair => {
      // 身份过滤
      if (tierFilter === 'member-only' && (pair.fromTier !== 'member' || pair.toTier !== 'member')) return false;
      // 主权等级过滤
      if (sovFilter !== 'all' && pair.dominantSovereignty !== sovFilter) return false;
      return true;
    });
  }, [data, tierFilter, sovFilter]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#6B7280' }}>
      <div style={{ width: 32, height: 32, border: '2px solid rgba(212,175,55,0.2)', borderTopColor: C.gold, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {isZh ? '正在分析海缆主权数据...' : 'Analyzing cable sovereignty data...'}
    </div>
  );

  if (error) return <div style={{ padding: 20, color: '#EF4444', textAlign: 'center' }}>{error}</div>;
  if (!data) return null;

  const { summary } = data;

  return (
    <div>
      {/* ── 汇总统计卡片 ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: isZh ? '国家对总数' : 'Total Pairs', value: summary.totalPairs, color: C.gold },
          { label: isZh ? '成员国对' : 'Member Pairs', value: summary.memberPairs, color: C.goldLight },
          { label: isZh ? '主权安全' : 'Sovereign', value: summary.sovereignty.sovereign, color: '#22C55E' },
          { label: isZh ? '混合依赖' : 'Partial', value: summary.sovereignty.partial, color: '#EAB308' },
          { label: isZh ? '西方主导' : 'Dependent', value: summary.sovereignty.dependent, color: '#EF4444' },
          { label: isZh ? '涉及海缆' : 'Total Cables', value: summary.totalCables, color: '#3B82F6' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ backgroundColor: 'rgba(26,45,74,0.5)', border: `1px solid ${C.gold}15`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── 过滤控制栏 ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* 国家身份过滤 */}
          {[
            { key: 'member-only', zh: '仅成员国对', en: 'Members Only' },
            { key: 'all', zh: '全部（含伙伴国）', en: 'All incl. Partners' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setTierFilter(opt.key as any)}
              style={{ padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', fontWeight: 500,
                border: `1px solid ${tierFilter === opt.key ? C.gold : 'rgba(255,255,255,0.1)'}`,
                backgroundColor: tierFilter === opt.key ? `${C.gold}15` : 'transparent',
                color: tierFilter === opt.key ? C.gold : '#6B7280',
              }}>
              {isZh ? opt.zh : opt.en}
            </button>
          ))}
          {/* 主权等级过滤 */}
          {(['all', 'sovereign', 'partial', 'dependent', 'unknown'] as const).map(lv => {
            const labels: Record<string, {zh: string; en: string}> = {
              all: {zh:'全部', en:'All'}, sovereign: {zh:'主权安全', en:'Sovereign'},
              partial: {zh:'混合依赖', en:'Partial'}, dependent: {zh:'西方主导', en:'Dependent'},
              unknown: {zh:'待分析', en:'Unknown'},
            };
            const col = lv === 'all' ? '#6B7280' : SOV_COLORS[lv].text;
            return (
              <button key={lv} onClick={() => setSovFilter(lv)}
                style={{ padding: '5px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', fontWeight: 500,
                  border: `1px solid ${sovFilter === lv ? col : 'rgba(255,255,255,0.1)'}`,
                  backgroundColor: sovFilter === lv ? `${col}20` : 'transparent',
                  color: sovFilter === lv ? col : '#6B7280',
                }}>
                {isZh ? labels[lv].zh : labels[lv].en}
              </button>
            );
          })}
        </div>

        {/* CSV 导出按钮 */}
        <button onClick={() => exportToCSV(filteredPairs, isZh)}
          style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600,
            border: `1px solid ${C.gold}30`, backgroundColor: `${C.gold}08`, color: C.gold,
          }}>
          ⬇ {isZh ? `导出 CSV（${filteredPairs.length} 对）` : `Export CSV (${filteredPairs.length} pairs)`}
        </button>
      </div>

      {/* ── 主数据表格 ───────────────────────────────────────── */}
      <div style={{ backgroundColor: 'rgba(13,22,40,0.6)', borderRadius: 12, border: `1px solid ${C.gold}10`, overflow: 'hidden' }}>

        {/* 表头 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.8fr 60px 120px 1fr', padding: '10px 16px',
          backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.gold}08`,
          fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <div>{isZh ? '甲方国家' : 'Country A'}</div>
          <div>{isZh ? '乙方国家' : 'Country B'}</div>
          <div style={{ textAlign: 'center' }}>{isZh ? '海缆数' : 'Cables'}</div>
          <div>{isZh ? '主权评级' : 'Sovereignty'}</div>
          <div>{isZh ? '主要建造商' : 'Key Vendor(s)'}</div>
        </div>

        {/* 数据行 */}
        {filteredPairs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
            {isZh ? '无符合条件的国家对' : 'No pairs match the current filter'}
          </div>
        ) : filteredPairs.map(pair => {
          const pairKey = `${pair.from}-${pair.to}`;
          const isExpanded = expandedPair === pairKey;
          const vendors = [...new Set(pair.cables.map(c => c.vendor).filter(Boolean))] as string[];

          return (
            <div key={pairKey} style={{ borderBottom: `1px solid ${C.gold}06` }}>
              {/* 主行（可点击展开） */}
              <div
                onClick={() => setExpandedPair(isExpanded ? null : pairKey)}
                style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.8fr 60px 120px 1fr',
                  padding: '12px 16px', cursor: 'pointer', transition: 'background 0.15s',
                  backgroundColor: isExpanded ? 'rgba(212,175,55,0.04)' : 'transparent',
                }}
                onMouseOver={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                onMouseOut={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {/* 甲方 */}
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F0E6C8' }}>{isZh ? pair.fromNameZh : pair.fromName}</span>
                  <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    backgroundColor: pair.fromTier === 'member' ? `${C.gold}12` : 'rgba(96,165,250,0.1)',
                    color: pair.fromTier === 'member' ? C.gold : '#60A5FA', fontWeight: 600 }}>
                    {isZh ? (pair.fromTier === 'member' ? '成员' : '伙伴') : (pair.fromTier === 'member' ? 'M' : 'P')}
                  </span>
                </div>
                {/* 乙方 */}
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F0E6C8' }}>{isZh ? pair.toNameZh : pair.toName}</span>
                  <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    backgroundColor: pair.toTier === 'member' ? `${C.gold}12` : 'rgba(96,165,250,0.1)',
                    color: pair.toTier === 'member' ? C.gold : '#60A5FA', fontWeight: 600 }}>
                    {isZh ? (pair.toTier === 'member' ? '成员' : '伙伴') : (pair.toTier === 'member' ? 'M' : 'P')}
                  </span>
                </div>
                {/* 海缆数 */}
                <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: C.goldLight }}>{pair.cables.length}</div>
                {/* 主权评级 */}
                <div>
                  <SovBadge level={pair.dominantSovereignty}
                    label={isZh ? SOV_COLORS[pair.dominantSovereignty] && ({sovereign:'主权安全',partial:'混合依赖',dependent:'西方主导',unknown:'待分析'}[pair.dominantSovereignty]) : ({sovereign:'Sovereign',partial:'Partial',dependent:'Dependent',unknown:'Unknown'}[pair.dominantSovereignty])} />
                  <div style={{ marginTop: 4 }}>
                    <SovereigntyBar score={pair.avgSovereigntyScore} level={pair.dominantSovereignty} />
                  </div>
                </div>
                {/* 建造商 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {vendors.slice(0, 2).map(v => (
                    <span key={v} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: 'rgba(255,255,255,0.05)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {v}
                    </span>
                  ))}
                  {vendors.length > 2 && <span style={{ fontSize: 10, color: '#6B7280' }}>+{vendors.length - 2}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4B5563' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* 展开详情：显示每条海缆 */}
              {isExpanded && (
                <div style={{ backgroundColor: 'rgba(10,18,36,0.8)', borderTop: `1px solid ${C.gold}08`, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isZh ? `${pair.cables.length} 条直连海缆详情` : `${pair.cables.length} direct submarine cables`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pair.cables.map(cable => (
                      <div key={cable.slug} style={{ display: 'grid', gridTemplateColumns: '2fr 90px 1.2fr 1.5fr 120px',
                        backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8,
                        border: `1px solid ${SOV_COLORS[cable.sovereignty.level].border}20`,
                        padding: '10px 14px', gap: 8, alignItems: 'center' }}>
                        {/* 海缆名称 + 状态 */}
                        <div>
                          <a href={`/?cable=${cable.slug}`} style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', textDecoration: 'none' }}
                            onMouseOver={e => (e.currentTarget.style.color = C.goldLight)}
                            onMouseOut={e => (e.currentTarget.style.color = '#E2E8F0')}>
                            {cable.name}
                          </a>
                          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: STATUS_COLORS[cable.status] || '#6B7280' }} />
                            <span style={{ fontSize: 10, color: STATUS_COLORS[cable.status] || '#6B7280' }}>{cable.status.replace(/_/g, ' ')}</span>
                            {cable.lengthKm && <span style={{ fontSize: 10, color: '#4B5563' }}>· {cable.lengthKm.toLocaleString()} km</span>}
                          </div>
                        </div>
                        {/* RFS 年份 */}
                        <div style={{ fontSize: 12, color: '#6B7280' }}>{cable.rfsYear || '—'}</div>
                        {/* 建造商 */}
                        <div>
                          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 2 }}>{isZh ? '建造商' : 'Vendor'}</div>
                          <div style={{ fontSize: 12, color: '#D1D5DB' }}>{cable.vendor || '—'}</div>
                        </div>
                        {/* 运营商 */}
                        <div>
                          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 2 }}>{isZh ? '运营商' : 'Operators'}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {cable.operators.slice(0, 3).map(op => (
                              <span key={op} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4,
                                backgroundColor: 'rgba(42,157,143,0.08)', color: '#2A9D8F', border: '1px solid rgba(42,157,143,0.15)' }}>
                                {op}
                              </span>
                            ))}
                            {cable.operators.length > 3 && <span style={{ fontSize: 10, color: '#6B7280' }}>+{cable.operators.length - 3}</span>}
                            {cable.operators.length === 0 && <span style={{ fontSize: 10, color: '#4B5563' }}>—</span>}
                          </div>
                        </div>
                        {/* 主权评级 */}
                        <div>
                          <SovBadge level={cable.sovereignty.level}
                            label={isZh ? cable.sovereignty.label_zh : cable.sovereignty.label_en} />
                          <div style={{ fontSize: 10, color: '#4B5563', marginTop: 3, lineHeight: 1.4 }}>
                            {isZh ? cable.sovereignty.reason_zh : cable.sovereignty.reason_en}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

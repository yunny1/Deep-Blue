'use client';
// src/components/admin/CableTopologyEditor.tsx
//
// 海缆拓扑编辑器：鱼骨 / 时序结构可视化
//
// 核心概念：
//   主干（trunk）：水平排列的登陆站序列，代表海缆的主要物理路径
//   支线（branch）：从主干某个站点分叉出去的子路径（spur cable）
//
// 交互方式：
//   ① 点击主干末端的 [+ 继续主干] 按钮，追加下一个主干站
//   ② 点击两个主干站之间的 + 小圆圈，在中间插入站点（纠正顺序）
//   ③ 点击主干站下方的 ↓ 按钮，从该站开始一条支线
//   ④ 点击支线末端的 + 按钮，继续延伸该支线
//   ⑤ 点击任意站卡片右上角的 × 删除该站
//
// 输出给父组件：
//   allStationIds  → 所有站点的 DB id（用于写 CableLandingStation 关联表）
//   geojson        → 计算好的 LineString 或 MultiLineString（写入 routeGeojson 字段）
//   topology       → 原始拓扑数据（用于保存和恢复编辑状态）

import { useState, useRef, useCallback, useEffect } from 'react';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface StationNode {
  id: string;
  name: string;
  nameZh: string | null;
  city: string | null;
  countryCode: string;
  lat: number | null;
  lng: number | null;
  cableCount?: number;
}

export interface BranchDef {
  fromTrunkIndex: number; // 该支线从第几个主干站点分叉
  stations: StationNode[];
}

export interface CableTopology {
  trunk: StationNode[];
  branches: BranchDef[];
}

export interface TopologyResult {
  allStationIds: string[];  // 所有唯一站点 ID，用于数据库关联
  geojson: object | null;   // 计算出的 GeoJSON
  topology: CableTopology;
}

// 描述"当前激活的插入操作目标"——决定搜索框出现在哪里、选中后插入到哪里
type InsertTarget =
  | { type: 'trunk-append' }
  | { type: 'trunk-insert'; afterIndex: number }
  | { type: 'branch-append'; branchIndex: number }
  | { type: 'new-branch'; fromTrunkIndex: number };

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const TRUNK_COLOR  = '#60A5FA'; // 蓝色：主干路径
const BRANCH_COLOR = '#34D399'; // 绿色：支线路径
const CARD_BG      = 'rgba(14,28,54,.9)';
const BORDER_DIM   = 'rgba(255,255,255,.07)';

// ── GeoJSON 计算 ──────────────────────────────────────────────────────────────
// 主干 + 所有支线各自成段，超过一段时用 MultiLineString
function computeGeojson(topology: CableTopology): object | null {
  const trunkCoords = topology.trunk
    .filter(s => s.lat != null && s.lng != null)
    .map(s => [s.lng!, s.lat!]);

  if (trunkCoords.length < 2) return null;

  const lines: number[][][] = [trunkCoords];

  for (const branch of topology.branches) {
    const origin = topology.trunk[branch.fromTrunkIndex];
    if (!origin?.lat || !origin?.lng) continue;
    // 支线的第一个点是它所分叉的主干站，保证连接不断
    const branchCoords = [
      [origin.lng!, origin.lat!],
      ...branch.stations
        .filter(s => s.lat != null && s.lng != null)
        .map(s => [s.lng!, s.lat!]),
    ];
    if (branchCoords.length >= 2) lines.push(branchCoords);
  }

  return lines.length === 1
    ? { type: 'LineString',      coordinates: lines[0] }
    : { type: 'MultiLineString', coordinates: lines };
}

// ── 内联搜索框 ────────────────────────────────────────────────────────────────
// 出现在点击 + 或 ↓ 的位置旁边，输入内容后实时请求 landing-station-search API
function StationSearchInline({ onSelect, onCancel, excludeIds }: {
  onSelect: (s: StationNode) => void;
  onCancel: () => void;
  excludeIds: Set<string>;
}) {
  const [q,       setQ]       = useState('');
  const [results, setResults] = useState<StationNode[]>([]);
  const [loading, setLoading] = useState(false);
  const timer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹出时立即聚焦，让用户直接开始打字
  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = (query: string) => {
    clearTimeout(timer.current);
    setQ(query);
    if (!query.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/admin/landing-station-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        // 过滤掉已经在拓扑中的站点，避免重复
        setResults((data.stations ?? []).filter((s: StationNode) => !excludeIds.has(s.id)));
      } catch { setResults([]); }
      finally  { setLoading(false); }
    }, 300);
  };

  return (
    <div style={{
      background: '#0b1930', border: `1px solid ${TRUNK_COLOR}50`,
      borderRadius: 10, padding: 10, minWidth: 220, maxWidth: 260,
      boxShadow: '0 10px 32px rgba(0,0,0,.7)', zIndex: 500,
    }}>
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => search(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onCancel()}
          placeholder="搜索登陆站名称、城市、国家…"
          style={{
            width: '100%', background: 'rgba(255,255,255,.06)',
            border: `1px solid rgba(255,255,255,.15)`, borderRadius: 6,
            color: '#E2E8F0', fontSize: 12, padding: '6px 8px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {loading && (
          <span style={{ position: 'absolute', right: 8, top: 7,
            fontSize: 10, color: 'rgba(255,255,255,.3)' }}>搜索中…</span>
        )}
      </div>

      {results.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {results.map(s => (
            <div key={s.id} onClick={() => onSelect(s)}
              style={{ padding: '7px 8px', cursor: 'pointer', borderRadius: 6, marginBottom: 2, transition: 'background .1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${TRUNK_COLOR}12`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>
                {s.name}{s.nameZh ? ` (${s.nameZh})` : ''}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 1, display: 'flex', gap: 8 }}>
                <span>{[s.city, s.countryCode].filter(Boolean).join(', ')}</span>
                {s.cableCount ? <span style={{ color: `${TRUNK_COLOR}70` }}>关联 {s.cableCount} 缆</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {q && !loading && results.length === 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', padding: '4px 8px' }}>无匹配结果</div>
      )}

      <button onClick={onCancel}
        style={{ marginTop: 6, width: '100%', background: 'none', border: 'none',
          color: 'rgba(255,255,255,.3)', cursor: 'pointer', fontSize: 11, padding: '3px 0' }}>
        取消（Esc）
      </button>
    </div>
  );
}

// ── 站点卡片 ──────────────────────────────────────────────────────────────────
function StationCard({ station, color, onRemove, compact = false }: {
  station: StationNode; color: string; onRemove: () => void; compact?: boolean;
}) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${color}45`,
      borderRadius: 8, padding: compact ? '6px 10px' : '9px 13px',
      minWidth: compact ? 110 : 130, maxWidth: compact ? 150 : 170,
      position: 'relative', flexShrink: 0,
      boxShadow: `0 0 12px ${color}15`,
    }}>
      <button onClick={onRemove} style={{
        position: 'absolute', top: 3, right: 4,
        background: 'none', border: 'none', color: 'rgba(255,255,255,.25)',
        cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
      }}>×</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%',
          background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}90` }} />
        <span style={{ fontSize: 10, color: `${color}CC`, fontWeight: 700, letterSpacing: '.04em' }}>
          {station.countryCode}
        </span>
      </div>

      <div style={{ fontSize: compact ? 11 : 12, fontWeight: 600,
        color: 'rgba(255,255,255,.88)', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {station.name}
      </div>

      {station.city && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {station.city}
        </div>
      )}

      {(station.lat == null || station.lng == null) && (
        <div style={{ fontSize: 9, color: '#f87171', marginTop: 3 }}>⚠ 缺坐标</div>
      )}
    </div>
  );
}

// ── 插入按钮（圆形小 +）────────────────────────────────────────────────────────
function PlusCircle({ onClick, color, title }: { onClick: () => void; color: string; title: string }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: `${color}12`, border: `1.5px dashed ${color}45`,
        color, fontSize: 14, lineHeight: '20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, transition: 'all .15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}28`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}80`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}12`; (e.currentTarget as HTMLButtonElement).style.borderColor = `${color}45`; }}>
      +
    </button>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────
export default function CableTopologyEditor({ onChange }: {
  onChange: (result: TopologyResult) => void;
}) {
  const [topology,     setTopology]     = useState<CableTopology>({ trunk: [], branches: [] });
  const [activeSearch, setActiveSearch] = useState<InsertTarget | null>(null);

  // 所有已在拓扑中的站点 ID（用于搜索结果去重）
  const allIds = new Set<string>([
    ...topology.trunk.map(s => s.id),
    ...topology.branches.flatMap(b => b.stations.map(s => s.id)),
  ]);

  // 更新拓扑并同时通知父组件
  const updateTopology = useCallback((updater: (prev: CableTopology) => CableTopology) => {
    setTopology(prev => {
      const next = updater(prev);
      const ids = new Set<string>([
        ...next.trunk.map(s => s.id),
        ...next.branches.flatMap(b => b.stations.map(s => s.id)),
      ]);
      onChange({
        allStationIds: [...ids],
        geojson:       computeGeojson(next),
        topology:      next,
      });
      return next;
    });
  }, [onChange]);

  // 用户在搜索框里选中了一个站点后，根据 activeSearch 类型决定插入位置
  const handleSelect = useCallback((station: StationNode) => {
    if (!activeSearch) return;

    updateTopology(prev => {
      switch (activeSearch.type) {
        case 'trunk-append':
          return { ...prev, trunk: [...prev.trunk, station] };

        case 'trunk-insert': {
          // 在 afterIndex 位置后面插入
          const trunk = [...prev.trunk];
          trunk.splice(activeSearch.afterIndex + 1, 0, station);
          // 插入点之后的支线索引需要 +1
          const branches = prev.branches.map(b =>
            b.fromTrunkIndex > activeSearch.afterIndex
              ? { ...b, fromTrunkIndex: b.fromTrunkIndex + 1 }
              : b
          );
          return { ...prev, trunk, branches };
        }

        case 'branch-append': {
          const branches = prev.branches.map((b, i) =>
            i === activeSearch.branchIndex
              ? { ...b, stations: [...b.stations, station] }
              : b
          );
          return { ...prev, branches };
        }

        case 'new-branch':
          return {
            ...prev,
            branches: [...prev.branches, {
              fromTrunkIndex: activeSearch.fromTrunkIndex,
              stations: [station],
            }],
          };

        default:
          return prev;
      }
    });

    setActiveSearch(null);
  }, [activeSearch, updateTopology]);

  // 删除主干站点（同时清理依附在它上面的支线，并修正后续支线的索引）
  const removeTrunkStation = (index: number) => {
    updateTopology(prev => {
      const trunk = prev.trunk.filter((_, i) => i !== index);
      const branches = prev.branches
        .filter(b => b.fromTrunkIndex !== index)       // 删除依附在该站的支线
        .map(b => b.fromTrunkIndex > index
          ? { ...b, fromTrunkIndex: b.fromTrunkIndex - 1 }  // 修正索引
          : b
        );
      return { ...prev, trunk, branches };
    });
  };

  // 删除支线中的某个站点（支线变空时整条支线一起删除）
  const removeBranchStation = (branchIdx: number, stationIdx: number) => {
    updateTopology(prev => ({
      ...prev,
      branches: prev.branches
        .map((b, bi) => bi !== branchIdx ? b : {
          ...b, stations: b.stations.filter((_, si) => si !== stationIdx),
        })
        .filter(b => b.stations.length > 0),  // 空支线自动清理
    }));
  };

  // 找出某个主干站有没有支线（返回支线在 branches 数组中的 index，没有返回 -1）
  const getBranchIdx = (trunkIdx: number) =>
    topology.branches.findIndex(b => b.fromTrunkIndex === trunkIdx);

  const geojson        = computeGeojson(topology);
  const validTrunkPts  = topology.trunk.filter(s => s.lat != null).length;

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* 图例 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TRUNK_COLOR }}>
          <div style={{ width: 24, height: 2.5, background: TRUNK_COLOR, borderRadius: 1 }} />
          主干路径（按物理顺序添加）
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BRANCH_COLOR }}>
          <div style={{ width: 24, height: 0, borderTop: `2.5px dashed ${BRANCH_COLOR}`, borderRadius: 1 }} />
          支线（spur cable）
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
          主干 {topology.trunk.length} 站 · 支线 {topology.branches.length} 条
        </div>
      </div>

      {/* 鱼骨画布：水平滚动 */}
      <div style={{
        overflowX: 'auto', overflowY: 'visible',
        paddingBottom: 20, paddingTop: 8,
        background: 'rgba(255,255,255,.015)',
        borderRadius: 10, border: `1px solid ${BORDER_DIM}`,
        minHeight: 120, position: 'relative',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          padding: '16px 20px', minWidth: 'max-content', gap: 0,
        }}>

          {/* 每个主干站点 + 它的支线 */}
          {topology.trunk.map((station, i) => {
            const branchIdx = getBranchIdx(i);
            const hasBranch = branchIdx !== -1;
            const branch    = hasBranch ? topology.branches[branchIdx] : null;
            const isLast    = i === topology.trunk.length - 1;

            return (
              <div key={`trunk-${station.id}-${i}`} style={{ display: 'flex', alignItems: 'flex-start' }}>

                {/* ── 与前一站的连接段（含插入按钮）── */}
                {i > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, position: 'relative' }}>
                    <div style={{ width: 20, height: 2, background: TRUNK_COLOR, opacity: .7 }} />

                    {/* 插入按钮 or 内联搜索框 */}
                    {activeSearch?.type === 'trunk-insert' && activeSearch.afterIndex === i - 1 ? (
                      <div style={{ position: 'absolute', top: 14, left: -10, zIndex: 400 }}>
                        <StationSearchInline
                          onSelect={handleSelect}
                          onCancel={() => setActiveSearch(null)}
                          excludeIds={allIds}
                        />
                      </div>
                    ) : (
                      <PlusCircle
                        color={TRUNK_COLOR}
                        title={`在第 ${i} 站和第 ${i+1} 站之间插入`}
                        onClick={() => setActiveSearch({ type: 'trunk-insert', afterIndex: i - 1 })}
                      />
                    )}

                    <div style={{ width: 20, height: 2, background: TRUNK_COLOR, opacity: .7 }} />
                  </div>
                )}

                {/* ── 站点列（主干卡片 + 支线）── */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                  {/* 主干站卡片（加左右端线让视觉上连续）*/}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    {i === 0 && <div style={{ width: 10, height: 2, background: TRUNK_COLOR, opacity: .5 }} />}
                    <StationCard
                      station={station}
                      color={TRUNK_COLOR}
                      onRemove={() => removeTrunkStation(i)}
                    />
                    {isLast && <div style={{ width: 10, height: 2, background: TRUNK_COLOR, opacity: .5 }} />}
                  </div>

                  {/* ── 支线区域（在主干卡片正下方）── */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                    {hasBranch && branch ? (
                      <>
                        {/* 竖向连接线 */}
                        <div style={{ width: 2, height: 10, background: BRANCH_COLOR, opacity: .6 }} />

                        {/* 支线各站 */}
                        {branch.stations.map((bs, bi) => (
                          <div key={`branch-${bs.id}-${bi}`}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <StationCard
                              station={bs}
                              color={BRANCH_COLOR}
                              onRemove={() => removeBranchStation(branchIdx, bi)}
                              compact
                            />
                            {bi < branch.stations.length - 1 && (
                              <div style={{ width: 2, height: 8, background: BRANCH_COLOR, opacity: .5 }} />
                            )}
                          </div>
                        ))}

                        {/* 支线末端 + 延伸按钮 */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
                          <div style={{ width: 2, height: 8, background: BRANCH_COLOR, opacity: .35 }} />
                          {activeSearch?.type === 'branch-append' && activeSearch.branchIndex === branchIdx ? (
                            <div style={{ position: 'relative', zIndex: 400 }}>
                              <StationSearchInline
                                onSelect={handleSelect}
                                onCancel={() => setActiveSearch(null)}
                                excludeIds={allIds}
                              />
                            </div>
                          ) : (
                            <PlusCircle
                              color={BRANCH_COLOR}
                              title="继续延伸此支线"
                              onClick={() => setActiveSearch({ type: 'branch-append', branchIndex: branchIdx })}
                            />
                          )}
                        </div>
                      </>
                    ) : (
                      /* 无支线时：显示一个小的 ↓ 添加支线按钮 */
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {activeSearch?.type === 'new-branch' && activeSearch.fromTrunkIndex === i ? (
                          <div style={{ position: 'relative', zIndex: 400, marginTop: 6 }}>
                            <StationSearchInline
                              onSelect={handleSelect}
                              onCancel={() => setActiveSearch(null)}
                              excludeIds={allIds}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setActiveSearch({ type: 'new-branch', fromTrunkIndex: i })}
                            title="从此站添加支线"
                            style={{
                              width: 22, height: 22, borderRadius: 4,
                              background: `${BRANCH_COLOR}08`,
                              border: `1px dashed ${BRANCH_COLOR}30`,
                              color: `${BRANCH_COLOR}70`, fontSize: 12,
                              cursor: 'pointer', display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              transition: 'all .15s',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${BRANCH_COLOR}18`;
                              (e.currentTarget as HTMLButtonElement).style.color = BRANCH_COLOR;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLButtonElement).style.background = `${BRANCH_COLOR}08`;
                              (e.currentTarget as HTMLButtonElement).style.color = `${BRANCH_COLOR}70`;
                            }}>
                            ↓
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ── 主干末端追加按钮 ── */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 30 }}>
            {topology.trunk.length > 0 && (
              <div style={{ width: 14, height: 2, background: TRUNK_COLOR, opacity: .5 }} />
            )}
            {activeSearch?.type === 'trunk-append' ? (
              <div style={{ marginLeft: topology.trunk.length > 0 ? 8 : 0, zIndex: 400 }}>
                <StationSearchInline
                  onSelect={handleSelect}
                  onCancel={() => setActiveSearch(null)}
                  excludeIds={allIds}
                />
              </div>
            ) : (
              <button
                onClick={() => setActiveSearch({ type: 'trunk-append' })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  background: `${TRUNK_COLOR}10`,
                  border: `1.5px dashed ${TRUNK_COLOR}50`,
                  color: TRUNK_COLOR, fontSize: 12, fontWeight: 600,
                  transition: 'all .15s', flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${TRUNK_COLOR}22`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${TRUNK_COLOR}10`; }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                {topology.trunk.length === 0 ? '添加第一个登陆站（主干起点）' : '继续主干'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 状态栏：坐标完整性 + GeoJSON 预览 */}
      <div style={{
        marginTop: 10, padding: '8px 14px', borderRadius: 8,
        background: 'rgba(255,255,255,.025)', border: `1px solid ${BORDER_DIM}`,
        display: 'flex', alignItems: 'center', gap: 16, fontSize: 11,
        flexWrap: 'wrap',
      }}>
        {geojson ? (
          <span style={{ color: '#4ade80' }}>
            ✓ 路由可生成：主干 {validTrunkPts} 个坐标点
            {topology.branches.length > 0
              ? `，+ ${topology.branches.length} 条支线`
              : '，无支线（LineString）'}
          </span>
        ) : (
          <span style={{ color: 'rgba(255,255,255,.3)' }}>
            主干至少需要 2 个有效坐标的登陆站才能生成路由
          </span>
        )}
        {topology.trunk.some(s => s.lat == null) && (
          <span style={{ color: '#fbbf24' }}>⚠ 有站点缺坐标，生成时会自动跳过</span>
        )}
      </div>

      {/* 使用提示 */}
      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.2)', lineHeight: 1.7 }}>
        💡 主干站点的左右顺序 = 海缆的物理路径顺序。在两站之间点击 <strong style={{ color: 'rgba(255,255,255,.4)' }}>＋</strong> 可插入遗漏的站点。
        点击站点下方的 <strong style={{ color: `${BRANCH_COLOR}80` }}>↓</strong> 可从该站添加 spur 支线，生成的路由会是 MultiLineString。
      </div>
    </div>
  );
}

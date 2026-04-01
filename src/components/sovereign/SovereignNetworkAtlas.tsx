'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx
//
// ⚠️  此组件必须通过 dynamic(..., { ssr: false }) 加载。
//     原因：D3 依赖 window/DOM，Next.js SSR 阶段不存在。
//     语言读取用 localStorage，不用 useTranslation（避免 React error #321）。

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import {
  SOVEREIGN_ROUTES,
  BRICS_MEMBERS,
  BRICS_PARTNERS,
  NODE_COORDS,
  riskColor,
  safetyCfg,
  type SovereignRoute,
  type SafetyLevel,
} from '@/lib/sovereign-routes';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function BadgeSafety({ safety }: { safety: SafetyLevel }) {
  const { bg, text, label } = safetyCfg(safety);
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ background: bg, color: text }}
    >
      {label}
    </span>
  );
}

function RiskDot({ score, size = 7 }: { score: number; size?: number }) {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: riskColor(score) }}
    />
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function SovereignNetworkAtlas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [routes, setRoutes] = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [filtered, setFiltered] = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [topoData, setTopoData] = useState<unknown>(null);

  // 加载 world topology
  useEffect(() => {
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(setTopoData)
      .catch(console.error);
  }, []);

  // 过滤逻辑
  useEffect(() => {
    setFiltered(
      routes.filter((r) => {
        if (filterSafety && r.safety !== filterSafety) return false;
        if (filterFrom && r.from !== filterFrom) return false;
        return true;
      })
    );
  }, [routes, filterSafety, filterFrom]);

  // 渲染地图（D3）
  const renderMap = useCallback(() => {
    if (!svgRef.current || !wrapRef.current || !topoData) return;
    const W = wrapRef.current.offsetWidth;
    const H = wrapRef.current.offsetHeight;

    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
    svg.selectAll('*').remove();

    const proj = d3
      .geoNaturalEarth1()
      .scale(W / 6.4)
      .translate([W / 2, H / 2]);
    const pathFn = d3.geoPath().projection(proj);

    // 底图
    svg
      .append('path')
      .datum({ type: 'Sphere' } as d3.GeoPermissibleObjects)
      .attr('d', pathFn)
      .attr('fill', '#0f172a')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', '0.5');

    // 陆地
    const countries = topojson.feature(
      topoData as Parameters<typeof topojson.feature>[0],
      (topoData as { objects: { countries: Parameters<typeof topojson.feature>[1] } }).objects.countries
    );
    svg
      .selectAll('.land')
      .data((countries as { features: unknown[] }).features)
      .join('path')
      .attr('class', 'land')
      .attr('d', pathFn as unknown as string)
      .attr('fill', '#1e293b')
      .attr('stroke', '#334155')
      .attr('stroke-width', '0.4');

    // 经纬网格
    svg
      .append('path')
      .datum(d3.geoGraticule()())
      .attr('d', pathFn)
      .attr('fill', 'none')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', '0.3')
      .attr('opacity', 0.6);

    // 路径弧线
    const arcG = svg.append('g');
    filtered.forEach((r) => {
      const nodes = r.nodes;
      const scores = r.riskScores.split(' | ').map(Number);
      let si = 0;
      for (let i = 0; i < nodes.length - 1; i++) {
        const c1 = NODE_COORDS[nodes[i]];
        const c2 = NODE_COORDS[nodes[i + 1]];
        if (!c1 || !c2) { si++; continue; }
        const p1 = proj(c1);
        const p2 = proj(c2);
        if (!p1 || !p2) { si++; continue; }

        const mx = (p1[0] + p2[0]) / 2;
        const my = (p1[1] + p2[1]) / 2;
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = Math.min(len * 0.22, 55);
        const d = `M${p1[0]},${p1[1]} Q${mx - (dy / len) * off},${my + (dx / len) * off} ${p2[0]},${p2[1]}`;

        const risk = scores[si] ?? r.maxRisk;
        si++;
        const isSelected = selected === r.id;
        const isHovered = hovered === r.id;
        const isDimmed = !!selected && !isSelected && !isHovered;

        arcG
          .append('path')
          .attr('d', d)
          .attr('fill', 'none')
          .attr('stroke', riskColor(risk))
          .attr('stroke-width', isSelected ? 3 : isHovered ? 2.5 : 1.5)
          .attr('stroke-opacity', isDimmed ? 0.08 : isSelected ? 0.95 : isHovered ? 0.85 : 0.5)
          .attr('stroke-linecap', 'round')
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHovered(r.id))
          .on('mouseleave', () => setHovered(null))
          .on('click', () => setSelected((prev) => (prev === r.id ? null : r.id)));
      }
    });

    // 节点层（pointer-events: none 避免遮挡弧线点击）
    const nodeG = svg.append('g').style('pointer-events', 'none');
    Object.entries(NODE_COORDS).forEach(([name, [lng, lat]]) => {
      const pt = proj([lng, lat]);
      if (!pt) return;
      const isMem = BRICS_MEMBERS.has(name);
      const isPar = BRICS_PARTNERS.has(name);
      const r = isMem ? 7 : isPar ? 5.5 : 3.5;
      const fill = isMem ? '#f59e0b' : isPar ? '#10b981' : '#64748b';
      const g = nodeG.append('g').attr('transform', `translate(${pt[0]},${pt[1]})`);
      g.append('circle').attr('r', r).attr('fill', fill).attr('stroke', '#0f172a').attr('stroke-width', '1.5');
      if (isMem || isPar) {
        g.append('text')
          .attr('y', -(r + 4))
          .attr('text-anchor', 'middle')
          .attr('font-size', isMem ? '9' : '8')
          .attr('font-weight', isMem ? '500' : '400')
          .attr('fill', isMem ? '#fbbf24' : '#94a3b8')
          .style('font-family', 'system-ui, sans-serif')
          .text(name);
      }
    });
  }, [filtered, selected, hovered, topoData]);

  useEffect(() => { renderMap(); }, [renderMap]);

  // ResizeObserver 响应容器变化
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => renderMap());
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderMap]);

  // 上传 xlsx 文件联动更新
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表，请上传正确的 xlsx 文件。'); return; }
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsed: SovereignRoute[] = data.map((r) => {
      const path = String(r['路径节点序列'] ?? '');
      return {
        id: String(r['路径ID'] ?? ''),
        from: String(r['甲方'] ?? ''),
        to: String(r['乙方'] ?? ''),
        path,
        nodes: path.split(' → '),
        cables: String(r['各段保留海缆'] ?? ''),
        riskScores: String(r['各段风险评分'] ?? ''),
        maxRisk: Number(r['路径最大单段风险'] ?? 0),
        avgRisk: Number(r['路径平均单段风险'] ?? 0),
        segments: Number(r['保留段数'] ?? 0),
        safety: String(r['是否安全'] ?? '') as SafetyLevel,
      };
    });
    setRoutes(parsed);
    setSelected(null);
    setFilterSafety('');
    setFilterFrom('');
    e.target.value = '';
  };

  // 统计
  const totalLow = routes.filter((r) => r.safety === '相对低暴露优先路径' || r.safety === '较优备选路径').length;
  const totalHigh = routes.filter((r) => r.safety === '高暴露路径').length;
  const selectedRoute = selected ? routes.find((r) => r.id === selected) ?? null : null;
  const fromOptions = [...new Set(routes.map((r) => r.from))].sort();

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">

      {/* ── 页头 ── */}
      <div className="flex items-start justify-between border-b border-slate-700 pb-4">
        <div>
          <p className="text-[10px] font-mono text-slate-500 tracking-widest uppercase mb-0.5">
            Deep Blue · Strategic Intelligence
          </p>
          <h1 className="text-xl font-medium text-white mb-0.5">自主权网络图谱</h1>
          <p className="text-sm text-slate-400">主权威胁下的可用通信路径 · 排除核心西方体系海缆</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-sky-400 border border-sky-700 hover:border-sky-500 px-3 py-1.5 rounded-lg cursor-pointer transition-colors whitespace-nowrap">
          上传 .xlsx 更新数据
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {/* ── 统计卡片 ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '路径总数',   value: routes.length,   color: 'text-white' },
          { label: '低风险可用', value: totalLow,         color: 'text-emerald-400' },
          { label: '高暴露路径', value: totalHigh,        color: 'text-red-400' },
          { label: '当前显示',   value: filtered.length,  color: 'text-sky-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-medium ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── 主体：侧边栏 + 地图 ── */}
      <div className="flex gap-3 flex-1 min-h-0" style={{ height: '480px' }}>

        {/* 侧边栏 */}
        <div className="w-60 flex-shrink-0 flex flex-col gap-2 overflow-hidden">

          {/* 筛选器 */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">筛选条件</p>
            <select
              value={filterSafety}
              onChange={(e) => setFilterSafety(e.target.value)}
              className="w-full mb-2 bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-sky-500"
            >
              <option value="">所有安全等级</option>
              <option value="相对低暴露优先路径">相对低暴露（优先）</option>
              <option value="较优备选路径">较优备选路径</option>
              <option value="中等暴露路径">中等暴露路径</option>
              <option value="高暴露路径">高暴露路径</option>
            </select>
            <select
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-sky-500"
            >
              <option value="">所有起点国家</option>
              {fromOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 路径列表 */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 scrollbar-thin scrollbar-thumb-slate-600">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">无匹配路径</p>
            ) : (
              filtered.map((r) => {
                const { bg, text, label } = safetyCfg(r.safety);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected((prev) => (prev === r.id ? null : r.id))}
                    className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                      selected === r.id
                        ? 'border-sky-500 bg-sky-950'
                        : 'border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <RiskDot score={r.maxRisk} />
                      <span className="text-[11px] font-medium text-slate-200 flex-1 truncate">
                        {r.from} → {r.to}
                      </span>
                      <BadgeSafety safety={r.safety} />
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{r.path}</p>
                  </button>
                );
              })
            )}
          </div>

          {/* 图例 */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">节点类型</p>
            <div className="space-y-1.5 mb-3">
              {[
                { color: '#f59e0b', size: 8,  label: '金砖成员国' },
                { color: '#10b981', size: 7,  label: '金砖伙伴国' },
                { color: '#64748b', size: 5,  label: '中转节点' },
              ].map(({ color, size, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="rounded-full flex-shrink-0" style={{ width: size, height: size, background: color, display: 'inline-block' }} />
                  <span className="text-xs text-slate-300">{label}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">风险评分</p>
            <div className="space-y-1">
              {[
                { color: '#0F6E56', range: '0–20 低' },
                { color: '#639922', range: '21–40 中低' },
                { color: '#BA7517', range: '41–60 中等' },
                { color: '#D85A30', range: '61–75 高' },
                { color: '#A32D2D', range: '76+ 极高' },
              ].map(({ color, range }) => (
                <div key={range} className="flex items-center gap-2">
                  <span className="rounded-sm" style={{ width: 20, height: 3, background: color, display: 'inline-block' }} />
                  <span className="text-[10px] text-slate-400">{range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 地图容器 */}
        <div
          ref={wrapRef}
          className="flex-1 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900"
        >
          <svg ref={svgRef} className="block w-full h-full" />
          {!selected && (
            <p className="absolute bottom-3 right-4 text-[10px] font-mono text-slate-500 pointer-events-none">
              点击路径弧线查看详情
            </p>
          )}
          {/* 悬停 tooltip（未选中状态） */}
          {hovered && !selected && (() => {
            const r = routes.find((x) => x.id === hovered);
            if (!r) return null;
            const { bg, text, label } = safetyCfg(r.safety);
            return (
              <div className="absolute top-3 right-3 bg-slate-900/95 border border-slate-600 rounded-xl p-3 max-w-[220px] pointer-events-none">
                <p className="text-xs font-medium text-white mb-0.5">{r.from} → {r.to}</p>
                <p className="text-[10px] font-mono text-slate-400 mb-2 leading-tight">{r.path}</p>
                <div className="flex items-center gap-2">
                  <RiskDot score={r.maxRisk} />
                  <span className="text-xs font-medium" style={{ color: riskColor(r.maxRisk) }}>
                    最大风险 {r.maxRisk}
                  </span>
                  <BadgeSafety safety={r.safety} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── 详情面板 ── */}
      {selectedRoute && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium text-white mb-0.5">
                {selectedRoute.from} → {selectedRoute.to}
              </h3>
              <p className="text-xs font-mono text-slate-400">{selectedRoute.path}</p>
            </div>
            <div className="flex items-center gap-2">
              <BadgeSafety safety={selectedRoute.safety} />
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-white text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          </div>

          {/* 三指标 */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: '最大段风险', value: selectedRoute.maxRisk, isRisk: true },
              { label: '平均风险',   value: selectedRoute.avgRisk, isRisk: true },
              { label: '保留段数',   value: selectedRoute.segments, isRisk: false },
            ].map(({ label, value, isRisk }) => (
              <div key={label} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                <p
                  className="text-lg font-medium"
                  style={{ color: isRisk ? riskColor(Number(value)) : '#e2e8f0' }}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* 海缆列表 */}
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">保留海缆明细</p>
          <div className="flex flex-wrap gap-1.5">
            {selectedRoute.cables.split(' | ').map((cable, i) => {
              const scores = selectedRoute.riskScores.split(' | ').map(Number);
              const score = scores[i] ?? selectedRoute.maxRisk;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs font-mono text-slate-300"
                >
                  <RiskDot score={score} size={6} />
                  {cable.trim()}
                  <span className="text-[10px] font-medium" style={{ color: riskColor(score) }}>{score}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

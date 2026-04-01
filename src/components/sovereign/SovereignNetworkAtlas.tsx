'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx
// 注意：必须通过 dynamic(..., { ssr: false }) 加载，不可直接 import

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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

function Badge({ safety }: { safety: SafetyLevel }) {
  const { bg, text, label } = safetyCfg(safety);
  return (
    <span style={{ background: bg, color: text }}
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap flex-shrink-0">
      {label}
    </span>
  );
}

function Dot({ score, size = 7 }: { score: number; size?: number }) {
  return (
    <span className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: riskColor(score) }} />
  );
}

export default function SovereignNetworkAtlas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [routes, setRoutes] = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [filtered, setFiltered] = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [topoData, setTopoData] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // 加载 world topology
  useEffect(() => {
    let cancelled = false;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTopoData(data); })
      .catch(() => { if (!cancelled) setTopoData('error'); });
    return () => { cancelled = true; };
  }, []);

  // 确保容器尺寸就绪（useLayoutEffect 在 DOM paint 后同步触发）
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const check = () => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) setMapReady(true);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 过滤路径
  useEffect(() => {
    setFiltered(routes.filter((r) => {
      if (filterSafety && r.safety !== filterSafety) return false;
      if (filterFrom && r.from !== filterFrom) return false;
      return true;
    }));
  }, [routes, filterSafety, filterFrom]);

  // 渲染地图 - 用动态 import 避免 SSR 问题
  const renderMap = useCallback(() => {
    if (!svgRef.current || !wrapRef.current || !mapReady) return;
    const W = wrapRef.current.offsetWidth;
    const H = wrapRef.current.offsetHeight;
    if (!W || !H) return;

    Promise.all([import('d3'), import('topojson-client')]).then(([d3, topojson]) => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
      svg.selectAll('*').remove();

      const proj = d3.geoNaturalEarth1().scale(W / 6.4).translate([W / 2, H / 2]);
      const pathFn = d3.geoPath().projection(proj);

      // 海洋底色
      svg.append('path')
        .datum({ type: 'Sphere' } as d3.GeoPermissibleObjects)
        .attr('d', pathFn)
        .attr('fill', '#0c1a2e')
        .attr('stroke', '#1e3a5f')
        .attr('stroke-width', '0.5');

      // 陆地（topology 可用时）
      if (topoData && topoData !== 'error') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const countries = topojson.feature(topoData as any, topoData.objects.countries);
          svg.selectAll('.land')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .data((countries as any).features)
            .join('path')
            .attr('class', 'land')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .attr('d', pathFn as any)
            .attr('fill', '#1a2744')
            .attr('stroke', '#2a3f6f')
            .attr('stroke-width', '0.4');
        } catch (_) { /* 静默跳过 */ }
      }

      // 经纬网格
      svg.append('path')
        .datum(d3.geoGraticule()())
        .attr('d', pathFn)
        .attr('fill', 'none')
        .attr('stroke', '#1a2f50')
        .attr('stroke-width', '0.3')
        .attr('opacity', 0.7);

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
          const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
          const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const off = Math.min(len * 0.2, 50);
          const d = `M${p1[0]},${p1[1]} Q${mx - (dy / len) * off},${my + (dx / len) * off} ${p2[0]},${p2[1]}`;
          const risk = scores[si] ?? r.maxRisk; si++;
          const isSel = selected === r.id, isHov = hovered === r.id;
          const isDim = !!selected && !isSel && !isHov;
          arcG.append('path').attr('d', d).attr('fill', 'none')
            .attr('stroke', riskColor(risk))
            .attr('stroke-width', isSel ? 3 : isHov ? 2.5 : 1.5)
            .attr('stroke-opacity', isDim ? 0.07 : isSel ? 0.95 : isHov ? 0.85 : 0.5)
            .attr('stroke-linecap', 'round')
            .style('cursor', 'pointer')
            .on('mouseenter', () => setHovered(r.id))
            .on('mouseleave', () => setHovered(null))
            .on('click', () => setSelected((prev) => (prev === r.id ? null : r.id)));
        }
      });

      // 节点层（pointer-events none，不遮挡弧线点击）
      const nodeG = svg.append('g').style('pointer-events', 'none');
      Object.entries(NODE_COORDS).forEach(([name, [lng, lat]]) => {
        const pt = proj([lng, lat]);
        if (!pt) return;
        const isMem = BRICS_MEMBERS.has(name), isPar = BRICS_PARTNERS.has(name);
        const r = isMem ? 7 : isPar ? 5.5 : 3.5;
        const fill = isMem ? '#f59e0b' : isPar ? '#10b981' : '#4b6080';
        const g = nodeG.append('g').attr('transform', `translate(${pt[0]},${pt[1]})`);
        g.append('circle').attr('r', r).attr('fill', fill).attr('stroke', '#0c1a2e').attr('stroke-width', '1.5');
        if (isMem || isPar) {
          g.append('text').attr('y', -(r + 4)).attr('text-anchor', 'middle')
            .attr('font-size', isMem ? '9' : '8')
            .attr('font-weight', isMem ? '500' : '400')
            .attr('fill', isMem ? '#fbbf24' : '#7ca0c8')
            .style('font-family', 'system-ui, sans-serif')
            .text(name);
        }
      });
    });
  }, [filtered, selected, hovered, topoData, mapReady]);

  useEffect(() => { renderMap(); }, [renderMap]);

  // 上传 xlsx 更新数据
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表'); return; }
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsed: SovereignRoute[] = data.map((r) => {
      const path = String(r['路径节点序列'] ?? '');
      return {
        id: String(r['路径ID'] ?? ''), from: String(r['甲方'] ?? ''), to: String(r['乙方'] ?? ''),
        path, nodes: path.split(' → '),
        cables: String(r['各段保留海缆'] ?? ''), riskScores: String(r['各段风险评分'] ?? ''),
        maxRisk: Number(r['路径最大单段风险'] ?? 0), avgRisk: Number(r['路径平均单段风险'] ?? 0),
        segments: Number(r['保留段数'] ?? 0), safety: String(r['是否安全'] ?? '') as SafetyLevel,
      };
    });
    setRoutes(parsed); setSelected(null); setFilterSafety(''); setFilterFrom('');
    e.target.value = '';
  };

  const totalLow = routes.filter((r) => r.safety === '相对低暴露优先路径' || r.safety === '较优备选路径').length;
  const totalHigh = routes.filter((r) => r.safety === '高暴露路径').length;
  const selectedRoute = selected ? routes.find((r) => r.id === selected) ?? null : null;
  const fromOptions = [...new Set(routes.map((r) => r.from))].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #1e3a5f', paddingBottom: 16 }}>
        <div>
          <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#4b6080', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
            Deep Blue · Strategic Intelligence
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#e2e8f0', marginBottom: 4 }}>自主权网络图谱</h1>
          <p style={{ fontSize: 13, color: '#4b6080' }}>主权威胁下的可用通信路径 · 排除核心西方体系海缆</p>
        </div>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#38bdf8', border: '1px solid #1e4a6f', padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap' }}>
          上传 .xlsx 更新数据
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
        </label>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: '路径总数',   value: routes.length,   color: '#e2e8f0' },
          { label: '低风险可用', value: totalLow,         color: '#34d399' },
          { label: '高暴露路径', value: totalHigh,        color: '#f87171' },
          { label: '当前显示',   value: filtered.length,  color: '#38bdf8' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#0f2035', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 14px' }}>
            <p style={{ fontSize: 11, color: '#4b6080', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* 主体：侧边栏 + 地图 */}
      <div style={{ display: 'flex', gap: 12, height: 500 }}>

        {/* 侧边栏 */}
        <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>

          {/* 筛选器 */}
          <div style={{ background: '#0f2035', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#4b6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>筛选条件</p>
            <select value={filterSafety} onChange={(e) => setFilterSafety(e.target.value)}
              style={{ width: '100%', marginBottom: 6, background: '#07121f', border: '1px solid #1e3a5f', color: '#94a3b8', fontSize: 12, borderRadius: 6, padding: '4px 8px', outline: 'none' }}>
              <option value="">所有安全等级</option>
              <option value="相对低暴露优先路径">低暴露优先</option>
              <option value="较优备选路径">较优备选路径</option>
              <option value="中等暴露路径">中等暴露路径</option>
              <option value="高暴露路径">高暴露路径</option>
            </select>
            <select value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
              style={{ width: '100%', background: '#07121f', border: '1px solid #1e3a5f', color: '#94a3b8', fontSize: 12, borderRadius: 6, padding: '4px 8px', outline: 'none' }}>
              <option value="">所有起点国家</option>
              {fromOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* 路径列表 */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {filtered.length === 0
              ? <p style={{ textAlign: 'center', fontSize: 12, color: '#4b6080', padding: '20px 0' }}>无匹配路径</p>
              : filtered.map((r) => {
                const isSel = selected === r.id;
                return (
                  <button key={r.id} onClick={() => setSelected((prev) => (prev === r.id ? null : r.id))}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 9px', borderRadius: 8, marginBottom: 3, cursor: 'pointer',
                      border: isSel ? '1px solid #0ea5e9' : '1px solid #1e3a5f',
                      background: isSel ? '#0c2a3f' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <Dot score={r.maxRisk} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.from} → {r.to}
                      </span>
                      <Badge safety={r.safety} />
                    </div>
                    <p style={{ fontSize: 10, color: '#4b6080', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.path}
                    </p>
                  </button>
                );
              })}
          </div>

          {/* 图例 */}
          <div style={{ background: '#0f2035', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
            <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#4b6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>节点类型</p>
            {[{ c:'#f59e0b',s:8,l:'金砖成员国'},{c:'#10b981',s:7,l:'金砖伙伴国'},{c:'#4b6080',s:5,l:'中转节点'}].map(({c,s,l})=>(
              <div key={l} style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
                <span style={{ width:s,height:s,borderRadius:'50%',background:c,display:'inline-block',flexShrink:0 }}/>
                <span style={{ fontSize:11,color:'#94a3b8' }}>{l}</span>
              </div>
            ))}
            <p style={{ fontSize:10,fontFamily:'monospace',color:'#4b6080',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4,marginTop:8 }}>风险评分</p>
            {[['#0F6E56','0–20 低'],['#639922','21–40 中低'],['#BA7517','41–60 中等'],['#D85A30','61–75 高'],['#A32D2D','76+ 极高']].map(([c,l])=>(
              <div key={l} style={{ display:'flex',alignItems:'center',gap:6,marginBottom:3 }}>
                <span style={{ width:20,height:3,background:c,display:'inline-block',borderRadius:2,flexShrink:0 }}/>
                <span style={{ fontSize:10,color:'#4b6080' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 地图容器 */}
        <div ref={wrapRef}
          style={{ flex:1,position:'relative',borderRadius:12,overflow:'hidden',border:'1px solid #1e3a5f',background:'#07121f',minWidth:0 }}>
          <svg ref={svgRef} style={{ display:'block',width:'100%',height:'100%' }} />
          {!topoData && (
            <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
              <span style={{ fontSize:12,color:'#4b6080',fontFamily:'monospace' }}>加载地图数据…</span>
            </div>
          )}
          {!selected && mapReady && (
            <p style={{ position:'absolute',bottom:10,right:14,fontSize:10,fontFamily:'monospace',color:'#2a4060',pointerEvents:'none' }}>
              点击路径弧线查看详情
            </p>
          )}
          {hovered && !selected && (() => {
            const r = routes.find((x) => x.id === hovered);
            if (!r) return null;
            const { bg, text } = safetyCfg(r.safety);
            return (
              <div style={{ position:'absolute',top:12,right:12,background:'rgba(7,18,31,0.95)',border:'1px solid #1e3a5f',borderRadius:10,padding:'10px 12px',maxWidth:220,pointerEvents:'none' }}>
                <p style={{ fontSize:12,fontWeight:500,color:'#e2e8f0',marginBottom:2 }}>{r.from} → {r.to}</p>
                <p style={{ fontSize:10,fontFamily:'monospace',color:'#4b6080',marginBottom:6,lineHeight:1.4 }}>{r.path}</p>
                <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                  <Dot score={r.maxRisk} />
                  <span style={{ fontSize:11,fontWeight:500,color:riskColor(r.maxRisk) }}>最大风险 {r.maxRisk}</span>
                  <span style={{ background:bg,color:text,fontSize:10,padding:'2px 6px',borderRadius:4 }}>{safetyCfg(r.safety).label}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 详情面板 */}
      {selectedRoute && (
        <div style={{ background:'#0f2035',border:'1px solid #1e3a5f',borderRadius:12,padding:'14px 16px' }}>
          <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12 }}>
            <div>
              <h3 style={{ fontSize:14,fontWeight:500,color:'#e2e8f0',marginBottom:2 }}>{selectedRoute.from} → {selectedRoute.to}</h3>
              <p style={{ fontSize:11,fontFamily:'monospace',color:'#4b6080' }}>{selectedRoute.path}</p>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <Badge safety={selectedRoute.safety} />
              <button onClick={() => setSelected(null)}
                style={{ background:'none',border:'none',cursor:'pointer',color:'#4b6080',fontSize:20,lineHeight:1,padding:'0 2px' }}>×</button>
            </div>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12 }}>
            {[
              { label:'最大段风险', value:selectedRoute.maxRisk, risk:true },
              { label:'平均风险',   value:selectedRoute.avgRisk, risk:true },
              { label:'保留段数',   value:selectedRoute.segments, risk:false },
            ].map(({ label, value, risk }) => (
              <div key={label} style={{ background:'#07121f',border:'1px solid #1e3a5f',borderRadius:8,padding:'8px 12px' }}>
                <p style={{ fontSize:10,color:'#4b6080',marginBottom:2 }}>{label}</p>
                <p style={{ fontSize:20,fontWeight:500,color:risk?riskColor(Number(value)):'#e2e8f0' }}>{value}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize:10,fontFamily:'monospace',color:'#4b6080',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8 }}>保留海缆明细</p>
          <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
            {selectedRoute.cables.split(' | ').map((cable, i) => {
              const scores = selectedRoute.riskScores.split(' | ').map(Number);
              const score = scores[i] ?? selectedRoute.maxRisk;
              return (
                <span key={i} style={{ display:'inline-flex',alignItems:'center',gap:5,background:'#07121f',border:'1px solid #1e3a5f',borderRadius:6,padding:'4px 8px',fontSize:11,fontFamily:'monospace',color:'#94a3b8' }}>
                  <Dot score={score} size={6} />
                  {cable.trim()}
                  <span style={{ fontSize:10,fontWeight:500,color:riskColor(score) }}>{score}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

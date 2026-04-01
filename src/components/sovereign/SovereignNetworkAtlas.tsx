'use client';
// src/components/sovereign/SovereignNetworkAtlas.tsx
//
// 设计系统与 BRICSDashboard 完全一致：
//   - 字体：Playfair Display（标题） + DM Sans（正文）
//   - 主色：#D4AF37（金色）、背景 rgba(26,45,74,.5) 毛玻璃卡片
//   - 文字层级：#E8E0D0 → rgba(255,255,255,.6) → rgba(255,255,255,.3)
//   - 动效：fade-up 入场、金色 glow 滤镜、SVG 流动信号线、脉冲节点
//
// ⚠️  必须通过 dynamic(..., { ssr: false }) 加载

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import {
  SOVEREIGN_ROUTES, BRICS_MEMBERS, BRICS_PARTNERS, NODE_COORDS,
  riskColor, safetyCfg, type SovereignRoute, type SafetyLevel,
} from '@/lib/sovereign-routes';

// ── 设计常量（与 BRICS_COLORS 对齐）────────────────────────────────────────
const GOLD      = '#D4AF37';
const GOLD_LIGHT = '#F0E6C8';
const GOLD_DIM  = '#D4AF3725';
const NAVY      = '#0A1628';
const CARD_BG   = 'rgba(26,45,74,.5)';
const FLAGS     = ['#0066B3','#D32F2F','#FFC107','#388E3C','#F57C00'];

// ── 小工具组件 ───────────────────────────────────────────────────────────────

function Badge({ safety }: { safety: SafetyLevel }) {
  const { bg, text, label } = safetyCfg(safety);
  return (
    <span style={{
      background: bg, color: text, fontSize: 10, padding: '2px 7px',
      borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
      letterSpacing: '0.02em', fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {label}
    </span>
  );
}

function Dot({ score, size = 7 }: { score: number; size?: number }) {
  const color = riskColor(score);
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'inline-block', flexShrink: 0,
      boxShadow: `0 0 ${size + 2}px ${color}70`,
    }} />
  );
}

// 与 BRICSDashboard 的 SH 组件完全对齐
function SH({ t, s }: { t: string; s?: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: GOLD_LIGHT, margin: '0 0 4px',
        fontFamily: "'Playfair Display', serif",
      }}>{t}</h2>
      {s && <p style={{ fontSize: 13, color: 'rgba(255,255,255,.3)', margin: 0, lineHeight: 1.6, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{s}</p>}
    </div>
  );
}

// 与 BRICSDashboard 的 SC 组件完全对齐
function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / 1200, 1);
      setV(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${GOLD_DIM}`,
      borderRadius: 14, backdropFilter: 'blur(12px)', padding: 20,
      display: 'flex', flexDirection: 'column', gap: 5,
      transition: 'all .25s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${GOLD}35`; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 24px ${GOLD}10`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = GOLD_DIM; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: `${GOLD}80`, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{label}</span>
      <span style={{ fontSize: 32, fontWeight: 700, color: GOLD_LIGHT, lineHeight: 1.1, fontFeatureSettings: '"tnum"', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <span style={{ color }}>{v.toLocaleString()}</span>
      </span>
      {sub && <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>{sub}</span>}
    </div>
  );
}

// ── 主组件 ───────────────────────────────────────────────────────────────────

export default function SovereignNetworkAtlas() {
  const svgRef  = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [routes,       setRoutes]       = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [filtered,     setFiltered]     = useState<SovereignRoute[]>(SOVEREIGN_ROUTES);
  const [selected,     setSelected]     = useState<string | null>(null);
  const [hovered,      setHovered]      = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState('');
  const [filterFrom,   setFilterFrom]   = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [topoData,  setTopoData]  = useState<any>(null);
  const [mapReady,  setMapReady]  = useState(false);

  // ── 加载世界底图（CDN）───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r => r.json())
      .then(d => { if (!cancelled) setTopoData(d); })
      .catch(() => { if (!cancelled) setTopoData('error'); });
    return () => { cancelled = true; };
  }, []);

  // ── 等容器尺寸就绪后才启动绘图──────────────────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const check = () => { if (el.offsetWidth > 0 && el.offsetHeight > 0) setMapReady(true); };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── 过滤路径────────────────────────────────────────────────────────────
  useEffect(() => {
    setFiltered(routes.filter(r => {
      if (filterSafety && r.safety !== filterSafety) return false;
      if (filterFrom   && r.from   !== filterFrom)   return false;
      return true;
    }));
  }, [routes, filterSafety, filterFrom]);

  // ── 核心绘图（D3 + Topojson，全部动态 import 避免 SSR）──────────────────
  const renderMap = useCallback(() => {
    if (!svgRef.current || !wrapRef.current || !mapReady) return;
    const W = wrapRef.current.offsetWidth;
    const H = wrapRef.current.offsetHeight;
    if (!W || !H) return;

    Promise.all([import('d3'), import('topojson-client')]).then(([d3, topojson]) => {
      if (!svgRef.current) return;
      const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${W} ${H}`);
      svg.selectAll('*').remove();

      // ── SVG 滤镜 & 渐变 ────────────────────────────────────────────────
      const defs = svg.append('defs');

      // 金色 glow 滤镜（选中路径用）
      const fGold = defs.append('filter').attr('id', 'glow-gold')
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      fGold.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '4').attr('result', 'blur');
      const mGold = fGold.append('feMerge');
      mGold.append('feMergeNode').attr('in', 'blur');
      mGold.append('feMergeNode').attr('in', 'SourceGraphic');

      // 彩色 glow 滤镜（风险色用）
      const fColor = defs.append('filter').attr('id', 'glow-color')
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
      fColor.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '5').attr('result', 'blur');
      const mColor = fColor.append('feMerge');
      mColor.append('feMergeNode').attr('in', 'blur');
      mColor.append('feMergeNode').attr('in', 'SourceGraphic');

      // 节点发光（金砖成员国用）
      const fNode = defs.append('filter').attr('id', 'glow-node')
        .attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
      fNode.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '7').attr('result', 'blur');
      const mNode = fNode.append('feMerge');
      mNode.append('feMergeNode').attr('in', 'blur');
      mNode.append('feMergeNode').attr('in', 'SourceGraphic');

      // 大气放射渐变（与 dark-matter 底图风格一致）
      const atmo = defs.append('radialGradient').attr('id', 'atmo')
        .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
      atmo.append('stop').attr('offset', '0%').attr('stop-color', '#040f1e');
      atmo.append('stop').attr('offset', '80%').attr('stop-color', '#071628');
      atmo.append('stop').attr('offset', '100%').attr('stop-color', '#0d2550').attr('stop-opacity', '0.7');

      // 扫描线渐变（情报终端氛围感）
      const scan = defs.append('linearGradient').attr('id', 'scan-grad')
        .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
      scan.append('stop').attr('offset', '0%').attr('stop-color', GOLD).attr('stop-opacity', '0');
      scan.append('stop').attr('offset', '50%').attr('stop-color', GOLD).attr('stop-opacity', '0.025');
      scan.append('stop').attr('offset', '100%').attr('stop-color', GOLD).attr('stop-opacity', '0');

      // ── 投影：Natural Earth（与 BRICSMap 的全球视角保持一致）──────────
      const proj = d3.geoNaturalEarth1().scale(W / 6.2).translate([W / 2, H / 2]);
      const pathFn = d3.geoPath().projection(proj);

      // ── 底层：背景 + 球形投影边界 ─────────────────────────────────────
      svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#040f1e');
      svg.append('path')
        .datum({ type: 'Sphere' } as d3.GeoPermissibleObjects)
        .attr('d', pathFn)
        .attr('fill', 'url(#atmo)')
        .attr('stroke', '#1a3a6a')
        .attr('stroke-width', '0.8');

      // ── 经纬网格（与底图 dark-matter 风格一致，非常细、低对比）──────
      svg.append('path')
        .datum(d3.geoGraticule().step([30, 30])())
        .attr('d', pathFn)
        .attr('fill', 'none')
        .attr('stroke', '#0d2040')
        .attr('stroke-width', '0.6')
        .attr('opacity', '0.8');

      // ── 国家轮廓（与 dark-matter-nolabels 底图色调对齐）────────────
      if (topoData && topoData !== 'error') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const countries = topojson.feature(topoData as any, topoData.objects.countries);
          svg.selectAll('.land')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .data((countries as any).features)
            .join('path').attr('class', 'land')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .attr('d', pathFn as any)
            .attr('fill', '#0e2040')          // 接近 dark-matter 的深蓝
            .attr('stroke', '#1e3a6a')         // 边界线（低对比度）
            .attr('stroke-width', '0.35');
        } catch (_) { /* 静默跳过 */ }
      }

      // ── 金色扫描线动画（给页面增加"情报系统"氛围）───────────────────
      const scanEl = svg.append('rect')
        .attr('x', 0).attr('y', -60).attr('width', W).attr('height', 60)
        .attr('fill', 'url(#scan-grad)').style('pointer-events', 'none');
      scanEl.append('animateTransform')
        .attr('attributeName', 'transform').attr('type', 'translate')
        .attr('from', `0,0`).attr('to', `0,${H + 60}`)
        .attr('dur', '10s').attr('repeatCount', 'indefinite');

      // ── 路径弧线 ──────────────────────────────────────────────────────
      const arcG = svg.append('g').attr('class', 'arcs');

      filtered.forEach(r => {
        const nodes  = r.nodes;
        const scores = r.riskScores.split(' | ').map(Number);
        let si = 0;

        for (let i = 0; i < nodes.length - 1; i++) {
          const c1 = NODE_COORDS[nodes[i]];
          const c2 = NODE_COORDS[nodes[i + 1]];
          if (!c1 || !c2) { si++; continue; }
          const p1 = proj(c1), p2 = proj(c2);
          if (!p1 || !p2) { si++; continue; }

          const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
          const dx = p2[0] - p1[0],        dy = p2[1] - p1[1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const off = Math.min(len * 0.18, 50);
          const d = `M${p1[0]},${p1[1]} Q${mx - dy / len * off},${my + dx / len * off} ${p2[0]},${p2[1]}`;

          const risk  = scores[si] ?? r.maxRisk; si++;
          const color = riskColor(risk);
          const isSel = selected === r.id;
          const isHov = hovered  === r.id;
          const isDim = !!selected && !isSel && !isHov;

          const g = arcG.append('g');

          // 外层光晕（选中/悬停时显示，与 BRICSMap 的 line-blur glow 效果一致）
          if (isSel || isHov) {
            g.append('path').attr('d', d).attr('fill', 'none')
              .attr('stroke', isSel ? GOLD : color)
              .attr('stroke-width', isSel ? '10' : '6')
              .attr('stroke-opacity', isSel ? '0.2' : '0.15')
              .attr('filter', 'url(#glow-color)')
              .style('pointer-events', 'none');
          }

          // 主弧线
          g.append('path').attr('d', d).attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', isSel ? '2.8' : isHov ? '2.2' : '1.4')
            .attr('stroke-opacity', isDim ? 0.06 : isSel ? 0.92 : isHov ? 0.78 : 0.35)
            .attr('stroke-linecap', 'round')
            .style('cursor', 'pointer')
            .on('mouseenter', () => setHovered(r.id))
            .on('mouseleave', () => setHovered(null))
            .on('click',      () => setSelected(prev => prev === r.id ? null : r.id));

          // 流动信号线（核心动效：像电流沿海缆传输）
          if (!isDim) {
            const dur     = isSel ? '1.2s' : isHov ? '1.8s' : `${2.5 + (si % 6) * 0.35}s`;
            const dashArr = isSel ? '16 30' : isHov ? '12 36' : '7 46';
            const flowW   = isSel ? '2.2'   : isHov ? '1.8'   : '0.9';
            const flowOp  = isSel ? '0.95'  : isHov ? '0.88'  : '0.6';

            const fp = g.append('path').attr('d', d).attr('fill', 'none')
              .attr('stroke', isSel ? GOLD : color)
              .attr('stroke-width', flowW)
              .attr('stroke-opacity', flowOp)
              .attr('stroke-dasharray', dashArr)
              .attr('stroke-linecap', 'round')
              .style('pointer-events', 'none');

            // SVG animateTransform 模拟信号沿路径流动
            fp.append('animate')
              .attr('attributeName', 'stroke-dashoffset')
              .attr('from', '0').attr('to', '-200')
              .attr('dur', dur).attr('repeatCount', 'indefinite');
          }
        }
      });

      // ── 节点层（与 BRICSMap 的 brics-dots 样式完全一致）─────────────
      const nodeG = svg.append('g').attr('class', 'nodes').style('pointer-events', 'none');

      Object.entries(NODE_COORDS).forEach(([name, [lng, lat]]) => {
        const pt = proj([lng, lat]);
        if (!pt) return;

        const isMem = BRICS_MEMBERS.has(name);
        const isPar = BRICS_PARTNERS.has(name);

        // 半径与颜色对齐 BRICSMap（金色成员国、蓝色伙伴国、灰色中转）
        const r     = isMem ? 5.5 : isPar ? 4.5 : 2.8;
        const fill  = isMem ? GOLD    : isPar ? '#60A5FA' : '#4B5A72';
        const stroke= isMem ? '#B8962E' : isPar ? '#3B82F6' : '#2a3a52';

        const g = nodeG.append('g').attr('transform', `translate(${pt[0]},${pt[1]})`);

        // 外扩光晕圆（脉冲动画，成员国专属，与 BRICSMap 圆点光晕一致）
        if (isMem) {
          const halo = g.append('circle').attr('r', r + 4).attr('fill', 'none')
            .attr('stroke', GOLD).attr('stroke-width', '1').attr('opacity', '0');
          halo.append('animate').attr('attributeName', 'r')
            .attr('from', String(r + 2)).attr('to', String(r + 14))
            .attr('dur', '2.5s').attr('repeatCount', 'indefinite');
          halo.append('animate').attr('attributeName', 'opacity')
            .attr('from', '0.5').attr('to', '0')
            .attr('dur', '2.5s').attr('repeatCount', 'indefinite');
        }

        // 主节点圆
        g.append('circle').attr('r', r)
          .attr('fill', fill)
          .attr('stroke', stroke).attr('stroke-width', '1.2')
          .attr('filter', isMem ? 'url(#glow-node)' : 'none');

        // 文字标注（成员国 + 伙伴国，与 brics-text 层风格一致）
        if (isMem || isPar) {
          // 文字底色（模拟 text-halo）
          g.append('text').attr('y', -(r + 5))
            .attr('text-anchor', 'middle')
            .attr('font-size', isMem ? '9.5' : '8.5')
            .attr('font-weight', '700')
            .attr('fill', NAVY)
            .attr('stroke', NAVY).attr('stroke-width', '3')
            .attr('stroke-linejoin', 'round')
            .attr('paint-order', 'stroke')
            .style('font-family', "'DM Sans', system-ui, sans-serif")
            .text(name);

          // 文字本体
          g.append('text').attr('y', -(r + 5))
            .attr('text-anchor', 'middle')
            .attr('font-size', isMem ? '9.5' : '8.5')
            .attr('font-weight', '700')
            .attr('fill', isMem ? GOLD_LIGHT : '#93C5FD')  // 与 BRICSMap goldLight / partner 颜色一致
            .style('font-family', "'DM Sans', system-ui, sans-serif")
            .text(name);
        }
      });
    });
  }, [filtered, selected, hovered, topoData, mapReady]);

  useEffect(() => { renderMap(); }, [renderMap]);

  // ── 上传 xlsx 更新数据（懒加载 xlsx 库，零首屏开销）─────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf);
    const ws   = wb.Sheets['路径汇总'];
    if (!ws) { alert('找不到"路径汇总"工作表，请上传由仪表盘导出的正确文件。'); return; }
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    const parsed: SovereignRoute[] = data.map(r => {
      const path = String(r['路径节点序列'] ?? '');
      return {
        id: String(r['路径ID'] ?? ''),
        from: String(r['甲方'] ?? ''), to: String(r['乙方'] ?? ''),
        path, nodes: path.split(' → '),
        cables: String(r['各段保留海缆'] ?? ''),
        riskScores: String(r['各段风险评分'] ?? ''),
        maxRisk: Number(r['路径最大单段风险'] ?? 0),
        avgRisk: Number(r['路径平均单段风险'] ?? 0),
        segments: Number(r['保留段数'] ?? 0),
        safety: String(r['是否安全'] ?? '') as SafetyLevel,
      };
    });
    setRoutes(parsed);
    setSelected(null); setFilterSafety(''); setFilterFrom('');
    e.target.value = '';
  };

  // ── 统计 ─────────────────────────────────────────────────────────────────
  const totalLow     = routes.filter(r => r.safety === '相对低暴露优先路径' || r.safety === '较优备选路径').length;
  const totalHigh    = routes.filter(r => r.safety === '高暴露路径').length;
  const totalMid     = routes.filter(r => r.safety === '中等暴露路径').length;
  const selectedRoute = selected ? routes.find(r => r.id === selected) ?? null : null;
  const fromOptions   = [...new Set(routes.map(r => r.from))].sort();

  // ── CSS 动画（与 BRICSDashboard 的 fu 关键帧完全一致）──────────────────
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600;700&display=swap');
    .sna-root { font-family: 'DM Sans', system-ui, sans-serif; }
    .sna-root h1, .sna-root h2 { font-family: 'Playfair Display', serif; }
    @keyframes sna-fu { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    .sna-bs { animation: sna-fu .6s ease both; }
    .sna-card {
      background: ${CARD_BG};
      border: 1px solid ${GOLD_DIM};
      border-radius: 14px;
      backdrop-filter: blur(12px);
      transition: all .25s;
    }
    .sna-card:hover { border-color: ${GOLD}35; box-shadow: 0 0 24px ${GOLD}10; }
    .sna-btn {
      background: ${GOLD}10;
      border: 1px solid ${GOLD}25;
      border-radius: 8px;
      color: ${GOLD_LIGHT};
      cursor: pointer;
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 14px;
      transition: all .2s;
      white-space: nowrap;
    }
    .sna-btn:hover { background: ${GOLD}18; border-color: ${GOLD}40; }
    .sna-route-item {
      background: transparent;
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      padding: 8px 10px;
      text-align: left;
      transition: all .15s;
      width: 100%;
    }
    .sna-route-item:hover { background: rgba(212,175,55,.06); border-color: ${GOLD}20; }
    .sna-route-item.active { background: rgba(212,175,55,.08); border-color: ${GOLD}40; }
    .sna-select {
      background: rgba(10,22,40,.8);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      color: rgba(255,255,255,.7);
      font-family: 'DM Sans', system-ui, sans-serif;
      font-size: 12px;
      outline: none;
      padding: 6px 8px;
      transition: border-color .15s;
      width: 100%;
    }
    .sna-select:focus { border-color: ${GOLD}50; }
    .sna-root *::-webkit-scrollbar { width: 5px; height: 5px; }
    .sna-root *::-webkit-scrollbar-track { background: ${NAVY}; }
    .sna-root *::-webkit-scrollbar-thumb { background: ${GOLD}30; border-radius: 3px; }
  `;

  return (
    <div className="sna-root" style={{ minHeight: '100vh', background: NAVY, color: '#E8E0D0' }}>
      <style>{CSS}</style>

      {/* ── 顶部 5 色条纹（与 BRICSDashboard 完全一致）── */}
      <div style={{ display: 'flex', height: 4, position: 'sticky', top: 0, zIndex: 100 }}>
        {FLAGS.map(c => <div key={c} style={{ flex: 1, background: c }} />)}
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 48px' }}>

        {/* ── 页头 ── */}
        <div className="sna-bs" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18, alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 返回按钮（与 BRICSDashboard 一致） */}
            <a href="/brics" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px',
              background: `${GOLD}10`, border: `1px solid ${GOLD}25`, borderRadius: 20,
              textDecoration: 'none', fontSize: 11, color: '#9CA3AF',
            }}>← 金砖仪表盘</a>

            {/* 上传按钮 */}
            <label className="sna-btn">
              上传 .xlsx 更新路径数据
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleUpload} />
            </label>
          </div>

          {/* 页面标题徽章 */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: `${GOLD}08`, border: `1px solid ${GOLD}20`, borderRadius: 20, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD }} />
            <span style={{ fontSize: 11, color: `${GOLD}CC`, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>Strategic Intelligence · 战略情报</span>
          </div>

          <h1 style={{ fontSize: 38, fontWeight: 800, color: GOLD_LIGHT, margin: '0 0 8px', lineHeight: 1.1, fontFamily: "'Playfair Display', serif" }}>
            自主权网络图谱
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,.45)', margin: 0, maxWidth: 600, lineHeight: 1.7 }}>
            主权威胁框架下的金砖可用通信路径 · 排除核心西方体系海缆 · 基于最弱链条原则进行风险评级
          </p>
        </div>

        {/* ── 统计卡片（与 BRICSDashboard SC 完全一致的样式）── */}
        <div className="sna-bs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, marginBottom: 32, animationDelay: '.1s' }}>
          <StatCard label="路径总数"   value={routes.length}   color={GOLD_LIGHT}  sub="覆盖所有国家对" />
          <StatCard label="优先可用"   value={totalLow}         color="#22C55E"     sub="低暴露 + 较优备选" />
          <StatCard label="中等暴露"   value={totalMid}         color="#EAB308"     sub="需关注中转节点" />
          <StatCard label="高暴露路径" value={totalHigh}        color="#EF4444"     sub="含西方核心中转" />
        </div>

        {/* ── 主体区域：左侧边栏 + 右侧地图 ── */}
        <div className="sna-bs" style={{ display: 'flex', gap: 16, animationDelay: '.2s' }}>

          {/* ─ 左侧边栏 ─ */}
          <div style={{ width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* 筛选器卡片 */}
            <div className="sna-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 12 }}>筛选条件</div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginBottom: 4 }}>安全等级</div>
                <select value={filterSafety} onChange={e => setFilterSafety(e.target.value)} className="sna-select">
                  <option value="">全部</option>
                  <option value="相对低暴露优先路径">低暴露优先</option>
                  <option value="较优备选路径">较优备选</option>
                  <option value="中等暴露路径">中等暴露</option>
                  <option value="高暴露路径">高暴露路径</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginBottom: 4 }}>起点国家</div>
                <select value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="sna-select">
                  <option value="">全部</option>
                  {fromOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {(filterSafety || filterFrom) && (
                <div style={{ marginTop: 10, fontSize: 12, color: `${GOLD}CC`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>显示 {filtered.length} / {routes.length} 条</span>
                  <button onClick={() => { setFilterSafety(''); setFilterFrom(''); }}
                    style={{ background: 'none', border: 'none', color: `${GOLD}80`, cursor: 'pointer', fontSize: 13 }}>✕ 清除</button>
                </div>
              )}
            </div>

            {/* 路径列表 */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', maxHeight: 340 }}>
              {filtered.length === 0
                ? <div className="sna-card" style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.3)' }}>无匹配路径</div>
                : filtered.map(r => {
                  const isSel = selected === r.id;
                  return (
                    <button key={r.id}
                      className={`sna-route-item${isSel ? ' active' : ''}`}
                      onClick={() => setSelected(prev => prev === r.id ? null : r.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <Dot score={r.maxRisk} size={6} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: isSel ? GOLD_LIGHT : '#D1D5DB', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.from} → {r.to}
                        </span>
                        <Badge safety={r.safety} />
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {r.path}
                      </div>
                    </button>
                  );
                })}
            </div>

            {/* 图例卡片（与 BRICSMap 图例样式对齐）*/}
            <div className="sna-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 12 }}>图例</div>

              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>节点类型</div>
              {[
                { fill: GOLD,     stroke: '#B8962E', r: 6, label: '金砖成员国', sub: '11国' },
                { fill: '#60A5FA', stroke: '#3B82F6', r: 5, label: '金砖伙伴国', sub: '部分' },
                { fill: '#4B5A72', stroke: '#2a3a52', r: 3.5, label: '中转节点',  sub: '' },
              ].map(({ fill, stroke, r, label, sub }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="14" height="14" style={{ flexShrink: 0 }}>
                    <circle cx="7" cy="7" r={r} fill={fill} stroke={stroke} strokeWidth="1.2" />
                  </svg>
                  <span style={{ fontSize: 11, color: '#D1D5DB' }}>{label}</span>
                  {sub && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)' }}>{sub}</span>}
                </div>
              ))}

              <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '10px 0' }} />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 6 }}>风险评分色阶</div>
              {[
                { c: '#0F6E56', label: '0–20', desc: '低风险' },
                { c: '#639922', label: '21–40', desc: '中低' },
                { c: '#BA7517', label: '41–60', desc: '中等' },
                { c: '#D85A30', label: '61–75', desc: '较高' },
                { c: '#A32D2D', label: '76+',   desc: '极高' },
              ].map(({ c, label, desc }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 22, height: 3, background: c, display: 'inline-block', borderRadius: 2, boxShadow: `0 0 6px ${c}60`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', minWidth: 28 }}>{label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)' }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─ 地图区域 ─ */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 地图容器（与 BRICSMap 同款圆角边框）*/}
            <div ref={wrapRef} style={{
              position: 'relative', borderRadius: 14, overflow: 'hidden',
              border: `1px solid ${GOLD}12`, height: 540,
              background: '#040f1e',
            }}>
              <svg ref={svgRef} style={{ display: 'block', width: '100%', height: '100%' }} />

              {/* 加载遮罩 */}
              {!topoData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,15,30,.8)', borderRadius: 14 }}>
                  <span style={{ color: GOLD_LIGHT, fontSize: 14, fontFamily: "'DM Sans', system-ui, sans-serif" }}>正在加载底图数据…</span>
                </div>
              )}

              {/* 选中状态顶部提示条（与 BRICSDashboard 的高亮提示条一致）*/}
              {selected && selectedRoute && (
                <div style={{
                  position: 'absolute', top: 12, left: 12, right: 12,
                  padding: '8px 14px', borderRadius: 8,
                  background: `${GOLD}10`, border: `1px solid ${GOLD}30`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: GOLD, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                    正在查看：{selectedRoute.from} → {selectedRoute.to}
                    <span style={{ marginLeft: 8, color: 'rgba(255,255,255,.4)' }}>最大风险</span>
                    <span style={{ marginLeft: 4, color: riskColor(selectedRoute.maxRisk), fontWeight: 700 }}>{selectedRoute.maxRisk}</span>
                  </span>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
                </div>
              )}

              {/* 悬停 tooltip（与 BRICSMap hover panel 样式完全一致）*/}
              {hovered && !selected && (() => {
                const r = routes.find(x => x.id === hovered);
                if (!r) return null;
                const { bg, text, label } = safetyCfg(r.safety);
                return (
                  <div style={{
                    position: 'absolute', bottom: 14, left: 14,
                    width: 300, background: 'rgba(10,18,36,.97)',
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${GOLD}25`,
                    borderRadius: 10, overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
                    pointerEvents: 'none',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${GOLD}12`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#F0E6C8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                        {r.from} → {r.to}
                      </span>
                      <span style={{ background: bg, color: text, fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>{label}</span>
                    </div>
                    <div style={{ padding: '10px 14px', fontSize: 11, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginBottom: 3 }}>路径</div>
                      <div style={{ color: 'rgba(255,255,255,.6)', marginBottom: 10, fontFamily: 'monospace', fontSize: 10, lineHeight: 1.5 }}>{r.path}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div><div style={{ color: 'rgba(255,255,255,.35)', fontSize: 10, marginBottom: 2 }}>最大段风险</div><div style={{ color: riskColor(r.maxRisk), fontWeight: 700, fontSize: 14 }}>{r.maxRisk}</div></div>
                        <div><div style={{ color: 'rgba(255,255,255,.35)', fontSize: 10, marginBottom: 2 }}>平均风险</div><div style={{ color: riskColor(r.avgRisk), fontWeight: 700, fontSize: 14 }}>{r.avgRisk}</div></div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 右下角提示 */}
              {!selected && !hovered && (
                <div style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(10,22,40,.85)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'rgba(255,255,255,.3)', border: `1px solid ${GOLD}10`, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  悬停弧线查看路径 · 点击锁定详情
                </div>
              )}
            </div>

            {/* ─ 详情展开面板（点击路径后显示）─ */}
            {selectedRoute && (
              <div className="sna-card sna-bs" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: GOLD_LIGHT, margin: '0 0 4px', fontFamily: "'Playfair Display', serif" }}>
                      {selectedRoute.from} → {selectedRoute.to}
                    </h2>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', margin: 0, fontFamily: 'monospace' }}>{selectedRoute.path}</p>
                  </div>
                  <Badge safety={selectedRoute.safety} />
                </div>

                {/* 三指标 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: '最大段风险', value: selectedRoute.maxRisk, color: riskColor(selectedRoute.maxRisk) },
                    { label: '平均风险',   value: selectedRoute.avgRisk, color: riskColor(selectedRoute.avgRisk) },
                    { label: '保留段数',   value: selectedRoute.segments, color: GOLD_LIGHT },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', marginBottom: 4, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1, fontFeatureSettings: '"tnum"' }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* 海缆明细（与 BRICSMap hover panel 中 operators 标签风格一致）*/}
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: `${GOLD}80`, marginBottom: 10 }}>保留海缆明细</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedRoute.cables.split(' | ').map((cable, i) => {
                    const scores = selectedRoute.riskScores.split(' | ').map(Number);
                    const score  = scores[i] ?? selectedRoute.maxRisk;
                    const color  = riskColor(score);
                    return (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: `${color}10`, border: `1px solid ${color}25`,
                        borderRadius: 6, padding: '4px 10px',
                        fontSize: 11, color: 'rgba(255,255,255,.7)',
                        fontFamily: 'monospace',
                      }}>
                        <Dot score={score} size={5} />
                        {cable.trim()}
                        <span style={{ color, fontWeight: 700, fontSize: 10 }}>{score}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 页脚（与 BRICSDashboard footer 一致）── */}
        <footer className="sna-bs" style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${GOLD}10`, animationDelay: '.4s' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.2)', marginBottom: 8 }}>
            <span>数据来源：BRICS Transit Analysis · TeleGeography · Submarine Networks</span>
            <span>风险评分体系：建造商 20% + 运营商 45% + 中转国家 35%</span>
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,.12)', lineHeight: 1.6, margin: 0, maxWidth: 900 }}>
            本图谱展示的路径数据排除了核心西方体系（SubCom / ASN / AT&T / Google / Meta 等主导）海缆，风险评分采用最弱链条原则。数据仅供战略研究参考，不构成任何外交或政策建议。
          </p>
        </footer>
      </div>
    </div>
  );
}

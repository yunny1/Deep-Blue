// src/app/topology/page.tsx
// 全球海缆网络拓扑仪表盘 — 灵感来自NSFC大数据知识管理门户
// 顶部：动画计数统计卡片 | 中间：力导向关系图 | 右侧：统计图表 + 详情面板

'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import LangSwitcher from '@/components/layout/LangSwitcher';

interface TopoNode { id: string; name: string; cableCount: number; connectionCount: number; x: number; y: number; }
interface TopoEdge { source: string; target: string; cables: string[]; cableCount: number; }
interface TopoData { nodes: TopoNode[]; edges: TopoEdge[]; stats: { mostConnected: any }; }

const GW = 750, GH = 560;

function getNodeColor(c: number): string {
  if (c >= 40) return '#E9712B';
  if (c >= 25) return '#2A9D8F';
  if (c >= 12) return '#3B82F6';
  return '#475569';
}

function getNodeTier(c: number, zh: boolean): string {
  if (c >= 40) return zh ? '全球枢纽' : 'Global Hub';
  if (c >= 25) return zh ? '区域枢纽' : 'Regional Hub';
  if (c >= 12) return zh ? '重要节点' : 'Major Node';
  return zh ? '一般节点' : 'Standard';
}

// 预计算布局
function computeLayout(rawNodes: any[], edges: TopoEdge[]): TopoNode[] {
  const nodes: TopoNode[] = rawNodes.map((n, i) => {
    const angle = (i / rawNodes.length) * 2 * Math.PI - Math.PI / 2;
    const radius = 160 + (i % 5) * 40;
    return { ...n, x: GW / 2 + Math.cos(angle) * radius, y: GH / 2 + Math.sin(angle) * radius };
  });
  for (let iter = 0; iter < 350; iter++) {
    const alpha = Math.max(0.01, 1 - iter / 350);
    for (let i = 0; i < nodes.length; i++) {
      let fx = 0, fy = 0;
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = 4500 / (d * d);
        fx += (dx / d) * f; fy += (dy / d) * f;
      }
      nodes[i].x += fx * alpha * 0.25; nodes[i].y += fy * alpha * 0.25;
    }
    for (const e of edges) {
      const a = nodes.find(n => n.id === e.source), b = nodes.find(n => n.id === e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - 120) * 0.004;
      a.x += (dx / d) * f * alpha; a.y += (dy / d) * f * alpha;
      b.x -= (dx / d) * f * alpha; b.y -= (dy / d) * f * alpha;
    }
    for (const n of nodes) {
      n.x += (GW / 2 - n.x) * 0.004 * alpha; n.y += (GH / 2 - n.y) * 0.004 * alpha;
      n.x = Math.max(50, Math.min(GW - 50, n.x)); n.y = Math.max(50, Math.min(GH - 50, n.y));
    }
  }
  return nodes;
}

// ═══ 数字滚动动画 Hook ═══
function useAnimatedCount(target: number, duration: number = 1500): number {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(target * eased));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return current;
}

function TopologyContent() {
  const [data, setData] = useState<TopoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  useEffect(() => {
    fetch('/api/topology?limit=45')
      .then(r => r.json())
      .then(d => { d.nodes = computeLayout(d.nodes, d.edges); setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const activeNode = selectedNode || hoveredNode;
  const selectedData = data?.nodes.find(n => n.id === selectedNode);
  const selectedEdges = data?.edges.filter(e => e.source === selectedNode || e.target === selectedNode).sort((a, b) => b.cableCount - a.cableCount) || [];
  const allCableNames = [...new Set(selectedEdges.flatMap(e => e.cables))];

  // 统计数据
  const totalNodes = data?.nodes.length || 0;
  const totalEdges = data?.edges.length || 0;
  const totalCables = data ? [...new Set(data.edges.flatMap(e => e.cables))].length : 0;
  const tier1Count = data?.nodes.filter(n => n.cableCount >= 40).length || 0;

  // 动画计数
  const animNodes = useAnimatedCount(totalNodes);
  const animEdges = useAnimatedCount(totalEdges);
  const animCables = useAnimatedCount(totalCables);
  const animTier1 = useAnimatedCount(tier1Count);

  // 区域分布统计（按节点连接数分组）
  const regionStats = data ? [
    { label: zh ? '亚太' : 'Asia-Pacific', count: data.nodes.filter(n => ['JP', 'SG', 'AU', 'IN', 'CN', 'KR', 'TW', 'HK', 'ID', 'MY', 'TH', 'VN', 'PH', 'NZ', 'PK', 'BD', 'MM', 'KH', 'FJ', 'TO', 'PG', 'VU', 'WS', 'MV'].includes(n.id)).length, color: '#2A9D8F' },
    { label: zh ? '欧洲' : 'Europe', count: data.nodes.filter(n => ['GB', 'DE', 'FR', 'ES', 'IT', 'PT', 'NL', 'DK', 'SE', 'NO', 'FI', 'IE', 'GR', 'CY', 'MT', 'IS', 'BE', 'PL', 'RO', 'HR'].includes(n.id)).length, color: '#3B82F6' },
    { label: zh ? '非洲' : 'Africa', count: data.nodes.filter(n => ['EG', 'ZA', 'NG', 'KE', 'TZ', 'MZ', 'MG', 'MU', 'SC', 'DJ', 'SO', 'SD', 'TN', 'LY', 'GH', 'SN', 'CI', 'CM', 'AO', 'CG', 'CD', 'GA', 'TG', 'BJ', 'ER'].includes(n.id)).length, color: '#F59E0B' },
    { label: zh ? '美洲' : 'Americas', count: data.nodes.filter(n => ['US', 'BR', 'CA', 'MX', 'AR', 'CL', 'CO', 'PE', 'CU', 'JM', 'TT', 'BB', 'GD', 'VE', 'EC', 'UY', 'PA', 'CR', 'GT', 'HN', 'SV', 'NI', 'GY', 'SR', 'PR'].includes(n.id)).length, color: '#E9712B' },
    { label: zh ? '中东' : 'Middle East', count: data.nodes.filter(n => ['AE', 'SA', 'OM', 'QA', 'BH', 'KW', 'YE', 'IR', 'IQ', 'JO', 'LB', 'IL', 'TR', 'SY'].includes(n.id)).length, color: '#EC4899' },
  ] : [];
  const maxRegion = Math.max(...regionStats.map(r => r.count), 1);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060B14', color: '#C8D6E5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* ═══ 顶部导航 ═══ */}
      <nav style={{ height: 48, background: 'linear-gradient(180deg, #0B1526 0%, #060B14 100%)', borderBottom: '1px solid #111D33', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #1E6091, #2A9D8F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white' }}>DB</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#8BA3C7' }}>DEEP BLUE</span>
          </a>
          <div style={{ width: 1, height: 16, backgroundColor: '#1A2744' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A7899' }}>{zh ? '全球海缆网络拓扑分析' : 'Global Cable Network Topology'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 11, color: '#3D5A80', textDecoration: 'none', padding: '4px 12px', borderRadius: 4, border: '1px solid #152238', transition: 'all 0.2s' }}>
            {zh ? '← 返回地图' : '← Back to Map'}
          </a>
          <LangSwitcher />
        </div>
      </nav>

      {loading ? (
        <div style={{ height: 'calc(100vh - 48px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '2px solid #152238', borderTopColor: '#2A9D8F', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
            <div style={{ fontSize: 13, color: '#3D5A80' }}>{zh ? '正在分析全球海缆网络拓扑结构...' : 'Analyzing global cable network topology...'}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      ) : data && (
        <>
          {/* ═══ 统计卡片区（数字滚动动画） ═══ */}
          <div style={{ padding: '16px 24px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <CountCard value={animNodes} label={zh ? '国家/地区' : 'Countries'} icon="🌐" color="#2A9D8F" sub={zh ? '节点总数' : 'total nodes'} />
            <CountCard value={animEdges} label={zh ? '连接关系' : 'Connections'} icon="🔗" color="#3B82F6" sub={zh ? '国家间链路' : 'country links'} />
            <CountCard value={animCables} label={zh ? '海缆系统' : 'Cable Systems'} icon="🌊" color="#E9712B" sub={zh ? '可追踪海缆' : 'trackable cables'} />
            <CountCard value={animTier1} label={zh ? '全球枢纽' : 'Global Hubs'} icon="⭐" color="#F59E0B" sub={zh ? '40+条海缆' : '40+ cables'} />
          </div>

          <div style={{ display: 'flex', padding: '12px 24px 24px', gap: 12, height: 'calc(100vh - 48px - 100px)' }}>
            {/* ═══ 左侧：SVG拓扑图 ═══ */}
            <div style={{ flex: 1, backgroundColor: '#0A1122', borderRadius: 10, border: '1px solid #111D33', position: 'relative', overflow: 'hidden' }}>
              {/* 图标题 */}
              <div style={{ position: 'absolute', top: 12, left: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: '#2A9D8F' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5A7899' }}>{zh ? '网络关系图' : 'Network Graph'}</span>
              </div>

              <svg viewBox={`0 0 ${GW} ${GH}`} style={{ width: '100%', height: '100%' }}>
                <defs>
                  <pattern id="grid2" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0D1A2F" strokeWidth="0.3" />
                  </pattern>
                  {/* 连接线渐变 */}
                  <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#2A9D8F" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#2A9D8F" stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <rect width={GW} height={GH} fill="url(#grid2)" />

                {/* 边 */}
                {data.edges.map((edge, idx) => {
                  const a = data.nodes.find(n => n.id === edge.source);
                  const b = data.nodes.find(n => n.id === edge.target);
                  if (!a || !b) return null;
                  const isActive = activeNode === a.id || activeNode === b.id;
                  const isDimmed = activeNode && !isActive;
                  return (
                    <line key={idx} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={isActive ? '#2A9D8F' : isDimmed ? '#091120' : '#15243D'}
                      strokeWidth={isActive ? Math.min(1.2 + edge.cableCount * 0.25, 3.5) : Math.min(0.3 + edge.cableCount * 0.08, 1.2)}
                      opacity={isDimmed ? 0.2 : 1}
                      style={{ transition: 'all 0.4s ease' }} />
                  );
                })}

                {/* 高亮边标签 */}
                {activeNode && data.edges.filter(e => e.source === activeNode || e.target === activeNode).map((edge, idx) => {
                  const a = data.nodes.find(n => n.id === edge.source);
                  const b = data.nodes.find(n => n.id === edge.target);
                  if (!a || !b) return null;
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                  return (
                    <g key={`label-${idx}`}>
                      <rect x={mx - 8} y={my - 6} width={16} height={12} rx={2} fill="#0B1526" stroke="#2A9D8F" strokeWidth={0.5} />
                      <text x={mx} y={my + 2.5} textAnchor="middle" fill="#2A9D8F" fontSize={7} fontWeight={600} fontFamily="system-ui">{edge.cableCount}</text>
                    </g>
                  );
                })}

                {/* 节点 */}
                {data.nodes.map(node => {
                  const color = getNodeColor(node.cableCount);
                  const isSelected = selectedNode === node.id;
                  const isHovered = hoveredNode === node.id;
                  const isActive2 = isSelected || isHovered;
                  const isDimmed = activeNode && activeNode !== node.id && !data.edges.some(e => (e.source === activeNode && e.target === node.id) || (e.target === activeNode && e.source === node.id));
                  const size = node.cableCount >= 40 ? 22 : node.cableCount >= 25 ? 18 : node.cableCount >= 12 ? 15 : 11;

                  return (
                    <g key={node.id}
                      onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{ cursor: 'pointer' }}
                      opacity={isDimmed ? 0.1 : 1}>
                      {isSelected && <circle cx={node.x} cy={node.y} r={size + 5} fill="none" stroke="#2A9D8F" strokeWidth={1} strokeDasharray="3 2" opacity={0.5} style={{ transition: 'all 0.3s' }} />}
                      {isHovered && !isSelected && <circle cx={node.x} cy={node.y} r={size + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.3} />}
                      <circle cx={node.x} cy={node.y} r={size} fill={color} stroke={isActive2 ? '#FFF' : '#111D33'} strokeWidth={isActive2 ? 1.5 : 0.5} style={{ transition: 'all 0.3s' }} />
                      <text x={node.x} y={node.y + (size > 16 ? 1 : 0.5)} textAnchor="middle" dominantBaseline="middle" fill="#FFF" fontSize={size > 16 ? 10 : 8} fontWeight={700} fontFamily="system-ui">{node.id}</text>
                      {(isActive2 || node.cableCount >= 20) && !isDimmed && (
                        <text x={node.x} y={node.y + size + 12} textAnchor="middle" fill={isActive2 ? '#8BA3C7' : '#3D5A80'} fontSize={8} fontFamily="system-ui" fontWeight={500}>
                          {node.name.length > 12 ? node.name.slice(0, 11) + '..' : node.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* 图例 */}
              <div style={{ position: 'absolute', bottom: 12, left: 14, display: 'flex', gap: 12, fontSize: 10, color: '#3D5A80' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#E9712B', marginRight: 4, verticalAlign: 'middle' }}></span>40+</span>
                <span><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: '#2A9D8F', marginRight: 4, verticalAlign: 'middle' }}></span>25-39</span>
                <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3B82F6', marginRight: 4, verticalAlign: 'middle' }}></span>12-24</span>
                <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', backgroundColor: '#475569', marginRight: 4, verticalAlign: 'middle' }}></span>&lt;12</span>
              </div>
            </div>

            {/* ═══ 右侧面板 ═══ */}
            <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', flexShrink: 0 }}>

              {/* 区域分布柱状图 */}
              <div style={{ backgroundColor: '#0A1122', borderRadius: 10, border: '1px solid #111D33', padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: '#3B82F6' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#5A7899' }}>{zh ? '区域分布' : 'Regional Distribution'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {regionStats.map(r => (
                    <div key={r.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: '#5A7899' }}>{r.label}</span>
                        <span style={{ color: r.color, fontWeight: 600 }}>{r.count}</span>
                      </div>
                      <div style={{ height: 6, backgroundColor: '#0D1A2F', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(r.count / maxRegion) * 100}%`, height: '100%', borderRadius: 3,
                          background: `linear-gradient(90deg, ${r.color}CC, ${r.color}40)`,
                          transition: 'width 1s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* TOP 10 排名 */}
              <div style={{ backgroundColor: '#0A1122', borderRadius: 10, border: '1px solid #111D33', padding: 16, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: '#E9712B' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#5A7899' }}>{zh ? '节点排名 TOP 10' : 'Top 10 Nodes'}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {data.nodes.slice(0, 10).map((n, i) => {
                    const isActive = selectedNode === n.id;
                    return (
                      <div key={n.id}
                        onClick={() => setSelectedNode(isActive ? null : n.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                          backgroundColor: isActive ? 'rgba(42,157,143,0.1)' : 'transparent',
                          borderLeft: isActive ? '2px solid #2A9D8F' : '2px solid transparent',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={() => setHoveredNode(n.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        <span style={{ fontSize: 11, color: i < 3 ? '#E9712B' : '#3D5A80', fontWeight: 700, width: 20 }}>
                          {i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}
                        </span>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: getNodeColor(n.cableCount), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#FFF', flexShrink: 0 }}>{n.id}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: isActive ? '#C8D6E5' : '#8BA3C7', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: getNodeColor(n.cableCount) }}>{n.cableCount}</span>
                          <span style={{ fontSize: 9, color: '#3D5A80', marginLeft: 2 }}>cables</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 选中节点详情 */}
              {selectedData && (
                <div style={{ backgroundColor: '#0A1122', borderRadius: 10, border: '1px solid #2A9D8F30', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: getNodeColor(selectedData.cableCount), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#FFF' }}>{selectedData.id}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#C8D6E5' }}>{selectedData.name}</div>
                        <div style={{ fontSize: 10, color: '#3D5A80' }}>{getNodeTier(selectedData.cableCount, zh)}</div>
                      </div>
                    </div>
                    <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: '#3D5A80', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div style={{ backgroundColor: '#0D1A2F', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#2A9D8F' }}>{selectedData.cableCount}</div>
                      <div style={{ fontSize: 9, color: '#3D5A80' }}>{zh ? '海缆' : 'Cables'}</div>
                    </div>
                    <div style={{ backgroundColor: '#0D1A2F', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#3B82F6' }}>{selectedData.connectionCount}</div>
                      <div style={{ fontSize: 9, color: '#3D5A80' }}>{zh ? '连接国' : 'Linked'}</div>
                    </div>
                  </div>

                  {/* 连接关系列表 */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#3D5A80', marginBottom: 6, letterSpacing: 1 }}>{zh ? '连接关系' : 'CONNECTIONS'}</div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 10 }}>
                    {selectedEdges.slice(0, 10).map((e, i) => {
                      const other = e.source === selectedNode ? e.target : e.source;
                      return (
                        <div key={i} onClick={() => setSelectedNode(other)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.015)', fontSize: 11 }}
                          onMouseEnter={() => setHoveredNode(other)} onMouseLeave={() => setHoveredNode(null)}>
                          <span style={{ color: '#8BA3C7' }}>→ {other}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: Math.min(e.cableCount * 2.5, 24), height: 3, borderRadius: 2, backgroundColor: '#2A9D8F' }} />
                            <span style={{ fontSize: 10, color: '#2A9D8F', fontWeight: 600 }}>{e.cableCount}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 海缆标签 */}
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#3D5A80', marginBottom: 6, letterSpacing: 1 }}>{zh ? '海缆列表' : 'CABLES'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                    {allCableNames.slice(0, 12).map((name, i) => (
                      <span key={i} style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, backgroundColor: '#0D1A2F', color: '#5A7899', border: '1px solid #152238' }}>{name}</span>
                    ))}
                    {allCableNames.length > 12 && <span style={{ fontSize: 8, padding: '2px 6px', color: '#3D5A80' }}>+{allCableNames.length - 12}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 统计卡片组件（带数字滚动效果）
function CountCard({ value, label, icon, color, sub }: { value: number; label: string; icon: string; color: string; sub: string }) {
  return (
    <div style={{
      backgroundColor: '#0A1122', borderRadius: 10, border: '1px solid #111D33', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{ fontSize: 24, opacity: 0.8 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }}>{value.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: '#5A7899', fontWeight: 500, marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: 9, color: '#2D4562' }}>{sub}</div>
      </div>
    </div>
  );
}

export default function TopologyPage() {
  return (
    <I18nProvider>
      <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: '#060B14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3D5A80' }}>Loading...</div>}>
        <TopologyContent />
      </Suspense>
    </I18nProvider>
  );
}

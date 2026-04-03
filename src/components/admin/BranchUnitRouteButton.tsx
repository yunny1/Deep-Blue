'use client';
// src/components/admin/BranchUnitRouteButton.tsx
//
// 触发"分支单元路由"接口的按钮。
// 这个路由模型基于真实海缆的工程架构：
//   主干只连接各分支单元（在海洋里），引支线从分支单元伸向登陆站。
// 从根本上解决"主干穿越陆地"问题。

import { useState } from 'react';

interface BUResult {
  message: string;
  trunkPoints: number;
  spurCount: number;
  details: Array<{
    stationIndex: number;
    bu: [number, number];
    station: [number, number];
    spurLengthDeg: string;
  }>;
}

export default function BranchUnitRouteButton({ slug }: { slug: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<BUResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const run = async () => {
    if (!confirm(
      `对「${slug}」执行分支单元路由？\n\n` +
      `系统会为每个中间登陆站计算分支单元（BU）位置，\n` +
      `主干只连接各 BU（全程在海洋中），短引支线从 BU 延伸到登陆站。\n\n` +
      `⚠️ 使用前请确保已在拓扑编辑器里按正确物理顺序排好所有站点，\n` +
      `并已保存（当前路由坐标就是站点的排列顺序）。`
    )) return;

    setRunning(true); setResult(null); setError(null);
    try {
      const res  = await fetch('/api/admin/branch-unit-route', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '请求失败'); return; }
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setRunning(false);
    }
  };

  const GREEN = '#34D399';

  return (
    <div>
      <button onClick={run} disabled={running}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 8,
          cursor: running ? 'not-allowed' : 'pointer',
          background: running ? 'rgba(255,255,255,.04)' : `${GREEN}12`,
          border: `1px solid ${running ? 'rgba(255,255,255,.1)' : GREEN + '50'}`,
          color: running ? 'rgba(255,255,255,.3)' : GREEN,
          fontSize: 13, fontWeight: 500, transition: 'all .2s',
        }}
        onMouseEnter={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}22`; }}
        onMouseLeave={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.background = `${GREEN}12`; }}
      >
        <span style={{ fontSize: 16 }}>{running ? '⏳' : '⚓'}</span>
        {running
          ? '计算分支单元位置中（约 15-30 秒）…'
          : '⚓ 分支单元路由（主干在海，支缆到岸）'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(16,80,50,.2)', border: `1px solid ${GREEN}25`,
          fontSize: 12, lineHeight: 1.8,
        }}>
          <div style={{ color: GREEN, fontWeight: 600, marginBottom: 6 }}>
            ✓ {result.message}
          </div>
          {result.details.map((d, i) => (
            <div key={i} style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
              站点 {d.stationIndex}：BU 在 [{d.bu[0].toFixed(2)}, {d.bu[1].toFixed(2)}]，
              引支线长 ~{(parseFloat(d.spurLengthDeg) * 111).toFixed(0)} km
            </div>
          ))}
          <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 11, marginTop: 6 }}>
            缓存已自动清除。用 Cmd/Ctrl+Shift+R 强制刷新主页查看结果。
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(120,20,20,.2)', border: '1px solid rgba(248,113,113,.2)',
          color: '#f87171', fontSize: 12,
        }}>
          ✗ {error}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.2)', lineHeight: 1.7 }}>
        基于真实海缆工程架构：主干连接分支单元（BU，在海洋里），
        每条短引支线从 BU 延伸到登陆站。主干从不接触陆地（端点除外）。
        前提：当前路由坐标须已按物理顺序排好（首尾是端点）。
      </div>
    </div>
  );
}

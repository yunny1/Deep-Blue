'use client';
// src/components/admin/SmoothRouteButton.tsx
//
// 触发"路由平滑"接口的按钮组件。
// 平滑算法会自动检测路由中穿越陆地的线段，插入海洋绕行点，
// 确保海缆线路完全走在海洋中（不跨大陆）。

import { useState } from 'react';

interface SmoothResult {
  message:       string;
  before:        number;
  after:         number;
  waypointsAdded: number;
  passCount:     number;
}

export default function SmoothRouteButton({ slug }: { slug: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<SmoothResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const handleClick = async () => {
    if (!confirm(
      `确认为「${slug}」自动平滑路由？\n\n` +
      `系统将下载陆地轮廓数据（约 400KB，首次需 1-2 秒），` +
      `然后自动检测并修正所有穿越陆地的线段，` +
      `插入海洋绕行点后写回数据库。\n\n` +
      `注意：MultiLineString（含支线的路由）将被合并为单条 LineString。`
    )) return;

    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/smooth-cable-route', {
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

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={running}
        style={{
          display:       'flex',
          alignItems:    'center',
          gap:           8,
          padding:       '8px 16px',
          borderRadius:  8,
          cursor:        running ? 'not-allowed' : 'pointer',
          background:    running ? 'rgba(255,255,255,.04)' : 'rgba(251,191,36,.1)',
          border:        `1px solid ${running ? 'rgba(255,255,255,.1)' : 'rgba(251,191,36,.4)'}`,
          color:         running ? 'rgba(255,255,255,.3)' : '#fbbf24',
          fontSize:      13,
          fontWeight:    500,
          transition:    'all .2s',
        }}
        onMouseEnter={e => {
          if (!running) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,.18)';
        }}
        onMouseLeave={e => {
          if (!running) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(251,191,36,.1)';
        }}
      >
        <span style={{ fontSize: 16 }}>{running ? '⏳' : '🌊'}</span>
        {running ? '平滑计算中，请稍候…（约 10-30 秒）' : '自动平滑路由（绕开陆地）'}
      </button>

      {/* 结果展示 */}
      {result && (
        <div style={{
          marginTop:    10,
          padding:      '10px 14px',
          borderRadius: 8,
          background:   'rgba(16,112,86,.15)',
          border:       '1px solid rgba(74,222,128,.2)',
          fontSize:     12,
          lineHeight:   1.7,
        }}>
          <div style={{ color: '#4ade80', fontWeight: 600 }}>✓ {result.message}</div>
          <div style={{ color: 'rgba(255,255,255,.45)', marginTop: 4 }}>
            坐标点：{result.before} → {result.after} 个
            （新增 {result.waypointsAdded} 个海洋绕行点，{result.passCount} 轮迭代）
          </div>
          <div style={{ color: 'rgba(255,255,255,.3)', marginTop: 4, fontSize: 11 }}>
            地图缓存已自动清除。在主页强制刷新（Cmd/Ctrl+Shift+R）即可查看平滑后的路线。
          </div>
        </div>
      )}

      {/* 错误展示 */}
      {error && (
        <div style={{
          marginTop:    10,
          padding:      '8px 12px',
          borderRadius: 8,
          background:   'rgba(120,20,20,.2)',
          border:       '1px solid rgba(248,113,113,.2)',
          color:        '#f87171',
          fontSize:     12,
        }}>
          ✗ {error}
        </div>
      )}

      {/* 说明文字 */}
      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.2)', lineHeight: 1.6 }}>
        使用 Natural Earth 1:50m 陆地数据自动检测穿越陆地的线段。
        印度尼西亚群岛等极复杂区域的极窄海峡可能仍需手动添加锚点。
      </div>
    </div>
  );
}

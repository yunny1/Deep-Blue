'use client';
// src/components/admin/SmartRouteButton.tsx
//
// 触发"智能路由"接口的按钮。
// 与"自动平滑"不同，智能路由会先从数据库里找走过相同区域的参考海缆，
// 把它们的坐标提取为航路点，再做陆地穿越修复，效果更准确。

import { useState } from 'react';

interface SmartRouteResult {
  message: string;
  refCablesUsed: number;
  skeletonPoints: number;
  finalPoints: number;
}

export default function SmartRouteButton({ slug }: { slug: string }) {
  const [running, setRunning] = useState(false);
  const [result,  setResult]  = useState<SmartRouteResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const run = async () => {
    if (!confirm(
      `对「${slug}」执行智能路由？\n\n` +
      `系统会扫描数据库里所有有效海缆的路由坐标（最多 150 条），` +
      `提取走过相同区域的参考坐标，然后结合陆地检测生成新路由。\n\n` +
      `首次运行需要下载陆地轮廓数据（约 400KB），整个过程约需 15–40 秒。`
    )) return;

    setRunning(true); setResult(null); setError(null);
    try {
      const res  = await fetch('/api/admin/smart-route-cable', {
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

  const BLUE = '#60A5FA';

  return (
    <div>
      <button onClick={run} disabled={running}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 8,
          cursor: running ? 'not-allowed' : 'pointer',
          background: running ? 'rgba(255,255,255,.04)' : `${BLUE}12`,
          border: `1px solid ${running ? 'rgba(255,255,255,.1)' : BLUE + '50'}`,
          color: running ? 'rgba(255,255,255,.3)' : BLUE,
          fontSize: 13, fontWeight: 500, transition: 'all .2s',
        }}
        onMouseEnter={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.background = `${BLUE}22`; }}
        onMouseLeave={e => { if (!running) (e.currentTarget as HTMLButtonElement).style.background = `${BLUE}12`; }}
      >
        <span style={{ fontSize: 16 }}>{running ? '⏳' : '🧭'}</span>
        {running ? '智能路由计算中，请稍候（15–40 秒）…' : '🧭 智能路由（参考数据库海缆路径）'}
      </button>

      {result && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(16,80,112,.2)', border: `1px solid ${BLUE}25`,
          fontSize: 12, lineHeight: 1.7,
        }}>
          <div style={{ color: BLUE, fontWeight: 600 }}>✓ {result.message}</div>
          <div style={{ color: 'rgba(255,255,255,.4)', marginTop: 4 }}>
            参考了 {result.refCablesUsed} 条已有海缆的路由坐标，
            坐标点从 {result.skeletonPoints} 扩展到 {result.finalPoints} 个。
          </div>
          <div style={{ color: 'rgba(255,255,255,.3)', marginTop: 4, fontSize: 11 }}>
            Redis 缓存已自动清除。用 Cmd/Ctrl+Shift+R 强制刷新主页查看新路线。
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

      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.2)', lineHeight: 1.6 }}>
        使用数据库中已有海缆的真实路径作为参考走廊，比纯算法路由精度高得多。
        同时自动修复跨太平洋的反子午线问题（-124°W → 236°）。
      </div>
    </div>
  );
}

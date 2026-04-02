// src/components/admin/NewsInitButton.tsx
//
// 逐条初始化 26 条海缆新闻缓存的进度组件。
// 每次只调用单条缆接口，彻底避免 Cloudflare 524 超时。

'use client';

import { useState } from 'react';

// 26 条保留海缆标准名称（与 sovereign-routes.ts 保持一致）
const CABLE_NAMES = [
  'ALPHA',
  'Asia Connect Cable-1 (ACC-1)',
  'Asia Direct Cable (ADC)',
  'Asia Link Cable (ALC)',
  'Asia Submarine-cable Express (ASE)/Cahaya Malaysia',
  'Batam Dumai Melaka (BDM)',
  'Batam Sarawak Internet Cable System (BaSICS)',
  'Batam Singapore Cable System (BSCS)',
  'Batam-Rengit Cable System (BRCS)',
  'Bridge One',
  'BtoBE',
  'Dumai-Melaka Cable System (DMCS)',
  'Hokkaido-Sakhalin Cable System (HSCS)',
  'INSICA',
  'Indonesia Global Gateway (IGG) System',
  'MIST',
  'MYUS',
  'Nigeria Cameroon Submarine Cable System (NCSCS)',
  'PEACE Cable',
  'Russia-Japan Cable Network (RJCN)',
  'SEA-H2X',
  'SEACOM',
  'South Atlantic Inter Link (SAIL)',
  'TGN-IA2',
  'Thailand-Indonesia-Singapore (TIS)',
  'Vietnam-Singapore Cable System (VTS)',
];

type ItemStatus = 'pending' | 'loading' | 'done' | 'empty' | 'error';

interface ItemResult {
  name: string;
  status: ItemStatus;
  count: number;
  error?: string;
}

const STATUS_ICON: Record<ItemStatus, string> = {
  pending: '·',
  loading: '⟳',
  done:    '✓',
  empty:   '○',
  error:   '✗',
};
const STATUS_COLOR: Record<ItemStatus, string> = {
  pending: 'rgba(255,255,255,.2)',
  loading: '#EAB308',
  done:    '#22C55E',
  empty:   '#6B7280',
  error:   '#EF4444',
};

export default function NewsInitButton() {
  const [running,  setRunning]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [current,  setCurrent]  = useState('');
  const [progress, setProgress] = useState(0);
  const [results,  setResults]  = useState<ItemResult[]>([]);

  const handleStart = async () => {
    if (!confirm(`确认初始化 ${CABLE_NAMES.length} 条海缆的新闻缓存？\n每条约需 3-5 秒，总共约 2 分钟。`)) return;

    setRunning(true);
    setDone(false);
    setProgress(0);
    setResults(CABLE_NAMES.map(name => ({ name, status: 'pending', count: 0 })));

    let successCount = 0;

    for (let i = 0; i < CABLE_NAMES.length; i++) {
      const cableName = CABLE_NAMES[i];
      setCurrent(cableName);

      // 更新当前项为 loading
      setResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'loading' } : r
      ));

      try {
        const res = await fetch('/api/admin/init-single-cable-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cableName }),
        });
        const data = await res.json();

        const status: ItemStatus = !data.success ? 'error' : data.count === 0 ? 'empty' : 'done';
        if (data.count > 0) successCount++;

        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status, count: data.count, error: data.error } : r
        ));
      } catch (e) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error', count: 0, error: '网络错误' } : r
        ));
      }

      setProgress(Math.round(((i + 1) / CABLE_NAMES.length) * 100));

      // 每条之间短暂等待，避免 API 限流
      if (i < CABLE_NAMES.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setCurrent('');
    setRunning(false);
    setDone(true);
  };

  return (
    <div style={{ background: 'rgba(26,45,74,.5)', border: '1px solid rgba(139,92,246,.2)', borderRadius: 14, backdropFilter: 'blur(12px)', padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' as const, color: '#8B5CF6', marginBottom: 8 }}>
        海缆新闻初始化（首次部署执行一次）
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 16, lineHeight: 1.6 }}>
        为全部 {CABLE_NAMES.length} 条保留海缆搜索近两年真实新闻并缓存到 Redis。
        逐条调用避免超时，约需 2 分钟。之后每天凌晨 2 点自动更新。
      </p>

      {/* 进度条 */}
      {(running || done) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
            <span>{running ? `正在处理：${current}` : done ? '✓ 全部完成' : ''}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #8B5CF6, #6366F1)', borderRadius: 3, transition: 'width .3s ease' }} />
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {!running && (
        <button
          onClick={handleStart}
          style={{
            padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
            background: done ? 'rgba(34,197,94,.12)' : 'rgba(139,92,246,.15)',
            border: `1px solid ${done ? 'rgba(34,197,94,.3)' : 'rgba(139,92,246,.4)'}`,
            color: done ? '#22C55E' : '#8B5CF6',
            fontSize: 13, fontWeight: 500,
          }}>
          {done ? '✓ 已完成，点击重新初始化' : '触发新闻初始化'}
        </button>
      )}

      {running && (
        <div style={{ fontSize: 12, color: '#EAB308', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, border: '2px solid rgba(234,179,8,.2)', borderTop: '2px solid #EAB308', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
          初始化中，请勿关闭页面…
        </div>
      )}

      {/* 逐条结果列表 */}
      {results.length > 0 && (
        <div style={{ marginTop: 14, maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {results.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
              <span style={{ fontSize: 13, color: STATUS_COLOR[r.status], flexShrink: 0, width: 14, textAlign: 'center' }}>
                {STATUS_ICON[r.status]}
              </span>
              <span style={{ fontSize: 11, color: r.status === 'pending' ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              {r.status === 'done' && (
                <span style={{ fontSize: 10, color: '#22C55E', flexShrink: 0 }}>{r.count} 条</span>
              )}
              {r.status === 'empty' && (
                <span style={{ fontSize: 10, color: '#6B7280', flexShrink: 0 }}>无结果</span>
              )}
              {r.status === 'error' && (
                <span style={{ fontSize: 10, color: '#EF4444', flexShrink: 0 }}>失败</span>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

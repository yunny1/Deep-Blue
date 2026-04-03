'use client';
// src/components/admin/GenerateRoutesButton.tsx
//
// 管理后台组件：手动触发"根据登陆站坐标生成近似路由"
//
// 有两种使用方式：
//   1. 不传 slug → 批量处理所有缺路由坐标的海缆
//   2. 传入 slug → 只处理指定海缆（海缆录入完成后立即触发的场景）
//
// 用法示例（在 admin 页面或 cable-intake 页面引入）：
//   <GenerateRoutesButton />               // 全量批量
//   <GenerateRoutesButton slug="myus" />   // 只处理 MYUS

import { useState } from 'react';

interface Props {
  slug?: string; // 不传则批量处理所有缺路由的海缆
}

interface ApiResult {
  message:      string;
  generated:    number;
  skipped:      number;
  insufficient: number;
  details?:     string[];
}

export default function GenerateRoutesButton({ slug }: Props) {
  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<ApiResult | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isSingle = Boolean(slug);

  const handleClick = async () => {
    const label = isSingle ? `海缆 "${slug}"` : '所有缺路由的海缆';
    if (!confirm(`确认为 ${label} 生成近似路由坐标？\n生成后地图缓存会自动清除，地球上将立即显示新路线。`)) return;

    setRunning(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/generate-approximate-routes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(slug ? { slug } : {}),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '请求失败，请检查控制台');
        return;
      }

      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setRunning(false);
    }
  };

  // 根据是单条还是批量展示不同的按钮文案
  const buttonLabel = running
    ? '生成中，请稍候…'
    : isSingle
      ? `⚡ 根据登陆站坐标立即生成路由`
      : `⚡ 批量生成近似路由（缺路由的全部海缆）`;

  const buttonColor = isSingle ? '#3B82F6' : '#D4AF37';

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={running}
        style={{
          padding:       isSingle ? '7px 14px' : '9px 20px',
          borderRadius:  8,
          cursor:        running ? 'not-allowed' : 'pointer',
          background:    running ? 'rgba(255,255,255,.06)' : `${buttonColor}18`,
          border:        `1px solid ${running ? 'rgba(255,255,255,.1)' : buttonColor + '45'}`,
          color:         running ? 'rgba(255,255,255,.4)' : buttonColor,
          fontSize:      13,
          fontWeight:    500,
          transition:    'all .2s',
          whiteSpace:    'nowrap',
        }}
      >
        {buttonLabel}
      </button>

      {/* 结果展示 */}
      {result && (
        <div style={{
          marginTop:  10,
          padding:    '10px 14px',
          borderRadius: 8,
          background: result.generated > 0 ? 'rgba(16,112,86,.15)' : 'rgba(40,60,90,.3)',
          border:     `1px solid ${result.generated > 0 ? 'rgba(74,222,128,.2)' : 'rgba(255,255,255,.1)'}`,
          fontSize:   12,
          lineHeight: 1.7,
        }}>
          <div style={{ color: result.generated > 0 ? '#4ade80' : 'rgba(255,255,255,.6)', fontWeight: 600 }}>
            {result.message}
          </div>

          {/* 详情列表（可折叠）*/}
          {result.details && result.details.length > 0 && (
            <>
              <button
                onClick={() => setExpanded(e => !e)}
                style={{
                  marginTop:  6,
                  background: 'none',
                  border:     'none',
                  color:      'rgba(255,255,255,.4)',
                  cursor:     'pointer',
                  fontSize:   11,
                  padding:    0,
                }}
              >
                {expanded ? '▲ 收起详情' : `▼ 查看详情（${result.details.length} 条）`}
              </button>

              {expanded && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {result.details.map((line, i) => (
                    <div key={i} style={{
                      fontSize: 11,
                      color:    line.startsWith('✓')
                        ? '#4ade80'
                        : line.startsWith('⚠')
                          ? '#fbbf24'
                          : 'rgba(255,255,255,.5)',
                      marginBottom: 2,
                    }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 提示：记得刷新页面查看地球变化 */}
          {result.generated > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.4)' }}>
              地图缓存已自动清除。在主页刷新地球（Cmd/Ctrl + Shift + R）即可看到新路线。
            </div>
          )}
        </div>
      )}

      {/* 错误展示 */}
      {error && (
        <div style={{
          marginTop:  10,
          padding:    '8px 12px',
          borderRadius: 8,
          background: 'rgba(120,20,20,.2)',
          border:     '1px solid rgba(248,113,113,.2)',
          color:      '#f87171',
          fontSize:   12,
        }}>
          ✗ {error}
        </div>
      )}
    </div>
  );
}

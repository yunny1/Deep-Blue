// src/app/sovereign-network/page.tsx
//
// 路由：/sovereign-network
// 渲染策略：纯客户端（no SSR），原因如下：
//   1. D3 地图需要 window.innerWidth / DOM 测量
//   2. xlsx 上传解析在客户端完成
//   3. 数据完全静态（无 DB 查询），不需要服务端渲染

import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '自主权网络图谱 · Deep Blue',
  description: '主权威胁下的可用海底光缆通信路径 — 排除核心西方体系，可视化金砖国家互联互通',
};

// 动态加载（ssr: false）：避免 D3 访问 window 时 SSR 报错
// 这与项目中 BRICSMap.tsx、CesiumGlobe.tsx 的加载方式保持一致
const SovereignNetworkAtlas = dynamic(
  () => import('@/components/sovereign/SovereignNetworkAtlas'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-600 border-t-sky-400 rounded-full animate-spin" />
          <span className="text-sm font-mono">加载自主权网络图谱…</span>
        </div>
      </div>
    ),
  }
);

export default function SovereignNetworkPage() {
  return (
    // 与 /brics 页面保持一致的深色背景 + 内边距
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <SovereignNetworkAtlas />
      </div>
    </div>
  );
}

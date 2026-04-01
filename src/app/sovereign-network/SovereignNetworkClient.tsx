'use client';

import dynamic from 'next/dynamic';

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

export default function SovereignNetworkClient() {
  return <SovereignNetworkAtlas />;
}
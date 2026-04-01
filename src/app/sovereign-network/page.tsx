// src/app/sovereign-network/page.tsx
import type { Metadata } from 'next';
import SovereignNetworkClient from './SovereignNetworkClient';

export const metadata: Metadata = {
  title: '自主权网络图谱 · Deep Blue',
  description: '主权威胁下的可用海底光缆通信路径 — 排除核心西方体系，可视化金砖国家互联互通',
};

export default function SovereignNetworkPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <SovereignNetworkClient />
      </div>
    </div>
  );
}
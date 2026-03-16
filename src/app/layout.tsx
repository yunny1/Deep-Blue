// src/app/layout.tsx
// Deep Blue 根布局 - 定义全站的HTML结构和元数据

import type { Metadata } from 'next';
import './globals.css';

// 网站的SEO元数据（搜索引擎会读取这些信息）
export const metadata: Metadata = {
  title: 'Deep Blue | Global Submarine Cable Intelligence Portal',
  description: 'The world\'s most comprehensive submarine cable monitoring and intelligence platform. Track 600+ cables, 1800+ landing stations, real-time events and AI-powered risk analysis.',
  keywords: 'submarine cable, undersea cable, ocean infrastructure, cable monitoring, telecom',
};

// 根布局组件 - 包裹所有页面
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

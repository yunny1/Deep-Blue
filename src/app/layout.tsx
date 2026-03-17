// src/app/layout.tsx
// Deep Blue 根布局 — 包裹I18n国际化Provider
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deep Blue | Global Submarine Cable Intelligence Portal',
  description: 'The world\'s most comprehensive submarine cable monitoring and intelligence platform.',
  keywords: 'submarine cable, undersea cable, ocean infrastructure, cable monitoring, 海底光缆, 海缆监测',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

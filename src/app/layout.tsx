// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Deep Blue | Global Submarine Cable Intelligence',
  description: 'Real-time submarine cable monitoring with AI-powered news analysis, earthquake impact assessment, geopolitical risk scoring, and network topology visualization. Built by Jiangyun.',
  keywords: 'submarine cable, undersea cable, ocean infrastructure, cable monitoring, geopolitical risk, 海底光缆, 海缆监测, Deep Blue',
  authors: [{ name: 'Jiangyun' }],
  creator: 'Jiangyun',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-180.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    title: 'Deep Blue | Global Submarine Cable Intelligence',
    description: 'Monitor 690+ submarine cables worldwide with AI-powered intelligence, real-time earthquake alerts, and geopolitical risk analysis.',
    url: 'https://deep-cloud.org',
    siteName: 'Deep Blue',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Deep Blue | Submarine Cable Intelligence',
    description: 'AI-powered global submarine cable monitoring platform',
    creator: '@Jiangyun',
  },
  other: {
    'theme-color': '#2A9D8F',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/cesium/Widgets/widgets.css" />
      </head>
      <body>{children}<Analytics /></body>
    </html>
  );
}

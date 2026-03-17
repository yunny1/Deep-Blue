// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deep Blue | Global Submarine Cable Intelligence Portal',
  description: 'The world\'s most comprehensive submarine cable monitoring and intelligence platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/cesium/Widgets/widgets.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}

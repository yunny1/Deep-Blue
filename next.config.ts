// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 静默Turbopack警告（Next.js 16默认使用Turbopack）
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.submarinecablemap.com' },
    ],
  },
};

export default nextConfig;
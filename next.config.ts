// next.config.ts
// Deep Blue - Next.js配置文件
// 主要作用：配置CesiumJS的静态资源和图片域名白名单

import type { NextConfig } from 'next';
import CopyPlugin from 'copy-webpack-plugin';
import path from 'path';

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // CesiumJS需要把它的Workers和Assets文件复制到public目录
      // 这些文件是3D地球渲染所需的（地形数据、着色器等）
      const cesiumPath = path.dirname(require.resolve('cesium/package.json'));
      config.plugins.push(
        new CopyPlugin({
          patterns: [
            { from: path.join(cesiumPath, 'Build/Cesium/Workers'), to: '../public/cesium/Workers' },
            { from: path.join(cesiumPath, 'Build/Cesium/ThirdParty'), to: '../public/cesium/ThirdParty' },
            { from: path.join(cesiumPath, 'Build/Cesium/Assets'), to: '../public/cesium/Assets' },
            { from: path.join(cesiumPath, 'Build/Cesium/Widgets'), to: '../public/cesium/Widgets' },
          ],
        })
      );
      // CesiumJS内部使用了一些Node.js模块，在浏览器中需要忽略
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, url: false };
    }
    return config;
  },
  // 允许加载的外部图片域名
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.submarinecablemap.com' },
    ],
  },
};

export default nextConfig;

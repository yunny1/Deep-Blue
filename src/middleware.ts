// src/middleware.ts
//
// 全站身份验证中间件
//
// 工作原理：
//   所有请求经过此中间件时，检查 httpOnly Cookie "db-session" 是否存在且有效。
//   有效 → 放行；无效或不存在 → 重定向到 /login。
//
// 不受保护的路径（任何人都可访问）：
//   /login          — 登录页面
//   /api/auth/*     — 登录/登出 API
//   /_next/*        — Next.js 静态资源
//   /cesium/*       — CesiumJS 地球资源
//   /favicon.ico    — 图标
//
// 安全说明：
//   JWT 使用 HS256 算法，密钥由 AUTH_SESSION_SECRET 环境变量提供。
//   Cookie 设置 httpOnly + Secure + SameSite=Lax，防止 XSS 和 CSRF。
//   Session 有效期 8 小时，到期自动重定向至登录页。

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// 不需要认证的路径前缀
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/_next/',
  '/cesium/',
  '/favicon.ico',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径直接放行
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get('db-session')?.value;

  // 没有 Token → 重定向到登录页，并记录原始路径便于登录后跳回
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 验证 JWT
  try {
    const secret = new TextEncoder().encode(
      process.env.AUTH_SESSION_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION'
    );
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    // Token 无效或已过期：清除 Cookie 并重定向到登录页
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('db-session');
    return response;
  }
}

export const config = {
  // 匹配所有路径，但排除 Next.js 内部路径和静态文件
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|cesium|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf)$).*)',
  ],
};

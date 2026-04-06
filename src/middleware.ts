// src/middleware.ts
// 合并了两套验证逻辑：
//   1. /admin/* 路径 → 使用管理员 JWT（admin_token cookie，原 proxy.ts 的逻辑）
//   2. 其他所有路径 → 使用全站登录 JWT（db-session cookie，新增的访客登录逻辑）

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// 不需要任何验证的公开路径
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/_next/',
  '/cesium/',
  '/favicon.ico',
];

// 管理员后台专用的 JWT 密钥（与原 proxy.ts 完全一致）
const ADMIN_JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'deepblue_admin_secret_change_this'
);

// 全站登录的 JWT 密钥（新增）
const SESSION_SECRET = new TextEncoder().encode(
  process.env.AUTH_SESSION_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION'
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 公开路径直接放行 ──────────────────────────────────────────
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── /admin 路径：使用原有管理员 JWT 验证 ─────────────────────
  // 这段逻辑与原 proxy.ts 完全一致，不改变管理员后台的行为
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const adminToken = request.cookies.get('admin_token')?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    try {
      await jwtVerify(adminToken, ADMIN_JWT_SECRET);
      return NextResponse.next();
    } catch {
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('admin_token');
      return response;
    }
  }

  // ── 其他所有路径：使用全站登录验证 ───────────────────────────
  const sessionToken = request.cookies.get('db-session')?.value;
  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }
  try {
    await jwtVerify(sessionToken, SESSION_SECRET);
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('db-session');
    return response;
  }
}

export const config = {
  // 匹配所有路径，排除静态资源
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|cesium|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf)$).*)',
  ],
};
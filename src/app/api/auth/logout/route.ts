// src/app/api/auth/logout/route.ts
//
// 登出 API：清除 session cookie，重定向到登录页

import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('db-session', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,   // 立即过期
    path:     '/',
  });
  return response;
}

// GET 方便从浏览器地址栏直接访问触发登出
export async function GET() {
  const response = NextResponse.redirect(
    new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'https://www.deep-cloud.org')
  );
  response.cookies.set('db-session', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,
    path:     '/',
  });
  return response;
}

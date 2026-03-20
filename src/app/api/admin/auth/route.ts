// src/app/api/admin/auth/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const ADMIN_JWT_SECRET = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'deepblue_admin_secret_change_this'
);

// POST /api/admin/auth — 登录
export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'deepblue2024';

  if (username !== validUsername || password !== validPassword) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const token = await new SignJWT({ username, role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(ADMIN_JWT_SECRET);

  const response = NextResponse.json({ success: true });
  response.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}

// DELETE /api/admin/auth — 退出登录
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_token');
  return response;
}

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

const SESSION_DURATION_SEC = 8 * 60 * 60;

function getUsers(): Map<string, string> {
  const users = new Map<string, string>();
  const raw = process.env.AUTH_USERS || '';
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const username = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const hash = trimmed.slice(colonIdx + 1).trim();
    if (username && hash) users.set(username, hash);
  }
  return users;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return NextResponse.json({ error: '请填写账号和密码' }, { status: 400 });
    }

    const users = getUsers();
    const hash = users.get(username.trim().toLowerCase());
    const dummyHash = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh';
    const actualHash = hash || dummyHash;
    const passwordOk = await bcrypt.compare(password, actualHash);

    if (!hash || !passwordOk) {
      return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
    }

    const secret = new TextEncoder().encode(
      process.env.AUTH_SESSION_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION'
    );
    const role = username.trim().toLowerCase() === 'admin' ? 'admin' : 'guest';
    const token = await new SignJWT({ sub: username.trim().toLowerCase(), role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_SEC}s`)
      .sign(secret);

    const response = NextResponse.json({ ok: true, role });
    response.cookies.set('db-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION_SEC,
      path: '/',
    });
    return response;
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

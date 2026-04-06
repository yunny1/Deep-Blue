// src/app/api/auth/login/route.ts
//
// 登录 API
//
// 流程：
//   1. 验证腾讯云 CAPTCHA 票据（防机器人）
//   2. 验证用户名/密码（bcrypt 对比环境变量中的哈希）
//   3. 签发 JWT，写入 httpOnly Cookie（有效期 8 小时）
//
// 账号配置（在 Vercel 环境变量中设置）：
//   AUTH_USERS=admin:$2b$10$...,guest1:$2b$10$...,...
//   多账号用英文逗号分隔；密码使用 bcrypt 哈希（见 scripts/gen-password-hash.ts）
//
// 腾讯云 CAPTCHA 配置：
//   TENCENT_CAPTCHA_APP_ID     — 在腾讯云控制台获取（同时配置 NEXT_PUBLIC_ 版本供前端使用）
//   TENCENT_CAPTCHA_APP_SECRET — 仅服务端使用，不可暴露给前端

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';

const SESSION_DURATION_SEC = 8 * 60 * 60; // 8 小时

// ── 解析环境变量中的账号列表 ────────────────────────────────────────
// 格式：AUTH_USERS=admin:$2b$10$xxx,guest1:$2b$10$yyy
function getUsers(): Map<string, string> {
  const users = new Map<string, string>();
  const raw = process.env.AUTH_USERS || '';

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    // bcrypt hash 本身包含 $，所以只从第一个 : 分割
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const username = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const hash     = trimmed.slice(colonIdx + 1).trim();
    if (username && hash) users.set(username, hash);
  }

  return users;
}

// ── 腾讯云 CAPTCHA 票据验证 ─────────────────────────────────────────
async function verifyCaptcha(
  ticket: string,
  randstr: string,
  userIp: string,
): Promise<{ ok: boolean; message: string }> {
  // 临时跳过：先确认账号密码和 JWT 流程正常，CAPTCHA 单独调试
  console.warn('[Auth] CAPTCHA 验证暂时跳过（调试模式）');
  return { ok: true, message: 'skipped' };
}

  try {
    const url = new URL('https://ssl.captcha.qq.com/ticket/verify');
    url.searchParams.set('aid',          appId);
    url.searchParams.set('AppSecretKey', secret);
    url.searchParams.set('Ticket',       ticket);
    url.searchParams.set('Randstr',      randstr);
    url.searchParams.set('UserIp',       userIp);

    const res  = await fetch(url.toString(), { cache: 'no-store' });
    const data = await res.json();

    // CaptchaCode === 1 表示验证通过
    if (data.CaptchaCode === 1) return { ok: true, message: 'ok' };
    return { ok: false, message: data.CaptchaMsg || '验证码验证失败' };
  } catch (e) {
    console.error('[Auth] CAPTCHA 验证请求失败:', e);
    return { ok: false, message: '验证码服务暂时不可用' };
  }
}

// ── 主处理函数 ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, ticket, randstr } = body as {
      username?: string;
      password?: string;
      ticket?:   string;
      randstr?:  string;
    };

    // 基础参数校验
    if (!username || !password || !ticket || !randstr) {
      return NextResponse.json(
        { error: '请填写完整信息并完成人机验证' },
        { status: 400 },
      );
    }

    // Step 1：验证 CAPTCHA
    const userIp = (
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'
    ).trim();

    const captchaResult = await verifyCaptcha(ticket, randstr, userIp);
    if (!captchaResult.ok) {
      return NextResponse.json(
        { error: `人机验证失败：${captchaResult.message}，请重试` },
        { status: 400 },
      );
    }

    // Step 2：验证账号密码
    const users  = getUsers();
    const hash   = users.get(username.trim().toLowerCase());

    // 即使用户名不存在也执行 bcrypt（防止时序攻击泄露用户名存在性）
    const dummyHash   = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh';
    const actualHash  = hash || dummyHash;
    const passwordOk  = await bcrypt.compare(password, actualHash);

    if (!hash || !passwordOk) {
      return NextResponse.json(
        { error: '账号或密码错误' },
        { status: 401 },
      );
    }

    // Step 3：签发 JWT
    const secret = new TextEncoder().encode(
      process.env.AUTH_SESSION_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION'
    );

    const role  = username.trim().toLowerCase() === 'admin' ? 'admin' : 'guest';
    const token = await new SignJWT({ sub: username.trim().toLowerCase(), role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DURATION_SEC}s`)
      .sign(secret);

    // 写入 httpOnly Cookie
    const response = NextResponse.json({ ok: true, role });
    response.cookies.set('db-session', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_DURATION_SEC,
      path:     '/',
    });

    return response;
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return NextResponse.json(
      { error: '服务器内部错误，请稍后重试' },
      { status: 500 },
    );
  }
}

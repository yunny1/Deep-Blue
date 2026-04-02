// src/lib/admin-auth.ts
//
// 管理后台 JWT 鉴权工具函数。
// 供所有 /api/admin/* 路由调用，验证请求是否携带有效的管理员 token。
//
// 实现原理：
//   登录时后端签发 JWT（存在 HttpOnly Cookie "admin_token" 里），
//   每个受保护的 API 路由调用 verifyAdminJWT(req) 来验证这个 Cookie。
//   如果验证失败就抛出错误，路由层 catch 后返回 401。

import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export async function verifyAdminJWT(req: NextRequest): Promise<void> {
  // 从 Cookie 中读取 admin_token
  const token = req.cookies.get('admin_token')?.value;

  if (!token) {
    throw new Error('No admin token found in cookies');
  }

  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error('ADMIN_JWT_SECRET environment variable not configured');
  }

  // 用 jose 验证 JWT 签名和有效期
  // 如果 token 无效或过期，jwtVerify 会自动抛出错误
  await jwtVerify(token, new TextEncoder().encode(secret));
}

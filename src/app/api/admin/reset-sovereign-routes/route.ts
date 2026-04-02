// src/app/api/admin/reset-sovereign-routes/route.ts
// 清除 Redis 里的主权路径数据，让页面回到从未上传过的初始状态（使用静态数据）
// 用 admin JWT 鉴权，和其他 admin 接口一致

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

async function redisDel(key: string): Promise<boolean> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ok = await redisDel('sovereign-routes:v1');
  return NextResponse.json({
    success: ok,
    message: ok
      ? 'Redis 数据已清除，自主权图谱页面现在将显示代码内置的静态数据。请重新上传你的 Excel 文件。'
      : '清除失败，请检查 Redis 连接配置。',
  });
}

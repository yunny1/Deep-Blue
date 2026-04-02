// src/app/api/admin/cable-search/route.ts
//
// 模糊搜索现有海缆，返回 top-10 相似结果。
// 使用 Prisma 的 contains + mode insensitive 实现不区分大小写的模糊匹配。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ cables: [] });

  // 将查询词拆成单词，对每个单词做 contains 匹配（OR 逻辑）
  const words = q.trim().split(/\s+/).filter(w => w.length >= 2);
  if (!words.length) return NextResponse.json({ cables: [] });

  const cables = await prisma.cable.findMany({
    where: {
      mergedInto: null,
      OR: words.map(w => ({ name: { contains: w, mode: 'insensitive' as const } })),
    },
    select: { slug: true, name: true, status: true, lengthKm: true, vendor: true },
    orderBy: { name: 'asc' },
    take: 10,
  });

  return NextResponse.json({ cables });
}

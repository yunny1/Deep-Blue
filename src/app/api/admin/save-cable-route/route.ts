// src/app/api/admin/save-cable-route/route.ts
// 专用于地图编辑器保存路线，设置 ROUTE_FIXED 防止 nightly-sync 覆盖

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic     = 'force-dynamic';
export const maxDuration = 30;

async function clearCache() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['del', 'cables:geo:details'],
      ['del', 'cables:geo'],
      ['del', 'cables:list'],
    ]),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { slug?: string; geojson?: object };
  const { slug, geojson } = body;

  if (!slug?.trim()) return NextResponse.json({ error: 'slug 必填' }, { status: 400 });
  if (!geojson)       return NextResponse.json({ error: 'geojson 必填' }, { status: 400 });

  const cable = await prisma.cable.findUnique({ where: { slug }, select: { id: true } });
  if (!cable) return NextResponse.json({ error: `找不到海缆：${slug}` }, { status: 404 });

  await prisma.cable.update({
    where: { id: cable.id },
    data: {
      routeGeojson:      geojson,
      isApproximateRoute: false,
      reviewStatus:      'ROUTE_FIXED',   // nightly-sync 遇到此状态会跳过路由覆盖
    },
  });

  await clearCache();

  return NextResponse.json({ success: true, slug });
}

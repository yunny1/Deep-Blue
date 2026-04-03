// src/app/api/admin/generate-approximate-routes/route.ts
//
// 根据海缆的登陆站坐标自动生成近似路由（LineString GeoJSON）
//
// 触发方式有两种：
//   1. 管理后台手动点击按钮 → POST /api/admin/generate-approximate-routes
//   2. 腾讯云 nightly-sync 完成后自动调用（在 scripts/nightly-sync.ts 末尾加一行 curl）
//
// 处理逻辑：
//   - 找出所有"有 ≥2 个带坐标的登陆站"但"routeGeojson 为 null"的海缆
//   - 可选参数 slug：只处理指定海缆（用于手动录入后立即生成的场景）
//   - 把登陆站按经度从西到东排序，连成 LineString
//   - 标记 isApproximateRoute = true（地图用虚线渲染，区别于精确路由）
//   - 完成后自动删除 Redis 里的地图缓存，让地球立即更新

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic  = 'force-dynamic';
export const maxDuration = 60; // 批量处理可能需要较长时间，设置 60 秒上限

// ── Redis 缓存清除（让地球地图立即反映新路由）────────────────────────────────
async function clearMapCache() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  // cables:geo:details 是主页 3D 地球的地理数据缓存，TTL 12 小时
  // 删除后下一次请求会重新从数据库读取，包含新生成的路由
  await fetch(`${url}/del/cables:geo:details`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => { /* 缓存清除失败不影响主流程 */ });
}

// ── 核心逻辑：为单条海缆生成近似路由 ─────────────────────────────────────────
// 返回值：'generated'（已生成）| 'skipped'（已有路由，跳过）| 'insufficient'（坐标不足）
async function generateForCable(cableId: string): Promise<{
  result: 'generated' | 'skipped' | 'insufficient';
  cableName: string;
  pointCount?: number;
}> {
  const cable = await prisma.cable.findUnique({
    where:   { id: cableId },
    select: {
      id:           true,
      name:         true,
      routeGeojson: true,
      landingStations: {
        select: {
          landingStation: {
            select: {
              latitude:  true,
              longitude: true,
              name:      true,
              countryCode: true,
            },
          },
        },
      },
    },
  });

  if (!cable) return { result: 'insufficient', cableName: cableId };

  // 已有路由坐标的海缆直接跳过，不覆盖（包括精确路由和之前生成的近似路由）
  if (cable.routeGeojson !== null) {
    return { result: 'skipped', cableName: cable.name };
  }

  // 过滤出有完整经纬度的登陆站
  const validStations = cable.landingStations
    .map(ls => ls.landingStation)
    .filter(s => s.latitude != null && s.longitude != null);

  // 少于 2 个有效坐标点无法连线
  if (validStations.length < 2) {
    return { result: 'insufficient', cableName: cable.name };
  }

  // 按经度从西到东排序，让连线在地理上尽量合理
  // 注意：这是大圆弧近似，对于跨越反子午线（±180°）的海缆需要特殊处理
  // 这类情况比较罕见，目前先用简单排序，必要时再针对性处理
  validStations.sort((a, b) => (a.longitude ?? 0) - (b.longitude ?? 0));

  const geojson = {
    type:        'LineString',
    coordinates: validStations.map(s => [s.longitude!, s.latitude!]),
  };

  await prisma.cable.update({
    where: { id: cable.id },
    data: {
      routeGeojson:       geojson,
      isApproximateRoute: true,
    },
  });

  return {
    result:     'generated',
    cableName:  cable.name,
    pointCount: validStations.length,
  };
}

// ── POST 处理器 ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 可选参数 slug：只处理某一条特定海缆（管理后台手动录入后的立即触发场景）
  // 不传则批量处理所有缺路由的海缆（nightly-sync 后的全量补充场景）
  const body = await req.json().catch(() => ({}));
  const targetSlug: string | undefined = body.slug;

  // ── 查询需要处理的海缆 ──────────────────────────────────────────────────────
  // 条件：routeGeojson 为空 AND 至少有一个登陆站（作为快速预筛选）
  // 精确的"≥2 个有效坐标点"判断在 generateForCable 内部做，
  // 因为数据库层面很难优雅地表达嵌套聚合条件。
  const whereClause = targetSlug
    ? { slug: targetSlug }
    : {
        routeGeojson:    { equals: Prisma.DbNull },
        landingStations: { some: {} }, // 有至少一个登陆站
        status:          { not: 'REMOVED' as const },
      };

  const cables = await prisma.cable.findMany({
    where:  whereClause,
    select: { id: true },
  });

  if (cables.length === 0) {
    return NextResponse.json({
      message:   targetSlug
        ? `海缆 "${targetSlug}" 已有路由坐标，无需处理`
        : '没有找到需要生成路由的海缆（所有海缆已有路由或无登陆站）',
      generated:  0,
      skipped:    0,
      insufficient: 0,
    });
  }

  // ── 逐条处理 ─────────────────────────────────────────────────────────────
  const results = { generated: 0, skipped: 0, insufficient: 0 };
  const details: string[] = [];

  for (const { id } of cables) {
    const { result, cableName, pointCount } = await generateForCable(id);
    results[result]++;

    if (result === 'generated') {
      details.push(`✓ ${cableName}（${pointCount} 个点）`);
    } else if (result === 'insufficient') {
      details.push(`⚠ ${cableName}（坐标不足，跳过）`);
    }
    // skipped 的不加入详情，避免日志太长
  }

  // ── 清除地图缓存，让地球立即更新 ──────────────────────────────────────────
  if (results.generated > 0) {
    await clearMapCache();
  }

  return NextResponse.json({
    message: `处理完成：生成 ${results.generated} 条，跳过 ${results.skipped} 条，坐标不足 ${results.insufficient} 条`,
    ...results,
    details,
  });
}

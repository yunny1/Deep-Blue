// src/app/api/admin/cable-save/route.ts
// 海缆录入保存接口（完整版）v3
//
// v3 修复（本轮变更）:
// 1. 移除本地的 clearMapCache 函数,改用 src/lib/cache-invalidation.ts 中的
//    invalidateCableCaches。这样除了清地图层缓存,还会清除 transit:analysis:v1
//    (金砖中转分析,TTL 6h),保证 admin 改完海缆后金砖战略页立刻反映。
//
// v2 修复:
// 1. 登陆站关联改为「全量替换」（先删后增），防止多次保存累积重复记录
// 2. 保存成功后自动清除 Redis 地图缓存,主页地球立即反映新路由

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';
import { invalidateCableCaches } from '@/lib/cache-invalidation';

export const dynamic = 'force-dynamic';

function toSlug(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    name, slug: slugInput, status, lengthKm, capacityTbps,
    fiberPairs, rfsDate, vendor, owners, url, notes,
    routeGeojson: routeGeojsonStr,
    landingStationIds = [],
    mergeIntoSlug = null,
  } = body as {
    name: string; slug?: string; status?: string;
    lengthKm?: string; capacityTbps?: string; fiberPairs?: string;
    rfsDate?: string; vendor?: string; owners?: string;
    url?: string; notes?: string; routeGeojson?: string;
    landingStationIds?: string[]; mergeIntoSlug?: string | null;
  };

  if (!name?.trim())
    return NextResponse.json({ error: '海缆名称为必填项' }, { status: 400 });

  // routeGeojson:字符串 → JSON 对象
  let routeGeojson: object | undefined;
  if (routeGeojsonStr?.trim()) {
    try { routeGeojson = JSON.parse(routeGeojsonStr); }
    catch { return NextResponse.json({ error: 'routeGeojson 格式错误,请粘贴合法的 GeoJSON' }, { status: 400 }); }
  }

  // rfsDate:年份字符串 → DateTime
  let rfsDt: Date | undefined;
  if (rfsDate?.trim()) {
    const yr = parseInt(rfsDate);
    if (!isNaN(yr) && yr > 1980 && yr < 2060) rfsDt = new Date(yr, 0, 1);
  }

  // vendor:按名字 upsert Company
  let vendorId: string | null = null;
  if (vendor?.trim()) {
    const c = await prisma.company.upsert({
      where: { name: vendor.trim() }, create: { name: vendor.trim(), type: 'vendor' }, update: {},
    });
    vendorId = c.id;
  }

  // owners:逗号分隔,逐个 upsert Company
  const ownerNames = (owners ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ownerCompanies = await Promise.all(
    ownerNames.map(n =>
      prisma.company.upsert({ where: { name: n }, create: { name: n, type: 'owner' }, update: {} })
    )
  );

  const cableData = {
    name:               name.trim(),
    status:             status ?? 'IN_SERVICE',
    lengthKm:           lengthKm     ? parseFloat(lengthKm)     : undefined,
    designCapacityTbps: capacityTbps ? parseFloat(capacityTbps) : undefined,
    fiberPairs:         fiberPairs   ? parseInt(fiberPairs)      : undefined,
    rfsDate:            rfsDt,
    notes:              notes?.trim() || undefined,
    routeGeojson:       routeGeojson,
    vendorId:           vendorId ?? undefined,
    reviewStatus:       'MANUALLY_ADDED',
    ...(url?.trim() ? { notes: `${notes?.trim() ?? ''}${notes ? '\n' : ''}官方链接: ${url.trim()}` } : {}),
  };

  let cableId: string;
  let finalSlug: string;

  if (mergeIntoSlug) {
    // 合并模式:更新现有记录(undefined 字段 Prisma 自动跳过,不清空原有值)
    const updated = await prisma.cable.update({ where: { slug: mergeIntoSlug }, data: cableData });
    cableId = updated.id; finalSlug = updated.slug;
  } else {
    // 新建模式
    const slug = slugInput?.trim() || toSlug(name);
    const existingCount = await prisma.cable.count({ where: { slug: { startsWith: slug } } });
    const uniqueSlug = existingCount > 0 ? `${slug}-${existingCount}` : slug;
    const created = await prisma.cable.create({ data: { ...cableData, slug: uniqueSlug } });
    cableId = created.id; finalSlug = created.slug;
  }

  // owners:先清空旧关联,再重建
  if (ownerCompanies.length > 0) {
    await prisma.cableOwnership.deleteMany({ where: { cableId } });
    await prisma.cableOwnership.createMany({
      data: ownerCompanies.map(c => ({ cableId, companyId: c.id })),
      skipDuplicates: true,
    });
  }

  // ── 登陆站关联:全量替换(先删后增)──────────────────────────────────
  // 关键修复:从「只追加」改为「全量替换」。
  //
  // 旧策略的问题:每次保存都追加,多次保存后站点数量不断累积
  //(比如第一次 9 个,第二次又追加 9 个变成 15 个,skipDuplicates 只过滤完全相同的 ID)。
  //
  // 新策略:把鱼骨拓扑编辑器的输出作为"当前这条缆应该有哪些登陆站"的唯一事实来源,
  // 每次保存都先清空再重建,保证数据库和编辑器的状态完全一致。
  if (landingStationIds.length > 0) {
    // 先删除该缆的所有登陆站关联
    await prisma.cableLandingStation.deleteMany({ where: { cableId } });
    // 再写入编辑器提供的完整列表
    await prisma.cableLandingStation.createMany({
      data: landingStationIds.map(lsId => ({ cableId, landingStationId: lsId })),
      skipDuplicates: true,
    });
  }

  // ── 缓存清除 ─────────────────────────────────────────────────────────
  // v3 变更:从 clearMapCache(只清地图层4个 key)升级为 invalidateCableCaches
  //(同时清除 transit:analysis:v1,保证金砖战略页立即更新)。
  //
  // 必须 await:Vercel serverless 函数返回响应后实例立即回收,
  // fire-and-forget 的 fetch 可能根本没发出去。
  await invalidateCableCaches();

  return NextResponse.json({
    ok: true, slug: finalSlug, cableId,
    message: mergeIntoSlug ? `已合并更新到 ${finalSlug}` : `已新建 ${finalSlug}`,
  });
}

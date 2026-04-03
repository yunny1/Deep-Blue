// src/app/api/admin/cable-save/route.ts
// 海缆录入保存接口（完整版）
// 处理：新建 or 合并更新、vendor/owners 查找或创建、登陆站关联、routeGeojson 写入
// 保存后打上 MANUALLY_ADDED 标记，nightly-sync 不会覆盖

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// 把海缆名字转成 slug，例如 "PEACE Cable" → "peace-cable"
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
    name,
    slug: slugInput,
    status,
    lengthKm,
    capacityTbps,
    fiberPairs,
    rfsDate,
    vendor,
    owners,
    url,
    notes,
    routeGeojson: routeGeojsonStr,
    landingStationIds = [],   // string[]  — 已在 DB 中的登陆站 ID
    mergeIntoSlug = null,     // string | null
  } = body as {
    name: string;
    slug?: string;
    status?: string;
    lengthKm?: string;
    capacityTbps?: string;
    fiberPairs?: string;
    rfsDate?: string;
    vendor?: string;
    owners?: string;
    url?: string;
    notes?: string;
    routeGeojson?: string;
    landingStationIds?: string[];
    mergeIntoSlug?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: '海缆名称为必填项' }, { status: 400 });
  }

  // ── 处理 routeGeojson：字符串 → JSON 对象 ─────────────────────────────────
  let routeGeojson: object | undefined = undefined;
  if (routeGeojsonStr?.trim()) {
    try {
      routeGeojson = JSON.parse(routeGeojsonStr);
    } catch {
      return NextResponse.json({ error: 'routeGeojson 格式错误，请粘贴合法的 GeoJSON' }, { status: 400 });
    }
  }

  // ── 处理 rfsDate：年份字符串 "2023" → DateTime ────────────────────────────
  let rfsDt: Date | undefined = undefined;
  if (rfsDate?.trim()) {
    const yr = parseInt(rfsDate);
    if (!isNaN(yr) && yr > 1980 && yr < 2060) {
      rfsDt = new Date(yr, 0, 1); // 1 月 1 日作为代表日期
    }
  }

  // ── 处理 vendor（建造商）：按名字 upsert Company ──────────────────────────
  let vendorId: string | null = null;
  if (vendor?.trim()) {
    const company = await prisma.company.upsert({
      where:  { name: vendor.trim() },
      create: { name: vendor.trim(), type: 'vendor' },
      update: {},
    });
    vendorId = company.id;
  }

  // ── 处理 owners（运营商，逗号分隔）─────────────────────────────────────────
  const ownerNames = (owners ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ownerCompanies = await Promise.all(
    ownerNames.map(n =>
      prisma.company.upsert({
        where:  { name: n },
        create: { name: n, type: 'owner' },
        update: {},
      })
    )
  );

  // ── 构造 Cable 数据对象 ───────────────────────────────────────────────────
  const cableData = {
    name:                name.trim(),
    status:              status ?? 'IN_SERVICE',
    lengthKm:            lengthKm  ? parseFloat(lengthKm)  : undefined,
    designCapacityTbps:  capacityTbps ? parseFloat(capacityTbps) : undefined,
    fiberPairs:          fiberPairs   ? parseInt(fiberPairs)   : undefined,
    rfsDate:             rfsDt,
    notes:               notes?.trim() || undefined,
    routeGeojson:        routeGeojson,
    vendorId:            vendorId ?? undefined,
    reviewStatus:        'MANUALLY_ADDED',
    // url 存到 notes 里（schema 无独立 url 字段，用备注记录）
    ...(url?.trim() ? { notes: `${notes?.trim() ?? ''}${notes ? '\n' : ''}官方链接: ${url.trim()}` } : {}),
  };

  let cableId: string;
  let finalSlug: string;

  if (mergeIntoSlug) {
    // ── 合并模式：找到现有记录并更新 ─────────────────────────────────────────
    // 只更新表单里填了的字段（undefined 字段 Prisma 会自动跳过，不会清空原有值）
    const updated = await prisma.cable.update({
      where: { slug: mergeIntoSlug },
      data:  cableData,
    });
    cableId    = updated.id;
    finalSlug  = updated.slug;
  } else {
    // ── 新建模式 ───────────────────────────────────────────────────────────
    const slug = slugInput?.trim() || toSlug(name);
    // slug 唯一性保障：如果已存在就加后缀
    const existingCount = await prisma.cable.count({ where: { slug: { startsWith: slug } } });
    const uniqueSlug = existingCount > 0 ? `${slug}-${existingCount}` : slug;

    const created = await prisma.cable.create({
      data: { ...cableData, slug: uniqueSlug },
    });
    cableId   = created.id;
    finalSlug = created.slug;
  }

  // ── 处理 owners：清空旧的关联，重新写入 ──────────────────────────────────
  // 合并模式时也重建，保证 owners 列表与表单一致
  if (ownerCompanies.length > 0) {
    await prisma.cableOwnership.deleteMany({ where: { cableId } });
    await prisma.cableOwnership.createMany({
      data: ownerCompanies.map(c => ({ cableId, companyId: c.id })),
      skipDuplicates: true,
    });
  }

  // ── 处理登陆站关联：只追加，不删除原有关联 ───────────────────────────────
  // 保留原有关联是因为用户可能只补录了部分站，不应该抹掉 nightly-sync 已经建立的关联
  if (landingStationIds.length > 0) {
    await prisma.cableLandingStation.createMany({
      data: landingStationIds.map(lsId => ({
        cableId,
        landingStationId: lsId,
      })),
      skipDuplicates: true, // 已关联的自动跳过，不报错
    });
  }

  return NextResponse.json({
    ok:      true,
    slug:    finalSlug,
    cableId: cableId,
    message: mergeIntoSlug
      ? `已合并更新到 ${finalSlug}`
      : `已新建 ${finalSlug}`,
  });
}

// src/app/api/admin/cable-save/route.ts
//
// 保存海缆：新建 or 合并到已有记录。
// 注意：vendor（建造商）和 owners（运营商）在 Prisma schema 里是关联字段（→ Company 表），
// 不能直接赋值字符串，因此把这两个字段合并写入 notes 作为文本备注。
// 关键：自动设置 reviewStatus = 'MANUALLY_ADDED'，nightly-sync 会跳过这条记录。

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyAdminJWT } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { mergeIntoSlug, ...fields } = body;

  // 把 vendor 和 owners 拼入 notes，避免直接操作关联字段
  const vendorNote  = fields.vendor ? `[建造商] ${fields.vendor}` : '';
  const ownersNote  = fields.owners ? `[运营商] ${fields.owners}` : '';
  const extraNotes  = [vendorNote, ownersNote, fields.notes].filter(Boolean).join('\n');

  // 只保留纯标量字段（不包含关联字段 vendor / owners）
  const scalarData = {
    name:         String(fields.name   ?? '').trim(),
    // status 必须是 enum 值，做一次白名单校验
    status: (
      ['IN_SERVICE','UNDER_CONSTRUCTION','PLANNED','RETIRED','DECOMMISSIONED']
        .includes(fields.status)
        ? fields.status
        : 'PLANNED'
    ) as string,
    lengthKm:     fields.lengthKm     ? Number(fields.lengthKm)     : null,
    capacityTbps: fields.capacityTbps ? Number(fields.capacityTbps) : null,
    fiberPairs:   fields.fiberPairs   ? Number(fields.fiberPairs)   : null,
    rfsDate:      fields.rfsDate      ? String(fields.rfsDate)      : null,
    notes:        extraNotes || null,
    // MANUALLY_ADDED 标记让 nightly-sync 跳过此记录的路由覆盖
    reviewStatus: 'MANUALLY_ADDED',
  };

  if (!scalarData.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    if (mergeIntoSlug) {
      // 合并模式：更新已有记录的标量字段，保留原有路由几何（routeGeojson 不动）
      const updated = await prisma.cable.update({
        where: { slug: mergeIntoSlug },
        data:  scalarData,
      });
      return NextResponse.json({ slug: updated.slug, action: 'merged' });
    } else {
      // 新建模式：生成 slug，检查冲突后创建
      let slug = scalarData.name
        .toLowerCase()
        .replace(/[\s\u4e00-\u9fa5]+/g, '-') // 中文和空格转连字符
        .replace(/[^a-z0-9-]/g, '')           // 去除其他特殊字符
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      if (!slug) slug = `cable-${Date.now().toString(36)}`;

      // 如果 slug 已存在就加时间戳后缀
      const existing = await prisma.cable.findUnique({ where: { slug } });
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      const created = await prisma.cable.create({ data: { ...scalarData, slug } });
      return NextResponse.json({ slug: created.slug, action: 'created' });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cable-save]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

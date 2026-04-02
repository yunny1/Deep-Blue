// src/app/api/admin/cable-save/route.ts
//
// 保存海缆：新建 or 合并到已有记录。
// 关键：自动设置 reviewStatus = 'MANUALLY_ADDED'，
// nightly-sync 脚本读取到这个值就会跳过该记录的路由覆盖。

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

  // 清理和转换字段
  const clean = {
    name:         String(fields.name   ?? '').trim(),
    status:       (fields.status       || 'PLANNED') as string,
    lengthKm:     fields.lengthKm      ? Number(fields.lengthKm)     : null,
    capacityTbps: fields.capacityTbps  ? Number(fields.capacityTbps) : null,
    fiberPairs:   fields.fiberPairs    ? Number(fields.fiberPairs)    : null,
    rfsDate:      fields.rfsDate       ? String(fields.rfsDate)       : null,
    vendor:       fields.vendor        ? String(fields.vendor)        : null,
    notes:        fields.notes         ? String(fields.notes)         : null,
    // MANUALLY_ADDED 标记：nightly-sync 看到这个值会跳过路由覆盖
    reviewStatus: 'MANUALLY_ADDED',
  };

  if (!clean.name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  try {
    if (mergeIntoSlug) {
      // 合并模式：更新已有记录，保留原有路由几何，更新其他字段
      const updated = await prisma.cable.update({
        where: { slug: mergeIntoSlug },
        data: {
          ...clean,
          // routeGeojson 不覆盖（保留已有真实路由数据）
        },
      });

      // 如果表单里有运营商，同步更新 owners 关联（简化版：先删后插）
      if (fields.owners) {
        const ownerNames = String(fields.owners).split(',').map((s: string) => s.trim()).filter(Boolean);
        // 这里做简化处理：把运营商存到 notes 字段里，实际项目中可根据具体 schema 调整
        await prisma.cable.update({
          where: { slug: mergeIntoSlug },
          data: { notes: `[运营商] ${ownerNames.join(', ')}${clean.notes ? '\n' + clean.notes : ''}` },
        });
      }

      return NextResponse.json({ slug: updated.slug, action: 'merged' });
    } else {
      // 新建模式：生成 slug（从名称转换），避免冲突
      let slug = clean.name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

      // 检查 slug 冲突，添加数字后缀
      const existing = await prisma.cable.findUnique({ where: { slug } });
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      const created = await prisma.cable.create({
        data: { ...clean, slug },
      });

      return NextResponse.json({ slug: created.slug, action: 'created' });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

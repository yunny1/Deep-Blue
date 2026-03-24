// src/app/api/cables/filter-options/route.ts
// 返回各筛选维度的海缆数量，支持跨维度过滤后的实时计数
// v7: 排除已合并记录（mergedInto: null）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 接收已激活的跨维度过滤条件
  const statusFilter  = searchParams.get('statuses')?.split(',').filter(Boolean) || [];
  const vendorFilter  = searchParams.get('vendors')?.split(',').filter(Boolean)  || [];
  const opFilter      = searchParams.get('operators')?.split(',').filter(Boolean) || [];
  const yearMin       = parseInt(searchParams.get('yearMin') || '1990');
  const yearMax       = parseInt(searchParams.get('yearMax') || '2030');

  // 基础 where 条件（排除 PENDING_REVIEW + 已合并记录）
  const baseWhere: any = {
    status: { not: 'PENDING_REVIEW' },
    mergedInto: null,  // v7: 排除已合并记录
    OR: [
      { rfsDate: null },
      {
        rfsDate: {
          gte: new Date(yearMin, 0, 1),
          lte: new Date(yearMax, 11, 31),
        },
      },
    ],
  };

  // 跨维度过滤条件叠加
  if (statusFilter.length > 0) baseWhere.status = { in: statusFilter };
  if (vendorFilter.length > 0) {
    baseWhere.vendor = { name: { in: vendorFilter } };
  }
  if (opFilter.length > 0) {
    baseWhere.owners = { some: { company: { name: { in: opFilter } } } };
  }

  try {
    // 并行查询各维度计数
    const [
      allCables,
      statusCounts,
      vendorCounts,
      operatorCounts,
    ] = await Promise.all([
      // 总数（应用所有过滤后）
      prisma.cable.count({ where: baseWhere }),

      // 各状态计数（不受 status 过滤影响，但受其他过滤影响）
      prisma.cable.groupBy({
        by: ['status'],
        where: {
          ...baseWhere,
          status: { not: 'PENDING_REVIEW' },
        },
        _count: true,
      }),

      // 各建造商计数
      prisma.cable.groupBy({
        by: ['vendorId'],
        where: baseWhere,
        _count: true,
      }),

      // 各运营商计数（需要 join）
      prisma.cableOwnership.groupBy({
        by: ['companyId'],
        where: {
          cable: baseWhere,
        },
        _count: true,
      }),
    ]);

    // 获取 vendor 和 operator 名称
    const vendorIds = vendorCounts.map(v => v.vendorId).filter(Boolean) as string[];
    const opIds     = operatorCounts.map(o => o.companyId);

    const [vendors, operators] = await Promise.all([
      vendorIds.length > 0
        ? prisma.company.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } })
        : [],
      opIds.length > 0
        ? prisma.company.findMany({ where: { id: { in: opIds }, type: 'OPERATOR' }, select: { id: true, name: true } })
        : [],
    ]);

    const vendorMap = new Map(vendors.map(v => [v.id, v.name]));
    const opMap     = new Map(operators.map(o => [o.id, o.name]));

    // 无 vendorId 的海缆算作"其他"
    const knownVendorTotal = vendorCounts
      .filter(v => v.vendorId)
      .reduce((s, v) => s + v._count, 0);
    const otherVendorCount = allCables - knownVendorTotal;

    return NextResponse.json({
      total: allCables,
      statuses: statusCounts.map(s => ({
        key:   s.status,
        count: s._count,
      })),
      vendors: [
        ...vendorCounts
          .filter(v => v.vendorId && vendorMap.has(v.vendorId!))
          .map(v => ({ name: vendorMap.get(v.vendorId!)!, count: v._count }))
          .sort((a, b) => b.count - a.count),
        ...(otherVendorCount > 0 ? [{ name: '__other__', count: otherVendorCount }] : []),
      ],
      operators: operatorCounts
        .filter(o => opMap.has(o.companyId))
        .map(o => ({ name: opMap.get(o.companyId)!, count: o._count }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (e: any) {
    console.error('filter-options error:', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

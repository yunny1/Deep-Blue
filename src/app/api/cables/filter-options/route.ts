// src/app/api/cables/filter-options/route.ts
// 返回各筛选维度的海缆数量，支持跨维度过滤后的实时计数
// v8: 排除 REMOVED + mergedInto

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const statusFilter  = searchParams.get('statuses')?.split(',').filter(Boolean) || [];
  const vendorFilter  = searchParams.get('vendors')?.split(',').filter(Boolean)  || [];
  const opFilter      = searchParams.get('operators')?.split(',').filter(Boolean) || [];
  const yearMin       = parseInt(searchParams.get('yearMin') || '1990');
  const yearMax       = parseInt(searchParams.get('yearMax') || '2030');

  // v8: 基础条件排除 PENDING_REVIEW + REMOVED + 已合并
  const baseWhere: any = {
    status: { notIn: ['PENDING_REVIEW', 'REMOVED'] },
    mergedInto: null,
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

  if (statusFilter.length > 0) baseWhere.status = { in: statusFilter };
  if (vendorFilter.length > 0) {
    baseWhere.vendor = { name: { in: vendorFilter } };
  }
  if (opFilter.length > 0) {
    baseWhere.owners = { some: { company: { name: { in: opFilter } } } };
  }

  try {
    const [
      allCables,
      statusCounts,
      vendorCounts,
      operatorCounts,
    ] = await Promise.all([
      prisma.cable.count({ where: baseWhere }),

      prisma.cable.groupBy({
        by: ['status'],
        where: {
          ...baseWhere,
          status: { notIn: ['PENDING_REVIEW', 'REMOVED'] },
        },
        _count: true,
      }),

      prisma.cable.groupBy({
        by: ['vendorId'],
        where: baseWhere,
        _count: true,
      }),

      prisma.cableOwnership.groupBy({
        by: ['companyId'],
        where: {
          cable: baseWhere,
        },
        _count: true,
      }),
    ]);

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

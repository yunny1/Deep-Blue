// src/app/api/cables/[slug]/route.ts
// 单条海缆详情 API — 包含 nameZh 字段

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const cable = await prisma.cable.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
      include: {
        vendor: true,
        owners: { include: { company: true } },
        landingStations: {
          include: {
            landingStation: {
              include: { country: true },
            },
          },
          orderBy: {
            landingStation: { name: 'asc' },
          },
        },
        riskScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!cable) {
      return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
    }

    // 返回结构包含 nameZh
    return NextResponse.json({
      ...cable,
      landingStations: cable.landingStations.map(ls => ({
        ...ls,
        landingStation: {
          ...ls.landingStation,
          // nameZh 已在 schema 里，直接透传
        },
      })),
    });
  } catch (error) {
    console.error('Cable detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch cable' }, { status: 500 });
  }
}

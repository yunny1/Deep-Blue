// src/app/api/cables/[slug]/route.ts
// 单条海缆详情API - 根据slug返回完整信息（含登陆站、事件等）
// 右侧详情面板调用这个API

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    // 先尝试用slug查找，找不到就用id查找
    let cable = await prisma.cable.findUnique({
      where: { slug },
      include: {
        vendor: true,
        owners: { include: { company: true } },
        landingStations: {
          include: {
            landingStation: {
              include: { country: true },
            },
          },
        },
        events: {
          include: { event: true },
        },
        riskScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
      },
    });

    // 如果slug找不到，尝试用id查找
    if (!cable) {
      cable = await prisma.cable.findUnique({
        where: { id: slug },
        include: {
          vendor: true,
          owners: { include: { company: true } },
          landingStations: {
            include: {
              landingStation: {
                include: { country: true },
              },
            },
          },
          events: {
            include: { event: true },
          },
          riskScores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
        },
      });
    }

    if (!cable) {
      return NextResponse.json({ error: 'Cable not found' }, { status: 404 });
    }

    return NextResponse.json(cable);
  } catch (error) {
    console.error('Failed to fetch cable detail:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

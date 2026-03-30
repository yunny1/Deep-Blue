// src/app/api/country/bulk-export/route.ts
// 多国海缆批量导出 API
// 用法：GET /api/country/bulk-export?codes=CN,US,JP,BR
// 返回：JSON（前端转 CSV）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 大中华区合并规则（和主站保持一致）
const CHINA_GROUP = new Set(['CN', 'TW', 'HK', 'MO']);

// 内陆国（无海岸线，海缆极少）
const LANDLOCKED = new Set(['ET','BY','BO','KZ','UZ','UG','RU_INLAND']);

// 基础过滤：排除已合并、已删除、待审核的海缆
const ACTIVE_FILTER = {
  mergedInto: null,
  status: { notIn: ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'] as string[] },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codesParam = searchParams.get('codes') || '';

  if (!codesParam) {
    return NextResponse.json({ error: 'codes parameter required (e.g. ?codes=CN,US,JP)' }, { status: 400 });
  }

  // 解析国家代码列表，去重，转大写
  const requestedCodes = [...new Set(codesParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))];

  if (requestedCodes.length === 0 || requestedCodes.length > 50) {
    return NextResponse.json({ error: 'Please provide 1–50 country codes' }, { status: 400 });
  }

  // 构建查询目标：如果包含 CN，自动合并 TW/HK/MO
  const queryTargets: string[] = [];
  const cnExpanded = new Set<string>();
  for (const code of requestedCodes) {
    if (code === 'CN') {
      queryTargets.push('CN', 'TW', 'HK', 'MO');
      cnExpanded.add('CN'); cnExpanded.add('TW'); cnExpanded.add('HK'); cnExpanded.add('MO');
    } else {
      queryTargets.push(code);
    }
  }

  try {
    // 一次性查询所有涉及目标国家的海缆
    const cables = await prisma.cable.findMany({
      where: {
        ...ACTIVE_FILTER,
        landingStations: {
          some: { landingStation: { countryCode: { in: queryTargets } } },
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        lengthKm: true,
        fiberPairs: true,
        rfsDate: true,
        isApproximateRoute: true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: {
            landingStation: {
              select: {
                id: true,
                name: true,
                nameZh: true,
                countryCode: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // 为每个目标国家整理数据
    const result: Record<string, {
      countryCode: string;
      cables: {
        slug: string;
        name: string;
        status: string;
        lengthKm: number | null;
        fiberPairs: number | null;
        rfsYear: number | null;
        vendor: string | null;
        operators: string[];
        localStations: { name: string; nameZh: string | null; lat: number | null; lng: number | null }[];
        totalStations: number;
        isInternational: boolean;
      }[];
    }> = {};

    for (const code of requestedCodes) {
      // 确定这个国家码对应的实际查询码（CN 包含 TW/HK/MO）
      const matchCodes = code === 'CN' ? cnExpanded : new Set([code]);

      // 筛选这个国家相关的海缆
      const countryCables = cables.filter(cable =>
        cable.landingStations.some(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
      );

      // 整理每条海缆的数据
      const cableData = countryCables.map(cable => {
        const allCodes = [...new Set(cable.landingStations.map(cls => cls.landingStation.countryCode ?? ''))];
        // 判断是国际缆还是国内缆
        const normalizedCodes = allCodes.map(c => CHINA_GROUP.has(c) ? 'CN' : c);
        const uniqueNormalized = [...new Set(normalizedCodes)];
        const isInternational = uniqueNormalized.length > 1;

        // 本国登陆站
        const localStations = cable.landingStations
          .filter(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
          .map(cls => ({
            name: cls.landingStation.name,
            nameZh: cls.landingStation.nameZh ?? null,
            lat: cls.landingStation.latitude ?? null,
            lng: cls.landingStation.longitude ?? null,
          }));

        return {
          slug: cable.slug,
          name: cable.name,
          status: cable.status,
          lengthKm: cable.lengthKm ?? null,
          fiberPairs: cable.fiberPairs ?? null,
          rfsYear: cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
          vendor: cable.vendor?.name ?? null,
          operators: cable.owners.map(o => o.company.name),
          localStations,
          totalStations: cable.landingStations.length,
          isInternational,
        };
      });

      result[code] = { countryCode: code, cables: cableData };
    }

    return NextResponse.json({
      codes: requestedCodes,
      data: result,
      meta: {
        totalCountries: requestedCodes.length,
        totalUniqueCables: cables.length,
        generatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[BulkExport]', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  }
}

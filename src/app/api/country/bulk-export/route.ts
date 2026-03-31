// src/app/api/country/bulk-export/route.ts
// 多国海缆批量导出 API
// v2：新增 allStations 字段（所有登陆站，不限于本国）
// 用法：GET /api/country/bulk-export?codes=CN,US,JP,BR
// 返回：JSON（前端转 CSV）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CHINA_GROUP = new Set(['CN', 'TW', 'HK', 'MO']);
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

  const requestedCodes = [...new Set(codesParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))];
  if (requestedCodes.length === 0 || requestedCodes.length > 50) {
    return NextResponse.json({ error: 'Please provide 1–50 country codes' }, { status: 400 });
  }

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
    const cables = await prisma.cable.findMany({
      where: {
        ...ACTIVE_FILTER,
        landingStations: {
          some: { landingStation: { countryCode: { in: queryTargets } } },
        },
      },
      select: {
        id: true, slug: true, name: true, status: true,
        lengthKm: true, fiberPairs: true, rfsDate: true,
        isApproximateRoute: true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } } } },
        landingStations: {
          select: {
            landingStation: {
              select: {
                id: true, name: true, nameZh: true,
                countryCode: true, latitude: true, longitude: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result: Record<string, {
      countryCode: string;
      cables: {
        slug: string; name: string; status: string;
        lengthKm: number | null; fiberPairs: number | null; rfsYear: number | null;
        vendor: string | null; operators: string[];
        localStations: { name: string; nameZh: string | null; lat: number | null; lng: number | null }[];
        // ✅ v2 新增：全部登陆站（不限本国）
        allStations: { name: string; nameZh: string | null; countryCode: string; lat: number | null; lng: number | null }[];
        totalStations: number;
        isInternational: boolean;
      }[];
    }> = {};

    for (const code of requestedCodes) {
      const matchCodes = code === 'CN' ? cnExpanded : new Set([code]);

      const countryCables = cables.filter(cable =>
        cable.landingStations.some(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
      );

      const cableData = countryCables.map(cable => {
        const allCodes = [...new Set(cable.landingStations.map(cls => cls.landingStation.countryCode ?? ''))];
        const normalizedCodes = allCodes.map(c => CHINA_GROUP.has(c) ? 'CN' : c);
        const isInternational = [...new Set(normalizedCodes)].length > 1;

        const localStations = cable.landingStations
          .filter(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
          .map(cls => ({
            name: cls.landingStation.name,
            nameZh: cls.landingStation.nameZh ?? null,
            lat: cls.landingStation.latitude ?? null,
            lng: cls.landingStation.longitude ?? null,
          }));

        // ✅ v2：全部登陆站
        const allStations = cable.landingStations.map(cls => ({
          name: cls.landingStation.name,
          nameZh: cls.landingStation.nameZh ?? null,
          countryCode: cls.landingStation.countryCode ?? '',
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
          allStations,
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

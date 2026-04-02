// src/app/api/country/bulk-export/route.ts
// 修复：
// 1. 移除 RETIRED 的过滤（SEA-ME-WE 3 等已退役但重要的海缆应当显示）
// 2. Taiwan 登陆站改用 CNTW / "China Taiwan" 标签（含保护名单）
// 3. 新增 ?includeRetired=true 参数控制是否包含退役缆（默认 true）

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const CHINA_GROUP = new Set(['CN', 'TW', 'HK', 'MO']);

// Taiwan 登陆站替换规则：这些海缆的 TW 站点显示为 CNTW / China Taiwan
// 数据库不改动，仅在导出时做展示层替换，防止 nightly-sync 覆盖
const TAIWAN_CABLE_NAMES = new Set([
  'Apricot',
  'Asia United Gateway East (AUG East)',
  'Candle',
  'E2A',
  'FASTER',
  'ORCA',
  'Pacific Light Cable Network (PLCN)',
  'Taiwan Penghu Kinmen Matsu No.2 (TPKM2)',
  'Taiwan Penghu Kinmen Matsu No.3 (TPKM3)',
  'Taiwan-Matsu No.4',
  'Topaz',
  'TPU',
]);

// 将 TW 站点的 countryCode 替换为 CNTW（仅用于导出展示）
function normalizeTaiwanStation(cableName: string, station: {
  name: string; nameZh: string | null; countryCode: string;
  lat: number | null; lng: number | null;
}) {
  if (TAIWAN_CABLE_NAMES.has(cableName) && station.countryCode === 'TW') {
    return { ...station, countryCode: 'CNTW', countryLabel: 'China Taiwan 中国台湾' };
  }
  return { ...station, countryLabel: null };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const codesParam      = searchParams.get('codes') || '';
  // 默认包含退役缆（SEA-ME-WE 3 等），可传 includeRetired=false 排除
  const includeRetired  = searchParams.get('includeRetired') !== 'false';

  if (!codesParam) {
    return NextResponse.json({ error: 'codes parameter required (e.g. ?codes=CN,US,JP)' }, { status: 400 });
  }

  const requestedCodes = [...new Set(
    codesParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
  )];
  if (requestedCodes.length === 0 || requestedCodes.length > 50) {
    return NextResponse.json({ error: 'Please provide 1–50 country codes' }, { status: 400 });
  }

  const queryTargets: string[] = [];
  const cnExpanded = new Set<string>();
  for (const code of requestedCodes) {
    if (code === 'CN') {
      queryTargets.push('CN', 'TW', 'HK', 'MO');
      cnExpanded.add('CN'); cnExpanded.add('TW');
      cnExpanded.add('HK'); cnExpanded.add('MO');
    } else {
      queryTargets.push(code);
    }
  }

  // status 过滤：去掉 PENDING_REVIEW 和 REMOVED，
  // RETIRED/DECOMMISSIONED 默认保留（用户需要历史数据）
  const statusExclude = includeRetired
    ? ['PENDING_REVIEW', 'REMOVED']
    : ['PENDING_REVIEW', 'REMOVED', 'RETIRED', 'DECOMMISSIONED'];

  try {
    const cables = await prisma.cable.findMany({
      where: {
        mergedInto: null,
        status: { notIn: statusExclude as string[] },
        landingStations: {
          some: { landingStation: { countryCode: { in: queryTargets } } },
        },
      },
      select: {
        id: true, slug: true, name: true, status: true,
        lengthKm: true, fiberPairs: true, rfsDate: true,
        isApproximateRoute: true,
        vendor:  { select: { name: true } },
        owners:  { select: { company: { select: { name: true } } } },
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
        localStations: { name: string; nameZh: string | null; countryCode: string; countryLabel: string | null; lat: number | null; lng: number | null }[];
        allStations:   { name: string; nameZh: string | null; countryCode: string; countryLabel: string | null; lat: number | null; lng: number | null }[];
        totalStations: number;
        isInternational: boolean;
        isRetired: boolean;
      }[];
    }> = {};

    for (const code of requestedCodes) {
      const matchCodes = code === 'CN' ? cnExpanded : new Set([code]);

      const countryCables = cables.filter(cable =>
        cable.landingStations.some(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
      );

      const cableData = countryCables.map(cable => {
        const allCodes  = [...new Set(cable.landingStations.map(cls => cls.landingStation.countryCode ?? ''))];
        const normCodes = allCodes.map(c => CHINA_GROUP.has(c) ? 'CN' : c);
        const isInternational = [...new Set(normCodes)].length > 1;

        const localStations = cable.landingStations
          .filter(cls => matchCodes.has(cls.landingStation.countryCode ?? ''))
          .map(cls => {
            const raw = {
              name:        cls.landingStation.name,
              nameZh:      cls.landingStation.nameZh ?? null,
              countryCode: cls.landingStation.countryCode ?? '',
              lat:         cls.landingStation.latitude ?? null,
              lng:         cls.landingStation.longitude ?? null,
            };
            const norm = normalizeTaiwanStation(cable.name, raw);
            return norm;
          });

        const allStations = cable.landingStations.map(cls => {
          const raw = {
            name:        cls.landingStation.name,
            nameZh:      cls.landingStation.nameZh ?? null,
            countryCode: cls.landingStation.countryCode ?? '',
            lat:         cls.landingStation.latitude ?? null,
            lng:         cls.landingStation.longitude ?? null,
          };
          return normalizeTaiwanStation(cable.name, raw);
        });

        return {
          slug:          cable.slug,
          name:          cable.name,
          status:        cable.status,
          lengthKm:      cable.lengthKm ?? null,
          fiberPairs:    cable.fiberPairs ?? null,
          rfsYear:       cable.rfsDate ? new Date(cable.rfsDate).getFullYear() : null,
          vendor:        cable.vendor?.name ?? null,
          operators:     cable.owners.map(o => o.company.name),
          localStations,
          allStations,
          totalStations: cable.landingStations.length,
          isInternational,
          isRetired:     cable.status === 'RETIRED' || cable.status === 'DECOMMISSIONED',
        };
      });

      result[code] = { countryCode: code, cables: cableData };
    }

    return NextResponse.json({
      codes: requestedCodes,
      data: result,
      meta: {
        totalCountries:     requestedCodes.length,
        totalUniqueCables:  cables.length,
        includeRetired,
        generatedAt:        new Date().toISOString(),
        note: 'Taiwan cable stations are labeled CNTW/China Taiwan in export. SEA-ME-WE 3 and other retired cables are included by default.',
      },
    });

  } catch (error) {
    console.error('[BulkExport]', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  }
}

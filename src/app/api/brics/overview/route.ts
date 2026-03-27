import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_ALL, normalizeBRICS, isBRICSCountry, isBRICSInternalCable, isDomesticCable  } from '@/lib/brics-constants';

export const revalidate = 3600;
const AF = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED','RETIRED','DECOMMISSIONED'] as string[] } };

export async function GET() {
  try {
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count({ where: AF }), prisma.landingStation.count(),
    ]);

    const raw = await prisma.cable.findMany({
      where: AF,
      select: {
        id:true, slug:true, name:true, status:true, lengthKm:true,
        rfsDate:true, fiberPairs:true, designCapacityTbps:true,
        vendor: { select: { name: true } },
        owners: { select: { company: { select: { name: true } }, sharePercent: true } },
        landingStations: { select: { landingStation: { select: { name:true, countryCode:true, city:true } } } },
      },
    });

    const cables = raw.map(c => {
      const rawCodes = c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[];
      const normalizedCodes = rawCodes.map(normalizeBRICS);
      const uniqueNorm = [...new Set(normalizedCodes)];
      const stations = c.landingStations.map(cls => ({ name: cls.landingStation.name, country: cls.landingStation.countryCode, city: cls.landingStation.city }));
      const owners = c.owners.map(o => o.company.name);
      return {
        id: c.id, slug: c.slug, name: c.name, status: c.status,
        lengthKm: c.lengthKm, rfsDate: c.rfsDate, fiberPairs: c.fiberPairs,
        capacityTbps: c.designCapacityTbps, vendor: c.vendor?.name ?? null,
        owners, stations, rawCodes, normalizedCodes: uniqueNorm,
      };
    });

    const isInternal = (c: typeof cables[0]) => c.normalizedCodes.length >= 2 && c.normalizedCodes.every(cc => isBRICSCountry(cc));
    const isDom = (c: typeof cables[0]) => c.normalizedCodes.length === 1 && isBRICSCountry(c.normalizedCodes[0]);
    const isRelated = (c: typeof cables[0]) => c.rawCodes.some(cc => isBRICSCountry(cc));

    const internal = cables.filter(isInternal);
    const domestic = cables.filter(c => isDom(c) && !isInternal(c));
    const related = cables.filter(c => isRelated(c) && !isInternal(c) && !isDom(c));
    const allBrics = [...internal, ...domestic, ...related];

    const memberSet = new Set<string>(BRICS_MEMBERS);
    const memberInternal = internal.filter(c => c.normalizedCodes.every(cc => memberSet.has(cc)));

    const bricsAllSet = new Set<string>(BRICS_ALL.map(c => c));
    const bricsStations = await prisma.landingStation.count({ where: { countryCode: { in: [...bricsAllSet, 'TW', 'HK', 'MO'] } } });

    const memberCableCounts: Record<string, number> = {};
    for (const code of BRICS_ALL) memberCableCounts[code] = cables.filter(c => c.normalizedCodes.includes(code)).length;

    const sovereigntyIndex = allBrics.length > 0 ? Math.round(((internal.length + domestic.length) / allBrics.length) * 100) : 0;

    // 供地图使用：每条海缆的分类 + 基本信息
    const cableMap: Record<string, { cat: string; name: string; status: string; lengthKm: number | null; vendor: string | null; owners: string[]; stations: { name: string; country: string | null; city: string | null }[]; fiberPairs: number | null; capacityTbps: number | null; rfsDate: string | null }> = {};
    for (const c of internal) cableMap[c.slug] = { cat:'internal', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };
    for (const c of domestic) cableMap[c.slug] = { cat:'domestic', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };
    for (const c of related) cableMap[c.slug] = { cat:'related', name:c.name, status:c.status, lengthKm:c.lengthKm, vendor:c.vendor, owners:c.owners, stations:c.stations, fiberPairs:c.fiberPairs, capacityTbps:c.capacityTbps, rfsDate:c.rfsDate?.toISOString()?.slice(0,10) ?? null };

    return NextResponse.json({
      global: { totalCables, totalStations },
      brics: {
        relatedCables: allBrics.length, internalCables: internal.length,
        domesticCables: domestic.length, externalCables: related.length,
        memberInternalCables: memberInternal.length,
        stations: bricsStations, sovereigntyIndex,
        statusBreakdown: {
          active: allBrics.filter(c => c.status === 'IN_SERVICE').length,
          underConstruction: allBrics.filter(c => c.status === 'UNDER_CONSTRUCTION').length,
          planned: allBrics.filter(c => c.status === 'PLANNED').length,
          other: allBrics.filter(c => !['IN_SERVICE','UNDER_CONSTRUCTION','PLANNED'].includes(c.status)).length,
        },
        memberCableCounts,
      },
      cableMap,
    });
  } catch (error) {
    console.error('[BRICS Overview]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_ALL, isBRICSCountry, isBRICSInternalCable } from '@/lib/brics-constants';

export const revalidate = 3600;
const ACTIVE_FILTER = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const [totalCables, totalStations] = await Promise.all([
      prisma.cable.count({ where: ACTIVE_FILTER }),
      prisma.landingStation.count(),
    ]);

    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: {
        id: true, slug: true, name: true, status: true,
        landingStations: { select: { landingStation: { select: { countryCode: true } } } },
      },
    });

    const cables = cablesRaw.map(c => ({
      id: c.id, slug: c.slug, name: c.name, status: c.status,
      countryCodes: [...new Set(c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[])],
    }));

    const bricsRelated = cables.filter(c => c.countryCodes.some(cc => isBRICSCountry(cc)));
    const bricsInternal = cables.filter(c => isBRICSInternalCable(c.countryCodes));
    const memberSet = new Set<string>(BRICS_MEMBERS);
    const memberInternal = cables.filter(c => c.countryCodes.length >= 2 && c.countryCodes.every(cc => memberSet.has(cc)));

    const bricsAllSet = new Set<string>(BRICS_ALL.map(c => c));
    const bricsStations = await prisma.landingStation.count({ where: { countryCode: { in: [...bricsAllSet] } } });

    const memberCableCounts: Record<string, number> = {};
    for (const code of BRICS_MEMBERS) memberCableCounts[code] = cables.filter(c => c.countryCodes.includes(code)).length;

    const sovereigntyIndex = bricsRelated.length > 0 ? Math.round((bricsInternal.length / bricsRelated.length) * 100) : 0;

    return NextResponse.json({
      global: { totalCables, totalStations },
      brics: {
        relatedCables: bricsRelated.length,
        internalCables: bricsInternal.length,
        memberInternalCables: memberInternal.length,
        stations: bricsStations,
        sovereigntyIndex,
        statusBreakdown: {
          active: bricsRelated.filter(c => c.status === 'IN_SERVICE').length,
          underConstruction: bricsRelated.filter(c => c.status === 'UNDER_CONSTRUCTION').length,
          planned: bricsRelated.filter(c => c.status === 'PLANNED').length,
        },
        memberCableCounts,
      },
      internalCableSlugs: bricsInternal.map(c => c.slug),
      relatedCableSlugs: bricsRelated.map(c => c.slug),
      internalCableList: bricsInternal.map(c => ({ slug: c.slug, name: c.name, status: c.status, countries: c.countryCodes })),
    });
  } catch (error) {
    console.error('[BRICS Overview]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

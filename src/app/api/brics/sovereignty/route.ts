import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BRICS_MEMBERS, BRICS_COUNTRY_META, isBRICSCountry } from '@/lib/brics-constants';

export const revalidate = 3600;
type ConnStatus = 'direct' | 'indirect' | 'transit' | 'none' | 'landlocked';
const LANDLOCKED = new Set(['ET']);
const ACTIVE_FILTER = { mergedInto: null, status: { notIn: ['PENDING_REVIEW','REMOVED'] as string[] } };

export async function GET() {
  try {
    const cablesRaw = await prisma.cable.findMany({
      where: ACTIVE_FILTER,
      select: { slug: true, name: true, landingStations: { select: { landingStation: { select: { countryCode: true } } } } },
    });
    const cableCountries = cablesRaw.map(c => ({
      slug: c.slug, name: c.name,
      countries: [...new Set(c.landingStations.map(cls => cls.landingStation.countryCode?.toUpperCase()).filter(Boolean) as string[])],
    }));

    const adj: Record<string, Set<string>> = {};
    const dcMap: Record<string, Record<string, string[]>> = {};
    for (const cable of cableCountries) {
      const cc = cable.countries;
      for (let i = 0; i < cc.length; i++) for (let j = i + 1; j < cc.length; j++) {
        const [a, b] = [cc[i], cc[j]];
        if (!adj[a]) adj[a] = new Set(); if (!adj[b]) adj[b] = new Set();
        adj[a].add(b); adj[b].add(a);
        if (!dcMap[a]) dcMap[a] = {}; if (!dcMap[a][b]) dcMap[a][b] = [];
        dcMap[a][b].push(cable.slug);
        if (!dcMap[b]) dcMap[b] = {}; if (!dcMap[b][a]) dcMap[b][a] = [];
        dcMap[b][a].push(cable.slug);
      }
    }

    function bfs(from: string, to: string, bricsOnly: boolean): boolean {
      if (!adj[from]) return false;
      const vis = new Set([from]); const q = [from];
      while (q.length) { const cur = q.shift()!;
        for (const nb of adj[cur] ?? []) {
          if (nb === to) return true;
          if (!vis.has(nb) && (!bricsOnly || isBRICSCountry(nb))) { vis.add(nb); q.push(nb); }
        }
      }
      return false;
    }

    const members = [...BRICS_MEMBERS];
    const matrix: { from: string; to: string; status: ConnStatus; directCableCount: number; directCables: string[] }[] = [];
    for (let i = 0; i < members.length; i++) for (let j = 0; j < members.length; j++) {
      if (i === j) continue;
      const [f, t] = [members[i], members[j]];
      if (LANDLOCKED.has(f) || LANDLOCKED.has(t)) { matrix.push({ from: f, to: t, status: 'landlocked', directCableCount: 0, directCables: [] }); continue; }
      const cables = dcMap[f]?.[t] ?? [];
      const status: ConnStatus = cables.length > 0 ? 'direct' : bfs(f, t, true) ? 'indirect' : bfs(f, t, false) ? 'transit' : 'none';
      matrix.push({ from: f, to: t, status, directCableCount: cables.length, directCables: cables.slice(0, 10) });
    }

    const up: Record<ConnStatus, number> = { direct: 0, indirect: 0, transit: 0, none: 0, landlocked: 0 };
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const c = matrix.find(m => m.from === members[i] && m.to === members[j]);
      if (c) up[c.status]++;
    }

    return NextResponse.json({
      members: members.map(code => ({ code, name: BRICS_COUNTRY_META[code]?.name ?? code, nameZh: BRICS_COUNTRY_META[code]?.nameZh ?? code })),
      matrix,
      summary: { totalPairs: (members.length * (members.length - 1)) / 2, ...up },
    });
  } catch (error) {
    console.error('[BRICS Sovereignty]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

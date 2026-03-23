import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function fix() {
  const cables = await p.cable.findMany({ select: { id: true, name: true, slug: true } });
  const nameMap = new Map(cables.map(c => [c.name, c]));
  let merged = 0;

  for (const c of cables) {
    const m = c.name.match(/\(([A-Z0-9\-]{2,10})\)/);
    if (!m) continue;
    const abbr = m[1];
    const shortCable = nameMap.get(abbr);
    if (!shortCable || shortCable.id === c.id) continue;

    try {
      const existing = await p.cableLandingStation.findMany({ where: { cableId: c.id }, select: { landingStationId: true } });
      const existingIds = new Set(existing.map((e: any) => e.landingStationId));
      const toMigrate = await p.cableLandingStation.findMany({ where: { cableId: shortCable.id } });
      for (const ls of toMigrate) {
        if (!existingIds.has(ls.landingStationId)) {
          await p.cableLandingStation.create({ data: { cableId: c.id, landingStationId: ls.landingStationId } });
        }
      }
      await p.cableLandingStation.deleteMany({ where: { cableId: shortCable.id } });

      const existingOwners = await p.cableOwnership.findMany({ where: { cableId: c.id }, select: { companyId: true } });
      const existingOwnerIds = new Set(existingOwners.map((e: any) => e.companyId));
      const ownersToMigrate = await p.cableOwnership.findMany({ where: { cableId: shortCable.id } });
      for (const o of ownersToMigrate) {
        if (!existingOwnerIds.has(o.companyId)) {
          await p.cableOwnership.create({ data: { cableId: c.id, companyId: o.companyId, sharePercent: o.sharePercent } });
        }
      }
      await p.cableOwnership.deleteMany({ where: { cableId: shortCable.id } });

      await p.cable.delete({ where: { id: shortCable.id } });
      console.log('合并:', abbr, '->', c.name);
      merged++;
    } catch(e: any) {
      console.error('失败:', abbr, e.message?.slice(0, 80));
    }
  }
  console.log('完成，合并', merged, '组');
  await p.$disconnect();
}

fix().catch(async e => { console.error(e); await p.$disconnect(); });

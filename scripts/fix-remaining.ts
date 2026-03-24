import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  console.log('=== 修复剩余问题 ===\n');

  const pairs = [
    { keepName: 'Sihanoukville-Hong Kong (SHV-HK)', removeName: 'Sihanoukville-HK Cable' },
    { keepName: 'Asia Submarine-cable Express (ASE)/Cahaya Malaysia', removeName: 'ASE' },
  ];

  for (const pair of pairs) {
    const keep = await p.cable.findFirst({ where: { name: pair.keepName, mergedInto: null } });
    const remove = await p.cable.findFirst({ where: { name: pair.removeName, mergedInto: null } });
    if (!keep) { console.log('未找到: "' + pair.keepName + '"'); continue; }
    if (!remove) { console.log('未找到: "' + pair.removeName + '"（可能已合并）'); continue; }

    const keepStations: any[] = await p.$queryRawUnsafe(
      'SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1', keep.id
    );
    const keepIds = new Set(keepStations.map((s: any) => s.landing_station_id));
    const removeStations: any[] = await p.$queryRawUnsafe(
      'SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1', remove.id
    );
    for (const rs of removeStations) {
      if (!keepIds.has(rs.landing_station_id)) {
        try {
          await p.$executeRawUnsafe(
            'INSERT INTO cable_landing_stations (id, cable_id, landing_station_id) VALUES (gen_random_uuid()::text, $1, $2)',
            keep.id, rs.landing_station_id
          );
        } catch {}
      }
    }

    await p.$executeRawUnsafe(
      "UPDATE cables SET merged_into = $1, merged_at = NOW(), review_status = 'MERGED' WHERE id = $2",
      keep.id, remove.id
    );
    await p.$executeRawUnsafe('DELETE FROM cable_landing_stations WHERE cable_id = $1', remove.id);
    await p.$executeRawUnsafe(
      "INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)",
      keep.id, remove.id, pair.keepName, pair.removeName, 'manual', 100
    );
    console.log('✓ 合并: "' + pair.removeName + '" → "' + pair.keepName + '"');
  }

  console.log('\n=== 海缆数据完整性检查 ===\n');
  const checkNames = ['BtoBE', 'AAE-2', 'FNAL/RNAL', 'HK-G', 'HKA', 'PLCN', 'TGN-IA2'];
  for (const name of checkNames) {
    const cable = await p.cable.findFirst({
      where: { name: { contains: name, mode: 'insensitive' }, mergedInto: null },
      select: { id: true, name: true, status: true, lengthKm: true, routeGeojson: true,
        landingStations: { select: { landingStation: { select: { name: true, countryCode: true, latitude: true, longitude: true } } } } },
    });
    if (!cable) { console.log(name + ': 未找到'); continue; }
    const hasRoute = cable.routeGeojson !== null;
    const stations = cable.landingStations.map((ls: any) => {
      const s = ls.landingStation;
      const hasCoords = s.latitude !== null && s.longitude !== null;
      return s.name + ' (' + s.countryCode + ')' + (hasCoords ? '' : ' ⚠无坐标');
    });
    console.log(cable.name + ' | id=' + cable.id + ' | ' + (hasRoute ? '有路由' : '⚠无路由') + ' | ' + stations.length + '站:');
    for (const s of stations) console.log('  ' + s);
    if (stations.length === 0) console.log('  (无登陆站)');
  }

  const snNoRoute = await p.cable.count({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] }, routeGeojson: null }
  });
  const snTotal = await p.cable.count({
    where: { mergedInto: null, id: { startsWith: 'sn-' }, status: { notIn: ['REMOVED'] } }
  });
  console.log('\n=== SN 路由数据统计 ===');
  console.log('SN独有总数: ' + snTotal);
  console.log('无路由: ' + snNoRoute + '/' + snTotal);

  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });
  await Promise.all(['cables:geo:details','cables:geo','cables:list','stats:global'].map(k => redis.del(k)));
  console.log('\n✓ 缓存已清除');

  const finalCount = await p.cable.count({ where: { mergedInto: null, status: { notIn: ['REMOVED'] } } });
  console.log('活跃海缆: ' + finalCount + ' 条');

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

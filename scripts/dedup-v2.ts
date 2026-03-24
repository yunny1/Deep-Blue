/**
 * dedup-v2.ts
 * 
 * 全面去重 v2 — 解决"缩写 vs 全名"跨源重复问题
 * 
 * 核心改进：自动从 TG 的 "Full Name (ABBREV)" 格式中提取缩写，注册为别名，
 * 使得 SN 的 "ABBREV" 能够匹配到 TG 的 "Full Name"。
 * 
 * 流程：
 *   Step 1: 扫描所有海缆名称，提取括号中的缩写，构建别名表
 *   Step 2: 用扩充后的别名表重新解析所有海缆的 canonical name
 *   Step 3: 找出 canonical 相同的记录对（= 确认重复）
 *   Step 4: DRY_RUN 先看报告，EXECUTE=true 才合并
 * 
 * 运行方式（腾讯云）：
 *   cd /home/ubuntu/deep-blue && set -a && source .env && set +a
 *   npx tsx /home/ubuntu/deep-blue/scripts/dedup-v2.ts                 # DRY_RUN
 *   EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/dedup-v2.ts    # 正式执行
 */

import { PrismaClient } from '@prisma/client';
import {
  loadAliases,
  buildAliasesFromNames,
  persistAliasesToDB,
  parseCableName,
  getAliasCount,
  jaroWinkler,
  jaccard,
} from '../src/lib/cable-name-parser';

const prisma = new PrismaClient();
const EXECUTE = process.env.EXECUTE === 'true';

interface CableInfo {
  id: string;
  name: string;
  status: string;
  dataSource: string;
  stationNames: Set<string>;
  landingStationCount: number;
  hasGeoJson: boolean;
  parsed: ReturnType<typeof parseCableName>;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  全面去重 v2 — 缩写别名自动提取 + 重新匹配            ║`);
  console.log(`║  模式: ${EXECUTE ? '正式执行' : 'DRY_RUN（只看报告）'}                                 ║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // ── Step 1: 构建扩充别名表 ────────────────────────────────────
  console.log('=== Step 1: 构建别名表 ===\n');

  // 先从 DB 加载已有别名
  await loadAliases(prisma);
  const beforeCount = getAliasCount();

  // 拉取所有活跃海缆名称
  const allCables = await prisma.cable.findMany({
    where: { mergedInto: null, status: { notIn: ['REMOVED', 'MERGED'] } },
    include: {
      landingStations: {
        include: { landingStation: true },
      },
    },
  });

  console.log(`  活跃海缆: ${allCables.length} 条`);

  // 从所有名称中提取括号缩写并注册
  const names = (allCables as any[]).map(c => c.name || '');
  const newAliases = buildAliasesFromNames(names);
  const afterCount = getAliasCount();

  console.log(`  别名表: ${beforeCount} → ${afterCount}（新增 ${newAliases} 条自动提取的缩写别名）`);

  // 持久化到 DB（如果是正式执行）
  if (EXECUTE && newAliases > 0) {
    const persisted = await persistAliasesToDB(prisma);
    console.log(`  已写入 DB: ${persisted} 条新别名`);
  }

  // ── Step 2: 用扩充别名表重新解析所有海缆 ─────────────────────
  console.log('\n=== Step 2: 重新解析 canonical names ===\n');

  const cables: CableInfo[] = (allCables as any[]).map(c => {
    const stations = (c.landingStations || []).map((ls: any) => ls.landingStation || ls);
    return {
      id: c.id,
      name: c.name || '',
      status: c.status || 'UNKNOWN',
      dataSource: c.dataSource || 'UNKNOWN',
      stationNames: new Set(
        stations.map((s: any) => (s.name || '').toLowerCase().trim()).filter(Boolean)
      ),
      landingStationCount: stations.length,
      hasGeoJson: !!(c.routeGeojson || c.geoJson || c.geojson || c.geometry),
      parsed: parseCableName(c.name || ''),
    };
  });

  // 按 canonical name 分组，找出有多条记录的组
  const groups = new Map<string, CableInfo[]>();
  for (const c of cables) {
    if (!c.parsed.canonical) continue;
    const key = c.parsed.canonical;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  // ── Step 3: 找出所有重复组 ────────────────────────────────────
  console.log('=== Step 3: 识别重复 ===\n');

  interface MergeAction {
    keepId: string;
    keepName: string;
    keepSource: string;
    removeId: string;
    removeName: string;
    removeSource: string;
    canonical: string;
    stationOverlap: number;
  }

  const actions: MergeAction[] = [];

  for (const [canonical, group] of groups) {
    if (group.length < 2) continue;

    // 排除之前已经合并过又被恢复的（review_status = 'MERGED'）
    // 对每一组，选最好的保留，其余合并
    // 优先级：TG > SN > UNKNOWN；登陆站多 > 少；有 GeoJSON > 无
    group.sort((a, b) => {
      // TG 优先
      const aIsTG = !a.id.startsWith('sn-') ? 1 : 0;
      const bIsTG = !b.id.startsWith('sn-') ? 1 : 0;
      if (bIsTG !== aIsTG) return bIsTG - aIsTG;

      // 登陆站多的优先
      if (b.landingStationCount !== a.landingStationCount) return b.landingStationCount - a.landingStationCount;

      // 有 GeoJSON 的优先
      if (a.hasGeoJson !== b.hasGeoJson) return a.hasGeoJson ? -1 : 1;

      return 0;
    });

    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      const remove = group[i];

      // 计算登陆站重合度作为额外验证
      const overlap = jaccard(keep.stationNames, remove.stationNames);

      actions.push({
        keepId: keep.id,
        keepName: keep.name,
        keepSource: keep.dataSource,
        removeId: remove.id,
        removeName: remove.name,
        removeSource: remove.dataSource,
        canonical,
        stationOverlap: Math.round(overlap * 100),
      });
    }
  }

  // 按来源分类
  const crossSource = actions.filter(a => {
    const keepIsTG = !a.keepId.startsWith('sn-');
    const removeIsTG = !a.removeId.startsWith('sn-');
    return keepIsTG !== removeIsTG;
  });
  const sameSource = actions.filter(a => {
    const keepIsTG = !a.keepId.startsWith('sn-');
    const removeIsTG = !a.removeId.startsWith('sn-');
    return keepIsTG === removeIsTG;
  });

  console.log(`  总重复对: ${actions.length}`);
  console.log(`    跨源重复（TG vs SN）: ${crossSource.length}`);
  console.log(`    同源重复: ${sameSource.length}`);

  // 打印详细列表
  if (crossSource.length > 0) {
    console.log('\n  >>> 跨源重复（TG ← SN 合并）<<<\n');
    for (const a of crossSource) {
      console.log(`    保留 "${a.keepName}" (${a.keepSource})`);
      console.log(`    合并 "${a.removeName}" (${a.removeSource})`);
      console.log(`    canonical="${a.canonical}" | 站点重合: ${a.stationOverlap}%`);
      console.log('');
    }
  }

  if (sameSource.length > 0) {
    console.log('\n  >>> 同源重复 <<<\n');
    for (const a of sameSource) {
      console.log(`    保留 "${a.keepName}" ← 合并 "${a.removeName}" (canonical="${a.canonical}", 站点重合: ${a.stationOverlap}%)`);
    }
  }

  if (actions.length === 0) {
    console.log('\n  ✓ 没有发现重复记录\n');
  }

  // ── Step 4: 执行合并 ─────────────────────────────────────────
  console.log(`\n=== Step 4: ${EXECUTE ? '执行合并' : 'DRY_RUN（不修改数据库）'} ===\n`);

  if (actions.length === 0) {
    console.log('  无需操作');
  } else if (!EXECUTE) {
    console.log(`  DRY_RUN: 发现 ${actions.length} 对重复`);
    console.log(`  确认无误后执行: EXECUTE=true npx tsx /home/ubuntu/deep-blue/scripts/dedup-v2.ts`);
  } else {
    let ok = 0;
    for (const action of actions) {
      try {
        // 1. 转移登陆站关联
        const keepStations: any[] = await prisma.$queryRawUnsafe(
          `SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1`, action.keepId
        );
        const keepIds = new Set(keepStations.map(s => s.landing_station_id));

        const removeStations: any[] = await prisma.$queryRawUnsafe(
          `SELECT landing_station_id FROM cable_landing_stations WHERE cable_id = $1`, action.removeId
        );

        for (const rs of removeStations) {
          if (!keepIds.has(rs.landing_station_id)) {
            try {
              await prisma.$executeRawUnsafe(
                `INSERT INTO cable_landing_stations (id, cable_id, landing_station_id) VALUES (gen_random_uuid()::text, $1, $2)`,
                action.keepId, rs.landing_station_id
              );
            } catch (_) {}
          }
        }

        // 2. 补全空字段
        const keepCable = await prisma.cable.findUnique({ where: { id: action.keepId } });
        const removeCable = await prisma.cable.findUnique({ where: { id: action.removeId } });
        if (keepCable && removeCable) {
          const updates: Record<string, any> = {};
          const fields = ['rfsDate', 'lengthKm', 'description', 'owners', 'suppliers', 'url', 'designCapacityTbps', 'fiberPairs'];
          for (const f of fields) {
            if (f in keepCable && (keepCable as any)[f] == null && (removeCable as any)[f] != null) {
              updates[f] = (removeCable as any)[f];
            }
          }
          if (Object.keys(updates).length > 0) {
            await prisma.cable.update({ where: { id: action.keepId }, data: updates });
          }
        }

        // 3. 软删除
        await prisma.$executeRawUnsafe(
          `UPDATE cables SET merged_into = $1, merged_at = NOW(), review_status = 'MERGED' WHERE id = $2`,
          action.keepId, action.removeId
        );

        // 4. 清理被合并记录的登陆站关联
        await prisma.$executeRawUnsafe(
          `DELETE FROM cable_landing_stations WHERE cable_id = $1`, action.removeId
        );

        // 5. 写合并日志
        await prisma.$executeRawUnsafe(
          `INSERT INTO cable_merge_log (id, kept_cable_id, removed_cable_id, kept_name, removed_name, merge_method, match_score)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)`,
          action.keepId, action.removeId, action.keepName, action.removeName, 'auto-v2-abbrev', action.stationOverlap
        );

        // 6. 回填 canonical name
        const parsed = parseCableName(action.keepName);
        await prisma.$executeRawUnsafe(
          `UPDATE cables SET canonical_name = $1, canonical_base = $2, canonical_suffix = $3 WHERE id = $4`,
          parsed.canonical, parsed.base, parsed.suffix, action.keepId
        );

        ok++;
        console.log(`  ✓ "${action.removeName}" → "${action.keepName}"`);
      } catch (e: any) {
        console.error(`  ✗ "${action.removeName}": ${e.message}`);
      }
    }

    console.log(`\n  合并完成: ${ok}/${actions.length} 成功`);

    // 清除缓存
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      await Promise.all([
        redis.del('cables:geojson:full'),
        redis.del('cables:geo:details'),
        redis.del('cables:geo'),
        redis.del('cables:list'),
        redis.del('stats:global'),
      ]);
      console.log('  ✓ 缓存已清除');
    } catch (e: any) {
      console.warn(`  ⚠ 缓存清除失败: ${e.message}`);
    }
  }

  // ── 最终报告 ──────────────────────────────────────────────────
  console.log('\n=== 最终报告 ===\n');

  const finalCounts: any[] = await prisma.$queryRawUnsafe(`
    SELECT status, COUNT(*)::int as count 
    FROM cables 
    WHERE merged_into IS NULL AND (status IS NULL OR status NOT IN ('REMOVED', 'MERGED'))
    GROUP BY status ORDER BY count DESC
  `);
  const finalTotal = finalCounts.reduce((sum: number, r: any) => sum + r.count, 0);

  console.log(`  活跃海缆: ${finalTotal} 条`);
  for (const row of finalCounts) {
    console.log(`    ${row.status}: ${row.count}`);
  }

  // 写 JSON 报告
  const fs = await import('fs');
  const report = {
    generatedAt: new Date().toISOString(),
    execute: EXECUTE,
    aliasesAdded: newAliases,
    duplicatesFound: actions.length,
    crossSource: crossSource.length,
    sameSource: sameSource.length,
    details: actions.map(a => ({
      keep: a.keepName, keepSource: a.keepSource,
      remove: a.removeName, removeSource: a.removeSource,
      canonical: a.canonical, stationOverlap: a.stationOverlap,
    })),
    finalTotal,
  };

  const reportPath = '/home/ubuntu/deep-blue/dedup-v2-report.json';
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));
    console.log(`\n  报告: ${reportPath}`);
  } catch {
    fs.writeFileSync('dedup-v2-report.json', JSON.stringify(report, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));
    console.log('\n  报告: dedup-v2-report.json');
  }

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log(`║  完成！发现 ${actions.length} 对重复，活跃海缆: ${finalTotal} 条       ║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('脚本失败:', e);
  await prisma.$disconnect();
  process.exit(1);
});

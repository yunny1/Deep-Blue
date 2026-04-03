// src/app/api/sovereign-network/route.ts
//
// 改进点：
// 1. 动态从 Redis 路径数据提取海缆名称，不再依赖硬编码的 CANONICAL_CABLE_NAMES
//    → 管理后台更新路径后，地图自动同步，无需改代码
// 2. 多策略名称匹配，修复含斜杠/特殊格式的海缆（如 ASE/Cahaya Malaysia）匹配失败问题
// 3. 结果去重，防止多个 OR 条件匹配到同一条缆

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CANONICAL_CABLE_NAMES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

// ── Redis 工具函数 ────────────────────────────────────────────────────────────
async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

// ── 从 Redis 路径数据中动态提取所有涉及的海缆名称 ────────────────────────────
// 这样管理后台更新路径后，地图会自动展示新路径里引用的海缆，不需要手动改代码。
async function getCableNamesFromRedis(): Promise<string[] | null> {
  const raw = await redisGet('sovereign-routes:v1');
  if (!raw) return null;

  try {
    const routes = JSON.parse(raw) as Array<{ cables?: string }>;
    const names  = new Set<string>();

    for (const route of routes) {
      // cables 字段格式："Cable A | Cable B | Cable C"
      (route.cables ?? '').split(' | ').forEach(c => {
        const trimmed = c.trim();
        if (trimmed) names.add(trimmed);
      });
    }

    return names.size > 0 ? [...names] : null;
  } catch {
    return null;
  }
}

// ── 多策略名称匹配条件构建 ────────────────────────────────────────────────────
// 原来只有一种策略（去掉括号后 contains），有两个缺陷：
//   1. "Asia Submarine-cable Express (ASE)/Cahaya Malaysia" 去括号后变成
//      "Asia Submarine-cable Express /Cahaya Malaysia"（斜杠前多一个空格），
//      数据库里没有这个格式，匹配失败。
//   2. 斜杠分隔的双名海缆（一条缆有两个名字）无法用任一个名字单独命中。
//
// 新策略：对每个名字生成多个候选条件，取并集（OR），再在代码层面去重。
function buildMatchConditions(names: string[]) {
  const condMap = new Map<string, { name: { contains: string; mode: 'insensitive' } }>();

  const addContains = (s: string) => {
    const key = s.toLowerCase().trim();
    if (key.length < 3) return;
    condMap.set(key, { name: { contains: key, mode: 'insensitive' as const } });
  };

  for (const name of names) {
    // 策略 1：完整名称直接 contains
    addContains(name);

    // 策略 2：去掉括号 + 规范化空格和斜杠两侧空格
    const noParens = name
      .replace(/\s*\([^)]+\)/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .trim();
    if (noParens !== name) addContains(noParens);

    // 策略 3：提取括号里的缩写（如 "ASE"）
    const abbrs = [...name.matchAll(/\(([^)]+)\)/g)].map(m => m[1]);
    abbrs.forEach(abbr => addContains(abbr));

    // 策略 4：斜杠分段，分别尝试斜杠两侧的名字
    if (name.includes('/')) {
      name.split('/').forEach(part => {
        const cleaned = part.replace(/\s*\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        addContains(cleaned);
      });
    }
  }

  return [...condMap.values()];
}

// ── 主处理函数 ────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    // 优先从 Redis 提取路径里真实引用的海缆名（自动与管理后台同步）
    // 若 Redis 为空（首次部署或被清空），退回到源代码里的静态名单兜底
    const redisCableNames = await getCableNamesFromRedis();
    const cableNames      = redisCableNames ?? CANONICAL_CABLE_NAMES;

    const matchConditions = buildMatchConditions(cableNames);

    const cables = await prisma.cable.findMany({
      where: {
        OR: matchConditions,
        status: { not: 'REMOVED' },
      },
      select: {
        slug:         true,
        name:         true,
        status:       true,
        lengthKm:     true,
        fiberPairs:   true,
        rfsDate:      true,
        routeGeojson: true,
        vendor: {
          select: { name: true },
        },
        owners: {
          select: {
            company: { select: { name: true } },
          },
        },
        landingStations: {
          select: {
            landingStation: {
              select: {
                name:        true,
                city:        true,
                countryCode: true,
                latitude:    true,
                longitude:   true,
              },
            },
          },
        },
      },
    });

    // 去重：多个 OR 条件可能匹配到同一条缆，以 slug 为主键去重
    const seenSlugs  = new Set<string>();
    const uniqueCables = cables.filter(c => {
      if (seenSlugs.has(c.slug)) return false;
      seenSlugs.add(c.slug);
      return true;
    });

    // 构建 nameIndex 供前端模糊匹配
    const nameIndex: Record<string, string> = {};
    for (const cable of uniqueCables) {
      const key = cable.name.toLowerCase();
      nameIndex[key] = cable.slug;
      [...cable.name.matchAll(/\(([^)]+)\)/g)].forEach(m => {
        nameIndex[m[1].toLowerCase()] = cable.slug;
      });
      const simplified = cable.name.replace(/\s*\([^)]+\)/g, '').trim().toLowerCase();
      if (simplified !== key) nameIndex[simplified] = cable.slug;
    }

    const result = uniqueCables.map(c => ({
      slug:         c.slug,
      name:         c.name,
      status:       c.status,
      lengthKm:     c.lengthKm,
      fiberPairs:   c.fiberPairs,
      rfsDate:      c.rfsDate,
      routeGeojson: c.routeGeojson ?? null,
      vendor:       c.vendor?.name ?? null,
      owners:       c.owners.map(o => o.company.name),
      stations:     c.landingStations.map(ls => ({
        name:    ls.landingStation.name,
        city:    ls.landingStation.city,
        country: ls.landingStation.countryCode,
        lat:     ls.landingStation.latitude,
        lng:     ls.landingStation.longitude,
      })),
    }));

    return NextResponse.json({ cables: result, nameIndex });
  } catch (e) {
    console.error('[sovereign-network]', e);
    return NextResponse.json({ cables: [], nameIndex: {} });
  }
}

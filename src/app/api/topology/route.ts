// src/app/api/topology/route.ts
// 网络拓扑API — 返回国家之间的海缆连接关系图数据
// 用于绘制抽象网络拓扑视图

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get('country'); // 可选：只返回某国的拓扑
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    // 获取所有在役海缆及其登陆站国家
    const cables = await prisma.cable.findMany({
      where: {
        status: { in: ['IN_SERVICE', 'UNDER_CONSTRUCTION'] },
        ...(country ? {
          landingStations: { some: { landingStation: { countryCode: country.toUpperCase() } } },
        } : {}),
      },
      select: {
        id: true, name: true, slug: true, status: true, lengthKm: true,
        landingStations: {
          select: { landingStation: { select: { countryCode: true, country: { select: { nameEn: true } } } } },
        },
      },
      take: limit * 5, // 获取更多数据以便后续筛选
    });

    // 构建节点（国家）和边（海缆连接）
    const countryMap = new Map<string, { code: string; name: string; cableCount: number; connections: Set<string> }>();
    const edges: Array<{ source: string; target: string; cables: string[]; cableCount: number }> = [];
    const edgeMap = new Map<string, Set<string>>();

    for (const cable of cables) {
      const countries = [...new Set(cable.landingStations.map(ls => ls.landingStation.countryCode))];

      // 添加节点
      for (const ls of cable.landingStations) {
        const cc = ls.landingStation.countryCode;
        if (!countryMap.has(cc)) {
          countryMap.set(cc, {
            code: cc,
            name: ls.landingStation.country?.nameEn || cc,
            cableCount: 0,
            connections: new Set(),
          });
        }
        countryMap.get(cc)!.cableCount++;
      }

      // 添加边（国家对之间的连接）
      for (let i = 0; i < countries.length; i++) {
        for (let j = i + 1; j < countries.length; j++) {
          const key = [countries[i], countries[j]].sort().join('-');
          const node = countryMap.get(countries[i])!;
          node.connections.add(countries[j]);
          countryMap.get(countries[j])!.connections.add(countries[i]);

          if (!edgeMap.has(key)) edgeMap.set(key, new Set());
          edgeMap.get(key)!.add(cable.name);
        }
      }
    }

    // 转换为数组格式
    const nodes = Array.from(countryMap.values())
      .map(n => ({
        id: n.code,
        name: n.name,
        cableCount: n.cableCount,
        connectionCount: n.connections.size,
      }))
      .sort((a, b) => b.cableCount - a.cableCount)
      .slice(0, limit);

    const nodeIds = new Set(nodes.map(n => n.id));

    for (const [key, cableSet] of edgeMap) {
      const [source, target] = key.split('-');
      if (nodeIds.has(source) && nodeIds.has(target)) {
        edges.push({
          source, target,
          cables: Array.from(cableSet).slice(0, 5),
          cableCount: cableSet.size,
        });
      }
    }

    // 排序边
    edges.sort((a, b) => b.cableCount - a.cableCount);

    return NextResponse.json({
      nodes,
      edges: edges.slice(0, limit * 3),
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        mostConnected: nodes[0] || null,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Topology API error:', error);
    return NextResponse.json({ error: 'Topology generation failed' }, { status: 500 });
  }
}

// src/app/api/search/recommendations/route.ts
// 推荐海缆 API
// 当搜索框为空时调用，返回一批值得关注的海缆作为推荐入口
// 推荐策略：选取几条知名度高、地理分布有代表性的海缆
// 这个列表是策划的，不是算法生成的——目的是让新用户第一眼就能感受到产品的深度

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 精选推荐列表：slug + 推荐理由（中英文都用英文，前端 SearchBox 这里不做 i18n）
const FEATURED_SLUGS: { slug: string; reason: string }[] = [
  { slug: '2africa',             reason: 'World\'s longest cable · 45,000 km'        },
  { slug: 'sea-me-we-6',         reason: 'Newest Asia-Europe route · 2025'            },
  { slug: 'peace-cable',         reason: 'China-Europe via Pakistan'                  },
  { slug: 'marea',               reason: 'Meta\'s transatlantic cable'               },
  { slug: 'dunant',              reason: 'Google\'s dedicated Atlantic cable'        },
  { slug: 'equiano',             reason: 'Google\'s Africa cable · branching unit'   },
  { slug: 'jupiter',             reason: 'Facebook\'s trans-Pacific cable'          },
  { slug: 'faster-cable-system', reason: 'Fastest trans-Pacific · 60 Tbps'          },
];

export async function GET() {
  try {
    // 只查 slug 和基本属性，不查 GeoJSON（推荐列表不需要路由数据，响应快）
    const cables = await prisma.cable.findMany({
      where: {
        slug: { in: FEATURED_SLUGS.map(f => f.slug) },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        lengthKm: true,
      },
    });

    // 把推荐理由附加到查询结果上，并按预定顺序排列
    const result = FEATURED_SLUGS
      .map(featured => {
        const cable = cables.find(c => c.slug === featured.slug);
        if (!cable) return null;
        return {
          ...cable,
          reason: featured.reason,
        };
      })
      .filter(Boolean); // 过滤掉数据库中不存在的条目（容错）

    return NextResponse.json({ cables: result });

  } catch (error) {
    console.error('[Recommendations API] Failed:', error);
    // 失败时返回空列表，前端会静默降级（不显示推荐区域）
    return NextResponse.json({ cables: [] });
  }
}

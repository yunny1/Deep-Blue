// src/app/api/cables/route.ts
// 海缆数据API - 返回所有海缆
// 升级版：所有请求经过 Redis 缓存层，不再每次直接查 Supabase
//
// ?geo=true     包含 GeoJSON 路由（地图渲染用，走 cables:all:geo 缓存）
// ?details=true 包含 vendor/owners 信息（颜色编码用，已包含在缓存里）

import { NextRequest, NextResponse } from 'next/server';
import { getCablesWithGeo, getCablesLight } from '@/lib/cable-cache';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeGeo = searchParams.get('geo') === 'true';

  try {
    // geo=true：返回含 GeoJSON 的完整数据（地球渲染）
    // geo=false/省略：返回不含 GeoJSON 的轻量数据（列表/搜索）
    // 两种都经过 Redis 缓存，不再直接打 Supabase
    const cables = includeGeo
      ? await getCablesWithGeo()
      : await getCablesLight();

    return NextResponse.json({
      total: cables.length,
      cables,
    });
  } catch (error) {
    console.error('Failed to fetch cables:', error);
    return NextResponse.json({ error: 'Failed to fetch cables' }, { status: 500 });
  }
}

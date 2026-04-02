// src/app/api/admin/sovereign-routes-download/route.ts
//
// 生成并返回当前主权路径数据的 Excel 文件。
// 格式与原始上传 Excel 完全一致（"路径汇总"工作表，11列）。
// 数据优先读 Redis sovereign-routes:v1，回退到静态 SOVEREIGN_ROUTES。

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminJWT } from '@/lib/admin-auth';
import { SOVEREIGN_ROUTES } from '@/lib/sovereign-routes';

export const dynamic = 'force-dynamic';

async function redisGet(key: string): Promise<string | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()).result ?? null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  try { await verifyAdminJWT(req); } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 读取最新路径数据
  let routes: typeof SOVEREIGN_ROUTES = SOVEREIGN_ROUTES;
  const cached = await redisGet('sovereign-routes:v1');
  if (cached) {
    try { routes = JSON.parse(cached); } catch { /* 用静态数据 */ }
  }

  // 用 xlsx 生成 Excel，列与原始 Excel 完全一致
  const XLSX = await import('xlsx');

  const headers = [
    '路径ID', '甲方', '乙方', '路径节点序列',
    '保留段数', '各段保留海缆', '各段风险评分',
    '路径最大单段风险', '路径平均单段风险',
    '西方核心中转数', '是否安全',
  ];

  const rows = routes.map(r => [
    r.id,
    r.from,
    r.to,
    r.path,
    r.segments,
    r.cables,
    r.riskScores,
    r.maxRisk,
    r.avgRisk,
    0,           // 西方核心中转数（原静态数据中未存储，填0）
    r.safety,
  ]);

  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // 设置列宽
  ws['!cols'] = [
    { wch: 40 },  // 路径ID
    { wch: 12 },  // 甲方
    { wch: 12 },  // 乙方
    { wch: 50 },  // 路径节点序列
    { wch: 8 },   // 保留段数
    { wch: 80 },  // 各段保留海缆
    { wch: 30 },  // 各段风险评分
    { wch: 12 },  // 最大风险
    { wch: 12 },  // 平均风险
    { wch: 12 },  // 西方核心中转数
    { wch: 20 },  // 是否安全
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '路径汇总');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const now  = new Date().toISOString().split('T')[0];
  const fname = `sovereign-routes-${now}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}

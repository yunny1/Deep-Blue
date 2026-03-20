// src/app/api/admin/logs/route.ts
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// GET /api/admin/logs — 获取同步日志
export async function GET() {
  const logs: any[] = [];

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    // 读取最近 7 天的同步报告
    const keys = await redis.keys('sync:report:*');
    const sortedKeys = keys.sort().reverse().slice(0, 30); // 最多显示最近 30 条

    for (const key of sortedKeys) {
      const report = await redis.get(key);
      if (report) logs.push(typeof report === 'string' ? JSON.parse(report) : report);
    }
  } catch (e: any) {
    // Redis 不可用时返回空
    return NextResponse.json({
      logs: [],
      error: 'Redis unavailable: ' + e.message,
    });
  }

  return NextResponse.json({ logs });
}

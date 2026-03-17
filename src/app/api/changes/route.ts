// src/app/api/changes/route.ts
// 数据变化记录 API
// 返回最近一次导入产生的变化（新增、更新、删除的海缆）
// 数据来源：Redis key "changes:latest"，由 import-full.ts 在每次导入后写入

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET() {
  try {
    const changeLog = await redis.get('changes:latest');

    if (!changeLog) {
      // 还没有变化记录（可能是第一次导入，或者导入后没有变化）
      return NextResponse.json({
        hasChanges: false,
        message: 'No change record found. Run import to generate one.',
      });
    }

    return NextResponse.json({
      hasChanges: true,
      ...(changeLog as object),
    });

  } catch (error) {
    console.error('[Changes API] Failed to read from Redis:', error);
    // Redis 不可用时静默失败，不影响主要功能
    return NextResponse.json({ hasChanges: false });
  }
}

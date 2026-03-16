// src/lib/db.ts
// Prisma 数据库客户端（单例模式）
// 确保整个应用只创建一个数据库连接，避免连接泄露

import { PrismaClient } from '@prisma/client';

// 在开发环境中，Next.js的热重载会导致PrismaClient被重复创建
// 使用global变量缓存，避免"Too many connections"错误
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

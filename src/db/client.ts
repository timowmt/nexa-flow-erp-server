/**
 * 数据库客户端
 * 支持 SQLite (开发) 和 PostgreSQL (生产)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// 全局 Prisma 客户端实例
let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// 在开发环境中，使用全局变量避免热重载时创建多个实例
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

// 优雅关闭
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma };

/**
 * 获取数据库连接
 */
export async function getDb() {
  try {
    await prisma.$connect();
    return prisma;
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

export default prisma;


/**
 * 入库单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { StockIn, Prisma } from '@prisma/client';

export class StockInRepository extends BaseRepository<
  StockIn,
  Prisma.StockInCreateInput,
  Prisma.StockInUpdateInput,
  Prisma.StockInWhereInput
> {
  constructor() {
    super(prisma.stockIn);
  }

  /**
   * 根据单号查找入库单
   */
  async findByInNo(inNo: string): Promise<StockIn | null> {
    return this.findOne({ inNo });
  }

  /**
   * 生成入库单号
   */
  async generateInNo(prefix: string = 'IN'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      inNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


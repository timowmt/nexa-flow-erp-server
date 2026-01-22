/**
 * 出库单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { StockOut, Prisma } from '@prisma/client';

export class StockOutRepository extends BaseRepository<
  StockOut,
  Prisma.StockOutCreateInput,
  Prisma.StockOutUpdateInput,
  Prisma.StockOutWhereInput
> {
  constructor() {
    super(prisma.stockOut);
  }

  /**
   * 根据单号查找出库单
   */
  async findByOutNo(outNo: string): Promise<StockOut | null> {
    return this.findOne({ outNo });
  }

  /**
   * 生成出库单号
   */
  async generateOutNo(prefix: string = 'OUT'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      outNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


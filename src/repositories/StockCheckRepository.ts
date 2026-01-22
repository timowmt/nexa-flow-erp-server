/**
 * 盘点单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { StockCheck, Prisma } from '@prisma/client';

export class StockCheckRepository extends BaseRepository<
  StockCheck,
  Prisma.StockCheckCreateInput,
  Prisma.StockCheckUpdateInput,
  Prisma.StockCheckWhereInput
> {
  constructor() {
    super(prisma.stockCheck);
  }

  /**
   * 根据单号查找盘点单
   */
  async findByCheckNo(checkNo: string): Promise<StockCheck | null> {
    return this.findOne({ checkNo });
  }

  /**
   * 生成盘点单号
   */
  async generateCheckNo(prefix: string = 'CK'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      checkNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


/**
 * 调拨单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { StockTransfer, Prisma } from '@prisma/client';

export class StockTransferRepository extends BaseRepository<
  StockTransfer,
  Prisma.StockTransferCreateInput,
  Prisma.StockTransferUpdateInput,
  Prisma.StockTransferWhereInput
> {
  constructor() {
    super(prisma.stockTransfer);
  }

  /**
   * 根据单号查找调拨单
   */
  async findByTransferNo(transferNo: string): Promise<StockTransfer | null> {
    return this.findOne({ transferNo });
  }

  /**
   * 生成调拨单号
   */
  async generateTransferNo(prefix: string = 'TR'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      transferNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


/**
 * 采购退货 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { PurchaseReturn, Prisma } from '@prisma/client';

export class PurchaseReturnRepository extends BaseRepository<
  PurchaseReturn,
  Prisma.PurchaseReturnCreateInput,
  Prisma.PurchaseReturnUpdateInput,
  Prisma.PurchaseReturnWhereInput
> {
  constructor() {
    super(prisma.purchaseReturn);
  }

  /**
   * 根据退货单号查找退货单
   */
  async findByReturnNo(returnNo: string): Promise<PurchaseReturn | null> {
    return this.findOne({ returnNo });
  }

  /**
   * 生成退货单号
   */
  async generateReturnNo(prefix: string = 'PR'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      returnNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


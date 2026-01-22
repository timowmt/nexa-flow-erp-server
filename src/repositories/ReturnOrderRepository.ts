/**
 * 退货订单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { ReturnOrder, Prisma } from '@prisma/client';

export class ReturnOrderRepository extends BaseRepository<
  ReturnOrder,
  Prisma.ReturnOrderCreateInput,
  Prisma.ReturnOrderUpdateInput,
  Prisma.ReturnOrderWhereInput
> {
  constructor() {
    super(prisma.returnOrder);
  }

  /**
   * 根据退货单号查找退货单
   */
  async findByReturnNo(returnNo: string): Promise<ReturnOrder | null> {
    return this.findOne({ returnNo });
  }

  /**
   * 生成退货单号
   */
  async generateReturnNo(prefix: string = 'RO'): Promise<string> {
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


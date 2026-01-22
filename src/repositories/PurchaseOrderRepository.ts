/**
 * 采购订单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { PurchaseOrder, Prisma } from '@prisma/client';

export class PurchaseOrderRepository extends BaseRepository<
  PurchaseOrder,
  Prisma.PurchaseOrderCreateInput,
  Prisma.PurchaseOrderUpdateInput,
  Prisma.PurchaseOrderWhereInput
> {
  constructor() {
    super(prisma.purchaseOrder);
  }

  /**
   * 根据订单号查找订单
   */
  async findByOrderNo(orderNo: string): Promise<PurchaseOrder | null> {
    return this.findOne({ orderNo });
  }

  /**
   * 生成订单号
   */
  async generateOrderNo(prefix: string = 'PO'): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.count({
      orderNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${prefix}${dateStr}${seq}`;
  }
}


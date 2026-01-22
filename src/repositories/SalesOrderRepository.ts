/**
 * 销售订单 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { SalesOrder, Prisma } from '@prisma/client';

export class SalesOrderRepository extends BaseRepository<
  SalesOrder,
  Prisma.SalesOrderCreateInput,
  Prisma.SalesOrderUpdateInput,
  Prisma.SalesOrderWhereInput
> {
  constructor() {
    super(prisma.salesOrder);
  }

  /**
   * 根据订单号查找订单
   */
  async findByOrderNo(orderNo: string): Promise<SalesOrder | null> {
    return this.findOne({ orderNo });
  }

  /**
   * 生成订单号
   */
  async generateOrderNo(prefix: string = 'SO'): Promise<string> {
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


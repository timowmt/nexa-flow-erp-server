/**
 * 客户 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { Customer, Prisma } from '@prisma/client';

export class CustomerRepository extends BaseRepository<
  Customer,
  Prisma.CustomerCreateInput,
  Prisma.CustomerUpdateInput,
  Prisma.CustomerWhereInput
> {
  constructor() {
    super(prisma.customer);
  }

  /**
   * 根据编码查找客户
   */
  async findByCode(code: string): Promise<Customer | null> {
    return this.findOne({ code });
  }

  /**
   * 检查编码是否存在
   */
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.CustomerWhereInput = { code };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const count = await this.count(where);
    return count > 0;
  }
}


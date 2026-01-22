/**
 * 产品 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { Product, Prisma } from '@prisma/client';

export class ProductRepository extends BaseRepository<
  Product,
  Prisma.ProductCreateInput,
  Prisma.ProductUpdateInput,
  Prisma.ProductWhereInput
> {
  constructor() {
    super(prisma.product);
  }

  /**
   * 根据编码查找产品
   */
  async findByCode(code: string): Promise<Product | null> {
    return this.findOne({ code });
  }

  /**
   * 检查编码是否存在
   */
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.ProductWhereInput = { code };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const count = await this.count(where);
    return count > 0;
  }
}


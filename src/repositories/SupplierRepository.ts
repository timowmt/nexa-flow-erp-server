/**
 * 供应商 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { Supplier, Prisma } from '@prisma/client';

export class SupplierRepository extends BaseRepository<
  Supplier,
  Prisma.SupplierCreateInput,
  Prisma.SupplierUpdateInput,
  Prisma.SupplierWhereInput
> {
  constructor() {
    super(prisma.supplier);
  }

  /**
   * 根据编码查找供应商
   */
  async findByCode(code: string): Promise<Supplier | null> {
    return this.findOne({ code });
  }

  /**
   * 检查编码是否存在
   */
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.SupplierWhereInput = { code };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const count = await this.count(where);
    return count > 0;
  }
}


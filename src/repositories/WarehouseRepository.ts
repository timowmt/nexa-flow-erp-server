/**
 * 仓库 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { Warehouse, Prisma } from '@prisma/client';

export class WarehouseRepository extends BaseRepository<
  Warehouse,
  Prisma.WarehouseCreateInput,
  Prisma.WarehouseUpdateInput,
  Prisma.WarehouseWhereInput
> {
  constructor() {
    super(prisma.warehouse);
  }

  /**
   * 根据编码查找仓库
   */
  async findByCode(code: string): Promise<Warehouse | null> {
    return this.findOne({ code });
  }

  /**
   * 检查编码是否存在
   */
  async codeExists(code: string, excludeId?: string): Promise<boolean> {
    const where: Prisma.WarehouseWhereInput = { code };
    if (excludeId) {
      where.id = { not: excludeId };
    }
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * 获取所有活跃的仓库
   */
  async findActive(): Promise<Warehouse[]> {
    return this.findMany({ status: 'active' }, {
      orderBy: { createdAt: 'desc' },
    });
  }
}


/**
 * 仓库 Service
 */

import { BaseService } from './BaseService.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import type { Warehouse, Prisma } from '@prisma/client';

export class WarehouseService extends BaseService {
  private warehouseRepository: WarehouseRepository;

  constructor() {
    super();
    this.warehouseRepository = new WarehouseRepository();
  }

  /**
   * 获取仓库列表
   */
  async getWarehouses(params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }) {
    const { page = 1, pageSize = 10, keyword, status } = params || {};

    const where: Prisma.WarehouseWhereInput = {};
    if (keyword) {
      where.OR = [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
      ];
    }
    if (status) {
      where.status = status;
    }

    const [records, total] = await Promise.all([
      this.warehouseRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.warehouseRepository.count(where),
    ]);

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取所有活跃的仓库
   */
  async getActiveWarehouses(): Promise<Warehouse[]> {
    return this.warehouseRepository.findActive();
  }

  /**
   * 根据 ID 获取仓库
   */
  async getWarehouseById(id: string): Promise<Warehouse | null> {
    return this.warehouseRepository.findById(id);
  }

  /**
   * 创建仓库
   */
  async createWarehouse(data: Prisma.WarehouseCreateInput): Promise<Warehouse> {
    // 检查编码是否已存在
    const exists = await this.warehouseRepository.codeExists(data.code);
    if (exists) {
      throw new Error('仓库编码已存在');
    }

    return this.warehouseRepository.create(data);
  }

  /**
   * 更新仓库
   */
  async updateWarehouse(
    id: string,
    data: Prisma.WarehouseUpdateInput
  ): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new Error('仓库不存在');
    }

    // 如果更新了编码，检查新编码是否已存在
    if (data.code && typeof data.code === 'string') {
      const exists = await this.warehouseRepository.codeExists(data.code, id);
      if (exists) {
        throw new Error('仓库编码已存在');
      }
    }

    return this.warehouseRepository.update(id, data);
  }

  /**
   * 删除仓库
   */
  async deleteWarehouse(id: string): Promise<void> {
    const warehouse = await this.warehouseRepository.findById(id);
    if (!warehouse) {
      throw new Error('仓库不存在');
    }

    await this.warehouseRepository.delete(id);
  }
}


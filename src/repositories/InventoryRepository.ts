/**
 * 库存 Repository
 */

import { BaseRepository } from './BaseRepository.js';
import { prisma } from '../db/client.js';
import type { Inventory, Prisma } from '@prisma/client';

export class InventoryRepository extends BaseRepository<
  Inventory,
  Prisma.InventoryCreateInput,
  Prisma.InventoryUpdateInput,
  Prisma.InventoryWhereInput
> {
  constructor() {
    super(prisma.inventory);
  }

  /**
   * 根据仓库和产品查找库存
   */
  async findByWarehouseAndProduct(
    warehouseId: string,
    productId: string
  ): Promise<Inventory | null> {
    return this.findOne({
      warehouseId,
      productId,
    }, {
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          specification: true,
          unit: true,
          minStock: true,
          maxStock: true,
        },
      },
    });
  }

  /**
   * 更新库存数量（使用事务）
   */
  async updateQuantity(
    warehouseId: string,
    productId: string,
    quantity: number,
    availableQuantity?: number,
    reservedQuantity?: number
  ): Promise<Inventory> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId,
          },
        },
      });

      if (!existing) {
        // 如果不存在，创建新记录
        return tx.inventory.create({
          data: {
            warehouseId,
            productId,
            quantity: quantity,
            availableQuantity: availableQuantity ?? quantity,
            reservedQuantity: reservedQuantity ?? 0,
          },
        });
      }

      // 更新现有记录
      return tx.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId,
          },
        },
        data: {
          quantity: existing.quantity + quantity,
          availableQuantity: availableQuantity ?? (existing.availableQuantity + (quantity - (reservedQuantity ?? 0))),
          reservedQuantity: reservedQuantity ?? existing.reservedQuantity,
        },
      });
    });
  }
}


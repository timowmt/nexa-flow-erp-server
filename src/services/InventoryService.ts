/**
 * 库存 Service
 */

import { BaseService } from './BaseService.js';
import { InventoryRepository } from '../repositories/InventoryRepository.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import type { Prisma } from '@prisma/client';

export class InventoryService extends BaseService {
  private inventoryRepository: InventoryRepository;
  private warehouseRepository: WarehouseRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.inventoryRepository = new InventoryRepository();
    this.warehouseRepository = new WarehouseRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取即时库存列表
   */
  async getCurrentInventory(params: {
    page?: number;
    pageSize?: number;
    warehouseId?: string;
    productId?: string;
    keyword?: string;
  }) {
    const { page = 1, pageSize = 10, warehouseId, productId, keyword } = params;

    const where: Prisma.InventoryWhereInput = {};
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    if (productId) {
      where.productId = productId;
    }
    if (keyword) {
      where.product = {
        OR: [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
        ],
      };
    }

    const [records, total] = await Promise.all([
      this.inventoryRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
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
        },
      }),
      this.inventoryRepository.count(where),
    ]);

    // 转换数据格式
    const inventory = records.map((item: any) => ({
      id: item.id,
      warehouseId: item.warehouseId,
      warehouseName: item.warehouse.name,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      unit: item.product.unit,
      quantity: item.quantity,
      availableQuantity: item.availableQuantity,
      reservedQuantity: item.reservedQuantity,
      location: item.location,
      minStock: item.product.minStock,
      maxStock: item.product.maxStock,
      updateTime: item.updatedAt.toISOString(),
    }));

    return {
      records: inventory,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 更新库存（入库）
   * 注意：此方法内部已使用事务，不应在外部事务中调用
   */
  async increaseInventory(
    warehouseId: string,
    productId: string,
    quantity: number
  ): Promise<void> {
    // 验证仓库和产品是否存在
    const [warehouse, product] = await Promise.all([
      this.warehouseRepository.findById(warehouseId),
      this.productRepository.findById(productId),
    ]);

    if (!warehouse) {
      throw new Error('仓库不存在');
    }
    if (!product) {
      throw new Error('产品不存在');
    }

    await this.inventoryRepository.updateQuantity(
      warehouseId,
      productId,
      quantity
    );
  }

  /**
   * 在事务中更新库存（入库）
   */
  async increaseInventoryInTransaction(
    tx: any,
    warehouseId: string,
    productId: string,
    quantity: number
  ): Promise<void> {
    const existing = await tx.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId,
          productId,
        },
      },
    });

    if (!existing) {
      await tx.inventory.create({
        data: {
          warehouseId,
          productId,
          quantity: quantity,
          availableQuantity: quantity,
          reservedQuantity: 0,
        },
      });
    } else {
      await tx.inventory.update({
        where: {
          warehouseId_productId: {
            warehouseId,
            productId,
          },
        },
        data: {
          quantity: existing.quantity + quantity,
          availableQuantity: existing.availableQuantity + quantity,
        },
      });
    }
  }

  /**
   * 更新库存（出库）
   */
  async decreaseInventory(
    warehouseId: string,
    productId: string,
    quantity: number
  ): Promise<void> {
    // 验证仓库和产品是否存在
    const [warehouse, product] = await Promise.all([
      this.warehouseRepository.findById(warehouseId),
      this.productRepository.findById(productId),
    ]);

    if (!warehouse) {
      throw new Error('仓库不存在');
    }
    if (!product) {
      throw new Error('产品不存在');
    }

    // 检查库存是否充足
    const inventory = await this.inventoryRepository.findByWarehouseAndProduct(
      warehouseId,
      productId
    );

    if (!inventory || inventory.availableQuantity < quantity) {
      throw new Error('库存不足');
    }

    await this.inventoryRepository.updateQuantity(
      warehouseId,
      productId,
      -quantity
    );
  }

  /**
   * 在事务中更新库存（出库）
   */
  async decreaseInventoryInTransaction(
    tx: any,
    warehouseId: string,
    productId: string,
    quantity: number
  ): Promise<void> {
    const existing = await tx.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId,
          productId,
        },
      },
    });

    if (!existing) {
      throw new Error('库存不存在');
    }

    if (existing.availableQuantity < quantity) {
      throw new Error('库存不足');
    }

    await tx.inventory.update({
      where: {
        warehouseId_productId: {
          warehouseId,
          productId,
        },
      },
      data: {
        quantity: existing.quantity - quantity,
        availableQuantity: existing.availableQuantity - quantity,
      },
    });
  }
}


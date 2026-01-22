/**
 * 盘点单 Service
 */

import { BaseService } from './BaseService.js';
import { StockCheckRepository } from '../repositories/StockCheckRepository.js';
import { InventoryService } from './InventoryService.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateStockCheckInput {
  warehouseId: string;
  checkDate: Date;
  checker: string;
  items: Array<{
    productId: string;
    bookQuantity: number;
    actualQuantity: number;
    location?: string;
    reason?: string;
  }>;
  remark?: string;
}

export class StockCheckService extends BaseService {
  private stockCheckRepository: StockCheckRepository;
  private inventoryService: InventoryService;
  private warehouseRepository: WarehouseRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.stockCheckRepository = new StockCheckRepository();
    this.inventoryService = new InventoryService();
    this.warehouseRepository = new WarehouseRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取盘点单列表
   */
  async getStockChecks(params: {
    page?: number;
    pageSize?: number;
  }) {
    const { page = 1, pageSize = 10 } = params;

    const where: Prisma.StockCheckWhereInput = {};

    const [records, total] = await Promise.all([
      this.stockCheckRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.stockCheckRepository.count(where),
    ]);

    // 转换数据格式
    const stockChecks = records.map((stockCheck: any) => ({
      id: stockCheck.id,
      checkNo: stockCheck.checkNo,
      warehouseId: stockCheck.warehouseId,
      warehouseName: stockCheck.warehouse.name,
      checkDate: stockCheck.checkDate.toISOString().split('T')[0],
      checker: stockCheck.checker,
      status: stockCheck.status,
      statusName: this.getStockCheckStatusName(stockCheck.status),
      totalItems: (stockCheck as any).items?.length || 0,
      differenceItems: (stockCheck as any).items?.filter((item: any) => item.difference !== 0).length || 0,
      remark: stockCheck.remark,
      createTime: stockCheck.createdAt.toISOString(),
    }));

    return {
      records: stockChecks,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取盘点单明细
   */
  async getStockCheckItems(id: string) {
    const stockCheck = await this.stockCheckRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockCheck) {
      throw new Error('盘点单不存在');
    }

    return (stockCheck as any).items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      bookQuantity: item.bookQuantity,
      actualQuantity: item.actualQuantity,
      difference: item.difference,
      location: item.location,
      reason: item.reason,
    }));
  }

  /**
   * 创建盘点单
   */
  async createStockCheck(data: CreateStockCheckInput): Promise<any> {
    // 验证仓库是否存在
    const warehouse = await this.warehouseRepository.findById(data.warehouseId);
    if (!warehouse) {
      throw new Error('仓库不存在');
    }

    // 验证所有产品是否存在
    for (const item of data.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) {
        throw new Error(`产品不存在: ${item.productId}`);
      }
    }

    // 使用事务创建盘点单
    return prisma.$transaction(async (tx) => {
      // 生成盘点单号
      const checkNo = await this.stockCheckRepository.generateCheckNo('CK');

      // 计算差异
      const itemsWithDifference = data.items.map((item) => ({
        ...item,
        difference: item.actualQuantity - item.bookQuantity,
      }));

      // 创建盘点单
      const stockCheck = await tx.stockCheck.create({
        data: {
          checkNo,
          warehouseId: data.warehouseId,
          checkDate: data.checkDate,
          checker: data.checker,
          status: 'draft',
          remark: data.remark,
          items: {
            create: itemsWithDifference.map((item) => ({
              productId: item.productId,
              bookQuantity: item.bookQuantity,
              actualQuantity: item.actualQuantity,
              difference: item.difference,
              location: item.location,
              reason: item.reason,
            })),
          },
        },
        include: {
          warehouse: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return stockCheck;
    });
  }

  /**
   * 更新盘点单
   */
  async updateStockCheck(id: string, data: Partial<CreateStockCheckInput>): Promise<any> {
    const stockCheck = await this.stockCheckRepository.findById(id);
    if (!stockCheck) {
      throw new Error('盘点单不存在');
    }

    if (stockCheck.status === 'completed') {
      throw new Error('已完成的盘点单不能修改');
    }

    if (stockCheck.status === 'cancelled') {
      throw new Error('已取消的盘点单不能修改');
    }

    // 如果更新仓库，验证仓库是否存在
    if (data.warehouseId) {
      const warehouse = await this.warehouseRepository.findById(data.warehouseId);
      if (!warehouse) {
        throw new Error('仓库不存在');
      }
    }

    // 如果更新明细，验证所有产品是否存在
    if (data.items) {
      for (const item of data.items) {
        const product = await this.productRepository.findById(item.productId);
        if (!product) {
          throw new Error(`产品不存在: ${item.productId}`);
        }
      }
    }

    // 使用事务更新盘点单
    return prisma.$transaction(async (tx) => {
      // 如果更新明细，先删除旧明细
      if (data.items) {
        await tx.stockCheckItem.deleteMany({
          where: { checkId: id },
        });
      }

      // 计算差异
      const itemsWithDifference = data.items
        ? data.items.map((item) => ({
            ...item,
            difference: item.actualQuantity - item.bookQuantity,
          }))
        : [];

      // 更新盘点单
      const updated = await tx.stockCheck.update({
        where: { id },
        data: {
          ...(data.warehouseId && { warehouseId: data.warehouseId }),
          ...(data.checkDate && { checkDate: data.checkDate }),
          ...(data.checker && { checker: data.checker }),
          ...(data.remark !== undefined && { remark: data.remark }),
          ...(data.items && {
            items: {
              create: itemsWithDifference.map((item) => ({
                productId: item.productId,
                bookQuantity: item.bookQuantity,
                actualQuantity: item.actualQuantity,
                difference: item.difference,
                location: item.location,
                reason: item.reason,
              })),
            },
          }),
        },
        include: {
          warehouse: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return updated;
    });
  }

  /**
   * 完成盘点单（更新库存）
   */
  async completeStockCheck(id: string): Promise<void> {
    const stockCheck = await this.stockCheckRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockCheck) {
      throw new Error('盘点单不存在');
    }

    if (stockCheck.status === 'completed') {
      throw new Error('盘点单已完成');
    }

    if (stockCheck.status === 'cancelled') {
      throw new Error('盘点单已取消，无法完成');
    }

    // 使用事务更新盘点单状态并更新库存
    await prisma.$transaction(async (tx) => {
      // 更新盘点单状态
      await tx.stockCheck.update({
        where: { id },
        data: { status: 'completed' },
      });

      // 根据差异更新库存
      for (const item of (stockCheck as any).items) {
        if (item.difference > 0) {
          // 盘盈，增加库存
          await this.inventoryService.increaseInventoryInTransaction(
            tx,
            stockCheck.warehouseId,
            item.productId,
            item.difference
          );
        } else if (item.difference < 0) {
          // 盘亏，减少库存
          await this.inventoryService.decreaseInventoryInTransaction(
            tx,
            stockCheck.warehouseId,
            item.productId,
            Math.abs(item.difference)
          );
        }
      }
    });
  }

  private getStockCheckStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


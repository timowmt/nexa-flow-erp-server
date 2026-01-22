/**
 * 出库单 Service
 */

import { BaseService } from './BaseService.js';
import { StockOutRepository } from '../repositories/StockOutRepository.js';
import { InventoryService } from './InventoryService.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateStockOutInput {
  warehouseId: string;
  type: 'sales' | 'transfer' | 'adjustment' | 'scrap';
  relatedOrderId?: string;
  relatedOrderNo?: string;
  outDate: Date;
  items: Array<{
    productId: string;
    quantity: number;
    location?: string;
    batchNo?: string;
    remark?: string;
  }>;
  remark?: string;
}

export class StockOutService extends BaseService {
  private stockOutRepository: StockOutRepository;
  private inventoryService: InventoryService;
  private warehouseRepository: WarehouseRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.stockOutRepository = new StockOutRepository();
    this.inventoryService = new InventoryService();
    this.warehouseRepository = new WarehouseRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取出库单列表
   */
  async getStockOuts(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, warehouseId, startDate, endDate } = params;

    const where: Prisma.StockOutWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    if (startDate || endDate) {
      where.outDate = {};
      if (startDate) {
        where.outDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.outDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      this.stockOutRepository.findMany(where, {
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
      this.stockOutRepository.count(where),
    ]);

    // 转换数据格式
    const stockOuts = records.map((stockOut: any) => ({
      id: stockOut.id,
      outNo: stockOut.outNo,
      warehouseId: stockOut.warehouseId,
      warehouseName: stockOut.warehouse.name,
      type: stockOut.type,
      typeName: this.getStockOutTypeName(stockOut.type),
      relatedOrderId: stockOut.relatedOrderId,
      relatedOrderNo: stockOut.relatedOrderNo,
      outDate: stockOut.outDate.toISOString().split('T')[0],
      operator: stockOut.operator,
      status: stockOut.status,
      statusName: this.getStockOutStatusName(stockOut.status),
      remark: stockOut.remark,
      createTime: stockOut.createdAt.toISOString(),
    }));

    return {
      records: stockOuts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取出库单详情
   */
  async getStockOutById(id: string) {
    const stockOut = await this.stockOutRepository.findById(id, {
      warehouse: true,
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockOut) {
      throw new Error('出库单不存在');
    }

    return {
      id: stockOut.id,
      outNo: stockOut.outNo,
      warehouseId: stockOut.warehouseId,
      warehouseName: (stockOut as any).warehouse.name,
      type: stockOut.type,
      typeName: this.getStockOutTypeName(stockOut.type),
      relatedOrderId: stockOut.relatedOrderId,
      relatedOrderNo: stockOut.relatedOrderNo,
      outDate: stockOut.outDate.toISOString().split('T')[0],
      operator: stockOut.operator,
      status: stockOut.status,
      statusName: this.getStockOutStatusName(stockOut.status),
      remark: stockOut.remark,
      createTime: (stockOut as any).createdAt.toISOString(),
    };
  }

  /**
   * 获取出库单明细
   */
  async getStockOutItems(id: string) {
    const stockOut = await this.stockOutRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockOut) {
      throw new Error('出库单不存在');
    }

    return (stockOut as any).items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      quantity: item.quantity,
      location: item.location,
      batchNo: item.batchNo,
      remark: item.remark,
    }));
  }

  /**
   * 创建出库单
   */
  async createStockOut(data: CreateStockOutInput, operator: string): Promise<any> {
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

    // 使用事务创建出库单
    return prisma.$transaction(async (tx) => {
      // 生成出库单号
      const outNo = await this.stockOutRepository.generateOutNo('OUT');

      // 创建出库单
      const stockOut = await tx.stockOut.create({
        data: {
          outNo,
          warehouseId: data.warehouseId,
          type: data.type,
          relatedOrderId: data.relatedOrderId,
          relatedOrderNo: data.relatedOrderNo,
          outDate: data.outDate,
          operator,
          status: 'draft',
          remark: data.remark,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              location: item.location,
              batchNo: item.batchNo,
              remark: item.remark,
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

      return stockOut;
    });
  }

  /**
   * 更新出库单
   */
  async updateStockOut(id: string, data: Partial<CreateStockOutInput>): Promise<any> {
    const stockOut = await this.stockOutRepository.findById(id);
    if (!stockOut) {
      throw new Error('出库单不存在');
    }

    if (stockOut.status === 'completed') {
      throw new Error('已完成的出库单不能修改');
    }

    if (stockOut.status === 'cancelled') {
      throw new Error('已取消的出库单不能修改');
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

    // 使用事务更新出库单
    return prisma.$transaction(async (tx) => {
      // 如果更新明细，先删除旧明细
      if (data.items) {
        await tx.stockOutItem.deleteMany({
          where: { stockOutId: id } as any,
        });
      }

      // 更新出库单
      const updated = await tx.stockOut.update({
        where: { id },
        data: {
          ...(data.warehouseId && { warehouseId: data.warehouseId }),
          ...(data.type && { type: data.type }),
          ...(data.relatedOrderId !== undefined && { relatedOrderId: data.relatedOrderId }),
          ...(data.relatedOrderNo !== undefined && { relatedOrderNo: data.relatedOrderNo }),
          ...(data.outDate && { outDate: data.outDate }),
          ...(data.remark !== undefined && { remark: data.remark }),
          ...(data.items && {
            items: {
              create: data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                location: item.location,
                batchNo: item.batchNo,
                remark: item.remark,
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
   * 完成出库单（更新库存）
   */
  async completeStockOut(id: string): Promise<void> {
    const stockOut = await this.stockOutRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockOut) {
      throw new Error('出库单不存在');
    }

    if (stockOut.status === 'completed') {
      throw new Error('出库单已完成');
    }

    if (stockOut.status === 'cancelled') {
      throw new Error('出库单已取消，无法完成');
    }

    // 使用事务更新出库单状态并更新库存
    await prisma.$transaction(async (tx) => {
      // 更新出库单状态
      await tx.stockOut.update({
        where: { id },
        data: { status: 'completed' },
      });

      // 更新库存（在事务中）
      for (const item of (stockOut as any).items) {
        await this.inventoryService.decreaseInventoryInTransaction(
          tx,
          stockOut.warehouseId,
          item.productId,
          item.quantity
        );
      }
    });
  }

  private getStockOutTypeName(type: string): string {
    const map: Record<string, string> = {
      sales: '销售出库',
      transfer: '调拨出库',
      adjustment: '盘亏出库',
      scrap: '报废出库',
    };
    return map[type] || type;
  }

  private getStockOutStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


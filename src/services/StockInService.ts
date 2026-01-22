/**
 * 入库单 Service
 */

import { BaseService } from './BaseService.js';
import { StockInRepository } from '../repositories/StockInRepository.js';
import { InventoryService } from './InventoryService.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateStockInInput {
  warehouseId: string;
  type: 'purchase' | 'transfer' | 'adjustment' | 'return';
  relatedOrderId?: string;
  relatedOrderNo?: string;
  inDate: Date;
  items: Array<{
    productId: string;
    quantity: number;
    location?: string;
    batchNo?: string;
    remark?: string;
  }>;
  remark?: string;
}

export class StockInService extends BaseService {
  private stockInRepository: StockInRepository;
  private inventoryService: InventoryService;
  private warehouseRepository: WarehouseRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.stockInRepository = new StockInRepository();
    this.inventoryService = new InventoryService();
    this.warehouseRepository = new WarehouseRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取入库单列表
   */
  async getStockIns(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    warehouseId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, warehouseId, startDate, endDate } = params;

    const where: Prisma.StockInWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    if (startDate || endDate) {
      where.inDate = {};
      if (startDate) {
        where.inDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.inDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      this.stockInRepository.findMany(where, {
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
      this.stockInRepository.count(where),
    ]);

    // 转换数据格式
    const stockIns = records.map((stockIn: any) => ({
      id: stockIn.id,
      inNo: stockIn.inNo,
      warehouseId: stockIn.warehouseId,
      warehouseName: stockIn.warehouse.name,
      type: stockIn.type,
      typeName: this.getStockInTypeName(stockIn.type),
      relatedOrderId: stockIn.relatedOrderId,
      relatedOrderNo: stockIn.relatedOrderNo,
      inDate: stockIn.inDate.toISOString().split('T')[0],
      operator: stockIn.operator,
      status: stockIn.status,
      statusName: this.getStockInStatusName(stockIn.status),
      remark: stockIn.remark,
      createTime: stockIn.createdAt.toISOString(),
    }));

    return {
      records: stockIns,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取入库单详情
   */
  async getStockInById(id: string) {
    const stockIn = await this.stockInRepository.findById(id, {
      warehouse: true,
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockIn) {
      throw new Error('入库单不存在');
    }

    return {
      id: stockIn.id,
      inNo: stockIn.inNo,
      warehouseId: stockIn.warehouseId,
      warehouseName: (stockIn as any).warehouse.name,
      type: stockIn.type,
      typeName: this.getStockInTypeName(stockIn.type),
      relatedOrderId: stockIn.relatedOrderId,
      relatedOrderNo: stockIn.relatedOrderNo,
      inDate: stockIn.inDate.toISOString().split('T')[0],
      operator: stockIn.operator,
      status: stockIn.status,
      statusName: this.getStockInStatusName(stockIn.status),
      remark: stockIn.remark,
      createTime: (stockIn as any).createdAt.toISOString(),
    };
  }

  /**
   * 获取入库单明细
   */
  async getStockInItems(id: string) {
    const stockIn = await this.stockInRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockIn) {
      throw new Error('入库单不存在');
    }

    return (stockIn as any).items.map((item: any) => ({
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
   * 创建入库单
   */
  async createStockIn(data: CreateStockInInput, operator: string): Promise<any> {
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

    // 使用事务创建入库单并更新库存
    return prisma.$transaction(async (tx) => {
      // 生成入库单号
      const inNo = await this.stockInRepository.generateInNo('IN');

      // 创建入库单
      const stockIn = await tx.stockIn.create({
        data: {
          inNo,
          warehouseId: data.warehouseId,
          type: data.type,
          relatedOrderId: data.relatedOrderId,
          relatedOrderNo: data.relatedOrderNo,
          inDate: data.inDate,
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

      return stockIn;
    });
  }

  /**
   * 更新入库单
   */
  async updateStockIn(id: string, data: Partial<CreateStockInInput>): Promise<any> {
    const stockIn = await this.stockInRepository.findById(id);
    if (!stockIn) {
      throw new Error('入库单不存在');
    }

    if (stockIn.status === 'completed') {
      throw new Error('已完成的入库单不能修改');
    }

    if (stockIn.status === 'cancelled') {
      throw new Error('已取消的入库单不能修改');
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

    // 使用事务更新入库单
    return prisma.$transaction(async (tx) => {
      // 如果更新明细，先删除旧明细
      if (data.items) {
        await tx.stockInItem.deleteMany({
          where: { stockInId: id },
        });
      }

      // 更新入库单
      const updated = await tx.stockIn.update({
        where: { id },
        data: {
          ...(data.warehouseId && { warehouseId: data.warehouseId }),
          ...(data.type && { type: data.type }),
          ...(data.relatedOrderId !== undefined && { relatedOrderId: data.relatedOrderId }),
          ...(data.relatedOrderNo !== undefined && { relatedOrderNo: data.relatedOrderNo }),
          ...(data.inDate && { inDate: data.inDate }),
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
   * 完成入库单（更新库存）
   */
  async completeStockIn(id: string): Promise<void> {
    const stockIn = await this.stockInRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockIn) {
      throw new Error('入库单不存在');
    }

    if (stockIn.status === 'completed') {
      throw new Error('入库单已完成');
    }

    if (stockIn.status === 'cancelled') {
      throw new Error('入库单已取消，无法完成');
    }

    // 使用事务更新入库单状态并更新库存
    await prisma.$transaction(async (tx) => {
      // 更新入库单状态
      await tx.stockIn.update({
        where: { id },
        data: { status: 'completed' },
      });

      // 更新库存（在事务中）
      for (const item of (stockIn as any).items) {
        await this.inventoryService.increaseInventoryInTransaction(
          tx,
          stockIn.warehouseId,
          item.productId,
          item.quantity
        );
      }
    });
  }

  private getStockInTypeName(type: string): string {
    const map: Record<string, string> = {
      purchase: '采购入库',
      transfer: '调拨入库',
      adjustment: '盘盈入库',
      return: '退货入库',
    };
    return map[type] || type;
  }

  private getStockInStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


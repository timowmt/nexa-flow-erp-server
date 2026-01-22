/**
 * 调拨单 Service
 */

import { BaseService } from './BaseService.js';
import { StockTransferRepository } from '../repositories/StockTransferRepository.js';
import { InventoryService } from './InventoryService.js';
import { WarehouseRepository } from '../repositories/WarehouseRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateStockTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  transferDate: Date;
  items: Array<{
    productId: string;
    quantity: number;
    fromLocation?: string;
    toLocation?: string;
    batchNo?: string;
    remark?: string;
  }>;
  remark?: string;
}

export class StockTransferService extends BaseService {
  private stockTransferRepository: StockTransferRepository;
  private inventoryService: InventoryService;
  private warehouseRepository: WarehouseRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.stockTransferRepository = new StockTransferRepository();
    this.inventoryService = new InventoryService();
    this.warehouseRepository = new WarehouseRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取调拨单列表
   */
  async getStockTransfers(params: {
    page?: number;
    pageSize?: number;
  }) {
    const { page = 1, pageSize = 10 } = params;

    const where: Prisma.StockTransferWhereInput = {};

    const [records, total] = await Promise.all([
      this.stockTransferRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          fromWarehouse: {
            select: {
              id: true,
              name: true,
            },
          },
          toWarehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.stockTransferRepository.count(where),
    ]);

    // 转换数据格式
    const stockTransfers = records.map((stockTransfer: any) => ({
      id: stockTransfer.id,
      transferNo: stockTransfer.transferNo,
      fromWarehouseId: stockTransfer.fromWarehouseId,
      fromWarehouseName: stockTransfer.fromWarehouse.name,
      toWarehouseId: stockTransfer.toWarehouseId,
      toWarehouseName: stockTransfer.toWarehouse.name,
      transferDate: stockTransfer.transferDate.toISOString().split('T')[0],
      operator: stockTransfer.operator,
      status: stockTransfer.status,
      statusName: this.getStockTransferStatusName(stockTransfer.status),
      remark: stockTransfer.remark,
      createTime: stockTransfer.createdAt.toISOString(),
    }));

    return {
      records: stockTransfers,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取调拨单明细
   */
  async getStockTransferItems(id: string) {
    const stockTransfer = await this.stockTransferRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockTransfer) {
      throw new Error('调拨单不存在');
    }

    return (stockTransfer as any).items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      quantity: item.quantity,
      fromLocation: item.fromLocation,
      toLocation: item.toLocation,
      batchNo: item.batchNo,
      remark: item.remark,
    }));
  }

  /**
   * 创建调拨单
   */
  async createStockTransfer(data: CreateStockTransferInput, operator: string): Promise<any> {
    // 验证仓库是否存在
    const [fromWarehouse, toWarehouse] = await Promise.all([
      this.warehouseRepository.findById(data.fromWarehouseId),
      this.warehouseRepository.findById(data.toWarehouseId),
    ]);

    if (!fromWarehouse) {
      throw new Error('源仓库不存在');
    }
    if (!toWarehouse) {
      throw new Error('目标仓库不存在');
    }

    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new Error('源仓库和目标仓库不能相同');
    }

    // 验证所有产品是否存在
    for (const item of data.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) {
        throw new Error(`产品不存在: ${item.productId}`);
      }
    }

    // 使用事务创建调拨单
    return prisma.$transaction(async (tx) => {
      // 生成调拨单号
      const transferNo = await this.stockTransferRepository.generateTransferNo('TR');

      // 创建调拨单
      const stockTransfer = await tx.stockTransfer.create({
        data: {
          transferNo,
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          transferDate: data.transferDate,
          operator,
          status: 'draft',
          remark: data.remark,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              fromLocation: item.fromLocation,
              toLocation: item.toLocation,
              batchNo: item.batchNo,
              remark: item.remark,
            })),
          },
        },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return stockTransfer;
    });
  }

  /**
   * 更新调拨单
   */
  async updateStockTransfer(id: string, data: Partial<CreateStockTransferInput>): Promise<any> {
    const stockTransfer = await this.stockTransferRepository.findById(id);
    if (!stockTransfer) {
      throw new Error('调拨单不存在');
    }

    if (stockTransfer.status === 'completed') {
      throw new Error('已完成的调拨单不能修改');
    }

    if (stockTransfer.status === 'cancelled') {
      throw new Error('已取消的调拨单不能修改');
    }

    // 如果更新仓库，验证仓库是否存在
    if (data.fromWarehouseId || data.toWarehouseId) {
      const [fromWarehouse, toWarehouse] = await Promise.all([
        data.fromWarehouseId
          ? this.warehouseRepository.findById(data.fromWarehouseId)
          : Promise.resolve(null),
        data.toWarehouseId
          ? this.warehouseRepository.findById(data.toWarehouseId)
          : Promise.resolve(null),
      ]);

      if (data.fromWarehouseId && !fromWarehouse) {
        throw new Error('源仓库不存在');
      }
      if (data.toWarehouseId && !toWarehouse) {
        throw new Error('目标仓库不存在');
      }

      const finalFromWarehouseId = data.fromWarehouseId || stockTransfer.fromWarehouseId;
      const finalToWarehouseId = data.toWarehouseId || stockTransfer.toWarehouseId;
      if (finalFromWarehouseId === finalToWarehouseId) {
        throw new Error('源仓库和目标仓库不能相同');
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

    // 使用事务更新调拨单
    return prisma.$transaction(async (tx) => {
      // 如果更新明细，先删除旧明细
      if (data.items) {
        await tx.stockTransferItem.deleteMany({
          where: { transferId: id },
        });
      }

      // 更新调拨单
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          ...(data.fromWarehouseId && { fromWarehouseId: data.fromWarehouseId }),
          ...(data.toWarehouseId && { toWarehouseId: data.toWarehouseId }),
          ...(data.transferDate && { transferDate: data.transferDate }),
          ...(data.remark !== undefined && { remark: data.remark }),
          ...(data.items && {
            items: {
              create: data.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                fromLocation: item.fromLocation,
                toLocation: item.toLocation,
                batchNo: item.batchNo,
                remark: item.remark,
              })),
            },
          }),
        },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
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
   * 完成调拨单（更新库存）
   */
  async completeStockTransfer(id: string): Promise<void> {
    const stockTransfer = await this.stockTransferRepository.findById(id, {
      items: {
        include: {
          product: true,
        },
      },
    });

    if (!stockTransfer) {
      throw new Error('调拨单不存在');
    }

    if (stockTransfer.status === 'completed') {
      throw new Error('调拨单已完成');
    }

    if (stockTransfer.status === 'cancelled') {
      throw new Error('调拨单已取消，无法完成');
    }

    // 使用事务更新调拨单状态并更新库存
    await prisma.$transaction(async (tx) => {
      // 更新调拨单状态
      await tx.stockTransfer.update({
        where: { id },
        data: { status: 'completed' },
      });

      // 更新库存：从源仓库减少，向目标仓库增加
      for (const item of (stockTransfer as any).items) {
        // 从源仓库减少库存
        await this.inventoryService.decreaseInventoryInTransaction(
          tx,
          stockTransfer.fromWarehouseId,
          item.productId,
          item.quantity
        );

        // 向目标仓库增加库存
        await this.inventoryService.increaseInventoryInTransaction(
          tx,
          stockTransfer.toWarehouseId,
          item.productId,
          item.quantity
        );
      }
    });
  }

  private getStockTransferStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      in_transit: '在途',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


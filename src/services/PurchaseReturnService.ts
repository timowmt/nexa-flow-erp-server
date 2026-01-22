/**
 * 采购退货 Service
 */

import { BaseService } from './BaseService.js';
import { PurchaseReturnRepository } from '../repositories/PurchaseReturnRepository.js';
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository.js';
import { SupplierRepository } from '../repositories/SupplierRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreatePurchaseReturnInput {
  originalOrderId: string;
  supplierId: string;
  returnDate: Date;
  items: Array<{
    orderItemId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    reason?: string;
  }>;
  reason: string;
  remark?: string;
}

export class PurchaseReturnService extends BaseService {
  private purchaseReturnRepository: PurchaseReturnRepository;
  private purchaseOrderRepository: PurchaseOrderRepository;
  private supplierRepository: SupplierRepository;

  constructor() {
    super();
    this.purchaseReturnRepository = new PurchaseReturnRepository();
    this.purchaseOrderRepository = new PurchaseOrderRepository();
    this.supplierRepository = new SupplierRepository();
  }

  /**
   * 获取采购退货列表
   */
  async getPurchaseReturns(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    supplierId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, supplierId, startDate, endDate } = params;

    const where: Prisma.PurchaseReturnWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (startDate || endDate) {
      where.returnDate = {};
      if (startDate) {
        where.returnDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.returnDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      this.purchaseReturnRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          originalOrder: {
            select: {
              id: true,
              orderNo: true,
            },
          },
        },
      }),
      this.purchaseReturnRepository.count(where),
    ]);

    // 转换数据格式
    const returns = records.map((returnOrder: any) => ({
      id: returnOrder.id,
      returnNo: returnOrder.returnNo,
      originalOrderId: returnOrder.originalOrderId,
      originalOrderNo: returnOrder.originalOrder.orderNo,
      supplierId: returnOrder.supplierId,
      supplierName: returnOrder.supplier.name,
      returnDate: returnOrder.returnDate.toISOString().split('T')[0],
      status: returnOrder.status,
      statusName: this.getPurchaseReturnStatusName(returnOrder.status),
      totalAmount: returnOrder.totalAmount,
      reason: returnOrder.reason,
      remark: returnOrder.remark,
      createTime: returnOrder.createdAt.toISOString(),
    }));

    return {
      records: returns,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 根据 ID 获取采购退货详情
   */
  async getPurchaseReturnById(id: string) {
    const returnOrder = await this.purchaseReturnRepository.findById(id, {
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      originalOrder: {
        select: {
          id: true,
          orderNo: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
    });

    if (!returnOrder) {
      throw new Error('采购退货单不存在');
    }

    return returnOrder;
  }

  /**
   * 创建采购退货
   */
  async createPurchaseReturn(
    data: CreatePurchaseReturnInput,
    createById: string
  ): Promise<any> {
    // 验证原订单是否存在
    const originalOrder = await this.purchaseOrderRepository.findById(data.originalOrderId);
    if (!originalOrder) {
      throw new Error('原采购订单不存在');
    }

    // 验证供应商是否存在
    const supplier = await this.supplierRepository.findById(data.supplierId);
    if (!supplier) {
      throw new Error('供应商不存在');
    }

    // 使用事务创建退货单
    return prisma.$transaction(async (tx) => {
      // 生成退货单号
      const returnNo = await this.purchaseReturnRepository.generateReturnNo('PR');

      // 计算退货金额
      let totalAmount = 0;
      for (const item of data.items) {
        totalAmount += item.quantity * item.unitPrice;
      }

      // 创建退货单
      const returnOrder = await tx.purchaseReturn.create({
        data: {
          returnNo,
          originalOrderId: data.originalOrderId,
          supplierId: data.supplierId,
          returnDate: data.returnDate,
          status: 'pending',
          totalAmount,
          reason: data.reason,
          remark: data.remark,
          items: {
            create: data.items.map((item) => ({
              orderItemId: item.orderItemId,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.quantity * item.unitPrice,
              reason: item.reason,
            })),
          },
        },
        include: {
          supplier: true,
          originalOrder: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return returnOrder;
    });
  }

  /**
   * 更新采购退货
   */
  async updatePurchaseReturn(id: string, data: Partial<CreatePurchaseReturnInput>): Promise<any> {
    const returnOrder = await this.purchaseReturnRepository.findById(id);
    if (!returnOrder) {
      throw new Error('采购退货单不存在');
    }

    // 如果状态是已完成或已取消，不允许更新
    if (returnOrder.status === 'completed' || returnOrder.status === 'cancelled') {
      throw new Error('已完成或已取消的退货单不允许更新');
    }

    // 构建更新数据
    const updateData: any = {};
    if (data.returnDate) {
      updateData.returnDate = data.returnDate;
    }
    if (data.reason) {
      updateData.reason = data.reason;
    }
    if (data.remark !== undefined) {
      updateData.remark = data.remark;
    }

    // 如果有退货明细，需要重新计算总金额
    if (data.items && data.items.length > 0) {
      let totalAmount = 0;
      for (const item of data.items) {
        totalAmount += item.quantity * item.unitPrice;
      }
      updateData.totalAmount = totalAmount;
    }

    return this.purchaseReturnRepository.update(id, updateData);
  }

  /**
   * 获取采购退货明细
   */
  async getPurchaseReturnItems(returnId: string): Promise<any[]> {
    const returnOrder = await this.purchaseReturnRepository.findById(returnId);
    if (!returnOrder) {
      throw new Error('采购退货单不存在');
    }

    const items = await prisma.purchaseReturnItem.findMany({
      where: { returnId },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            specification: true,
            unit: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return items.map((item: any) => ({
      id: item.id,
      returnId: item.returnId,
      orderItemId: item.orderItemId,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      reason: item.reason,
    }));
  }

  /**
   * 更新采购退货状态
   */
  async updatePurchaseReturnStatus(id: string, status: string): Promise<any> {
    const returnOrder = await this.purchaseReturnRepository.findById(id);
    if (!returnOrder) {
      throw new Error('采购退货单不存在');
    }

    return this.purchaseReturnRepository.update(id, { status });
  }

  private getPurchaseReturnStatusName(status: string): string {
    const map: Record<string, string> = {
      pending: '待审批',
      approved: '已审批',
      rejected: '已拒绝',
      completed: '已完成',
    };
    return map[status] || status;
  }
}


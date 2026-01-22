/**
 * 退货订单 Service
 */

import { BaseService } from './BaseService.js';
import { ReturnOrderRepository } from '../repositories/ReturnOrderRepository.js';
import { SalesOrderRepository } from '../repositories/SalesOrderRepository.js';
import { CustomerRepository } from '../repositories/CustomerRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateReturnOrderInput {
  originalOrderId: string;
  customerId: string;
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

export class ReturnOrderService extends BaseService {
  private returnOrderRepository: ReturnOrderRepository;
  private salesOrderRepository: SalesOrderRepository;
  private customerRepository: CustomerRepository;

  constructor() {
    super();
    this.returnOrderRepository = new ReturnOrderRepository();
    this.salesOrderRepository = new SalesOrderRepository();
    this.customerRepository = new CustomerRepository();
  }

  /**
   * 获取退货订单列表
   */
  async getReturnOrders(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, customerId, startDate, endDate } = params;

    const where: Prisma.ReturnOrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (customerId) {
      where.customerId = customerId;
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
      this.returnOrderRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
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
      this.returnOrderRepository.count(where),
    ]);

    // 转换数据格式
    const returns = records.map((returnOrder: any) => ({
      id: returnOrder.id,
      returnNo: returnOrder.returnNo,
      originalOrderId: returnOrder.originalOrderId,
      originalOrderNo: returnOrder.originalOrder.orderNo,
      customerId: returnOrder.customerId,
      customerName: returnOrder.customer.name,
      returnDate: returnOrder.returnDate.toISOString().split('T')[0],
      status: returnOrder.status,
      statusName: this.getReturnStatusName(returnOrder.status),
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
   * 根据 ID 获取退货订单详情
   */
  async getReturnOrderById(id: string) {
    const returnOrder = await this.returnOrderRepository.findById(id, {
      customer: {
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
      throw new Error('退货订单不存在');
    }

    return returnOrder;
  }

  /**
   * 创建退货订单
   */
  async createReturnOrder(
    data: CreateReturnOrderInput,
    createById: string
  ): Promise<any> {
    // 验证原订单是否存在
    const originalOrder = await this.salesOrderRepository.findById(data.originalOrderId);
    if (!originalOrder) {
      throw new Error('原销售订单不存在');
    }

    // 验证客户是否存在
    const customer = await this.customerRepository.findById(data.customerId);
    if (!customer) {
      throw new Error('客户不存在');
    }

    // 使用事务创建退货单
    return prisma.$transaction(async (tx) => {
      // 生成退货单号
      const returnNo = await this.returnOrderRepository.generateReturnNo('RO');

      // 计算退货金额
      let totalAmount = 0;
      for (const item of data.items) {
        totalAmount += item.quantity * item.unitPrice;
      }

      // 创建退货单
      const returnOrder = await tx.returnOrder.create({
        data: {
          returnNo,
          originalOrderId: data.originalOrderId,
          customerId: data.customerId,
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
          customer: true,
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
   * 获取退货订单明细
   */
  async getReturnOrderItems(id: string): Promise<any[]> {
    const returnOrder = await this.returnOrderRepository.findById(id, {
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
      throw new Error('退货订单不存在');
    }

    return (returnOrder as any).items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      reason: item.reason,
    }));
  }

  /**
   * 更新退货订单
   */
  async updateReturnOrder(id: string, data: Partial<CreateReturnOrderInput>): Promise<any> {
    const returnOrder = await this.returnOrderRepository.findById(id);
    if (!returnOrder) {
      throw new Error('退货订单不存在');
    }

    const updateData: any = {};
    if (data.returnDate) {
      updateData.returnDate = data.returnDate;
    }
    if (data.reason !== undefined) {
      updateData.reason = data.reason;
    }
    if (data.remark !== undefined) {
      updateData.remark = data.remark;
    }

    // 如果更新了明细，需要重新计算总金额
    if (data.items && data.items.length > 0) {
      let totalAmount = 0;
      for (const item of data.items) {
        totalAmount += item.quantity * item.unitPrice;
      }
      updateData.totalAmount = totalAmount;

      // 使用事务更新退货单和明细
      return prisma.$transaction(async (tx) => {
        // 删除旧明细
        await tx.returnOrderItem.deleteMany({
          where: { returnOrderId: id },
        });

        // 更新退货单
        const updatedOrder = await tx.returnOrder.update({
          where: { id },
          data: {
            ...updateData,
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
            customer: true,
            originalOrder: true,
            items: {
              include: {
                product: true,
              },
            },
          },
        });

        return updatedOrder;
      });
    }

    return this.returnOrderRepository.update(id, updateData);
  }

  /**
   * 更新退货订单状态
   */
  async updateReturnOrderStatus(id: string, status: string): Promise<any> {
    const returnOrder = await this.returnOrderRepository.findById(id);
    if (!returnOrder) {
      throw new Error('退货订单不存在');
    }

    return this.returnOrderRepository.update(id, { status });
  }

  private getReturnStatusName(status: string): string {
    const map: Record<string, string> = {
      pending: '待审批',
      approved: '已审批',
      rejected: '已拒绝',
      completed: '已完成',
    };
    return map[status] || status;
  }
}


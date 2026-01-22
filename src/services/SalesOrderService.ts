/**
 * 销售订单 Service
 */

import { BaseService } from './BaseService.js';
import { SalesOrderRepository } from '../repositories/SalesOrderRepository.js';
import { CustomerRepository } from '../repositories/CustomerRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreateSalesOrderInput {
  customerId: string;
  orderDate: Date;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    remark?: string;
  }>;
  remark?: string;
}

export class SalesOrderService extends BaseService {
  private salesOrderRepository: SalesOrderRepository;
  private customerRepository: CustomerRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.salesOrderRepository = new SalesOrderRepository();
    this.customerRepository = new CustomerRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取销售订单列表
   */
  async getSalesOrders(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    customerId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, customerId, startDate, endDate } = params;

    const where: Prisma.SalesOrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (customerId) {
      where.customerId = customerId;
    }
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.orderDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      this.salesOrderRepository.findMany(where, {
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
        },
      }),
      this.salesOrderRepository.count(where),
    ]);

    // 转换数据格式
    const orders = records.map((order: any) => ({
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: order.customer.name,
      orderDate: order.orderDate.toISOString().split('T')[0],
      status: order.status,
      statusName: this.getOrderStatusName(order.status),
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount,
      finalAmount: order.finalAmount,
      remark: order.remark,
      createTime: order.createdAt.toISOString(),
      createBy: order.createById,
    }));

    return {
      records: orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 创建销售订单
   */
  async createSalesOrder(
    data: CreateSalesOrderInput,
    createById: string
  ): Promise<any> {
    // 验证客户是否存在
    const customer = await this.customerRepository.findById(data.customerId);
    if (!customer) {
      throw new Error('客户不存在');
    }

    // 验证所有产品是否存在
    for (const item of data.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) {
        throw new Error(`产品不存在: ${item.productId}`);
      }
    }

    // 使用事务创建订单
    return prisma.$transaction(async (tx) => {
      // 生成订单号
      const orderNo = await this.salesOrderRepository.generateOrderNo('SO');

      // 计算订单金额
      let totalAmount = 0;
      let discountAmount = 0;

      for (const item of data.items) {
        const itemAmount = item.quantity * item.unitPrice;
        const itemDiscount = itemAmount * (item.discount || 0);
        totalAmount += itemAmount;
        discountAmount += itemDiscount;
      }

      const finalAmount = totalAmount - discountAmount;

      // 创建订单
      const order = await tx.salesOrder.create({
        data: {
          orderNo,
          customerId: data.customerId,
          orderDate: data.orderDate,
          status: 'draft',
          totalAmount,
          discountAmount,
          finalAmount,
          remark: data.remark,
          createById,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              amount: item.quantity * item.unitPrice * (1 - (item.discount || 0)),
              remark: item.remark,
            })),
          },
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      return order;
    });
  }

  /**
   * 获取单个销售订单
   */
  async getSalesOrderById(id: string): Promise<any> {
    const order = await this.salesOrderRepository.findById(id);
    if (!order) {
      throw new Error('销售订单不存在');
    }

    // 获取客户信息
    const customer = await this.customerRepository.findById(order.customerId);
    if (!customer) {
      throw new Error('客户不存在');
    }

    // 格式化返回数据
    return {
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: customer.name,
      customerCode: customer.code,
      orderDate: order.orderDate.toISOString().split('T')[0],
      status: order.status,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount,
      finalAmount: order.finalAmount,
      remark: order.remark,
      createTime: order.createdAt.toISOString(),
      updateTime: order.updatedAt.toISOString(),
    };
  }

  /**
   * 获取销售订单明细
   */
  async getSalesOrderItems(orderId: string): Promise<any[]> {
    const order = await this.salesOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('销售订单不存在');
    }

    const items = await prisma.salesOrderItem.findMany({
      where: { orderId },
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

    // 转换数据格式
    return items.map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      amount: item.amount,
      remark: item.remark,
    }));
  }

  /**
   * 更新销售订单状态
   */
  async updateSalesOrderStatus(id: string, status: string): Promise<any> {
    const order = await this.salesOrderRepository.findById(id);
    if (!order) {
      throw new Error('销售订单不存在');
    }

    return this.salesOrderRepository.update(id, { status });
  }

  private getOrderStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      pending: '待审核',
      approved: '已审核',
      shipped: '已发货',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


/**
 * 采购订单 Service
 */

import { BaseService } from './BaseService.js';
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository.js';
import { SupplierRepository } from '../repositories/SupplierRepository.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import { prisma } from '../db/client.js';
import type { Prisma } from '@prisma/client';

export interface CreatePurchaseOrderInput {
  supplierId: string;
  applyDate: Date;
  items: Array<{
    productId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    remark?: string;
  }>;
  currency?: string;
  contractNo?: string;
  remark?: string;
}

export class PurchaseOrderService extends BaseService {
  private purchaseOrderRepository: PurchaseOrderRepository;
  private supplierRepository: SupplierRepository;
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.purchaseOrderRepository = new PurchaseOrderRepository();
    this.supplierRepository = new SupplierRepository();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取采购订单列表
   */
  async getPurchaseOrders(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    supplierId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page = 1, pageSize = 10, status, supplierId, startDate, endDate } = params;

    const where: Prisma.PurchaseOrderWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (startDate || endDate) {
      where.applyDate = {};
      if (startDate) {
        where.applyDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.applyDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      this.purchaseOrderRepository.findMany(where, {
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
        },
      }),
      this.purchaseOrderRepository.count(where),
    ]);

    // 转换数据格式
    const orders = records.map((order: any) => ({
      id: order.id,
      orderNo: order.orderNo,
      supplierId: order.supplierId,
      supplierName: order.supplier.name,
      applyDate: order.applyDate.toISOString().split('T')[0],
      status: order.status,
      statusName: this.getPurchaseOrderStatusName(order.status),
      totalAmount: order.totalAmount,
      currency: order.currency,
      contractNo: order.contractNo,
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
   * 获取单个采购订单
   */
  async getPurchaseOrderById(id: string): Promise<any> {
    const order = await this.purchaseOrderRepository.findById(id);
    if (!order) {
      throw new Error('采购订单不存在');
    }

    // 获取供应商信息
    const supplier = await this.supplierRepository.findById(order.supplierId);
    if (!supplier) {
      throw new Error('供应商不存在');
    }

    // 格式化返回数据
    return {
      id: order.id,
      orderNo: order.orderNo,
      supplierId: order.supplierId,
      supplierName: supplier.name,
      supplierCode: supplier.code,
      applyDate: order.applyDate.toISOString().split('T')[0],
      status: order.status,
      statusName: this.getPurchaseOrderStatusName(order.status),
      totalAmount: order.totalAmount,
      currency: order.currency,
      contractNo: order.contractNo,
      remark: order.remark,
      createTime: order.createdAt.toISOString(),
      updateTime: order.updatedAt.toISOString(),
    };
  }

  /**
   * 获取采购订单明细
   */
  async getPurchaseOrderItems(orderId: string): Promise<any[]> {
    const order = await this.purchaseOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('采购订单不存在');
    }

    const items = await prisma.purchaseOrderItem.findMany({
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

    return items.map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productCode: item.product.code,
      productName: item.product.name,
      specification: item.product.specification,
      unit: item.product.unit || item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      remark: item.remark,
    }));
  }

  /**
   * 创建采购订单
   */
  async createPurchaseOrder(
    data: CreatePurchaseOrderInput,
    createById: string
  ): Promise<any> {
    // 验证供应商是否存在
    const supplier = await this.supplierRepository.findById(data.supplierId);
    if (!supplier) {
      throw new Error('供应商不存在');
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
      const orderNo = await this.purchaseOrderRepository.generateOrderNo('PO');

      // 计算订单金额
      let totalAmount = 0;
      for (const item of data.items) {
        totalAmount += item.quantity * item.unitPrice;
      }

      // 创建订单
      const order = await tx.purchaseOrder.create({
        data: {
          orderNo,
          supplierId: data.supplierId,
          applyDate: data.applyDate,
          status: 'draft',
          totalAmount,
          currency: data.currency || 'CNY',
          contractNo: data.contractNo,
          remark: data.remark,
          createById,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              amount: item.quantity * item.unitPrice,
              remark: item.remark,
            })),
          },
        },
        include: {
          supplier: true,
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
   * 获取采购订单比价记录
   */
  async getPurchaseOrderComparisons(orderId: string): Promise<any[]> {
    const order = await this.purchaseOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('采购订单不存在');
    }

    // 这里应该从比价记录表中查询，目前先返回空数组
    // TODO: 实现比价记录功能后，从数据库查询
    return [];
  }

  /**
   * 更新采购订单状态
   */
  async updatePurchaseOrderStatus(id: string, status: string): Promise<any> {
    const order = await this.purchaseOrderRepository.findById(id);
    if (!order) {
      throw new Error('采购订单不存在');
    }

    // 如果订单已完成或已取消，不允许更新状态
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new Error('已完成或已取消的订单不允许更新状态');
    }

    return this.purchaseOrderRepository.update(id, { status });
  }

  private getPurchaseOrderStatusName(status: string): string {
    const map: Record<string, string> = {
      draft: '草稿',
      pending: '待审核',
      approved: '已审核',
      purchased: '已采购',
      received: '已收货',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  }
}


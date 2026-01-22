/**
 * 供应商 Service
 */

import { BaseService } from './BaseService.js';
import { SupplierRepository } from '../repositories/SupplierRepository.js';
import type { Supplier, Prisma } from '@prisma/client';

export class SupplierService extends BaseService {
  private supplierRepository: SupplierRepository;

  constructor() {
    super();
    this.supplierRepository = new SupplierRepository();
  }

  /**
   * 获取供应商列表（分页）
   */
  async getSuppliers(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    creditRating?: string;
  }) {
    const { page = 1, pageSize = 10, keyword, status, creditRating } = params;

    const where: Prisma.SupplierWhereInput = {};
    if (keyword) {
      where.OR = [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (status) {
      where.status = status;
    }
    if (creditRating) {
      where.creditRating = creditRating;
    }

    const [records, total] = await Promise.all([
      this.supplierRepository.findMany(where, {
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.supplierRepository.count(where),
    ]);

    // 转换数据格式
    const suppliers = records.map((supplier) => ({
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      creditRating: supplier.creditRating,
      creditRatingName: this.getCreditRatingName(supplier.creditRating),
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      taxNumber: supplier.taxNumber,
      bankAccount: supplier.bankAccount,
      bankName: supplier.bankName,
      status: supplier.status,
      remark: supplier.remark,
      // 添加前端需要的统计字段（暂时使用默认值，后续可以从采购订单表统计）
      totalOrders: 0,
      totalAmount: 0,
      onTimeDeliveryRate: 0,
      qualityScore: 0,
      createTime: supplier.createdAt.toISOString(),
    }));

    return {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 根据 ID 获取供应商
   */
  async getSupplierById(id: string): Promise<Supplier | null> {
    return this.supplierRepository.findById(id);
  }

  /**
   * 创建供应商
   */
  async createSupplier(data: Prisma.SupplierCreateInput): Promise<Supplier> {
    // 检查编码是否已存在
    const exists = await this.supplierRepository.codeExists(data.code);
    if (exists) {
      throw new Error('供应商编码已存在');
    }

    return this.supplierRepository.create(data);
  }

  /**
   * 更新供应商
   */
  async updateSupplier(
    id: string,
    data: Prisma.SupplierUpdateInput
  ): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new Error('供应商不存在');
    }

    // 如果更新了编码，检查新编码是否已存在
    if (data.code && typeof data.code === 'string') {
      const exists = await this.supplierRepository.codeExists(data.code, id);
      if (exists) {
        throw new Error('供应商编码已存在');
      }
    }

    return this.supplierRepository.update(id, data);
  }

  /**
   * 删除供应商
   */
  async deleteSupplier(id: string): Promise<void> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new Error('供应商不存在');
    }

    await this.supplierRepository.delete(id);
  }

  private getCreditRatingName(rating: string): string {
    const map: Record<string, string> = {
      AAA: 'AAA级',
      AA: 'AA级',
      A: 'A级',
      B: 'B级',
      C: 'C级',
      D: 'D级',
    };
    return map[rating] || rating;
  }
}


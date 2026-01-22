/**
 * 客户 Service
 */

import { BaseService } from './BaseService.js';
import { CustomerRepository } from '../repositories/CustomerRepository.js';
import type { Customer, Prisma } from '@prisma/client';

export class CustomerService extends BaseService {
  private customerRepository: CustomerRepository;

  constructor() {
    super();
    this.customerRepository = new CustomerRepository();
  }

  /**
   * 获取客户列表（分页）
   */
  async getCustomers(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }) {
    try {
      const { page = 1, pageSize = 10, keyword, status } = params;

      const where: Prisma.CustomerWhereInput = {};
      if (keyword) {
        // SQLite 使用 contains，不区分大小写需要特殊处理
        const keywordLower = keyword.toLowerCase();
        where.OR = [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
          { phone: { contains: keyword } },
        ];
      }
      if (status) {
        where.status = status;
      }

      const [records, total] = await Promise.all([
        this.customerRepository.findMany(where, {
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        this.customerRepository.count(where),
      ]);

      // 转换数据格式
      const customers = records.map((customer) => ({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        level: customer.level,
        levelName: this.getLevelName(customer.level),
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        creditLimit: customer.creditLimit,
        status: customer.status,
        remark: customer.remark,
        createTime: customer.createdAt ? customer.createdAt.toISOString() : new Date().toISOString(),
      }));

      return {
        records: customers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error('CustomerService.getCustomers error:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取客户
   */
  async getCustomerById(id: string): Promise<Customer | null> {
    return this.customerRepository.findById(id);
  }

  /**
   * 创建客户
   */
  async createCustomer(data: Prisma.CustomerCreateInput): Promise<Customer> {
    // 检查编码是否已存在
    const exists = await this.customerRepository.codeExists(data.code);
    if (exists) {
      throw new Error('客户编码已存在');
    }

    return this.customerRepository.create(data);
  }

  /**
   * 更新客户
   */
  async updateCustomer(
    id: string,
    data: Prisma.CustomerUpdateInput
  ): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new Error('客户不存在');
    }

    // 如果更新了编码，检查新编码是否已存在
    if (data.code && typeof data.code === 'string') {
      const exists = await this.customerRepository.codeExists(data.code, id);
      if (exists) {
        throw new Error('客户编码已存在');
      }
    }

    return this.customerRepository.update(id, data);
  }

  /**
   * 删除客户
   */
  async deleteCustomer(id: string): Promise<void> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new Error('客户不存在');
    }

    await this.customerRepository.delete(id);
  }

  private getLevelName(level: string): string {
    const map: Record<string, string> = {
      A: 'A级客户',
      B: 'B级客户',
      C: 'C级客户',
      D: 'D级客户',
    };
    return map[level] || level;
  }
}


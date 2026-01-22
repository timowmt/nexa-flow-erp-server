/**
 * 产品 Service
 */

import { BaseService } from './BaseService.js';
import { ProductRepository } from '../repositories/ProductRepository.js';
import type { Product, Prisma } from '@prisma/client';

export class ProductService extends BaseService {
  private productRepository: ProductRepository;

  constructor() {
    super();
    this.productRepository = new ProductRepository();
  }

  /**
   * 获取产品列表（分页）
   */
  async getProducts(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }) {
    try {
      const { page = 1, pageSize = 10, keyword, status } = params;

      const where: Prisma.ProductWhereInput = {};
      if (keyword) {
        where.OR = [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
        ];
      }
      if (status) {
        where.status = status;
      }

      const [records, total] = await Promise.all([
        this.productRepository.findMany(where, {
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        this.productRepository.count(where),
      ]);

      return {
        records,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } catch (error) {
      console.error('ProductService.getProducts error:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取产品
   */
  async getProductById(id: string): Promise<Product | null> {
    return this.productRepository.findById(id);
  }

  /**
   * 创建产品
   */
  async createProduct(data: Prisma.ProductCreateInput): Promise<Product> {
    // 检查编码是否已存在
    const exists = await this.productRepository.codeExists(data.code);
    if (exists) {
      throw new Error('产品编码已存在');
    }

    return this.productRepository.create(data);
  }

  /**
   * 更新产品
   */
  async updateProduct(
    id: string,
    data: Prisma.ProductUpdateInput
  ): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error('产品不存在');
    }

    // 如果更新了编码，检查新编码是否已存在
    if (data.code && typeof data.code === 'string') {
      const exists = await this.productRepository.codeExists(data.code, id);
      if (exists) {
        throw new Error('产品编码已存在');
      }
    }

    return this.productRepository.update(id, data);
  }

  /**
   * 删除产品
   */
  async deleteProduct(id: string): Promise<void> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error('产品不存在');
    }

    await this.productRepository.delete(id);
  }
}


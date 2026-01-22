/**
 * 基础 Repository 类
 * 提供通用的 CRUD 操作方法
 */

import { prisma } from '../db/client.js';
import type { PrismaClient } from '@prisma/client';

export abstract class BaseRepository<T, CreateInput, UpdateInput, WhereInput> {
  protected prisma: PrismaClient;
  protected model: any;

  constructor(model: any) {
    this.prisma = prisma;
    this.model = model;
  }

  /**
   * 根据 ID 查找单个记录
   */
  async findById(id: string, include?: any): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
      include,
    });
  }

  /**
   * 根据条件查找单个记录
   */
  async findOne(where: WhereInput, include?: any): Promise<T | null> {
    return this.model.findFirst({
      where,
      include,
    });
  }

  /**
   * 查找多个记录
   */
  async findMany(
    where?: WhereInput,
    options?: {
      skip?: number;
      take?: number;
      orderBy?: any;
      include?: any;
    }
  ): Promise<T[]> {
    return this.model.findMany({
      where,
      skip: options?.skip,
      take: options?.take,
      orderBy: options?.orderBy,
      include: options?.include,
    });
  }

  /**
   * 统计记录数
   */
  async count(where?: WhereInput): Promise<number> {
    return this.model.count({ where });
  }

  /**
   * 创建记录
   */
  async create(data: CreateInput, include?: any): Promise<T> {
    return this.model.create({
      data,
      include,
    });
  }

  /**
   * 更新记录
   */
  async update(id: string, data: UpdateInput, include?: any): Promise<T> {
    return this.model.update({
      where: { id },
      data,
      include,
    });
  }

  /**
   * 删除记录
   */
  async delete(id: string): Promise<T> {
    return this.model.delete({
      where: { id },
    });
  }

  /**
   * 批量删除
   */
  async deleteMany(where: WhereInput): Promise<{ count: number }> {
    return this.model.deleteMany({ where });
  }
}


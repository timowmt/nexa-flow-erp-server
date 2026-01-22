/**
 * 数据验证工具
 */

import { z } from 'zod';

/**
 * 分页参数验证
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(10000).default(10).optional(), // 增加到 10000 以支持下拉框加载所有数据
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});

/**
 * ID 参数验证
 */
export const idSchema = z.object({
  id: z.string().uuid('无效的 ID 格式'),
});

/**
 * 登录参数验证
 */
export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
});

/**
 * 注册参数验证
 */
export const registerSchema = z.object({
  username: z.string().min(3, '用户名至少3位').max(20, '用户名最多20位'),
  password: z.string().min(6, '密码至少6位').max(50, '密码最多50位'),
  nickname: z.string().min(1, '昵称不能为空').max(20, '昵称最多20位'),
  email: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.union([z.string().email('邮箱格式不正确'), z.undefined()]).optional()
  ),
  phone: z.string().optional(),
});

/**
 * 验证请求体
 * 为了兼容各种复杂的 Zod Schema（包括 transform、preprocess 等），
 * 这里在类型上尽量放宽约束，避免影响运行时逻辑。
 */
export function validateBody<T = any>(schema: z.ZodTypeAny) {
  return (data: unknown): T => {
    try {
      return schema.parse(data) as T;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // 提取第一个错误消息，更友好
        const firstError = error.errors[0];
        const fieldName =
          firstError.path.length > 0 ? firstError.path.join('.') : 'unknown';
        throw new Error(`${fieldName}: ${firstError.message}`);
      }
      throw error;
    }
  };
}

/**
 * 验证查询参数
 */
export function validateQuery<T = any>(schema: z.ZodTypeAny) {
  return (query: unknown): T => {
    try {
      return schema.parse(query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const fieldName = firstError.path.join('.');
        throw new Error(`${fieldName}: ${firstError.message}`);
      }
      throw error;
    }
  };
}

/**
 * 验证路径参数
 */
export function validateParams<T = any>(schema: z.ZodTypeAny) {
  return (params: unknown): T => {
    try {
      return schema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const fieldName = firstError.path.join('.');
        throw new Error(`${fieldName}: ${firstError.message}`);
      }
      throw error;
    }
  };
}


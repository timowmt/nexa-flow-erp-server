/**
 * 错误处理中间件
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { error } from '../utils/response.js';

/**
 * 全局错误处理
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Zod 验证错误
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    error(res, `参数验证失败: ${message}`, 400);
    return;
  }

  // 其他错误
  const errorMessage = err instanceof Error ? err.message : '服务器内部错误';
  console.error('Error:', err);
  error(res, errorMessage, 500);
}

/**
 * 404 处理
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  error(res, `路由不存在: ${req.method} ${req.path}`, 404);
}


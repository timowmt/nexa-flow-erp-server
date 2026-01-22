/**
 * 统一响应格式工具
 */

import type { Response } from 'express';
import type { ApiResponse } from '../types/index.js';

/**
 * 成功响应
 */
export function success<T>(res: Response, data: T, message = '操作成功'): void {
  const response: ApiResponse<T> = {
    code: 200,
    message,
    data,
  };
  res.json(response);
}

/**
 * 错误响应
 */
export function error(
  res: Response,
  message = '操作失败',
  code = 500,
  data: any = null
): void {
  const response: ApiResponse = {
    code,
    message,
    data,
  };
  res.status(code >= 400 && code < 600 ? code : 500).json(response);
}

/**
 * 分页响应
 */
export function pagination<T>(
  res: Response,
  records: T[],
  total: number,
  page: number,
  pageSize: number,
  message = '查询成功'
): void {
  const response: ApiResponse<{
    records: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> = {
    code: 200,
    message,
    data: {
      records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
  res.json(response);
}

/**
 * 未授权响应
 */
export function unauthorized(res: Response, message = '未授权，请先登录'): void {
  error(res, message, 401);
}

/**
 * 禁止访问响应
 */
export function forbidden(res: Response, message = '禁止访问'): void {
  error(res, message, 403);
}

/**
 * 未找到响应
 */
export function notFound(res: Response, message = '资源不存在'): void {
  error(res, message, 404);
}

/**
 * 参数错误响应
 */
export function badRequest(res: Response, message = '参数错误'): void {
  error(res, message, 400);
}


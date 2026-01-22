/**
 * 通用类型定义
 */

// API 响应格式
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// 分页响应
export interface PaginationResponse<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 查询参数
export interface QueryParams extends PaginationParams {
  keyword?: string;
  status?: string;
  [key: string]: any;
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  username: string;
  roleId?: string;
}

import type { Request } from 'express';

// 请求扩展（添加用户信息）
export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    roleId?: string;
  };
}


/**
 * 认证中间件
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import { unauthorized } from '../utils/response.js';
import type { AuthRequest } from '../types/index.js';

/**
 * JWT 认证中间件
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      unauthorized(res, '未提供认证令牌');
      return;
    }

    const payload = verifyToken(token);
    (req as AuthRequest).user = {
      id: payload.userId,
      username: payload.username,
      roleId: payload.roleId,
    };

    next();
  } catch (error) {
    unauthorized(res, error instanceof Error ? error.message : '认证失败');
  }
}

/**
 * 可选认证中间件（不强制要求登录）
 */
export function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const payload = verifyToken(token);
      (req as AuthRequest).user = {
        id: payload.userId,
        username: payload.username,
        roleId: payload.roleId,
      };
    }

    next();
  } catch (error) {
    // 可选认证失败时继续执行，但不设置 user
    next();
  }
}


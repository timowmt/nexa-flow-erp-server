/**
 * 操作日志工具
 */

import { prisma } from '../db/client.js';
import type { OperationLog } from '@prisma/client';

/**
 * 记录操作日志
 */
export async function logOperation(
  operatorId: string,
  operationType: string,
  module: string,
  operationContent: string,
  options: {
    targetId?: string;
    targetName?: string;
    ipAddress?: string;
    userAgent?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    duration?: number;
  } = {}
): Promise<void> {
  try {
    await prisma.operationLog.create({
      data: {
        operatorId,
        operationType,
        module,
        targetId: options.targetId,
        targetName: options.targetName,
        operationContent,
        ipAddress: options.ipAddress || 'unknown',
        userAgent: options.userAgent,
        status: options.status || 'success',
        errorMessage: options.errorMessage,
        duration: options.duration,
      },
    });
  } catch (error) {
    // 日志记录失败不应该影响主流程
    console.error('Failed to log operation:', error);
  }
}

import type { Request } from 'express';

/**
 * 获取客户端 IP
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * 获取用户代理
 */
export function getUserAgent(req: Request): string | undefined {
  return req.headers['user-agent'];
}


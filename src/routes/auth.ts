/**
 * 认证路由
 */

import { Router } from 'express';
import { prisma } from '../db/client.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { success, error, unauthorized } from '../utils/response.js';
import { validateBody, loginSchema, registerSchema } from '../utils/validator.js';
import { logOperation, getClientIp, getUserAgent } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

/**
 * POST /auth/register
 * 用户注册
 */
router.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, nickname, email, phone } = validateBody(registerSchema)(req.body);

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      error(res, '用户名已存在', 400);
      return;
    }

    // 查找普通用户角色
    const userRole = await prisma.role.findUnique({
      where: { code: 'user' },
    });

    if (!userRole) {
      error(res, '系统配置错误：普通用户角色不存在', 500);
      return;
    }

    // 加密密码
    const hashedPassword = await hashPassword(password);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname,
        email: email as string | null | undefined,
        phone,
        roleId: userRole.id,
        status: 'active',
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    // 记录注册日志（使用新创建的用户ID）
    await logOperation(
      user.id,
      'create',
      'auth',
      `用户注册: ${username}`,
      {
        targetId: user.id,
        targetName: nickname,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        status: 'success',
      }
    );

    success(res, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      role: user.role?.code,
    }, '注册成功');
  } catch (err) {
    console.error('Register error:', err);
    error(res, err instanceof Error ? err.message : '注册失败', 500);
  }
});

/**
 * POST /auth/login
 * 用户登录
 */
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = validateBody(loginSchema)(req.body);

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      // 尝试使用 admin 用户记录日志，如果 admin 不存在则跳过日志记录
      try {
        const adminUser = await prisma.user.findUnique({
          where: { username: 'admin' },
        });
        if (adminUser) {
          await logOperation(
            adminUser.id,
            'login',
            'auth',
            `登录失败: 用户不存在 - ${username}`,
            {
              ipAddress: getClientIp(req),
              userAgent: getUserAgent(req),
              status: 'failure',
              errorMessage: '用户不存在',
            }
          );
        }
      } catch (logError) {
        // 日志记录失败不影响主流程
        console.error('Failed to log login failure:', logError);
      }
      unauthorized(res, '用户名或密码错误');
      return;
    }

    // 验证密码
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      await logOperation(
        user.id,
        'login',
        'auth',
        `登录失败: 密码错误 - ${username}`,
        {
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req),
          status: 'failure',
          errorMessage: '密码错误',
        }
      );
      unauthorized(res, '用户名或密码错误');
      return;
    }

    // 检查用户状态
    if (user.status !== 'active') {
      unauthorized(res, '用户已被禁用');
      return;
    }

    // 生成 Token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId || undefined,
    });

    // 构建权限列表
    const permissions = user.role?.permissions.map((rp) => ({
      id: rp.permission.id,
      name: rp.permission.name,
      code: rp.permission.code,
      type: rp.permission.type,
      path: rp.permission.path,
    })) || [];

    // 构建用户信息
    const userInfo = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      role: user.role?.code,
    };

    // 记录登录日志
    await logOperation(
      user.id,
      'login',
      'auth',
      `用户登录: ${username}`,
      {
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        status: 'success',
      }
    );

    success(res, {
      token,
      userInfo,
      permissions,
    });
  } catch (err) {
    console.error('Login error:', err);
    error(res, err instanceof Error ? err.message : '登录失败', 500);
  }
});

/**
 * POST /auth/logout
 * 用户登出
 */
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const username = req.user!.username;

    await logOperation(
      userId,
      'logout',
      'auth',
      `用户登出: ${username}`,
      {
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        status: 'success',
      }
    );

    success(res, null, '登出成功');
  } catch (err) {
    console.error('Logout error:', err);
    error(res, err instanceof Error ? err.message : '登出失败', 500);
  }
});

/**
 * GET /user/info
 * 获取当前用户信息
 */
router.get('/user/info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      unauthorized(res, '用户不存在');
      return;
    }

    const permissions = user.role?.permissions.map((rp) => ({
      id: rp.permission.id,
      name: rp.permission.name,
      code: rp.permission.code,
      type: rp.permission.type,
      path: rp.permission.path,
    })) || [];

    const userInfo = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      role: user.role?.code,
    };

    success(res, {
      ...userInfo,
      permissions,
    });
  } catch (err) {
    console.error('Get user info error:', err);
    error(res, err instanceof Error ? err.message : '获取用户信息失败', 500);
  }
});

export default router;


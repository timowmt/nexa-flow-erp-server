/**
 * 系统管理路由
 * 用户、角色、字典、操作日志
 */

import { Router } from 'express';
import { prisma } from '../db/client.js';
import { hashPassword } from '../utils/password.js';
import { success, pagination, error, badRequest } from '../utils/response.js';
import { validateBody, validateQuery, validateParams, paginationSchema, idSchema } from '../utils/validator.js';
import { logOperation, getClientIp, getUserAgent } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// ==================== 用户管理 ====================

const userCreateSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(6, '密码至少6位'),
  nickname: z.string().min(1, '昵称不能为空'),
  email: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.union([z.string().email('邮箱格式不正确'), z.undefined()]).optional()
  ),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

const userUpdateSchema = z.object({
  nickname: z.string().min(1).optional(),
  email: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.union([z.string().email('邮箱格式不正确'), z.undefined()]).optional()
  ),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

/**
 * GET /system/users
 * 获取用户列表
 */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, keyword, status } = validateQuery(
      paginationSchema.extend({
        keyword: z.string().optional(),
        status: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { nickname: { contains: keyword } },
        { email: { contains: keyword } },
      ];
    }
    if (status) {
      where.status = status;
    }

    const [records, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          role: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const users = records.map((user) => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      role: user.role?.code,
      status: user.status,
      createTime: user.createdAt.toISOString(),
    }));

    pagination(res, users, total, page, pageSize);
  } catch (err) {
    console.error('Get users error:', err);
    error(res, err instanceof Error ? err.message : '获取用户列表失败', 500);
  }
});

/**
 * GET /system/users/:id
 * 获取用户详情
 */
router.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);

    const user = await prisma.user.findUnique({
      where: { id },
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
      error(res, '用户不存在', 404);
      return;
    }

    success(res, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      role: user.role ? {
        id: user.role.id,
        name: user.role.name,
        code: user.role.code,
        permissions: user.role.permissions.map((rp) => ({
          id: rp.permission.id,
          name: rp.permission.name,
          code: rp.permission.code,
          type: rp.permission.type,
        })),
      } : null,
      status: user.status,
      createTime: user.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('Get user error:', err);
    error(res, err instanceof Error ? err.message : '获取用户详情失败', 500);
  }
});

/**
 * POST /system/users
 * 创建用户
 */
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(userCreateSchema)(req.body);
    const operatorId = req.user!.id;

    // 检查用户名是否已存在
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      badRequest(res, '用户名已存在');
      return;
    }

    // 加密密码
    const hashedPassword = await hashPassword(data.password);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        nickname: data.nickname,
        email: data.email as string | null | undefined,
        phone: data.phone,
        roleId: data.roleId,
        status: data.status,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    await logOperation(
      operatorId,
      'create',
      'user',
      `创建用户: ${user.username}`,
      {
        targetId: user.id,
        targetName: user.nickname,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      role: user.role?.code,
      status: user.status,
    }, '创建用户成功');
  } catch (err) {
    console.error('Create user error:', err);
    error(res, err instanceof Error ? err.message : '创建用户失败', 500);
  }
});

/**
 * PUT /system/users/:id
 * 更新用户
 */
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(userUpdateSchema)(req.body);
    const operatorId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      error(res, '用户不存在', 404);
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: {
        role: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    await logOperation(
      operatorId,
      'update',
      'user',
      `更新用户: ${updated.username}`,
      {
        targetId: updated.id,
        targetName: updated.nickname,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: updated.id,
      username: updated.username,
      nickname: updated.nickname,
      email: updated.email,
      phone: updated.phone,
      role: updated.role?.code,
      status: updated.status,
    }, '更新用户成功');
  } catch (err) {
    console.error('Update user error:', err);
    error(res, err instanceof Error ? err.message : '更新用户失败', 500);
  }
});

/**
 * DELETE /system/users/:id
 * 删除用户
 */
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      error(res, '用户不存在', 404);
      return;
    }

    await prisma.user.delete({ where: { id } });

    await logOperation(
      operatorId,
      'delete',
      'user',
      `删除用户: ${user.username}`,
      {
        targetId: user.id,
        targetName: user.nickname,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除用户成功');
  } catch (err) {
    console.error('Delete user error:', err);
    error(res, err instanceof Error ? err.message : '删除用户失败', 500);
  }
});

// ==================== 角色管理 ====================

/**
 * GET /system/roles
 * 获取角色列表
 */
router.get('/roles', async (req: AuthRequest, res: Response) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    success(res, roles.map((role) => ({
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        code: rp.permission.code,
        type: rp.permission.type,
      })),
    })));
  } catch (err) {
    console.error('Get roles error:', err);
    error(res, err instanceof Error ? err.message : '获取角色列表失败', 500);
  }
});

// ==================== 字典管理 ====================

const dictTypeSchema = z.object({
  code: z.string().min(1, '字典类型编码不能为空'),
  name: z.string().min(1, '字典类型名称不能为空'),
  description: z.string().optional(),
});

const dictSchema = z.object({
  type: z.string().min(1, '字典类型不能为空'),
  code: z.string().min(1, '字典编码不能为空'),
  label: z.string().min(1, '字典标签不能为空'),
  value: z.string().min(1, '字典值不能为空'),
  sort: z.coerce.number().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  remark: z.string().optional(),
});

/**
 * GET /system/dict/types
 * 获取字典类型列表
 */
router.get('/dict/types', async (req: AuthRequest, res: Response) => {
  try {
    const dictTypes = await prisma.dictType.findMany({
      orderBy: { createdAt: 'desc' },
    });

    success(res, dictTypes.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
    })));
  } catch (err) {
    console.error('Get dict types error:', err);
    error(res, err instanceof Error ? err.message : '获取字典类型列表失败', 500);
  }
});

/**
 * POST /system/dict/type
 * 创建字典类型
 */
router.post('/dict/type', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(dictTypeSchema)(req.body);
    const operatorId = req.user!.id;

    // 检查编码是否已存在
    const existing = await prisma.dictType.findUnique({
      where: { code: data.code },
    });
    if (existing) {
      badRequest(res, '字典类型编码已存在');
      return;
    }

    const dictType = await prisma.dictType.create({
      data,
    });

    await logOperation(
      operatorId,
      'create',
      'system',
      `创建字典类型: ${dictType.name}`,
      {
        targetId: dictType.id,
        targetName: dictType.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: dictType.id,
      code: dictType.code,
      name: dictType.name,
      description: dictType.description,
    }, '创建字典类型成功');
  } catch (err) {
    console.error('Create dict type error:', err);
    if (err instanceof Error && err.message.includes('已存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建字典类型失败', 500);
    }
  }
});

/**
 * PUT /system/dict/type/:id
 * 更新字典类型
 */
router.put('/dict/type/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(dictTypeSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const existing = await prisma.dictType.findUnique({ where: { id } });
    if (!existing) {
      error(res, '字典类型不存在', 404);
      return;
    }

    // 如果更新编码，检查是否重复
    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.dictType.findUnique({
        where: { code: data.code },
      });
      if (duplicate) {
        badRequest(res, '字典类型编码已存在');
        return;
      }
    }

    const updated = await prisma.dictType.update({
      where: { id },
      data,
    });

    await logOperation(
      operatorId,
      'update',
      'system',
      `更新字典类型: ${updated.name}`,
      {
        targetId: updated.id,
        targetName: updated.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
    }, '更新字典类型成功');
  } catch (err) {
    console.error('Update dict type error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新字典类型失败', 500);
    }
  }
});

/**
 * DELETE /system/dict/type/:id
 * 删除字典类型
 */
router.delete('/dict/type/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const existing = await prisma.dictType.findUnique({ where: { id } });
    if (!existing) {
      error(res, '字典类型不存在', 404);
      return;
    }

    // 检查是否有字典项使用此类型
    const dictCount = await prisma.dict.count({
      where: { typeId: id },
    });
    if (dictCount > 0) {
      badRequest(res, `该字典类型下还有 ${dictCount} 个字典项，无法删除`);
      return;
    }

    await prisma.dictType.delete({ where: { id } });

    await logOperation(
      operatorId,
      'delete',
      'system',
      `删除字典类型: ${existing.name}`,
      {
        targetId: existing.id,
        targetName: existing.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除字典类型成功');
  } catch (err) {
    console.error('Delete dict type error:', err);
    error(res, err instanceof Error ? err.message : '删除字典类型失败', 500);
  }
});

/**
 * GET /system/dict/list
 * 获取字典列表（分页）
 */
router.get('/dict/list', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, type, keyword } = validateQuery(
      paginationSchema.extend({
        type: z.string().optional(),
        keyword: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (type) {
      where.type = {
        code: type,
      };
    }
    if (keyword) {
      where.OR = [
        { code: { contains: keyword } },
        { label: { contains: keyword } },
        { value: { contains: keyword } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.dict.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          type: true,
        },
        orderBy: [
          { type: { code: 'asc' } },
          { sort: 'asc' },
        ],
      }),
      prisma.dict.count({ where }),
    ]);

    const dicts = records.map((dict) => ({
      id: dict.id,
      type: dict.type.code,
      typeName: dict.type.name,
      code: dict.code,
      label: dict.label,
      value: dict.value,
      sort: dict.sort,
      status: dict.status,
      remark: dict.remark,
    }));

    pagination(res, dicts, total, page, pageSize);
  } catch (err) {
    console.error('Get dict list error:', err);
    error(res, err instanceof Error ? err.message : '获取字典列表失败', 500);
  }
});

/**
 * POST /system/dict
 * 创建字典
 */
router.post('/dict', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(dictSchema)(req.body);
    const operatorId = req.user!.id;

    // 查找字典类型
    const dictType = await prisma.dictType.findUnique({
      where: { code: data.type },
    });
    if (!dictType) {
      badRequest(res, '字典类型不存在');
      return;
    }

    // 检查编码是否已存在（在同一类型下）
    const existing = await prisma.dict.findFirst({
      where: {
        typeId: dictType.id,
        code: data.code,
      },
    });
    if (existing) {
      badRequest(res, '该字典类型下编码已存在');
      return;
    }

    const dict = await prisma.dict.create({
      data: {
        typeId: dictType.id,
        code: data.code,
        label: data.label,
        value: data.value,
        sort: data.sort,
        status: data.status,
        remark: data.remark,
      },
      include: {
        type: true,
      },
    });

    await logOperation(
      operatorId,
      'create',
      'system',
      `创建字典: ${dict.label}`,
      {
        targetId: dict.id,
        targetName: dict.label,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: dict.id,
      type: dict.type.code,
      typeName: dict.type.name,
      code: dict.code,
      label: dict.label,
      value: dict.value,
      sort: dict.sort,
      status: dict.status,
      remark: dict.remark,
    }, '创建字典成功');
  } catch (err) {
    console.error('Create dict error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建字典失败', 500);
    }
  }
});

/**
 * PUT /system/dict/:id
 * 更新字典
 */
router.put('/dict/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(dictSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const existing = await prisma.dict.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!existing) {
      error(res, '字典不存在', 404);
      return;
    }

    // 如果更新类型，验证新类型是否存在
    let typeId = existing.typeId;
    if (data.type && data.type !== existing.type.code) {
      const dictType = await prisma.dictType.findUnique({
        where: { code: data.type },
      });
      if (!dictType) {
        badRequest(res, '字典类型不存在');
        return;
      }
      typeId = dictType.id;
    }

    // 如果更新编码，检查是否重复
    if (data.code && data.code !== existing.code) {
      const duplicate = await prisma.dict.findFirst({
        where: {
          typeId,
          code: data.code,
          id: { not: id },
        },
      });
      if (duplicate) {
        badRequest(res, '该字典类型下编码已存在');
        return;
      }
    }

    const updated = await prisma.dict.update({
      where: { id },
      data: {
        ...(typeId !== existing.typeId && { typeId }),
        ...(data.code && { code: data.code }),
        ...(data.label && { label: data.label }),
        ...(data.value && { value: data.value }),
        ...(data.sort !== undefined && { sort: data.sort }),
        ...(data.status && { status: data.status }),
        ...(data.remark !== undefined && { remark: data.remark }),
      },
      include: {
        type: true,
      },
    });

    await logOperation(
      operatorId,
      'update',
      'system',
      `更新字典: ${updated.label}`,
      {
        targetId: updated.id,
        targetName: updated.label,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, {
      id: updated.id,
      type: updated.type.code,
      typeName: updated.type.name,
      code: updated.code,
      label: updated.label,
      value: updated.value,
      sort: updated.sort,
      status: updated.status,
      remark: updated.remark,
    }, '更新字典成功');
  } catch (err) {
    console.error('Update dict error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新字典失败', 500);
    }
  }
});

/**
 * DELETE /system/dict/:id
 * 删除字典
 */
router.delete('/dict/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const existing = await prisma.dict.findUnique({
      where: { id },
      include: { type: true },
    });
    if (!existing) {
      error(res, '字典不存在', 404);
      return;
    }

    await prisma.dict.delete({ where: { id } });

    await logOperation(
      operatorId,
      'delete',
      'system',
      `删除字典: ${existing.label}`,
      {
        targetId: existing.id,
        targetName: existing.label,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除字典成功');
  } catch (err) {
    console.error('Delete dict error:', err);
    error(res, err instanceof Error ? err.message : '删除字典失败', 500);
  }
});

/**
 * GET /system/dicts
 * 获取字典列表（不分页，兼容旧接口）
 */
router.get('/dicts', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = validateQuery(
      z.object({ type: z.string().optional() })
    )(req.query);

    const where: any = {};
    if (type) {
      where.type = {
        code: type,
      };
    }

    const dicts = await prisma.dict.findMany({
      where,
      include: {
        type: true,
      },
      orderBy: [
        { type: { code: 'asc' } },
        { sort: 'asc' },
      ],
    });

    success(res, dicts.map((dict) => ({
      id: dict.id,
      type: dict.type.code,
      typeName: dict.type.name,
      code: dict.code,
      label: dict.label,
      value: dict.value,
      sort: dict.sort,
      status: dict.status,
      remark: dict.remark,
    })));
  } catch (err) {
    console.error('Get dicts error:', err);
    error(res, err instanceof Error ? err.message : '获取字典列表失败', 500);
  }
});

// ==================== 操作日志 ====================

/**
 * GET /system/operation-logs
 * 获取操作日志列表
 */
router.get('/operation-logs', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, module, operationType, operator } = validateQuery(
      paginationSchema.extend({
        module: z.string().optional(),
        operationType: z.string().optional(),
        operator: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (module) {
      where.module = module;
    }
    if (operationType) {
      where.operationType = operationType;
    }
    if (operator) {
      where.operator = {
        username: { contains: operator },
      };
    }

    const [records, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          operator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.operationLog.count({ where }),
    ]);

    const logs = records.map((log) => ({
      id: log.id,
      operator: log.operator.username,
      operatorName: log.operator.nickname,
      operationType: log.operationType,
      operationTypeName: getOperationTypeName(log.operationType),
      module: log.module,
      moduleName: getModuleName(log.module),
      targetId: log.targetId,
      targetName: log.targetName,
      operationContent: log.operationContent,
      operationTime: log.createdAt.toISOString(),
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      status: log.status,
      statusName: log.status === 'success' ? '成功' : '失败',
      errorMessage: log.errorMessage,
      duration: log.duration,
    }));

    pagination(res, logs, total, page, pageSize);
  } catch (err) {
    console.error('Get operation logs error:', err);
    error(res, err instanceof Error ? err.message : '获取操作日志失败', 500);
  }
});

// 辅助函数
function getOperationTypeName(type: string): string {
  const map: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '删除',
    query: '查询',
    login: '登录',
    logout: '登出',
    export: '导出',
    import: '导入',
    other: '其他',
  };
  return map[type] || type;
}

function getModuleName(module: string): string {
  const map: Record<string, string> = {
    auth: '认证模块',
    user: '用户管理',
    role: '角色管理',
    customer: '客户管理',
    sales: '销售管理',
    supplier: '供应商管理',
    purchase: '采购管理',
    inventory: '库存管理',
    finance: '财务管理',
    report: '数据报表',
  };
  return map[module] || module;
}

export default router;


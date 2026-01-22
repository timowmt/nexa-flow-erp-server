/**
 * 销售管理路由
 * 客户、销售订单、退货
 */

import { Router } from 'express';
import { success, pagination, error, badRequest } from '../utils/response.js';
import { validateBody, validateQuery, validateParams, paginationSchema, idSchema } from '../utils/validator.js';
import { logOperation, getClientIp, getUserAgent } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { CustomerService, SalesOrderService, ReturnOrderService } from '../services/index.js';
import { z } from 'zod';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 初始化 Service 实例
const customerService = new CustomerService();
const salesOrderService = new SalesOrderService();
const returnOrderService = new ReturnOrderService();

// ==================== 客户管理 ====================

const customerSchema = z.object({
  code: z.string().min(1, '客户编码不能为空'),
  name: z.string().min(1, '客户名称不能为空'),
  level: z.enum(['A', 'B', 'C', 'D']),
  phone: z.string().min(1, '联系电话不能为空'),
  email: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.union([z.string().email('请输入正确的邮箱格式'), z.undefined()]).optional()
  ),
  address: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().optional()
  ),
  creditLimit: z.coerce.number().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  remark: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().optional()
  ),
});

/**
 * GET /sales/customers
 * 获取客户列表
 */
router.get('/customers', async (req: AuthRequest, res: Response) => {
  try {
    console.log('GET /sales/customers - Query params:', req.query);
    const { page = 1, pageSize = 10, keyword, status } = validateQuery(
      paginationSchema.extend({
        keyword: z.string().optional(),
        status: z.string().optional(),
      })
    )(req.query);

    console.log('Validated params:', { page, pageSize, keyword, status });
    const result = await customerService.getCustomers({
      page,
      pageSize,
      keyword,
      status,
    });

    console.log('Customers result:', { count: result.records.length, total: result.total });
    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get customers error:', err);
    console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    const errorMessage = err instanceof Error ? err.message : '获取客户列表失败';
    console.error('Error message:', errorMessage);
    error(res, errorMessage, 500);
  }
});

/**
 * POST /sales/customers
 * 创建客户
 */
router.post('/customers', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(customerSchema)(req.body);
    const operatorId = req.user!.id;

    const customer = await customerService.createCustomer(data);

    await logOperation(
      operatorId,
      'create',
      'customer',
      `创建客户: ${customer.name}`,
      {
        targetId: customer.id,
        targetName: customer.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, customer, '创建客户成功');
  } catch (err) {
    console.error('Create customer error:', err);
    if (err instanceof Error && err.message.includes('已存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建客户失败', 500);
    }
  }
});

/**
 * PUT /sales/customers/:id
 * 更新客户
 */
router.put('/customers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(customerSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const updated = await customerService.updateCustomer(id, data);

    await logOperation(
      operatorId,
      'update',
      'customer',
      `更新客户: ${updated.name}`,
      {
        targetId: updated.id,
        targetName: updated.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '更新客户成功');
  } catch (err) {
    console.error('Update customer error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新客户失败', 500);
    }
  }
});

/**
 * DELETE /sales/customers/:id
 * 删除客户
 */
router.delete('/customers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const customer = await customerService.getCustomerById(id);
    if (!customer) {
      error(res, '客户不存在', 404);
      return;
    }

    await customerService.deleteCustomer(id);

    await logOperation(
      operatorId,
      'delete',
      'customer',
      `删除客户: ${customer.name}`,
      {
        targetId: customer.id,
        targetName: customer.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除客户成功');
  } catch (err) {
    console.error('Delete customer error:', err);
    error(res, err instanceof Error ? err.message : '删除客户失败', 500);
  }
});

// ==================== 销售订单 ====================

const salesOrderSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
    discount: z.coerce.number().min(0).max(1).default(0),
    remark: z.string().optional(),
  })).min(1, '至少需要一个订单项'),
  remark: z.string().optional(),
});

/**
 * GET /sales/orders
 * 获取销售订单列表
 */
router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, customerId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        customerId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await salesOrderService.getSalesOrders({
      page,
      pageSize,
      status,
      customerId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get sales orders error:', err);
    error(res, err instanceof Error ? err.message : '获取销售订单列表失败', 500);
  }
});

/**
 * GET /sales/orders/:id
 * 获取单个销售订单
 */
router.get('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const order = await salesOrderService.getSalesOrderById(id);
    success(res, order, '获取销售订单成功');
  } catch (err) {
    console.error('Get sales order error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取销售订单失败', 500);
    }
  }
});

/**
 * GET /sales/orders/:id/items
 * 获取销售订单明细
 */
router.get('/orders/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await salesOrderService.getSalesOrderItems(id);
    success(res, items, '获取订单明细成功');
  } catch (err) {
    console.error('Get sales order items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取订单明细失败', 500);
    }
  }
});

/**
 * POST /sales/orders
 * 创建销售订单
 */
router.post('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(salesOrderSchema)(req.body);
    const operatorId = req.user!.id;

    const order = await salesOrderService.createSalesOrder(data, operatorId);

    await logOperation(
      operatorId,
      'create',
      'sales',
      `创建销售订单: ${order.orderNo}`,
      {
        targetId: order.id,
        targetName: order.orderNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, order, '创建销售订单成功');
  } catch (err) {
    console.error('Create sales order error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建销售订单失败', 500);
    }
  }
});

/**
 * PUT /sales/orders/:id/status
 * 更新销售订单状态
 */
router.put('/orders/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const { status } = validateBody(z.object({
      status: z.string().min(1, '状态不能为空'),
    }))(req.body);
    const operatorId = req.user!.id;

    const updated = await salesOrderService.updateSalesOrderStatus(id, status);

    await logOperation(
      operatorId,
      'update',
      'sales',
      `更新订单状态: ${updated.orderNo} -> ${status}`,
      {
        targetId: updated.id,
        targetName: updated.orderNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '更新订单状态成功');
  } catch (err) {
    console.error('Update sales order status error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新订单状态失败', 500);
    }
  }
});

// ==================== 退货管理 ====================

/**
 * GET /sales/returns
 * 获取退货订单列表
 */
router.get('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, customerId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        customerId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await returnOrderService.getReturnOrders({
      page,
      pageSize,
      status,
      customerId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get return orders error:', err);
    error(res, err instanceof Error ? err.message : '获取退货订单列表失败', 500);
  }
});

/**
 * GET /sales/returns/:id
 * 获取退货订单详情
 */
router.get('/returns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const returnOrder = await returnOrderService.getReturnOrderById(id);
    success(res, returnOrder);
  } catch (err) {
    console.error('Get return order error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取退货订单详情失败', 500);
    }
  }
});

/**
 * GET /sales/returns/:id/items
 * 获取退货订单明细
 */
router.get('/returns/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await returnOrderService.getReturnOrderItems(id);
    success(res, items, '获取退货订单明细成功');
  } catch (err) {
    console.error('Get return order items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取退货订单明细失败', 500);
    }
  }
});

/**
 * POST /sales/returns
 * 创建退货订单
 */
const returnOrderSchema = z.object({
  originalOrderId: z.string().uuid('无效的原订单ID'),
  customerId: z.string().uuid('无效的客户ID'),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式不正确'),
  items: z.array(
    z.object({
      orderItemId: z.string().uuid().optional(),
      productId: z.string().uuid('无效的产品ID'),
      quantity: z.coerce.number().positive('退货数量必须大于0'),
      unitPrice: z.coerce.number().min(0, '单价不能为负数'),
      reason: z.string().optional(),
    })
  ).min(1, '至少需要一个退货明细'),
  reason: z.string().min(1, '退货原因不能为空'),
  remark: z.string().optional(),
});

router.post('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(returnOrderSchema)(req.body);
    const returnOrder = await returnOrderService.createReturnOrder(
      {
        ...data,
        returnDate: new Date(data.returnDate),
      },
      req.user!.id
    );
    success(res, returnOrder, '创建退货订单成功');
  } catch (err) {
    console.error('Create return order error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '创建退货订单失败', 500);
    }
  }
});

/**
 * PUT /sales/returns/:id
 * 更新退货订单
 */
router.put('/returns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(returnOrderSchema.partial())(req.body);
    const returnOrder = await returnOrderService.updateReturnOrder(id, {
      ...data,
      returnDate: data.returnDate ? new Date(data.returnDate) : undefined,
    });
    success(res, returnOrder, '更新退货订单成功');
  } catch (err) {
    console.error('Update return order error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '更新退货订单失败', 500);
    }
  }
});

/**
 * PUT /sales/returns/:id/status
 * 更新退货订单状态
 */
router.put('/returns/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const { status } = validateBody(
      z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'completed'], {
          errorMap: () => ({ message: '无效的状态值' }),
        }),
      })
    )(req.body);
    const returnOrder = await returnOrderService.updateReturnOrderStatus(id, status);
    success(res, returnOrder, '更新退货订单状态成功');
  } catch (err) {
    console.error('Update return order status error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '更新退货订单状态失败', 500);
    }
  }
});


export default router;


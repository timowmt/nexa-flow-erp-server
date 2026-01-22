/**
 * 采购管理路由
 * 供应商、采购订单、采购退货
 */

import { Router } from 'express';
import { success, pagination, error, badRequest } from '../utils/response.js';
import { validateBody, validateQuery, validateParams, paginationSchema, idSchema } from '../utils/validator.js';
import { logOperation, getClientIp, getUserAgent } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { SupplierService, PurchaseOrderService, PurchaseReturnService } from '../services/index.js';
import { z } from 'zod';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 初始化 Service 实例
const supplierService = new SupplierService();
const purchaseOrderService = new PurchaseOrderService();
const purchaseReturnService = new PurchaseReturnService();

// ==================== 供应商管理 ====================

const supplierSchema = z.object({
  code: z.string().min(1, '供应商编码不能为空'),
  name: z.string().min(1, '供应商名称不能为空'),
  creditRating: z.enum(['AAA', 'AA', 'A', 'B', 'C', 'D']),
  contactPerson: z.string().min(1, '联系人不能为空'),
  phone: z.string().min(1, '联系电话不能为空'),
  email: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.union([z.string().email('请输入正确的邮箱格式'), z.undefined()]).optional()
  ),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  remark: z.string().optional(),
});

/**
 * GET /purchase/suppliers
 * 获取供应商列表
 */
router.get('/suppliers', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, keyword, status, creditRating } = validateQuery(
      paginationSchema.extend({
        keyword: z.string().optional(),
        status: z.string().optional(),
        creditRating: z.string().optional(),
      })
    )(req.query);

    const result = await supplierService.getSuppliers({
      page,
      pageSize,
      keyword,
      status,
      creditRating,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get suppliers error:', err);
    error(res, err instanceof Error ? err.message : '获取供应商列表失败', 500);
  }
});

/**
 * POST /purchase/suppliers
 * 创建供应商
 */
router.post('/suppliers', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(supplierSchema)(req.body);
    const operatorId = req.user!.id;

    const supplier = await supplierService.createSupplier(data);

    await logOperation(
      operatorId,
      'create',
      'supplier',
      `创建供应商: ${supplier.name}`,
      {
        targetId: supplier.id,
        targetName: supplier.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, supplier, '创建供应商成功');
  } catch (err) {
    console.error('Create supplier error:', err);
    if (err instanceof Error && err.message.includes('已存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建供应商失败', 500);
    }
  }
});

/**
 * PUT /purchase/suppliers/:id
 * 更新供应商
 */
router.put('/suppliers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(supplierSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const updated = await supplierService.updateSupplier(id, data);

    await logOperation(
      operatorId,
      'update',
      'supplier',
      `更新供应商: ${updated.name}`,
      {
        targetId: updated.id,
        targetName: updated.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '更新供应商成功');
  } catch (err) {
    console.error('Update supplier error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新供应商失败', 500);
    }
  }
});

/**
 * DELETE /purchase/suppliers/:id
 * 删除供应商
 */
router.delete('/suppliers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const supplier = await supplierService.getSupplierById(id);
    if (!supplier) {
      error(res, '供应商不存在', 404);
      return;
    }

    await supplierService.deleteSupplier(id);

    await logOperation(
      operatorId,
      'delete',
      'supplier',
      `删除供应商: ${supplier.name}`,
      {
        targetId: supplier.id,
        targetName: supplier.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除供应商成功');
  } catch (err) {
    console.error('Delete supplier error:', err);
    error(res, err instanceof Error ? err.message : '删除供应商失败', 500);
  }
});

// ==================== 采购订单 ====================

const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  applyDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    unit: z.string().min(1),
    unitPrice: z.coerce.number().nonnegative(),
    remark: z.string().optional(),
  })).min(1, '至少需要一个订单项'),
  currency: z.string().default('CNY'),
  contractNo: z.string().optional(),
  remark: z.string().optional(),
});

/**
 * GET /purchase/orders
 * 获取采购订单列表
 */
router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, supplierId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        supplierId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await purchaseOrderService.getPurchaseOrders({
      page,
      pageSize,
      status,
      supplierId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get purchase orders error:', err);
    error(res, err instanceof Error ? err.message : '获取采购订单列表失败', 500);
  }
});

/**
 * GET /purchase/orders/:id
 * 获取单个采购订单
 */
router.get('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const order = await purchaseOrderService.getPurchaseOrderById(id);
    success(res, order, '获取采购订单成功');
  } catch (err) {
    console.error('Get purchase order error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取采购订单失败', 500);
    }
  }
});

/**
 * GET /purchase/orders/:id/items
 * 获取采购订单明细
 */
router.get('/orders/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await purchaseOrderService.getPurchaseOrderItems(id);
    success(res, items, '获取订单明细成功');
  } catch (err) {
    console.error('Get purchase order items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取订单明细失败', 500);
    }
  }
});

/**
 * GET /purchase/orders/:id/comparisons
 * 获取采购订单比价记录
 */
router.get('/orders/:id/comparisons', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const comparisons = await purchaseOrderService.getPurchaseOrderComparisons(id);
    success(res, comparisons, '获取比价记录成功');
  } catch (err) {
    console.error('Get purchase order comparisons error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取比价记录失败', 500);
    }
  }
});

/**
 * PUT /purchase/orders/:id/status
 * 更新采购订单状态
 */
router.put('/orders/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const { status } = validateBody(z.object({
      status: z.string().min(1, '状态不能为空'),
    }))(req.body);
    const operatorId = req.user!.id;

    const updated = await purchaseOrderService.updatePurchaseOrderStatus(id, status);

    await logOperation(
      operatorId,
      'update',
      'purchase',
      `更新采购订单状态: ${updated.orderNo} 为 ${status}`,
      {
        targetId: updated.id,
        targetName: updated.orderNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '状态更新成功');
  } catch (err) {
    console.error('Update purchase order status error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      error(res, err.message, 400);
    } else {
      error(res, err instanceof Error ? err.message : '状态更新失败', 500);
    }
  }
});

/**
 * POST /purchase/orders
 * 创建采购订单
 */
router.post('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(purchaseOrderSchema)(req.body);
    const operatorId = req.user!.id;

    const order = await purchaseOrderService.createPurchaseOrder(data, operatorId);

    await logOperation(
      operatorId,
      'create',
      'purchase',
      `创建采购订单: ${order.orderNo}`,
      {
        targetId: order.id,
        targetName: order.orderNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, order, '创建采购订单成功');
  } catch (err) {
    console.error('Create purchase order error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建采购订单失败', 500);
    }
  }
});

// ==================== 采购退货 ====================

/**
 * GET /purchase/returns
 * 获取采购退货列表
 */
router.get('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, supplierId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        supplierId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await purchaseReturnService.getPurchaseReturns({
      page,
      pageSize,
      status,
      supplierId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get purchase returns error:', err);
    error(res, err instanceof Error ? err.message : '获取采购退货列表失败', 500);
  }
});

/**
 * GET /purchase/returns/:id
 * 获取采购退货详情
 */
router.get('/returns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const returnOrder = await purchaseReturnService.getPurchaseReturnById(id);
    success(res, returnOrder);
  } catch (err) {
    console.error('Get purchase return error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取采购退货详情失败', 500);
    }
  }
});

const purchaseReturnSchema = z.object({
  originalOrderId: z.string().uuid('原订单ID格式不正确'),
  supplierId: z.string().uuid('供应商ID格式不正确'),
  returnDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    orderItemId: z.string().uuid('订单明细ID格式不正确'),
    productId: z.string().uuid('产品ID格式不正确'),
    quantity: z.coerce.number().positive('退货数量必须大于0'),
    unitPrice: z.coerce.number().nonnegative('单价不能为负数'),
    reason: z.string().optional(),
  })).min(1, '至少需要一个退货明细'),
  reason: z.string().min(1, '退货原因不能为空'),
  remark: z.string().optional(),
});

/**
 * POST /purchase/returns
 * 创建采购退货
 */
router.post('/returns', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(purchaseReturnSchema)(req.body);
    const operatorId = req.user!.id;

    const returnOrder = await purchaseReturnService.createPurchaseReturn(data, operatorId);

    await logOperation(
      operatorId,
      'create',
      'purchase',
      `创建采购退货: ${returnOrder.returnNo}`,
      {
        targetId: returnOrder.id,
        targetName: returnOrder.returnNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, returnOrder, '创建采购退货成功');
  } catch (err) {
    console.error('Create purchase return error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建采购退货失败', 500);
    }
  }
});

/**
 * PUT /purchase/returns/:id
 * 更新采购退货
 */
router.put('/returns/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(purchaseReturnSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const updated = await purchaseReturnService.updatePurchaseReturn(id, data);

    await logOperation(
      operatorId,
      'update',
      'purchase',
      `更新采购退货: ${updated.returnNo}`,
      {
        targetId: updated.id,
        targetName: updated.returnNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '更新采购退货成功');
  } catch (err) {
    console.error('Update purchase return error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新采购退货失败', 500);
    }
  }
});

/**
 * PUT /purchase/returns/:id/status
 * 更新采购退货状态
 */
router.put('/returns/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const { status } = validateBody(z.object({
      status: z.string().min(1, '状态不能为空'),
    }))(req.body);
    const operatorId = req.user!.id;

    const updated = await purchaseReturnService.updatePurchaseReturnStatus(id, status);

    await logOperation(
      operatorId,
      'update',
      'purchase',
      `更新采购退货状态: ${updated.returnNo} 为 ${status}`,
      {
        targetId: updated.id,
        targetName: updated.returnNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '状态更新成功');
  } catch (err) {
    console.error('Update purchase return status error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      error(res, err.message, 400);
    } else {
      error(res, err instanceof Error ? err.message : '状态更新失败', 500);
    }
  }
});

/**
 * GET /purchase/returns/:id/items
 * 获取采购退货明细
 */
router.get('/returns/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await purchaseReturnService.getPurchaseReturnItems(id);
    success(res, items, '获取退货明细成功');
  } catch (err) {
    console.error('Get purchase return items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取退货明细失败', 500);
    }
  }
});


export default router;


/**
 * 库存管理路由
 * 库存、入库、出库、盘点、调拨
 */

import { Router } from 'express';
import { success, pagination, error, badRequest } from '../utils/response.js';
import { validateBody, validateQuery, validateParams, paginationSchema, idSchema } from '../utils/validator.js';
import { logOperation, getClientIp, getUserAgent } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { ProductService, WarehouseService, InventoryService, StockInService, StockOutService, StockCheckService, StockTransferService } from '../services/index.js';
import { z } from 'zod';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 初始化 Service 实例
const productService = new ProductService();
const warehouseService = new WarehouseService();
const inventoryService = new InventoryService();
const stockInService = new StockInService();
const stockOutService = new StockOutService();
const stockCheckService = new StockCheckService();
const stockTransferService = new StockTransferService();

// ==================== 产品管理 ====================

const productSchema = z.object({
  code: z.string().min(1, '产品编码不能为空'),
  name: z.string().min(1, '产品名称不能为空'),
  specification: z.string().optional(),
  unit: z.string().min(1, '单位不能为空'),
  price: z.coerce.number().default(0),
  minStock: z.coerce.number().default(0),
  maxStock: z.coerce.number().default(0),
  safetyStock: z.coerce.number().default(0),
  status: z.enum(['active', 'inactive']).default('active'),
  remark: z.string().optional(),
});

/**
 * GET /inventory/products
 * 获取产品列表
 */
router.get('/products', async (req: AuthRequest, res: Response) => {
  try {
    console.log('GET /inventory/products - Query params:', req.query);
    const { page = 1, pageSize = 10, keyword, status } = validateQuery(
      paginationSchema.extend({
        keyword: z.string().optional(),
        status: z.string().optional(),
      })
    )(req.query);

    console.log('Validated params:', { page, pageSize, keyword, status });
    const result = await productService.getProducts({
      page,
      pageSize,
      keyword,
      status,
    });

    console.log('Products result:', { count: result.records.length, total: result.total });
    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get products error:', err);
    console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
    const errorMessage = err instanceof Error ? err.message : '获取产品列表失败';
    console.error('Error message:', errorMessage);
    error(res, errorMessage, 500);
  }
});

/**
 * POST /inventory/products
 * 创建产品
 */
router.post('/products', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(productSchema)(req.body);
    const operatorId = req.user!.id;

    const product = await productService.createProduct(data);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建产品: ${product.name}`,
      {
        targetId: product.id,
        targetName: product.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, product, '创建产品成功');
  } catch (err) {
    console.error('Create product error:', err);
    if (err instanceof Error && err.message.includes('已存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建产品失败', 500);
    }
  }
});

/**
 * PUT /inventory/products/:id
 * 更新产品
 */
router.put('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(productSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const updated = await productService.updateProduct(id, data);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `更新产品: ${updated.name}`,
      {
        targetId: updated.id,
        targetName: updated.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, updated, '更新产品成功');
  } catch (err) {
    console.error('Update product error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新产品失败', 500);
    }
  }
});

/**
 * DELETE /inventory/products/:id
 * 删除产品
 */
router.delete('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    const product = await productService.getProductById(id);
    if (!product) {
      error(res, '产品不存在', 404);
      return;
    }

    await productService.deleteProduct(id);

    await logOperation(
      operatorId,
      'delete',
      'inventory',
      `删除产品: ${product.name}`,
      {
        targetId: product.id,
        targetName: product.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '删除产品成功');
  } catch (err) {
    console.error('Delete product error:', err);
    error(res, err instanceof Error ? err.message : '删除产品失败', 500);
  }
});

// ==================== 仓库管理 ====================

const warehouseSchema = z.object({
  code: z.string().min(1, '仓库编码不能为空'),
  name: z.string().min(1, '仓库名称不能为空'),
  address: z.string().optional(),
  manager: z.string().min(1, '管理员不能为空'),
  phone: z.string().min(1, '联系电话不能为空'),
  status: z.enum(['active', 'inactive']).default('active'),
});

/**
 * GET /inventory/warehouses
 * 获取仓库列表
 */
router.get('/warehouses', async (req: AuthRequest, res: Response) => {
  try {
    const warehouses = await warehouseService.getActiveWarehouses();
    success(res, warehouses);
  } catch (err) {
    console.error('Get warehouses error:', err);
    error(res, err instanceof Error ? err.message : '获取仓库列表失败', 500);
  }
});

/**
 * POST /inventory/warehouses
 * 创建仓库
 */
router.post('/warehouses', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(warehouseSchema)(req.body);
    const operatorId = req.user!.id;

    const warehouse = await warehouseService.createWarehouse(data);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建仓库: ${warehouse.name}`,
      {
        targetId: warehouse.id,
        targetName: warehouse.name,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, warehouse, '创建仓库成功');
  } catch (err) {
    console.error('Create warehouse error:', err);
    if (err instanceof Error && err.message.includes('已存在')) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建仓库失败', 500);
    }
  }
});

// ==================== 即时库存 ====================

/**
 * GET /inventory/current
 * 获取即时库存列表
 */
router.get('/current', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, warehouseId, productId, keyword } = validateQuery(
      paginationSchema.extend({
        warehouseId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        keyword: z.string().optional(),
      })
    )(req.query);

    const result = await inventoryService.getCurrentInventory({
      page,
      pageSize,
      warehouseId,
      productId,
      keyword,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get inventory error:', err);
    error(res, err instanceof Error ? err.message : '获取库存列表失败', 500);
  }
});

// ==================== 入库管理 ====================

const stockInSchema = z.object({
  warehouseId: z.string().uuid(),
  type: z.enum(['purchase', 'transfer', 'adjustment', 'return']),
  relatedOrderId: z.string().uuid().optional(),
  relatedOrderNo: z.string().optional(),
  inDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    location: z.string().optional(),
    batchNo: z.string().optional(),
    remark: z.string().optional(),
  })).min(1, '至少需要一个入库项'),
  remark: z.string().optional(),
});

/**
 * GET /inventory/stock-ins
 * 获取入库单列表
 */
router.get('/stock-ins', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, warehouseId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        warehouseId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await stockInService.getStockIns({
      page,
      pageSize,
      status,
      warehouseId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get stock ins error:', err);
    error(res, err instanceof Error ? err.message : '获取入库单列表失败', 500);
  }
});

/**
 * GET /inventory/stock-ins/:id
 * 获取入库单详情
 */
router.get('/stock-ins/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const stockIn = await stockInService.getStockInById(id);
    success(res, stockIn);
  } catch (err) {
    console.error('Get stock in error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取入库单失败', 500);
    }
  }
});

/**
 * GET /inventory/stock-ins/:id/items
 * 获取入库单明细
 */
router.get('/stock-ins/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await stockInService.getStockInItems(id);
    success(res, items);
  } catch (err) {
    console.error('Get stock in items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取入库单明细失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-ins
 * 创建入库单
 */
router.post('/stock-ins', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(stockInSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    const stockIn = await stockInService.createStockIn(data, username);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建入库单: ${stockIn.inNo}`,
      {
        targetId: stockIn.id,
        targetName: stockIn.inNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockIn, '创建入库单成功');
  } catch (err) {
    console.error('Create stock in error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建入库单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-ins/:id
 * 更新入库单
 */
router.put('/stock-ins/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(stockInSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const stockIn = await stockInService.updateStockIn(id, data);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `更新入库单: ${stockIn.inNo}`,
      {
        targetId: stockIn.id,
        targetName: stockIn.inNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockIn, '更新入库单成功');
  } catch (err) {
    console.error('Update stock in error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新入库单失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-ins/:id/complete
 * 完成入库单（更新库存）
 */
router.post('/stock-ins/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    await stockInService.completeStockIn(id);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `完成入库单: ${id}`,
      {
        targetId: id,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '完成入库单成功');
  } catch (err) {
    console.error('Complete stock in error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '完成入库单失败', 500);
    }
  }
});

// ==================== 出库管理 ====================

const stockOutSchema = z.object({
  warehouseId: z.string().uuid(),
  type: z.enum(['sales', 'transfer', 'adjustment', 'scrap']),
  relatedOrderId: z.string().uuid().optional(),
  relatedOrderNo: z.string().optional(),
  outDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    location: z.string().optional(),
    batchNo: z.string().optional(),
    remark: z.string().optional(),
  })).min(1, '至少需要一个出库项'),
  remark: z.string().optional(),
});

/**
 * GET /inventory/stock-outs
 * 获取出库单列表
 */
router.get('/stock-outs', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, warehouseId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        warehouseId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const result = await stockOutService.getStockOuts({
      page,
      pageSize,
      status,
      warehouseId,
      startDate,
      endDate,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get stock outs error:', err);
    error(res, err instanceof Error ? err.message : '获取出库单列表失败', 500);
  }
});

/**
 * GET /inventory/stock-outs/:id
 * 获取出库单详情
 */
router.get('/stock-outs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const stockOut = await stockOutService.getStockOutById(id);
    success(res, stockOut);
  } catch (err) {
    console.error('Get stock out error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取出库单失败', 500);
    }
  }
});

/**
 * GET /inventory/stock-outs/:id/items
 * 获取出库单明细
 */
router.get('/stock-outs/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await stockOutService.getStockOutItems(id);
    success(res, items);
  } catch (err) {
    console.error('Get stock out items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取出库单明细失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-outs
 * 创建出库单
 */
router.post('/stock-outs', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(stockOutSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    const stockOut = await stockOutService.createStockOut(data, username);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建出库单: ${stockOut.outNo}`,
      {
        targetId: stockOut.id,
        targetName: stockOut.outNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockOut, '创建出库单成功');
  } catch (err) {
    console.error('Create stock out error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在') || err.message.includes('不足'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建出库单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-outs/:id
 * 更新出库单
 */
router.put('/stock-outs/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(stockOutSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const stockOut = await stockOutService.updateStockOut(id, data);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `更新出库单: ${stockOut.outNo}`,
      {
        targetId: stockOut.id,
        targetName: stockOut.outNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockOut, '更新出库单成功');
  } catch (err) {
    console.error('Update stock out error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新出库单失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-outs/:id/complete
 * 完成出库单（更新库存）
 */
router.post('/stock-outs/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    await stockOutService.completeStockOut(id);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `完成出库单: ${id}`,
      {
        targetId: id,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '完成出库单成功');
  } catch (err) {
    console.error('Complete stock out error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消') || err.message.includes('不足'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '完成出库单失败', 500);
    }
  }
});

// ==================== 盘点管理 ====================

const stockCheckSchema = z.object({
  warehouseId: z.string().uuid(),
  checkDate: z.string().transform((str) => new Date(str)),
  checker: z.string().min(1, '盘点人不能为空'),
  items: z.array(z.object({
    productId: z.string().uuid(),
    bookQuantity: z.coerce.number().nonnegative(),
    actualQuantity: z.coerce.number().nonnegative(),
    location: z.string().optional(),
    reason: z.string().optional(),
  })).min(1, '至少需要一个盘点项'),
  remark: z.string().optional(),
});

/**
 * GET /inventory/stock-check/list
 * 获取盘点单列表
 */
router.get('/stock-check/list', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10 } = validateQuery(
      paginationSchema
    )(req.query);

    const result = await stockCheckService.getStockChecks({
      page,
      pageSize,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get stock checks error:', err);
    error(res, err instanceof Error ? err.message : '获取盘点单列表失败', 500);
  }
});

/**
 * GET /inventory/stock-check/:id/items
 * 获取盘点单明细
 */
router.get('/stock-check/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await stockCheckService.getStockCheckItems(id);
    success(res, items);
  } catch (err) {
    console.error('Get stock check items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取盘点单明细失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-check
 * 创建盘点单
 */
router.post('/stock-check', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(stockCheckSchema)(req.body);
    const operatorId = req.user!.id;

    const stockCheck = await stockCheckService.createStockCheck(data);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建盘点单: ${stockCheck.checkNo}`,
      {
        targetId: stockCheck.id,
        targetName: stockCheck.checkNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockCheck, '创建盘点单成功');
  } catch (err) {
    console.error('Create stock check error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建盘点单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-check/:id
 * 更新盘点单
 */
router.put('/stock-check/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(stockCheckSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const stockCheck = await stockCheckService.updateStockCheck(id, data);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `更新盘点单: ${stockCheck.checkNo}`,
      {
        targetId: stockCheck.id,
        targetName: stockCheck.checkNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockCheck, '更新盘点单成功');
  } catch (err) {
    console.error('Update stock check error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新盘点单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-check/:id/complete
 * 完成盘点单（更新库存）
 */
router.put('/stock-check/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    await stockCheckService.completeStockCheck(id);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `完成盘点单: ${id}`,
      {
        targetId: id,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '完成盘点单成功');
  } catch (err) {
    console.error('Complete stock check error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '完成盘点单失败', 500);
    }
  }
});

// ==================== 调拨管理 ====================

const stockTransferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  transferDate: z.string().transform((str) => new Date(str)),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    fromLocation: z.string().optional(),
    toLocation: z.string().optional(),
    batchNo: z.string().optional(),
    remark: z.string().optional(),
  })).min(1, '至少需要一个调拨项'),
  remark: z.string().optional(),
});

/**
 * GET /inventory/stock-transfer/list
 * 获取调拨单列表
 */
router.get('/stock-transfer/list', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10 } = validateQuery(
      paginationSchema
    )(req.query);

    const result = await stockTransferService.getStockTransfers({
      page,
      pageSize,
    });

    pagination(res, result.records, result.total, result.page, result.pageSize);
  } catch (err) {
    console.error('Get stock transfers error:', err);
    error(res, err instanceof Error ? err.message : '获取调拨单列表失败', 500);
  }
});

/**
 * GET /inventory/stock-transfer/:id/items
 * 获取调拨单明细
 */
router.get('/stock-transfer/:id/items', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const items = await stockTransferService.getStockTransferItems(id);
    success(res, items);
  } catch (err) {
    console.error('Get stock transfer items error:', err);
    if (err instanceof Error && err.message.includes('不存在')) {
      error(res, err.message, 404);
    } else {
      error(res, err instanceof Error ? err.message : '获取调拨单明细失败', 500);
    }
  }
});

/**
 * POST /inventory/stock-transfer
 * 创建调拨单
 */
router.post('/stock-transfer', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(stockTransferSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    const stockTransfer = await stockTransferService.createStockTransfer(data, username);

    await logOperation(
      operatorId,
      'create',
      'inventory',
      `创建调拨单: ${stockTransfer.transferNo}`,
      {
        targetId: stockTransfer.id,
        targetName: stockTransfer.transferNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockTransfer, '创建调拨单成功');
  } catch (err) {
    console.error('Create stock transfer error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已存在') || err.message.includes('不能相同'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '创建调拨单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-transfer/:id
 * 更新调拨单
 */
router.put('/stock-transfer/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const data = validateBody(stockTransferSchema.partial())(req.body);
    const operatorId = req.user!.id;

    const stockTransfer = await stockTransferService.updateStockTransfer(id, data);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `更新调拨单: ${stockTransfer.transferNo}`,
      {
        targetId: stockTransfer.id,
        targetName: stockTransfer.transferNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, stockTransfer, '更新调拨单成功');
  } catch (err) {
    console.error('Update stock transfer error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消') || err.message.includes('不能相同'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '更新调拨单失败', 500);
    }
  }
});

/**
 * PUT /inventory/stock-transfer/:id/complete
 * 完成调拨单（更新库存）
 */
router.put('/stock-transfer/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = validateParams(idSchema)(req.params);
    const operatorId = req.user!.id;

    await stockTransferService.completeStockTransfer(id);

    await logOperation(
      operatorId,
      'update',
      'inventory',
      `完成调拨单: ${id}`,
      {
        targetId: id,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, null, '完成调拨单成功');
  } catch (err) {
    console.error('Complete stock transfer error:', err);
    if (err instanceof Error && (err.message.includes('不存在') || err.message.includes('已完成') || err.message.includes('已取消') || err.message.includes('不足'))) {
      badRequest(res, err.message);
    } else {
      error(res, err instanceof Error ? err.message : '完成调拨单失败', 500);
    }
  }
});

export default router;


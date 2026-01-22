/**
 * 报表路由
 * 销售分析、库存预警
 */

import { Router } from 'express';
import { prisma } from '../db/client.js';
import { success, error } from '../utils/response.js';
import { validateQuery } from '../utils/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';
import type { AuthRequest } from '../types/index.js';
import type { Response } from 'express';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

// ==================== 销售分析 ====================

/**
 * GET /report/sales-analysis
 * 获取销售分析数据
 */
router.get('/sales-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, dimension = 'product' } = validateQuery(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        dimension: z.enum(['product', 'customer', 'date']).default('product'),
      })
    )(req.query);

    const where: any = {
      status: {
        in: ['approved', 'shipped', 'completed'],
      },
    };

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.orderDate.lte = new Date(endDate);
      }
    }

    // 获取订单数据
    const orders = await prisma.salesOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
      },
    });

    // 按维度汇总
    const summary: Record<string, { quantity: number; amount: number }> = {};

    for (const order of orders) {
      for (const item of order.items) {
        let key = '';
        if (dimension === 'product') {
          key = `${item.product.code}-${item.product.name}`;
        } else if (dimension === 'customer') {
          key = `${order.customer.code}-${order.customer.name}`;
        } else {
          key = order.orderDate.toISOString().split('T')[0];
        }

        if (!summary[key]) {
          summary[key] = { quantity: 0, amount: 0 };
        }
        summary[key].quantity += item.quantity;
        summary[key].amount += item.amount;
      }
    }

    // 转换为数组并排序
    const summaryList = Object.entries(summary)
      .map(([value, data]) => ({
        dimension,
        value,
        quantity: data.quantity,
        amount: data.amount,
        percentage: 0, // 需要计算总金额后才能计算百分比
      }))
      .sort((a, b) => b.amount - a.amount);

    // 计算总金额和百分比
    const totalAmount = summaryList.reduce((sum, item) => sum + item.amount, 0);
    summaryList.forEach((item) => {
      item.percentage = totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0;
    });

    success(res, {
      summary: summaryList,
      totalAmount,
      totalQuantity: summaryList.reduce((sum, item) => sum + item.quantity, 0),
    });
  } catch (err) {
    console.error('Get sales analysis error:', err);
    error(res, err instanceof Error ? err.message : '获取销售分析失败', 500);
  }
});

/**
 * GET /report/sales-analysis/list
 * 获取销售分析明细列表
 */
router.get('/sales-analysis/list', async (req: AuthRequest, res: Response) => {
  try {
    const { productId, region, startDate, endDate } = validateQuery(
      z.object({
        productId: z.string().optional(),
        region: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const where: any = {
      status: {
        in: ['approved', 'shipped', 'completed'],
      },
    };

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.orderDate.lte = new Date(endDate);
      }
    }

    // 获取订单数据
    const orders = await prisma.salesOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        customer: true,
      },
    });

    // 转换为明细数据
    const detailList: any[] = [];
    for (const order of orders) {
      for (const item of order.items) {
        // 如果指定了产品ID，进行过滤
        if (productId && item.productId !== productId) {
          continue;
        }

        // 从客户地址提取区域信息（如果没有区域字段，可以从客户地址推断）
        const customerRegion = (order.customer.address || '').match(/华北|华东|华南|华中|西南|西北|东北/) 
          ? (order.customer.address || '').match(/华北|华东|华南|华中|西南|西北|东北/)![0]
          : '其他';

        // 如果指定了区域，进行过滤
        if (region && customerRegion !== region) {
          continue;
        }

        const orderDate = order.orderDate.toISOString().slice(0, 7); // YYYY-MM

        detailList.push({
          id: `${order.id}-${item.id}`,
          productId: item.productId,
          productCode: item.product.code,
          productName: item.product.name,
          region: customerRegion,
          date: orderDate,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        });
      }
    }

    // 按日期、产品、区域汇总
    const summaryMap = new Map<string, any>();
    for (const item of detailList) {
      const key = `${item.productId}-${item.region}-${item.date}`;
      if (summaryMap.has(key)) {
        const existing = summaryMap.get(key);
        existing.quantity += item.quantity;
        existing.amount += item.amount;
      } else {
        summaryMap.set(key, {
          id: item.id,
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          region: item.region,
          date: item.date,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        });
      }
    }

    const result = Array.from(summaryMap.values()).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.productCode !== b.productCode) return a.productCode.localeCompare(b.productCode);
      return a.region.localeCompare(b.region);
    });

    success(res, {
      list: result,
      total: result.length,
    });
  } catch (err) {
    console.error('Get sales analysis list error:', err);
    error(res, err instanceof Error ? err.message : '获取销售分析明细失败', 500);
  }
});

// ==================== 库存预警 ====================

/**
 * GET /report/inventory-alerts
 * 获取库存预警列表
 */
router.get('/inventory-alerts', async (req: AuthRequest, res: Response) => {
  try {
    const { level } = validateQuery(
      z.object({
        level: z.enum(['critical', 'warning', 'normal']).optional(),
      })
    )(req.query);

    // 获取所有库存
    const inventories = await prisma.inventory.findMany({
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            specification: true,
            unit: true,
            minStock: true,
            maxStock: true,
            safetyStock: true,
          },
        },
      },
    });

    // 计算预警级别
    const alerts = inventories
      .map((inv) => {
        const { product, warehouse } = inv;
        const currentStock = inv.quantity;
        const minStock = product.minStock || 0;
        const safetyStock = product.safetyStock || 0;
        const maxStock = product.maxStock || 0;

        let alertLevel: 'critical' | 'warning' | 'normal' = 'normal';
        let daysToStockout = 0;
        let suggestion = '';

        // 计算预警级别
        if (currentStock <= 0) {
          alertLevel = 'critical';
          suggestion = '库存为零，需要立即补货';
        } else if (currentStock < minStock) {
          alertLevel = 'critical';
          suggestion = `库存低于最低库存（${minStock}），需要紧急补货`;
        } else if (currentStock < safetyStock) {
          alertLevel = 'warning';
          suggestion = `库存低于安全库存（${safetyStock}），建议补货`;
        } else if (currentStock > maxStock) {
          alertLevel = 'warning';
          suggestion = `库存超过最高库存（${maxStock}），建议减少采购`;
        } else {
          alertLevel = 'normal';
          suggestion = '库存正常';
        }

        // 简单计算预计缺货天数（假设日均消耗量，这里简化处理）
        if (currentStock > 0 && minStock > 0) {
          const dailyConsumption = (minStock / 30); // 假设30天消耗完最低库存
          daysToStockout = Math.floor(currentStock / dailyConsumption);
        }

        return {
          id: inv.id,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          specification: product.specification,
          unit: product.unit,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          currentStock,
          minStock,
          maxStock,
          safetyStock,
          alertLevel,
          alertLevelName: getAlertLevelName(alertLevel),
          daysToStockout,
          suggestion,
          updateTime: inv.updatedAt.toISOString(),
        };
      })
      .filter((alert) => {
        if (level) {
          return alert.alertLevel === level;
        }
        // 默认只返回预警和严重预警
        return alert.alertLevel !== 'normal';
      })
      .sort((a, b) => {
        // 按预警级别排序：critical > warning > normal
        const levelOrder = { critical: 0, warning: 1, normal: 2 };
        return levelOrder[a.alertLevel] - levelOrder[b.alertLevel];
      });

    success(res, alerts);
  } catch (err) {
    console.error('Get inventory alerts error:', err);
    error(res, err instanceof Error ? err.message : '获取库存预警失败', 500);
  }
});

/**
 * GET /report/inventory-alert/list
 * 获取库存预警列表（分页）
 */
router.get('/inventory-alert/list', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, warehouseId, alertLevel } = validateQuery(
      z.object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(10),
        warehouseId: z.string().optional(),
        alertLevel: z.enum(['critical', 'warning', 'normal']).optional(),
      })
    )(req.query);

    const where: any = {};
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }

    // 获取所有库存
    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            specification: true,
            unit: true,
            minStock: true,
            maxStock: true,
            safetyStock: true,
          },
        },
      },
    });

    // 计算预警级别
    let alerts = inventories
      .map((inv) => {
        const { product, warehouse } = inv;
        const currentStock = inv.quantity;
        const minStock = product.minStock || 0;
        const safetyStock = product.safetyStock || 0;
        const maxStock = product.maxStock || 0;

        let alertLevel: 'critical' | 'warning' | 'normal' = 'normal';
        let daysToStockout = 0;
        let suggestion = '';

        // 计算预警级别
        if (currentStock <= 0) {
          alertLevel = 'critical';
          suggestion = '库存为零，需要立即补货';
        } else if (currentStock < minStock) {
          alertLevel = 'critical';
          suggestion = `库存低于最低库存（${minStock}），需要紧急补货`;
        } else if (currentStock < safetyStock) {
          alertLevel = 'warning';
          suggestion = `库存低于安全库存（${safetyStock}），建议补货`;
        } else if (currentStock > maxStock) {
          alertLevel = 'warning';
          suggestion = `库存超过最高库存（${maxStock}），建议减少采购`;
        } else {
          alertLevel = 'normal';
          suggestion = '库存正常';
        }

        // 简单计算预计缺货天数
        if (currentStock > 0 && minStock > 0) {
          const dailyConsumption = (minStock / 30);
          daysToStockout = Math.floor(currentStock / dailyConsumption);
        }

        return {
          id: inv.id,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          specification: product.specification,
          unit: product.unit,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          currentStock,
          minStock,
          maxStock,
          safetyStock,
          alertLevel,
          alertLevelName: getAlertLevelName(alertLevel),
          daysToStockout,
          suggestion,
          updateTime: inv.updatedAt.toISOString(),
        };
      })
      .filter((alert) => {
        if (alertLevel) {
          return alert.alertLevel === alertLevel;
        }
        // 默认只返回预警和严重预警
        return alert.alertLevel !== 'normal';
      })
      .sort((a, b) => {
        const levelOrder = { critical: 0, warning: 1, normal: 2 };
        return levelOrder[a.alertLevel] - levelOrder[b.alertLevel];
      });

    // 分页
    const total = alerts.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedAlerts = alerts.slice(start, end);

    success(res, {
      list: paginatedAlerts,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.error('Get inventory alert list error:', err);
    error(res, err instanceof Error ? err.message : '获取库存预警列表失败', 500);
  }
});

// ==================== Dashboard 统计 ====================

/**
 * GET /report/dashboard
 * 获取仪表盘统计数据
 */
router.get('/dashboard', async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 总订单数
    const totalOrders = await prisma.salesOrder.count();

    // 今日销售额
    const todaySales = await prisma.salesOrder.aggregate({
      where: {
        orderDate: {
          gte: today,
          lt: tomorrow,
        },
        status: {
          in: ['approved', 'shipped', 'completed'],
        },
      },
      _sum: {
        finalAmount: true,
      },
    });

    // 待处理订单数
    const pendingOrders = await prisma.salesOrder.count({
      where: {
        status: 'pending',
      },
    });

    // 库存预警数
    const inventories = await prisma.inventory.findMany({
      include: {
        product: true,
      },
    });
    const alertCount = inventories.filter((inv) => {
      const currentStock = inv.quantity;
      const minStock = inv.product.minStock || 0;
      return currentStock < minStock;
    }).length;

    success(res, {
      totalOrders,
      todaySales: todaySales._sum.finalAmount || 0,
      pendingOrders,
      inventoryAlerts: alertCount,
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    error(res, err instanceof Error ? err.message : '获取仪表盘统计失败', 500);
  }
});

// 辅助函数
function getAlertLevelName(level: string): string {
  const map: Record<string, string> = {
    critical: '严重',
    warning: '警告',
    normal: '正常',
  };
  return map[level] || level;
}

export default router;


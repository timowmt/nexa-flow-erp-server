/**
 * 财务管理路由
 * 应收账款、应付账款、收支明细
 */

import { Router } from 'express';
import { prisma } from '../db/client.js';
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

// ==================== 应收账款 ====================

/**
 * GET /finance/receivables
 * 获取应收账款列表
 */
router.get('/receivables', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, customerId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        customerId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (customerId) {
      where.customerId = customerId;
    }
    if (startDate || endDate) {
      where.billDate = {};
      if (startDate) {
        where.billDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.billDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      prisma.accountsReceivable.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.accountsReceivable.count({ where }),
    ]);

    const receivables = records.map((ar) => ({
      id: ar.id,
      billNo: ar.billNo,
      customerId: ar.customerId,
      customerName: ar.customer.name,
      orderId: ar.orderId,
      orderNo: ar.order.orderNo,
      billDate: ar.billDate.toISOString().split('T')[0],
      totalAmount: ar.totalAmount,
      receivedAmount: ar.receivedAmount,
      remainingAmount: ar.remainingAmount,
      dueDate: ar.dueDate.toISOString().split('T')[0],
      status: ar.status,
      statusName: getReceivableStatusName(ar.status),
      remark: ar.remark,
      createTime: ar.createdAt.toISOString(),
    }));

    pagination(res, receivables, total, page, pageSize);
  } catch (err) {
    console.error('Get receivables error:', err);
    error(res, err instanceof Error ? err.message : '获取应收账款列表失败', 500);
  }
});

/**
 * POST /finance/receivables
 * 创建应收账款（通常由销售订单自动创建）
 */
router.post('/receivables', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(
      z.object({
        customerId: z.string().uuid(),
        orderId: z.string().uuid(),
        billDate: z.string().transform((str) => new Date(str)),
        totalAmount: z.coerce.number().positive(),
        dueDate: z.string().transform((str) => new Date(str)),
        remark: z.string().optional(),
      })
    )(req.body);
    const operatorId = req.user!.id;

    // 生成账单号
    const billNo = await generateBillNo('AR');

    // 检查订单是否已有应收账款
    const existing = await prisma.accountsReceivable.findFirst({
      where: { orderId: data.orderId },
    });

    if (existing) {
      badRequest(res, '该订单已存在应收账款');
      return;
    }

    const receivable = await prisma.accountsReceivable.create({
      data: {
        billNo,
        customerId: data.customerId,
        orderId: data.orderId,
        billDate: data.billDate,
        totalAmount: data.totalAmount,
        receivedAmount: 0,
        remainingAmount: data.totalAmount,
        dueDate: data.dueDate,
        status: 'unpaid',
        remark: data.remark,
      },
      include: {
        customer: true,
        order: true,
      },
    });

    await logOperation(
      operatorId,
      'create',
      'finance',
      `创建应收账款: ${receivable.billNo}`,
      {
        targetId: receivable.id,
        targetName: receivable.billNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, receivable, '创建应收账款成功');
  } catch (err) {
    console.error('Create receivable error:', err);
    error(res, err instanceof Error ? err.message : '创建应收账款失败', 500);
  }
});

// ==================== 收款记录 ====================

/**
 * GET /finance/receipts
 * 获取收款记录列表（收款核销）
 */
router.get('/receipts', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, receiptNo, billNo } = validateQuery(
      paginationSchema.extend({
        receiptNo: z.string().optional(),
        billNo: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (receiptNo && String(receiptNo).trim()) {
      where.receiptNo = { contains: String(receiptNo).trim() };
    }
    if (billNo && String(billNo).trim()) {
      where.bill = { billNo: { contains: String(billNo).trim() } };
    }

    const [records, total] = await Promise.all([
      prisma.receiptRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          bill: {
            select: {
              id: true,
              billNo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.receiptRecord.count({ where }),
    ]);

    const receipts = records.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      billId: r.billId,
      billNo: r.bill.billNo,
      receiptDate: r.receiptDate.toISOString().split('T')[0],
      receiptAmount: r.receiptAmount,
      receiptMethod: r.receiptMethod,
      bankAccount: r.bankAccount,
      voucherNo: r.voucherNo,
      operator: r.operator,
      remark: r.remark,
      createTime: r.createdAt.toISOString(),
    }));

    pagination(res, receipts, total, page, pageSize);
  } catch (err) {
    console.error('Get receipts error:', err);
    error(res, err instanceof Error ? err.message : '获取收款记录列表失败', 500);
  }
});

const receiptRecordSchema = z.object({
  billId: z.string().uuid(),
  receiptDate: z.string().transform((str) => new Date(str)),
  receiptAmount: z.coerce.number().positive(),
  receiptMethod: z.enum(['cash', 'bank_transfer', 'check', 'other']),
  bankAccount: z.string().optional(),
  voucherNo: z.string().optional(),
  remark: z.string().optional(),
});

/**
 * POST /finance/receipts
 * 创建收款记录
 */
router.post('/receipts', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(receiptRecordSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    // 检查账单是否存在
    const bill = await prisma.accountsReceivable.findUnique({
      where: { id: data.billId },
    });

    if (!bill) {
      error(res, '应收账款不存在', 404);
      return;
    }

    // 检查收款金额是否超过剩余金额
    if (data.receiptAmount > bill.remainingAmount) {
      badRequest(res, '收款金额不能超过剩余金额');
      return;
    }

    // 生成收款单号
    const receiptNo = await generateReceiptNo('REC');

    // 创建收款记录
    const receipt = await prisma.receiptRecord.create({
      data: {
        receiptNo,
        billId: data.billId,
        receiptDate: data.receiptDate,
        receiptAmount: data.receiptAmount,
        receiptMethod: data.receiptMethod,
        bankAccount: data.bankAccount,
        voucherNo: data.voucherNo,
        operator: username,
        remark: data.remark,
      },
    });

    // 更新应收账款
    const newReceivedAmount = bill.receivedAmount + data.receiptAmount;
    const newRemainingAmount = bill.totalAmount - newReceivedAmount;
    let newStatus = bill.status;
    if (newRemainingAmount <= 0) {
      newStatus = 'paid';
    } else if (newReceivedAmount > 0) {
      newStatus = 'partial';
    }

    await prisma.accountsReceivable.update({
      where: { id: data.billId },
      data: {
        receivedAmount: newReceivedAmount,
        remainingAmount: newRemainingAmount,
        status: newStatus,
      },
    });

    await logOperation(
      operatorId,
      'create',
      'finance',
      `创建收款记录: ${receipt.receiptNo}`,
      {
        targetId: receipt.id,
        targetName: receipt.receiptNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, receipt, '创建收款记录成功');
  } catch (err) {
    console.error('Create receipt error:', err);
    error(res, err instanceof Error ? err.message : '创建收款记录失败', 500);
  }
});

// ==================== 应付账款 ====================

/**
 * GET /finance/payables
 * 获取应付账款列表
 */
router.get('/payables', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, status, supplierId, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        status: z.string().optional(),
        supplierId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (startDate || endDate) {
      where.billDate = {};
      if (startDate) {
        where.billDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.billDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      prisma.accountsPayable.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.accountsPayable.count({ where }),
    ]);

    const payables = records.map((ap) => ({
      id: ap.id,
      billNo: ap.billNo,
      supplierId: ap.supplierId,
      supplierName: ap.supplier.name,
      orderId: ap.orderId,
      orderNo: ap.order.orderNo,
      billDate: ap.billDate.toISOString().split('T')[0],
      totalAmount: ap.totalAmount,
      paidAmount: ap.paidAmount,
      remainingAmount: ap.remainingAmount,
      dueDate: ap.dueDate.toISOString().split('T')[0],
      status: ap.status,
      statusName: getPayableStatusName(ap.status),
      remark: ap.remark,
      createTime: ap.createdAt.toISOString(),
    }));

    pagination(res, payables, total, page, pageSize);
  } catch (err) {
    console.error('Get payables error:', err);
    error(res, err instanceof Error ? err.message : '获取应付账款列表失败', 500);
  }
});

// ==================== 付款记录 ====================

const paymentRecordSchema = z.object({
  billId: z.string().uuid(),
  paymentDate: z.string().transform((str) => new Date(str)),
  paymentAmount: z.coerce.number().positive(),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'check', 'other']),
  bankAccount: z.string().optional(),
  voucherNo: z.string().optional(),
  remark: z.string().optional(),
});

/**
 * GET /finance/payments
 * 获取付款记录列表（付款核销）
 */
router.get('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, paymentNo, billNo } = validateQuery(
      paginationSchema.extend({
        paymentNo: z.string().optional(),
        billNo: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (paymentNo && String(paymentNo).trim()) {
      where.paymentNo = { contains: String(paymentNo).trim() };
    }
    if (billNo && String(billNo).trim()) {
      where.bill = { billNo: { contains: String(billNo).trim() } };
    }

    const [records, total] = await Promise.all([
      prisma.paymentRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          bill: {
            select: {
              id: true,
              billNo: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.paymentRecord.count({ where }),
    ]);

    const payments = records.map((p) => ({
      id: p.id,
      paymentNo: p.paymentNo,
      billId: p.billId,
      billNo: p.bill.billNo,
      paymentDate: p.paymentDate.toISOString().split('T')[0],
      paymentAmount: p.paymentAmount,
      paymentMethod: p.paymentMethod,
      bankAccount: p.bankAccount,
      voucherNo: p.voucherNo,
      operator: p.operator,
      remark: p.remark,
      createTime: p.createdAt.toISOString(),
    }));

    pagination(res, payments, total, page, pageSize);
  } catch (err) {
    console.error('Get payments error:', err);
    error(res, err instanceof Error ? err.message : '获取付款记录列表失败', 500);
  }
});

/**
 * POST /finance/payments
 * 创建付款记录
 */
router.post('/payments', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(paymentRecordSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    // 检查账单是否存在
    const bill = await prisma.accountsPayable.findUnique({
      where: { id: data.billId },
    });

    if (!bill) {
      error(res, '应付账款不存在', 404);
      return;
    }

    // 检查付款金额是否超过剩余金额
    if (data.paymentAmount > bill.remainingAmount) {
      badRequest(res, '付款金额不能超过剩余金额');
      return;
    }

    // 生成付款单号
    const paymentNo = await generatePaymentNo('PAY');

    // 创建付款记录
    const payment = await prisma.paymentRecord.create({
      data: {
        paymentNo,
        billId: data.billId,
        paymentDate: data.paymentDate,
        paymentAmount: data.paymentAmount,
        paymentMethod: data.paymentMethod,
        bankAccount: data.bankAccount,
        voucherNo: data.voucherNo,
        operator: username,
        remark: data.remark,
      },
    });

    // 更新应付账款
    const newPaidAmount = bill.paidAmount + data.paymentAmount;
    const newRemainingAmount = bill.totalAmount - newPaidAmount;
    let newStatus = bill.status;
    if (newRemainingAmount <= 0) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partial';
    }

    await prisma.accountsPayable.update({
      where: { id: data.billId },
      data: {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        status: newStatus,
      },
    });

    await logOperation(
      operatorId,
      'create',
      'finance',
      `创建付款记录: ${payment.paymentNo}`,
      {
        targetId: payment.id,
        targetName: payment.paymentNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, payment, '创建付款记录成功');
  } catch (err) {
    console.error('Create payment error:', err);
    error(res, err instanceof Error ? err.message : '创建付款记录失败', 500);
  }
});

// ==================== 收支明细 ====================

const incomeExpenseSchema = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string().min(1, '类别不能为空'),
  amount: z.coerce.number().positive(),
  recordDate: z.string().transform((str) => new Date(str)),
  relatedOrderId: z.string().uuid().optional(),
  relatedOrderNo: z.string().optional(),
  description: z.string().min(1, '描述不能为空'),
});

/**
 * GET /finance/income-expenses/summary
 * 获取收支明细统计（总收入/总支出/净收入/笔数）
 */
router.get('/income-expenses/summary', async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, startDate, endDate } = validateQuery(
      z.object({
        type: z.string().optional(),
        category: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (type) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }
    if (startDate || endDate) {
      where.recordDate = {};
      if (startDate) {
        where.recordDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.recordDate.lte = new Date(endDate);
      }
    }

    const grouped = await prisma.incomeExpense.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const incomeRow = grouped.find((g) => g.type === 'income');
    const expenseRow = grouped.find((g) => g.type === 'expense');

    const totalIncome = Number(incomeRow?._sum?.amount ?? 0);
    const totalExpense = Number(expenseRow?._sum?.amount ?? 0);
    const incomeCount = Number(incomeRow?._count?._all ?? 0);
    const expenseCount = Number(expenseRow?._count?._all ?? 0);

    success(
      res,
      {
        totalIncome,
        totalExpense,
        netAmount: totalIncome - totalExpense,
        incomeCount,
        expenseCount,
        transactionCount: incomeCount + expenseCount,
      },
      '获取收支统计成功'
    );
  } catch (err) {
    console.error('Get income expenses summary error:', err);
    error(res, err instanceof Error ? err.message : '获取收支统计失败', 500);
  }
});

/**
 * GET /finance/income-expenses
 * 获取收支明细列表
 */
router.get('/income-expenses', async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, pageSize = 10, type, category, startDate, endDate } = validateQuery(
      paginationSchema.extend({
        type: z.string().optional(),
        category: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )(req.query);

    const where: any = {};
    if (type) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }
    if (startDate || endDate) {
      where.recordDate = {};
      if (startDate) {
        where.recordDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.recordDate.lte = new Date(endDate);
      }
    }

    const [records, total] = await Promise.all([
      prisma.incomeExpense.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { recordDate: 'desc' },
      }),
      prisma.incomeExpense.count({ where }),
    ]);

    const incomeExpenses = records.map((ie) => ({
      id: ie.id,
      recordNo: ie.recordNo,
      type: ie.type,
      typeName: ie.type === 'income' ? '收入' : '支出',
      category: ie.category,
      categoryName: getCategoryName(ie.category),
      amount: ie.amount,
      recordDate: ie.recordDate.toISOString().split('T')[0],
      relatedOrderId: ie.relatedOrderId,
      relatedOrderNo: ie.relatedOrderNo,
      description: ie.description,
      operator: ie.operator,
      createTime: ie.createdAt.toISOString(),
    }));

    pagination(res, incomeExpenses, total, page, pageSize);
  } catch (err) {
    console.error('Get income expenses error:', err);
    error(res, err instanceof Error ? err.message : '获取收支明细失败', 500);
  }
});

/**
 * POST /finance/income-expenses
 * 创建收支明细
 */
router.post('/income-expenses', async (req: AuthRequest, res: Response) => {
  try {
    const data = validateBody(incomeExpenseSchema)(req.body);
    const operatorId = req.user!.id;
    const username = req.user!.username;

    // 生成记录号
    const recordNo = await generateIncomeExpenseNo('IE');

    const incomeExpense = await prisma.incomeExpense.create({
      data: {
        recordNo,
        type: data.type,
        category: data.category,
        amount: data.amount,
        recordDate: data.recordDate,
        relatedOrderId: data.relatedOrderId,
        relatedOrderNo: data.relatedOrderNo,
        description: data.description,
        operator: username,
      },
    });

    await logOperation(
      operatorId,
      'create',
      'finance',
      `创建收支明细: ${incomeExpense.recordNo}`,
      {
        targetId: incomeExpense.id,
        targetName: incomeExpense.recordNo,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      }
    );

    success(res, incomeExpense, '创建收支明细成功');
  } catch (err) {
    console.error('Create income expense error:', err);
    error(res, err instanceof Error ? err.message : '创建收支明细失败', 500);
  }
});

// 辅助函数
function getReceivableStatusName(status: string): string {
  const map: Record<string, string> = {
    unpaid: '未付款',
    partial: '部分付款',
    paid: '已付清',
    overdue: '已逾期',
  };
  return map[status] || status;
}

function getPayableStatusName(status: string): string {
  const map: Record<string, string> = {
    unpaid: '未付款',
    partial: '部分付款',
    paid: '已付清',
    overdue: '已逾期',
  };
  return map[status] || status;
}

function getCategoryName(category: string): string {
  const map: Record<string, string> = {
    sales: '销售收入',
    purchase: '采购支出',
    salary: '工资支出',
    rent: '租金支出',
    other: '其他',
  };
  return map[category] || category;
}

async function generateBillNo(prefix: string): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.accountsReceivable.count({
    where: {
      billNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${dateStr}${seq}`;
}

async function generateReceiptNo(prefix: string): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.receiptRecord.count({
    where: {
      receiptNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${dateStr}${seq}`;
}

async function generatePaymentNo(prefix: string): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.paymentRecord.count({
    where: {
      paymentNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${dateStr}${seq}`;
}

async function generateIncomeExpenseNo(prefix: string): Promise<string> {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const count = await prisma.incomeExpense.count({
    where: {
      recordNo: {
        startsWith: `${prefix}${dateStr}`,
      },
    },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${dateStr}${seq}`;
}

export default router;


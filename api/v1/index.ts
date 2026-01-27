/**
 * Vercel Serverless Function Entry Point
 * This file handles all /api/* routes for Vercel deployment
 */

import express from 'express';
import cors from 'cors';
import { getDb } from '../../src/db/client.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';

// 路由
import authRoutes from '../../src/routes/auth.js';
import systemRoutes from '../../src/routes/system.js';
import salesRoutes from '../../src/routes/sales.js';
import purchaseRoutes from '../../src/routes/purchase.js';
import inventoryRoutes from '../../src/routes/inventory.js';
import financeRoutes from '../../src/routes/finance.js';
import reportRoutes from '../../src/routes/report.js';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

// Root / health check (so opening backend domain isn't Vercel 404)
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nexa-flow-erp-server',
    message: 'Backend is running. Use /api/* endpoints.',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize database connection
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    try {
      await getDb();
      dbInitialized = true;
    } catch (error) {
      console.error('Database initialization error:', error);
      return res.status(500).json({ 
        code: 500,
        message: 'Database connection failed',
        data: null 
      });
    }
  }
  next();
});

// API Routes
app.use('/auth', authRoutes);
app.use('/user', authRoutes); // 用户信息接口也在 auth 路由中
app.use('/system', systemRoutes);
app.use('/sales', salesRoutes);
app.use('/purchase', purchaseRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/finance', financeRoutes);
app.use('/report', reportRoutes);

// Also mount under /api/* for Vercel rewrites/proxies
app.use('/api/auth', authRoutes);
app.use('/api/user', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/report', reportRoutes);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Export for Vercel Serverless Function
export default app;


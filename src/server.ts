/**
 * Express Server (for local development)
 * Run with: npm run dev
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb } from './db/client.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// 路由
import authRoutes from './routes/auth.js';
import systemRoutes from './routes/system.js';
import salesRoutes from './routes/sales.js';
import purchaseRoutes from './routes/purchase.js';
import inventoryRoutes from './routes/inventory.js';
import financeRoutes from './routes/finance.js';
import reportRoutes from './routes/report.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Root path
app.get('/', (req, res) => {
  res.json({
    message: 'Nexa Flow ERP API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      user: '/api/user',
      system: '/api/system',
      sales: '/api/sales',
      purchase: '/api/purchase',
      inventory: '/api/inventory',
      finance: '/api/finance',
      report: '/api/report',
    },
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    message: 'Nexa Flow ERP API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        userInfo: 'GET /api/user/info',
      },
      system: {
        users: 'GET /api/system/users',
        roles: 'GET /api/system/roles',
        dicts: 'GET /api/system/dicts',
        operationLogs: 'GET /api/system/operation-logs',
      },
      sales: {
        customers: 'GET /api/sales/customers',
        orders: 'GET /api/sales/orders',
      },
      purchase: {
        suppliers: 'GET /api/purchase/suppliers',
        orders: 'GET /api/purchase/orders',
      },
      inventory: {
        products: 'GET /api/inventory/products',
        warehouses: 'GET /api/inventory/warehouses',
        current: 'GET /api/inventory/current',
      },
      finance: {
        receivables: 'GET /api/finance/receivables',
        payables: 'GET /api/finance/payables',
      },
      report: {
        salesAnalysis: 'GET /api/report/sales-analysis',
        inventoryAlerts: 'GET /api/report/inventory-alerts',
        dashboard: 'GET /api/report/dashboard',
      },
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', authRoutes); // 用户信息接口也在 auth 路由中
app.use('/api/system', systemRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/report', reportRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function start() {
  try {
    await getDb();
    console.log('✅ Database connected');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();


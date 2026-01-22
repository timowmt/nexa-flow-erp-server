# Nexa Flow ERP Server

Nexa Flow ERP 后端服务，基于 Node.js + Express + TypeScript + Prisma 构建。

## 技术栈

- **运行时**: Node.js
- **框架**: Express
- **语言**: TypeScript
- **ORM**: Prisma
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **认证**: JWT
- **部署**: Vercel Serverless Functions

## 项目结构

```
nexa-flow-erp-server/
├── api/
│   └── v1/
│       └── index.ts          # Vercel Serverless 入口
├── prisma/
│   └── schema.prisma         # 数据库模型定义
├── src/
│   ├── db/
│   │   ├── client.ts         # 数据库客户端
│   │   └── seed.ts           # 数据库种子数据
│   ├── middleware/
│   │   ├── auth.ts           # 认证中间件
│   │   └── errorHandler.ts   # 错误处理中间件
│   ├── routes/
│   │   ├── auth.ts           # 认证路由
│   │   ├── system.ts         # 系统管理路由
│   │   ├── sales.ts          # 销售管理路由
│   │   ├── purchase.ts       # 采购管理路由
│   │   ├── inventory.ts      # 库存管理路由
│   │   ├── finance.ts        # 财务管理路由
│   │   └── report.ts         # 报表路由
│   ├── utils/
│   │   ├── response.ts       # 响应工具
│   │   ├── jwt.ts            # JWT 工具
│   │   ├── password.ts       # 密码加密工具
│   │   ├── logger.ts         # 日志工具
│   │   └── validator.ts      # 数据验证工具
│   ├── types/
│   │   └── index.ts          # 类型定义
│   └── server.ts             # 本地开发服务器
├── package.json
├── tsconfig.json
└── vercel.json                # Vercel 配置
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
npm run db:generate

# 运行数据库迁移
npm run db:migrate

# 填充种子数据
npm run db:seed
```

### 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:4000` 启动。

## API 文档

### 认证接口

- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/user/info` - 获取当前用户信息

### 系统管理

- `GET /api/system/users` - 获取用户列表
- `POST /api/system/users` - 创建用户
- `PUT /api/system/users/:id` - 更新用户
- `DELETE /api/system/users/:id` - 删除用户
- `GET /api/system/roles` - 获取角色列表
- `GET /api/system/dicts` - 获取字典列表
- `GET /api/system/operation-logs` - 获取操作日志

### 销售管理

- `GET /api/sales/customers` - 获取客户列表
- `POST /api/sales/customers` - 创建客户
- `PUT /api/sales/customers/:id` - 更新客户
- `DELETE /api/sales/customers/:id` - 删除客户
- `GET /api/sales/orders` - 获取销售订单列表
- `POST /api/sales/orders` - 创建销售订单

### 采购管理

- `GET /api/purchase/suppliers` - 获取供应商列表
- `POST /api/purchase/suppliers` - 创建供应商
- `GET /api/purchase/orders` - 获取采购订单列表
- `POST /api/purchase/orders` - 创建采购订单

### 库存管理

- `GET /api/inventory/products` - 获取产品列表
- `POST /api/inventory/products` - 创建产品
- `GET /api/inventory/warehouses` - 获取仓库列表
- `GET /api/inventory/current` - 获取即时库存
- `GET /api/inventory/stock-ins` - 获取入库单列表
- `POST /api/inventory/stock-ins` - 创建入库单

### 财务管理

- `GET /api/finance/receivables` - 获取应收账款列表
- `POST /api/finance/receipts` - 创建收款记录
- `GET /api/finance/payables` - 获取应付账款列表
- `POST /api/finance/payments` - 创建付款记录
- `GET /api/finance/income-expenses` - 获取收支明细
- `POST /api/finance/income-expenses` - 创建收支明细

### 报表

- `GET /api/report/sales-analysis` - 销售分析
- `GET /api/report/inventory-alerts` - 库存预警
- `GET /api/report/dashboard` - 仪表盘统计

## 默认账号

运行 `npm run db:seed` 后会创建以下默认账号：

- **管理员**: `admin` / `admin123`
- **普通用户**: `user` / `user123`

## 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量：
   - `DATABASE_URL` - PostgreSQL 连接字符串（使用 Vercel Postgres）
   - `JWT_SECRET` - JWT 密钥
   - `FRONTEND_URL` - 前端 URL
4. 部署

## 开发说明

- 所有 API 响应格式统一为：
  ```json
  {
    "code": 200,
    "message": "操作成功",
    "data": {}
  }
  ```

- 认证方式：在请求头中添加 `Authorization: Bearer <token>`

- 分页参数：`page` (页码), `pageSize` (每页数量)

- 错误码：
  - `200` - 成功
  - `400` - 参数错误
  - `401` - 未授权
  - `403` - 禁止访问
  - `404` - 资源不存在
  - `500` - 服务器错误

## License

MIT


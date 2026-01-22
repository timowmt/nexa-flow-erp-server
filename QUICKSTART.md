# 快速开始指南

## 1. 安装依赖

```bash
cd nexa-flow-erp-server
npm install
```

## 2. 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

## 3. 初始化数据库

```bash
# 生成 Prisma Client
npm run db:generate

# 运行数据库迁移（创建表结构）
npm run db:push

# 填充种子数据（创建默认用户和权限）
npm run db:seed
```

## 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:4000` 启动。

## 5. 测试 API

### 登录接口测试

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

### 获取用户信息（需要 Token）

```bash
curl -X GET http://localhost:4000/api/user/info \
  -H "Authorization: Bearer <your-token>"
```

## 默认账号

- **管理员**: `admin` / `admin123`
- **普通用户**: `user` / `user123`

## 常见问题

### 1. Prisma Client 未生成

如果遇到 `Cannot find module '@prisma/client'` 错误，运行：

```bash
npm run db:generate
```

### 2. 数据库连接失败

确保 `.env` 文件中的 `DATABASE_URL` 配置正确。

### 3. 端口被占用

修改 `.env` 文件中的 `PORT` 值。

## 下一步

1. 配置前端 API 地址为 `http://localhost:4000/api`
2. 测试各个功能模块
3. 准备部署到 Vercel


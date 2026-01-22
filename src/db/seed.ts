/**
 * 数据库种子数据
 * 初始化系统基础数据
 */

import 'dotenv/config';
import { prisma } from './client.js';
import { hashPassword } from '../utils/password.js';

async function main() {
  console.log('开始初始化数据库...');

  // 1. 创建权限
  console.log('创建权限...');
  const permissions = await Promise.all([
    // 仪表盘
    prisma.permission.upsert({
      where: { code: 'dashboard:view' },
      update: {},
      create: {
        code: 'dashboard:view',
        name: '查看仪表盘',
        type: 'menu',
        path: '/dashboard',
        sort: 1,
      },
    }),
    // 用户管理
    prisma.permission.upsert({
      where: { code: 'user:list' },
      update: {},
      create: {
        code: 'user:list',
        name: '用户列表',
        type: 'menu',
        path: '/system/user',
        sort: 10,
      },
    }),
    prisma.permission.upsert({
      where: { code: 'user:add' },
      update: {},
      create: {
        code: 'user:add',
        name: '添加用户',
        type: 'button',
        sort: 11,
      },
    }),
    prisma.permission.upsert({
      where: { code: 'user:edit' },
      update: {},
      create: {
        code: 'user:edit',
        name: '编辑用户',
        type: 'button',
        sort: 12,
      },
    }),
    prisma.permission.upsert({
      where: { code: 'user:delete' },
      update: {},
      create: {
        code: 'user:delete',
        name: '删除用户',
        type: 'button',
        sort: 13,
      },
    }),
    // 销售管理
    prisma.permission.upsert({
      where: { code: 'sales:list' },
      update: {},
      create: {
        code: 'sales:list',
        name: '销售管理',
        type: 'menu',
        path: '/sales',
        sort: 20,
      },
    }),
    // 采购管理
    prisma.permission.upsert({
      where: { code: 'purchase:list' },
      update: {},
      create: {
        code: 'purchase:list',
        name: '采购管理',
        type: 'menu',
        path: '/purchase',
        sort: 30,
      },
    }),
    // 库存管理
    prisma.permission.upsert({
      where: { code: 'inventory:list' },
      update: {},
      create: {
        code: 'inventory:list',
        name: '库存管理',
        type: 'menu',
        path: '/inventory',
        sort: 40,
      },
    }),
    // 财务管理
    prisma.permission.upsert({
      where: { code: 'finance:list' },
      update: {},
      create: {
        code: 'finance:list',
        name: '财务管理',
        type: 'menu',
        path: '/finance',
        sort: 50,
      },
    }),
  ]);

  // 2. 创建角色
  console.log('创建角色...');
  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: {},
    create: {
      code: 'admin',
      name: '超级管理员',
      description: '拥有所有权限的超级管理员角色',
    },
  });

  const userRole = await prisma.role.upsert({
    where: { code: 'user' },
    update: {},
    create: {
      code: 'user',
      name: '普通用户',
      description: '普通用户角色，拥有基本权限',
    },
  });

  const guestRole = await prisma.role.upsert({
    where: { code: 'guest' },
    update: {},
    create: {
      code: 'guest',
      name: '游客',
      description: '游客角色，拥有只读权限',
    },
  });

  // 3. 分配权限给管理员角色
  console.log('分配权限...');
  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  // 给普通用户分配基本权限
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: userRole.id,
        permissionId: permissions[0].id, // dashboard:view
      },
    },
    update: {},
    create: {
      roleId: userRole.id,
      permissionId: permissions[0].id,
    },
  });

  // 给游客角色分配基本权限（仅查看仪表盘）
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: guestRole.id,
        permissionId: permissions[0].id, // dashboard:view
      },
    },
    update: {},
    create: {
      roleId: guestRole.id,
      permissionId: permissions[0].id,
    },
  });

  // 4. 创建用户
  console.log('创建用户...');
  const adminPassword = await hashPassword('admin123');
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      nickname: '管理员',
      email: 'admin@example.com',
      phone: '13800138000',
      roleId: adminRole.id,
      status: 'active',
    },
  });

  const guestPassword = await hashPassword('guest');
  await prisma.user.upsert({
    where: { username: 'guest' },
    update: {},
    create: {
      username: 'guest',
      password: guestPassword,
      nickname: '游客',
      email: 'guest@example.com',
      phone: '00000000000',
      roleId: guestRole.id,
      status: 'active',
    },
  });

  // 5. 创建字典类型和字典
  console.log('创建字典...');
  const orderStatusType = await prisma.dictType.upsert({
    where: { code: 'order_status' },
    update: {},
    create: {
      code: 'order_status',
      name: '订单状态',
      description: '订单状态字典类型',
      status: 'active',
    },
  });

  await Promise.all([
    prisma.dict.upsert({
      where: {
        typeId_code: {
          typeId: orderStatusType.id,
          code: 'draft',
        },
      },
      update: {},
      create: {
        typeId: orderStatusType.id,
        code: 'draft',
        label: '草稿',
        value: '1',
        sort: 1,
        status: 'active',
      },
    }),
    prisma.dict.upsert({
      where: {
        typeId_code: {
          typeId: orderStatusType.id,
          code: 'pending',
        },
      },
      update: {},
      create: {
        typeId: orderStatusType.id,
        code: 'pending',
        label: '待审核',
        value: '2',
        sort: 2,
        status: 'active',
      },
    }),
    prisma.dict.upsert({
      where: {
        typeId_code: {
          typeId: orderStatusType.id,
          code: 'approved',
        },
      },
      update: {},
      create: {
        typeId: orderStatusType.id,
        code: 'approved',
        label: '已审核',
        value: '3',
        sort: 3,
        status: 'active',
      },
    }),
  ]);

  console.log('数据库初始化完成！');
  console.log('默认账号:');
  console.log('  管理员: admin / admin123');
  console.log('  游客: guest / guest');
  console.log('提示: 普通用户可通过注册功能创建账号');
}

main()
  .catch((e) => {
    console.error('初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


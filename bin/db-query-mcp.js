#!/usr/bin/env node

/**
 * MCP数据库查询工具全局命令行入口（只读模式）
 */

// 显示帮助信息
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
MCP数据库查询工具（只读模式）

用法:
  db-query-mcp [选项]

选项:
  -h, --help     显示帮助信息
  -v, --version  显示版本信息

描述:
  一个通过Model Context Protocol提供多种数据库只读查询功能的服务。
  仅允许执行SELECT、SHOW等只读SQL操作，禁止修改数据的操作。

工具:
  query_mysql       执行MySQL数据库查询
  query_postgresql 执行PostgreSQL数据库查询
  query_mssql      执行MSSQL数据库查询
  query_oracle     执行Oracle数据库查询

安全特性:
  - 自动阻止INSERT、UPDATE、DELETE、DROP等写操作
  - 仅支持查询操作，确保数据库安全

配置:
  可以通过环境变量配置数据库连接和其他选项。
  复制 .env.example 文件为 .env 并修改其中的值。

示例:
  db-query-mcp
  `);
  process.exit(0);
}

// 显示版本信息
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const packageInfo = require('../package.json');
  console.log(packageInfo.version);
  process.exit(0);
}

const { runServer } = require('../mcp-server');

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 启动服务
runServer().catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});

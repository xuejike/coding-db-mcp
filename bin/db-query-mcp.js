#!/usr/bin/env node

/**
 * MCP数据库查询工具全局命令行入口（只读模式）
 */

// 加载环境变量
require('dotenv').config();

const { Server: McpServer } = require("@modelcontextprotocol/sdk/server");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const DatabaseQueryTool = require("../db-query-tool");
const config = require("../mcp.full.config.js");

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
  一个通过Model Context Protocol提供MySQL数据库只读查询功能的服务。
  仅允许执行SELECT、SHOW等只读SQL操作，禁止修改数据的操作。

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

// 创建数据库查询工具实例
const dbTool = new DatabaseQueryTool();

// 创建MCP服务
const server = new McpServer(
  {
    name: config.service.name,
    version: config.service.version,
  },
  {
    capabilities: config.capabilities,
    instructions: config.instructions
  }
);

// 注册工具调用处理器
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === config.tools.query_database.name) {
    try {
      const result = await dbTool.execute(request.params.arguments);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: error.message
          }, null, 2),
        }],
        isError: true
      };
    }
  } else {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

// 注册工具列表请求处理器
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [config.tools.query_database]
  };
});

// 启动服务
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // 只在stderr上输出日志信息，避免干扰MCP协议通信
  console.error("MCP数据库查询服务已启动（只读模式）");
  
  // 发送工具列表变更通知
  await server.sendToolListChanged();
}

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
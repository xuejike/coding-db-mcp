/**
 * MCP数据库查询服务
 * 通过stdio与MCP客户端通信
 */

// 加载环境变量
require('dotenv').config();

const { Server: McpServer } = require("@modelcontextprotocol/sdk/server");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const DatabaseQueryTool = require("./db-query-tool");
const config = require("./mcp.full.config.js");

function getTools() {
  return [
    config.tools.query_mysql,
    config.tools.query_postgresql,
    config.tools.query_mssql,
    config.tools.query_oracle
  ];
}

async function callDatabaseTool(dbTool, toolName, toolArguments) {
  switch (toolName) {
    case config.tools.query_mysql.name:
      return await dbTool.executeMySQL(toolArguments);
    case config.tools.query_postgresql.name:
      return await dbTool.executePostgreSQL(toolArguments);
    case config.tools.query_mssql.name:
      return await dbTool.executeMSSQL(toolArguments);
    case config.tools.query_oracle.name:
      return await dbTool.executeOracle(toolArguments);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function createServer() {
  const dbTool = new DatabaseQueryTool();
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
    try {
      const result = await callDatabaseTool(
        dbTool,
        request.params.name,
        request.params.arguments
      );

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
  });

  // 注册工具列表请求处理器
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getTools()
    };
  });

  return server;
}

// 启动服务
async function runServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP数据库查询服务已启动");

  // 发送工具列表变更通知
  await server.sendToolListChanged();
}

if (require.main === module) {
  runServer().catch((error) => {
    console.error('服务启动失败:', error);
    process.exit(1);
  });
}

module.exports = {
  callDatabaseTool,
  createServer,
  getTools,
  runServer
};

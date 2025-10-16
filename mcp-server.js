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
  try {
    let result;
    
    switch (request.params.name) {
      case config.tools.query_mysql.name:
        result = await dbTool.executeMySQL(request.params.arguments);
        break;
        
      case config.tools.query_postgresql.name:
        result = await dbTool.executePostgreSQL(request.params.arguments);
        break;
        
      case config.tools.query_mssql.name:
        result = await dbTool.executeMSSQL(request.params.arguments);
        break;
        
      case config.tools.query_oracle.name:
        result = await dbTool.executeOracle(request.params.arguments);
        break;
        
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
    
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
    tools: [
      config.tools.query_mysql,
      config.tools.query_postgresql,
      config.tools.query_mssql,
      config.tools.query_oracle
    ]
  };
});

// 启动服务
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP数据库查询服务已启动");
  
  // 发送工具列表变更通知
  await server.sendToolListChanged();
}

runServer().catch(console.error);
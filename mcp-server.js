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
const JenkinsTool = require("./lib/jenkins-tool");
const { resolveJenkinsArguments } = require("./lib/resolve-jenkins-arguments");
const LogQueryTool = require("./lib/log-query-tool");
const { resolveLogArguments } = require("./lib/resolve-log-arguments");
const config = require("./mcp.full.config.js");

// 创建数据库查询工具实例
const dbTool = new DatabaseQueryTool();

// 创建 Jenkins 工具实例
const jenkinsTool = new JenkinsTool();

// 创建日志查询工具实例
const logTool = new LogQueryTool();

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

      // Jenkins CI/CD 工具
      case config.tools.jenkins_list_jobs.name:
        result = await jenkinsTool.listJobs(resolveJenkinsArguments(request.params.arguments));
        break;

      case config.tools.jenkins_build_job.name:
        result = await jenkinsTool.buildJob(resolveJenkinsArguments(request.params.arguments));
        break;

      case config.tools.jenkins_get_build_log.name:
        result = await jenkinsTool.getBuildLog(resolveJenkinsArguments(request.params.arguments));
        break;

      case config.tools.jenkins_get_job_info.name:
        result = await jenkinsTool.getJobInfo(resolveJenkinsArguments(request.params.arguments));
        break;

      // 日志查询工具
      case config.tools.query_loki.name: {
        const resolvedArgs = resolveLogArguments(request.params.arguments);
        resolvedArgs.type = 'loki';
        result = await logTool.execute(resolvedArgs);
        break;
      }

      case config.tools.query_elasticsearch.name: {
        const resolvedArgs = resolveLogArguments(request.params.arguments);
        resolvedArgs.type = 'elasticsearch';
        result = await logTool.execute(resolvedArgs);
        break;
      }

      case config.tools.query_log_metadata.name: {
        const resolvedArgs = resolveLogArguments(request.params.arguments);
        result = await logTool.queryMetadata(resolvedArgs);
        break;
      }
        
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
      config.tools.query_oracle,
      config.tools.jenkins_list_jobs,
      config.tools.jenkins_build_job,
      config.tools.jenkins_get_build_log,
      config.tools.jenkins_get_job_info,
      config.tools.query_loki,
      config.tools.query_elasticsearch,
      config.tools.query_log_metadata
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
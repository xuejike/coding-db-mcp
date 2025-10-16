/**
 * MCP服务配置文件
 */

module.exports = {
  service: {
    name: "database-query-service",
    version: "1.0.0",
    description: "MCP service for querying MySQL databases"
  },
  tools: {
    query_database: {
      name: "query_database",
      description: "执行MySQL数据库查询",
      inputSchema: {
        type: "object",
        properties: {
          host: { 
            type: "string", 
            description: "数据库主机地址" 
          },
          port: { 
            type: "integer", 
            description: "数据库端口" 
          },
          user: { 
            type: "string", 
            description: "数据库用户名" 
          },
          pwd: { 
            type: "string", 
            description: "数据库密码" 
          },
          db: { 
            type: "string", 
            description: "数据库名称" 
          },
          querySql: { 
            type: "string", 
            description: "要执行的SQL查询语句" 
          }
        },
        required: ["host", "port", "user", "pwd", "db", "querySql"]
      }
    }
  }
};
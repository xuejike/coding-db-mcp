/**
 * 完整的MCP服务配置文件
 * 包含所有可用的配置选项和功能
 */

module.exports = {
  // 服务基本信息
  service: {
    name: "database-query-service",
    version: "1.0.0",
    description: "MCP service for querying multiple types of databases (MySQL, PostgreSQL, MSSQL, Oracle)"
  },

  // 服务功能配置
  capabilities: {
    tools: {
      enabled: true
    },
    resources: {
      enabled: false
    },
    prompts: {
      enabled: false
    },
    logging: {
      enabled: true,
      defaultLevel: "info"
    }
  },

  // 工具定义
  tools: {
    query_mysql: {
      name: "query_mysql",
      description: "执行MySQL数据库查询（只读模式）",
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
            description: "要执行的SQL查询语句（仅支持SELECT等只读操作）" 
          }
        },
        required: ["host", "port", "user", "pwd", "db", "querySql"]
      },
      annotations: {
        title: "MySQL数据库查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    
    query_postgresql: {
      name: "query_postgresql",
      description: "执行PostgreSQL数据库查询（只读模式）",
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
            description: "要执行的SQL查询语句（仅支持SELECT等只读操作）" 
          }
        },
        required: ["host", "port", "user", "pwd", "db", "querySql"]
      },
      annotations: {
        title: "PostgreSQL数据库查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    
    query_mssql: {
      name: "query_mssql",
      description: "执行MSSQL数据库查询（只读模式）",
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
            description: "要执行的SQL查询语句（仅支持SELECT等只读操作）" 
          }
        },
        required: ["host", "port", "user", "pwd", "db", "querySql"]
      },
      annotations: {
        title: "MSSQL数据库查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    
    query_oracle: {
      name: "query_oracle",
      description: "执行Oracle数据库查询（只读模式）",
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
            description: "要执行的SQL查询语句（仅支持SELECT等只读操作）" 
          }
        },
        required: ["host", "port", "user", "pwd", "db", "querySql"]
      },
      annotations: {
        title: "Oracle数据库查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      }
    }
  },

  // 服务使用说明
  instructions: "这是一个只读的数据库查询服务。用户可以使用不同的数据库查询工具连接相应类型的数据库（MySQL、PostgreSQL、MSSQL、Oracle）并执行SELECT等只读SQL查询。禁止执行INSERT、UPDATE、DELETE、DROP等修改数据的操作。",

  // 环境变量配置
  environmentVariables: {
    DB_HOST: {
      description: "默认数据库主机地址",
      required: false
    },
    DB_PORT: {
      description: "默认数据库端口",
      required: false
    },
    DB_USER: {
      description: "默认数据库用户名",
      required: false
    },
    DB_PASSWORD: {
      description: "默认数据库密码",
      required: false
    },
    DB_NAME: {
      description: "默认数据库名称",
      required: false
    },
    DB_TYPE: {
      description: "默认数据库类型",
      required: false
    }
  },

  // 安全配置
  security: {
    // 启用只读模式，防止执行修改数据的SQL语句
    readOnlyMode: true,
    // 是否启用查询超时
    enableQueryTimeout: true,
    // 查询超时时间（毫秒）
    queryTimeout: 30000,
    // 是否记录查询日志
    logQueries: true
  },

  // 性能配置
  performance: {
    // 最大连接数
    maxConnections: 10,
    // 连接池配置
    connectionPool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      createRetryIntervalMillis: 200
    }
  }
};
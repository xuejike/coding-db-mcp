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
    },

    // Jenkins CI/CD 集成工具
    jenkins_list_jobs: {
      name: "jenkins_list_jobs",
      description: "获取 Jenkins 所有 Job 列表",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "Jenkins 连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Jenkins 服务器地址，如 http://jenkins.example.com:8080" },
          user: { type: "string", description: "Jenkins 用户名" },
          token: { type: "string", description: "Jenkins API Token" }
        },
        required: []
      },
      annotations: {
        title: "Jenkins Job 列表查询",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },

    jenkins_build_job: {
      name: "jenkins_build_job",
      description: "启动 Jenkins Job 构建",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "Jenkins 连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Jenkins 服务器地址" },
          user: { type: "string", description: "Jenkins 用户名" },
          token: { type: "string", description: "Jenkins API Token" },
          jobName: { type: "string", description: "要构建的 Job 名称" },
          parameters: { type: "object", description: "构建参数（键值对，可选）" }
        },
        required: ["jobName"]
      },
      annotations: {
        title: "Jenkins Job 构建触发",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },

    jenkins_get_build_log: {
      name: "jenkins_get_build_log",
      description: "获取 Jenkins 构建日志",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "Jenkins 连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Jenkins 服务器地址" },
          user: { type: "string", description: "Jenkins 用户名" },
          token: { type: "string", description: "Jenkins API Token" },
          jobName: { type: "string", description: "Job 名称" },
          buildNumber: { type: ["integer", "string"], description: "构建号（默认 lastBuild）" }
        },
        required: ["jobName"]
      },
      annotations: {
        title: "Jenkins 构建日志查询",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },

    jenkins_get_job_info: {
      name: "jenkins_get_job_info",
      description: "获取 Jenkins Job 详细信息（参数定义、最近构建状态等），用于了解 Job 配置和所需构建参数",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "Jenkins 连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Jenkins 服务器地址" },
          user: { type: "string", description: "Jenkins 用户名" },
          token: { type: "string", description: "Jenkins API Token" },
          jobName: { type: "string", description: "Job 名称（支持嵌套路径如 folder/subfolder/job）" }
        },
        required: ["jobName"]
      },
      annotations: {
        title: "Jenkins Job 信息查询",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },

    // 日志查询工具
    query_loki: {
      name: "query_loki",
      description: "执行 Loki 日志查询（只读模式），支持 LogQL 查询表达式",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "日志平台连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Loki 服务地址" },
          user: { type: "string", description: "认证用户名" },
          pwd: { type: "string", description: "认证密码/Token" },
          query: { type: "string", description: "LogQL 查询表达式" },
          start: { type: "string", description: "起始时间（ISO 8601 或相对时间如 '1h', '30m', '7d'）" },
          end: { type: "string", description: "结束时间（默认 'now'）" },
          limit: { type: "integer", description: "返回行数限制（默认 100，最大 1000）" },
          direction: { type: "string", enum: ["forward", "backward"], description: "排序方向（默认 backward）" }
        },
        required: ["query"]
      },
      annotations: {
        title: "Loki 日志查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },

    query_elasticsearch: {
      name: "query_elasticsearch",
      description: "执行 Elasticsearch 日志查询（只读模式），支持 Query DSL JSON 或纯文本查询",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "日志平台连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "Elasticsearch 服务地址" },
          user: { type: "string", description: "认证用户名" },
          pwd: { type: "string", description: "认证密码/Token" },
          index: { type: "string", description: "ES 索引名/模式（默认 _all）" },
          query: { type: "string", description: "查询表达式（Query DSL JSON 或纯文本）" },
          start: { type: "string", description: "起始时间（ISO 8601 或相对时间如 '1h', '30m', '7d'）" },
          end: { type: "string", description: "结束时间（默认 'now'）" },
          limit: { type: "integer", description: "返回行数限制（默认 100，最大 1000）" }
        },
        required: ["query"]
      },
      annotations: {
        title: "Elasticsearch 日志查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },

    query_log_metadata: {
      name: "query_log_metadata",
      description: "查询日志平台元数据（标签、索引等），AI 可通过此工具了解平台上可用的标签/索引信息以自主构建更精确的查询条件",
      inputSchema: {
        type: "object",
        properties: {
          alias: { type: "string", description: "日志平台连接别名（可选，指定后其他连接参数可省略）" },
          baseUrl: { type: "string", description: "日志平台地址" },
          user: { type: "string", description: "认证用户名" },
          pwd: { type: "string", description: "认证密码/Token" },
          metadataType: {
            type: "string",
            enum: ["labels", "label_values", "series", "indices", "mappings", "field_caps"],
            description: "元数据类型。Loki: labels(标签列表), label_values(标签值), series(流信息)。ES: indices(索引列表), mappings(字段映射), field_caps(字段能力)"
          },
          label: { type: "string", description: "标签名（仅 label_values 类型需要）" },
          match: { type: "string", description: "流选择器（仅 series 类型需要，如 '{app=\"svc\"}'）" },
          index: { type: "string", description: "索引名/模式（ES mappings/field_caps 类型需要）" },
          start: { type: "string", description: "起始时间（可选，用于限制元数据的时间范围）" },
          end: { type: "string", description: "结束时间（可选）" }
        },
        required: ["metadataType"]
      },
      annotations: {
        title: "日志平台元数据查询工具（只读）",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
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
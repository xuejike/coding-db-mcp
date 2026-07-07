# 实现计划: 日志查询模块 (log-query-module)

## 概述

为 `@xuejike/develop-tool` 项目新增多平台日志查询功能，支持 Loki 和 Elasticsearch 日志平台。模块复用现有 ConfigManager 别名配置体系，支持 CLI 和 MCP 两种调用模式，并提供元数据查询能力供 AI 自主构建精确的日志过滤条件。

## 任务

- [x] 1. 扩展 ConfigManager 支持日志平台类型
  - [x] 1.1 修改 `lib/config-manager.js`，在 VALID_TYPES 中新增 `'loki'` 和 `'elasticsearch'` 类型
    - 新增 `VALID_LOG_TYPES = ['loki', 'elasticsearch']` 常量
    - 更新 `VALID_TYPES` 数组包含日志平台类型
    - 新增 `REQUIRED_LOG_FIELDS = ['type', 'baseUrl']` 常量（user/pwd 可选）
    - 修改 addConnection 方法，对日志类型使用 REQUIRED_LOG_FIELDS 校验
    - 修改 resolveAlias 方法，对日志类型返回 `{type, baseUrl, user, pwd}` 格式（含额外字段如 orgId、index）
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.2 编写 ConfigManager 日志类型单元测试
    - 测试添加 loki 类型配置成功
    - 测试添加 elasticsearch 类型配置成功
    - 测试缺少 baseUrl 时拒绝添加
    - 测试无 user/pwd 的无认证模式
    - 测试 resolveAlias 返回正确的日志配置格式
    - _Requirements: 1.1, 1.2, 1.4, 1.5_

  - [ ]* 1.3 编写 ConfigManager 日志类型属性测试
    - **Property 1**: 日志配置保存/解析往返一致性
    - **Property 2**: 缺少必填字段时拒绝添加
    - **Property 3**: 密码不以明文存储
    - _Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. 实现日志参数解析模块
  - [x] 2.1 创建 `lib/resolve-log-arguments.js`，实现 `resolveLogArguments` 函数
    - 无 alias 时验证 baseUrl 必填
    - 有 alias 时通过 ConfigManager 解析日志类型配置
    - 直接参数可覆盖 alias 配置中的字段
    - 合并别名配置中的额外字段（orgId、index）
    - 查询参数（query、start、end、limit）原样传递
    - 返回完整的日志查询配置对象
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 编写 resolve-log-arguments 单元测试
    - 测试别名模式参数解析
    - 测试直接参数模式
    - 测试直接参数覆盖别名配置
    - 测试缺少 alias 和 baseUrl 时报错
    - 测试额外字段合并（orgId、index）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.3 编写 resolve-log-arguments 属性测试
    - **Property 5**: 直接参数覆盖别名配置
    - **Property 6**: 查询参数原样传递
    - _Validates: Requirements 4.2, 4.4, 4.5_

- [x] 3. 实现 LogQueryTool 核心模块
  - [x] 3.1 创建 `lib/log-query-tool.js`，实现 LogQueryTool 类骨架
    - 实现 `execute(config)` 分发方法
    - 实现 `parseTime(timeStr)` 时间解析（支持 "now"、相对时间、ISO 8601）
    - 实现 `buildAuthHeaders(user, pwd, orgId)` 认证头构造
    - 实现 `httpGet(url, params, headers)` HTTP GET 请求封装
    - 实现 `httpPost(url, body, headers)` HTTP POST 请求封装
    - 实现 `buildResult(entries, platform, limit)` 结果构建
    - 定义 `MAX_LOG_LIMIT = 1000` 常量和 `QUERY_TIMEOUT = 30000` 常量
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 8.1, 8.2, 8.3, 8.4, 11.1, 11.2_

  - [x] 3.2 实现 `executeLoki(config)` 方法
    - 构建 Loki query_range API 请求（GET /loki/api/v1/query_range）
    - 解析时间参数为纳秒时间戳
    - 限制 limit 在 [1, MAX_LOG_LIMIT] 范围
    - 解析 Loki 响应中的日志流数据
    - 调用 formatAsMarkdown 格式化结果
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 实现 `executeElasticsearch(config)` 方法
    - 构建 ES _search API 请求（POST /{index}/_search）
    - 构建 ES 查询 DSL（含时间范围过滤）
    - 限制 limit（size）在 [1, MAX_LOG_LIMIT] 范围
    - 解析 ES 响应中的 hits 文档数据
    - 调用 formatAsMarkdown 格式化结果
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.4 实现 `formatAsMarkdown(entries, type)` 格式化方法
    - Loki 格式: | 时间 | 标签 | 内容 | 的 Markdown 表格
    - ES 格式: 根据文档字段动态生成 Markdown 表格
    - 处理空结果和截断警告
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.5 实现错误处理逻辑
    - 连接失败返回 CONNECTION_ERROR
    - HTTP 401/403 返回 AUTH_ERROR
    - 平台返回查询语法错误返回 QUERY_SYNTAX_ERROR
    - 超时返回 TIMEOUT
    - 索引/标签不存在返回 NOT_FOUND
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 3.6 编写 LogQueryTool 单元测试
    - 测试 parseTime 各种格式（now、相对时间、ISO 8601、无效格式）
    - 测试 formatAsMarkdown Loki 和 ES 两种格式
    - 测试 limit 钳位逻辑
    - 测试 execute 分发到正确的平台方法
    - Mock HTTP 层测试 executeLoki 和 executeElasticsearch 完整流程
    - 测试各错误场景的错误码和错误信息
    - _Requirements: 2.1-2.6, 3.1-3.5, 8.1-8.4, 9.1-9.4, 10.1-10.5_

  - [ ]* 3.7 编写 LogQueryTool 属性测试
    - **Property 4**: 行数限制钳位到 [1, 1000]
    - **Property 7**: 相对时间解析产生有效纳秒时间戳
    - **Property 8**: ISO 8601 时间解析往返
    - **Property 9**: 无效时间格式抛出错误
    - **Property 10**: Markdown 格式化包含所有日志条目内容
    - **Property 11**: 成功结果结构不变量
    - **Property 12**: 达到 limit 上限时附加截断警告
    - **Property 14**: Loki 查询仅使用 GET 方法
    - **Property 15**: ES 查询使用 POST _search
    - _Validates: Requirements 2.2-2.5, 3.4, 3.5, 8.2-8.4, 9.1-9.4, 11.1, 11.2_

- [x] 4. 实现元数据查询功能
  - [x] 4.1 实现 `queryMetadata(config)` 分发方法
    - 验证 metadataType 合法性
    - 根据 type 分发到 queryLokiMetadata 或 queryEsMetadata
    - 无效类型返回描述性错误
    - _Requirements: 5.7, 5.8_

  - [x] 4.2 实现 `queryLokiMetadata(config)` 方法
    - labels: GET /loki/api/v1/labels
    - label_values: GET /loki/api/v1/label/{label}/values（需要 label 参数）
    - series: GET /loki/api/v1/series（需要 match 参数）
    - 返回 {success, platform, metadataType, data, markdown}
    - _Requirements: 5.1, 5.2, 5.3, 5.8_

  - [x] 4.3 实现 `queryEsMetadata(config)` 方法
    - indices: GET /_cat/indices?format=json
    - mappings: GET /{index}/_mapping（需要 index 参数）
    - field_caps: GET /{index}/_field_caps?fields=*
    - 返回 {success, platform, metadataType, data, markdown}
    - _Requirements: 5.4, 5.5, 5.6, 5.8_

  - [x] 4.4 实现 `formatMetadataAsMarkdown(data, platform, metadataType, options)` 方法
    - 各元数据类型生成对应的 Markdown 格式展示
    - labels → 列表格式
    - indices → 表格格式（索引名、文档数、大小）
    - mappings → 表格格式（字段名、类型）
    - _Requirements: 5.8_

  - [x] 4.5 编写元数据查询单元测试
    - Mock HTTP 测试 Loki 三种元数据查询
    - Mock HTTP 测试 ES 三种元数据查询
    - 测试无效 metadataType 的错误返回
    - 测试缺少必要参数（label_values 缺 label、series 缺 match）的错误
    - _Requirements: 5.1-5.8_

  - [ ]* 4.6 编写元数据查询属性测试
    - **Property 13**: 无效元数据类型返回描述性错误
    - **Property 11**: 成功结果包含 data 和 markdown 字段
    - _Validates: Requirements 5.7, 5.8_

- [x] 5. 检查点 - 确保核心模块测试通过
  - 运行所有单元测试和属性测试，确保通过。如有问题请询问用户。

- [x] 6. MCP 工具注册与集成
  - [x] 6.1 在 `mcp.full.config.js` 中添加日志查询工具定义
    - 添加 `query_loki` 工具定义（readOnlyHint: true）
    - 添加 `query_elasticsearch` 工具定义（readOnlyHint: true）
    - 添加 `query_log_metadata` 工具定义（readOnlyHint: true）
    - 每个工具的 inputSchema 包含 alias（可选）和各自参数
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 6.2 修改 `mcp-server.js` 注册日志查询工具处理器
    - 在 CallToolRequestSchema 中添加 query_loki、query_elasticsearch、query_log_metadata 的 case 分支
    - 调用 resolveLogArguments 解析参数
    - 调用 LogQueryTool 对应方法执行操作
    - 响应封装为 MCP text content 格式
    - 在 ListToolsRequestSchema 中添加三个新工具
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.3 修改 `bin/develop-tool.js` 中 `startMcpServer` 函数（如有独立注册逻辑）
    - 确保 MCP 模式下日志查询工具正确注册
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. 实现 CLI log 子命令
  - [x] 7.1 在 `bin/develop-tool.js` 中扩展命令解析，支持 `log` 命令和子命令
    - 解析 `log query` - 执行日志查询
    - 解析 `log metadata` - 查询元数据
    - 支持 `--alias`、`--base-url`、`--user`、`--password`、`--password-stdin` 连接参数
    - 支持 `-q/--query`、`--start`、`--end`、`--limit`、`--direction`、`--index`、`--type` 查询参数
    - 支持 `--metadata-type`、`--label`、`--match` 元数据参数
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 7.2 实现 `handleLogQuery(options)` 处理逻辑
    - 验证 query 参数必填
    - 调用 resolveLogArguments 解析连接参数
    - 调用 LogQueryTool.execute 执行查询
    - 成功时输出 markdown 结果和行数统计
    - 失败时输出错误到 stderr 并 exit(1)
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [x] 7.3 实现 `handleLogMetadata(options)` 处理逻辑
    - 验证 metadata-type 参数必填
    - 调用 resolveLogArguments 解析连接参数
    - 调用 LogQueryTool.queryMetadata 执行元数据查询
    - 输出 markdown 格式的元数据结果
    - _Requirements: 7.3_

  - [x] 7.4 扩展 CLI `config add` 支持日志平台类型配置
    - 当 `--type loki` 或 `--type elasticsearch` 时，接受 `--base-url` 参数（必填）
    - 接受可选的 `--user`、`--password`、`--org-id`、`--index` 参数
    - 调用 ConfigManager.addConnection 保存日志平台连接配置
    - _Requirements: 1.1_

  - [x] 7.5 更新帮助信息
    - 添加 `log query` 命令说明和用法示例
    - 添加 `log metadata` 命令说明和用法示例
    - 添加 `config add` 日志平台类型的示例
    - _Requirements: 7.1, 7.3_

  - [x] 7.6 编写 CLI log 子命令单元测试
    - 测试参数解析（log query / log metadata 各参数）
    - 测试缺少 query 参数时的错误输出
    - 测试 --alias 参数解析
    - Mock LogQueryTool 测试完整流程
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. 最终检查点 - 确保所有测试通过
  - 运行全部测试，确保核心模块、MCP 集成、CLI 命令均正常工作。如有问题请询问用户。

## 备注

- 标记 `*` 的子任务为可选属性测试任务，可跳过以加速 MVP
- 每个任务引用了对应的需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试使用 fast-check 库验证设计文档中定义的正确性属性
- 项目使用 JavaScript (Node.js)，使用内置 http/https 模块避免引入额外 HTTP 依赖
- CLI 和 MCP 两种模式共用同一个 LogQueryTool 核心类和 resolveLogArguments 解析逻辑
- 所有日志查询操作为只读，不修改远端数据

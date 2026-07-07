# 需求文档

## 简介

为 `@xuejike/develop-tool` 项目新增日志查询模块，支持 Loki 和 Elasticsearch 等主流日志平台的日志查询和元数据查询功能。模块复用现有 ConfigManager 别名配置体系，用户通过 `config add` 添加日志平台连接信息（指定平台类型和连接参数），查询时通过别名即可快速检索日志。同时支持 CLI 模式和 MCP 模式两种调用方式，AI 可通过元数据查询自主构建精确的过滤条件。

## 术语表

- **LogQueryTool**: 日志查询工具类，负责与日志平台的 HTTP 通信、查询执行和结果格式化
- **ConfigManager**: 配置管理器，负责配置文件的加载、解析、验证和持久化（已有组件，本模块扩展）
- **Alias（别名）**: 日志平台连接配置的唯一标识符，用于引用预存的连接信息
- **Loki**: Grafana Loki 日志聚合平台，使用 LogQL 查询语言
- **Elasticsearch**: 分布式搜索引擎，使用 Query DSL 查询日志
- **LogQL**: Loki 的日志查询语言
- **Query_DSL**: Elasticsearch 的 JSON 格式查询语法
- **MCP_Server**: MCP 协议服务端，通过 stdio 与 AI 客户端通信
- **CLI**: 命令行接口，即 `develop-tool` 命令行工具
- **元数据（Metadata）**: 日志平台中的标签、索引、字段映射等描述性信息
- **MAX_LOG_LIMIT**: 单次查询最大返回日志条数限制（1000）

## 需求

### 需求 1: 日志平台配置管理

**用户故事:** 作为开发者，我希望能添加和管理日志平台的连接配置，这样我可以通过别名快速引用不同环境的日志平台。

#### 验收标准

1. WHEN 用户通过 `config add` 命令添加类型为 `loki` 或 `elasticsearch` 的连接配置, THE ConfigManager SHALL 验证并保存该配置到指定的配置文件中
2. WHEN 用户提供的日志平台配置缺少必填字段 `type` 或 `baseUrl`, THEN THE ConfigManager SHALL 拒绝添加并列出缺少的字段
3. WHEN 用户提供日志平台配置中包含 `pwd` 字段, THE ConfigManager SHALL 使用现有加密模块加密后存储
4. WHEN 用户提供日志平台配置中未包含 `user` 和 `pwd` 字段, THE ConfigManager SHALL 正常保存配置（支持无认证模式）
5. WHEN 通过 `resolveAlias` 解析日志类型别名, THE ConfigManager SHALL 返回包含 `type`、`baseUrl`、`user`、`pwd` 的配置对象

### 需求 2: Loki 日志查询

**用户故事:** 作为开发者，我希望通过 LogQL 表达式查询 Loki 日志平台的数据，这样我可以快速定位生产环境的问题。

#### 验收标准

1. WHEN 用户提供有效的 LogQL 查询表达式和连接信息, THE LogQueryTool SHALL 通过 HTTP GET 请求 Loki query_range API 并返回日志结果
2. WHEN 用户提供相对时间格式（如 "1h"、"30m"、"7d"）, THE LogQueryTool SHALL 将其解析为对应的纳秒时间戳
3. WHEN 用户未指定 limit 参数, THE LogQueryTool SHALL 使用默认值 100
4. WHEN 用户指定的 limit 超过 MAX_LOG_LIMIT, THE LogQueryTool SHALL 将其限制为 MAX_LOG_LIMIT 的值
5. WHEN Loki API 返回成功响应, THE LogQueryTool SHALL 将日志条目格式化为 Markdown 表格并返回
6. WHEN 用户未指定 direction 参数, THE LogQueryTool SHALL 使用默认值 "backward"（最新日志优先）

### 需求 3: Elasticsearch 日志查询

**用户故事:** 作为开发者，我希望通过 Query DSL 查询 Elasticsearch 中的日志数据，这样我可以利用 ES 的全文检索能力分析日志。

#### 验收标准

1. WHEN 用户提供有效的 Query DSL JSON 和连接信息, THE LogQueryTool SHALL 通过 HTTP POST 请求 ES _search API 并返回日志结果
2. WHEN 用户提供索引模式（index pattern）, THE LogQueryTool SHALL 在指定索引上执行查询
3. WHEN 用户未指定索引, THE LogQueryTool SHALL 使用 `_all` 作为默认查询目标
4. WHEN 用户指定的 limit 超过 MAX_LOG_LIMIT, THE LogQueryTool SHALL 将其限制为 MAX_LOG_LIMIT 的值
5. WHEN ES API 返回成功响应, THE LogQueryTool SHALL 将文档格式化为 Markdown 表格并返回

### 需求 4: 参数解析与别名支持

**用户故事:** 作为开发者，我希望通过别名引用预配置的日志平台连接，这样我不需要每次查询都输入完整的连接参数。

#### 验收标准

1. WHEN 用户传入有效的 alias 参数, THE resolveLogArguments SHALL 从 ConfigManager 解析出完整的日志平台连接配置
2. WHEN 用户同时传入 alias 和直接连接参数, THE resolveLogArguments SHALL 以直接参数覆盖 alias 配置中的对应字段
3. WHEN 用户未传入 alias 且未提供 baseUrl, THEN THE resolveLogArguments SHALL 抛出包含提示信息的错误
4. WHEN alias 配置中包含额外字段（如 orgId、index）, THE resolveLogArguments SHALL 将其合并到最终配置中
5. THE resolveLogArguments SHALL 将查询参数（query、start、end、limit）原样传递不做修改

### 需求 5: 日志平台元数据查询

**用户故事:** 作为 AI 助手，我希望能查询日志平台的元数据（标签、索引等），这样我可以自主了解平台上可用的信息并构建更精确的查询条件。

#### 验收标准

1. WHEN 请求 Loki 平台的 `labels` 元数据类型, THE LogQueryTool SHALL 通过 GET /loki/api/v1/labels 返回所有可用标签名列表
2. WHEN 请求 Loki 平台的 `label_values` 元数据类型并提供 label 参数, THE LogQueryTool SHALL 返回该标签的所有可用值
3. WHEN 请求 Loki 平台的 `series` 元数据类型并提供 match 参数, THE LogQueryTool SHALL 返回匹配的日志流信息
4. WHEN 请求 Elasticsearch 平台的 `indices` 元数据类型, THE LogQueryTool SHALL 返回索引列表及其文档数和大小信息
5. WHEN 请求 Elasticsearch 平台的 `mappings` 元数据类型并提供 index 参数, THE LogQueryTool SHALL 返回该索引的字段映射
6. WHEN 请求 Elasticsearch 平台的 `field_caps` 元数据类型, THE LogQueryTool SHALL 返回字段能力信息
7. WHEN 请求的 metadataType 不属于对应平台支持的类型, THEN THE LogQueryTool SHALL 返回错误信息并列出该平台支持的元数据类型
8. WHEN 元数据查询成功, THE LogQueryTool SHALL 同时返回结构化数据（data 字段）和 Markdown 格式化展示（markdown 字段）

### 需求 6: MCP 工具注册

**用户故事:** 作为 MCP 客户端（AI），我希望通过 MCP 协议调用日志查询和元数据查询工具，这样我可以在对话中帮助用户分析日志问题。

#### 验收标准

1. THE MCP_Server SHALL 注册 `query_loki` 工具，接受 alias、baseUrl、user、pwd、query、start、end、limit、direction 参数
2. THE MCP_Server SHALL 注册 `query_elasticsearch` 工具，接受 alias、baseUrl、user、pwd、index、query、start、end、limit 参数
3. THE MCP_Server SHALL 注册 `query_log_metadata` 工具，接受 alias、baseUrl、user、pwd、metadataType、label、match、index、start、end 参数
4. WHEN MCP 工具调用成功, THE MCP_Server SHALL 以 Markdown 格式文本返回查询结果
5. WHEN MCP 工具调用失败, THE MCP_Server SHALL 返回包含错误详情的 JSON 对象并标记 isError 为 true

### 需求 7: CLI 日志命令

**用户故事:** 作为开发者，我希望通过命令行直接执行日志查询，这样我可以在终端中快速检索和查看日志。

#### 验收标准

1. WHEN 用户执行 `develop-tool log query` 并提供 alias 和 query 参数, THE CLI SHALL 执行日志查询并将 Markdown 结果输出到终端
2. WHEN 用户执行 `develop-tool log query` 但未提供 query 参数, THEN THE CLI SHALL 输出错误提示并以非零退出码退出
3. WHEN 用户执行 `develop-tool log metadata` 并提供有效的 metadata-type 参数, THE CLI SHALL 执行元数据查询并输出结果
4. WHEN 日志查询成功, THE CLI SHALL 在结果末尾输出行数统计信息
5. WHEN 日志查询失败, THE CLI SHALL 将错误信息输出到 stderr 并以退出码 1 退出

### 需求 8: 时间解析

**用户故事:** 作为开发者，我希望能使用相对时间格式指定查询范围，这样我不需要手动计算具体的时间戳。

#### 验收标准

1. WHEN 时间参数为 "now" 或空值, THE LogQueryTool SHALL 将其解析为当前时间的纳秒时间戳
2. WHEN 时间参数为相对格式（如 "5m"、"1h"、"7d"）, THE LogQueryTool SHALL 将其解析为当前时间减去对应时长的纳秒时间戳
3. WHEN 时间参数为 ISO 8601 格式, THE LogQueryTool SHALL 将其解析为对应的纳秒时间戳
4. WHEN 时间参数格式无效, THEN THE LogQueryTool SHALL 抛出包含支持格式说明的错误

### 需求 9: 结果格式化

**用户故事:** 作为开发者或 AI，我希望查询结果以 Markdown 格式返回，这样无论在终端还是 AI 对话中都能清晰阅读。

#### 验收标准

1. THE LogQueryTool SHALL 将 Loki 日志结果格式化为包含时间、标签、内容列的 Markdown 表格
2. THE LogQueryTool SHALL 将 Elasticsearch 日志结果格式化为 Markdown 表格
3. WHEN 返回的日志条数达到 limit 上限, THE LogQueryTool SHALL 在结果中附加截断警告信息
4. THE LogQueryTool SHALL 在结果对象中包含 success、platform、rowCount、markdown 字段

### 需求 10: 错误处理

**用户故事:** 作为开发者，我希望在日志查询出错时收到清晰的错误信息和错误码，这样我可以快速定位问题。

#### 验收标准

1. WHEN 日志平台连接失败（网络不可达、URL 无效）, THEN THE LogQueryTool SHALL 返回 CONNECTION_ERROR 错误码和平台地址信息
2. WHEN 日志平台返回认证失败（HTTP 401/403）, THEN THE LogQueryTool SHALL 返回 AUTH_ERROR 错误码并提示检查凭证
3. WHEN 查询表达式语法错误, THEN THE LogQueryTool SHALL 返回 QUERY_SYNTAX_ERROR 错误码并包含平台返回的错误详情
4. WHEN 查询超时, THEN THE LogQueryTool SHALL 返回 TIMEOUT 错误码并建议缩小时间范围
5. WHEN 指定的索引或标签不存在, THEN THE LogQueryTool SHALL 返回 NOT_FOUND 错误码

### 需求 11: 只读保证

**用户故事:** 作为系统管理员，我希望日志查询模块仅执行只读操作，这样不会对生产环境的日志平台产生任何副作用。

#### 验收标准

1. THE LogQueryTool SHALL 仅使用 HTTP GET 方法查询 Loki API
2. THE LogQueryTool SHALL 仅使用 HTTP POST 方法访问 Elasticsearch _search API（_search 为只读操作）
3. THE LogQueryTool SHALL 仅使用 HTTP GET 方法执行所有元数据查询
4. THE LogQueryTool SHALL 不暴露任何写入、删除或修改日志数据的接口

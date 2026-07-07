# @xuejike/develop-tool

一个面向 AI Agent 的开发工具，支持只读数据库查询、多平台日志查询和 Jenkins CI/CD 操作，同时支持 MCP（Model Context Protocol）协议接入和 CLI 命令行直接使用。

适用于让 AI Agent（如 Cursor、Kiro、Claude Desktop 等）安全地查询数据库、检索日志（Loki / Elasticsearch）、管理 Jenkins 构建，或在终端中快速执行操作。

## 核心特性

- **只读安全** — 自动拦截 INSERT/UPDATE/DELETE/DROP 等写操作
- **多数据库支持** — MySQL、PostgreSQL、MSSQL、Oracle
- **日志查询** — 支持 Loki（LogQL）和 Elasticsearch（Query DSL）日志平台
- **Jenkins 集成** — 查看 Job 列表、触发构建、查看日志、查看 Job 信息
- **别名配置** — 预存连接信息，一个别名代替一堆参数
- **两层配置** — 用户级（全局）+ 项目级，项目级优先
- **密码加密** — AES-256-GCM 加密存储，配置文件泄露也不暴露密码/Token
- **双模式运行** — MCP stdio 服务（给 Agent 用）或 CLI 命令行（给人用）
- **元数据查询** — AI 可自主查询标签/索引信息以构建精确查询条件
- **嵌套文件夹** — Jenkins Job 支持多级文件夹路径

## 安装

```bash
npm install -g @xuejike/develop-tool
```

或用 npx 免安装运行：

```bash
npx @xuejike/develop-tool
```

### AI Agent 安装配置

复制以下文本发送给 AI，即可让 AI 帮你完成安装配置：

```
请阅读 https://raw.githubusercontent.com/xuejike/coding-db-mcp/refs/heads/master/AI_INSTALL.md 按照其中的指引帮我完成 @xuejike/develop-tool CLI 工具的安装和连接配置。
```

## 快速开始

### 数据库查询

```bash
# 添加数据库连接
develop-tool config add mydb \
  --type mysql \
  --host localhost \
  --port 3306 \
  --user root \
  --password yourpass \
  --database myapp \
  --global

# 执行查询
develop-tool query --alias mydb -q "SELECT * FROM users LIMIT 5"
```

### Jenkins 操作

```bash
# 添加 Jenkins 连接
develop-tool config add my-jenkins \
  --type jenkins \
  --base-url http://jenkins.example.com:8080 \
  --user admin \
  --token your-api-token \
  --global

# 查看 Job 列表
develop-tool jenkins list --alias my-jenkins

# 查看嵌套文件夹下的 Job
develop-tool jenkins list folder/subfolder --alias my-jenkins

# 查看 Job 详情（参数定义等）
develop-tool jenkins info folder/subfolder/my-job --alias my-jenkins

# 触发构建
develop-tool jenkins build folder/subfolder/my-job --alias my-jenkins --param branch=origin/main

# 查看构建日志
develop-tool jenkins log folder/subfolder/my-job --alias my-jenkins --build-number 10
```

### 日志查询

```bash
# 添加 Loki 日志平台配置
develop-tool config add prod-loki \
  --type loki \
  --base-url https://loki.example.com \
  --global

# 添加 Elasticsearch 配置（支持无认证模式）
develop-tool config add local-es \
  --type elasticsearch \
  --base-url http://localhost:9200 \
  --global

# 查询 Loki 日志
develop-tool log query --alias prod-loki -q '{namespace="prod"} |= "error"' --start 1h

# 直接参数模式查询
develop-tool log query --type loki --base-url https://loki.example.com -q '{app="payment"}' --start 30m --limit 50

# 查询 Elasticsearch 日志
develop-tool log query --alias local-es -q '{"match": {"level": "ERROR"}}' --index app-logs-* --start 24h

# 查询元数据 - 获取所有标签
develop-tool log metadata --alias prod-loki --metadata-type labels

# 查询标签的所有值
develop-tool log metadata --alias prod-loki --metadata-type label_values --label app

# 查询 ES 索引列表
develop-tool log metadata --alias local-es --metadata-type indices

# 查询 ES 字段映射
develop-tool log metadata --alias local-es --metadata-type mappings --index app-logs-*
```

### 管理连接

```bash
# 查看所有配置
develop-tool config list

# 查看连接详情
develop-tool config show mydb

# 删除连接
develop-tool config remove mydb --global
```

## 使用场景

### AI Agent 通过 MCP 协议使用

将工具配置为 Agent 的 MCP 服务：

```json
{
  "mcpServers": {
    "develop-tool": {
      "command": "npx",
      "args": ["@xuejike/develop-tool"]
    }
  }
}
```

Agent 可使用以下 MCP 工具：

- `query_mysql` / `query_postgresql` / `query_mssql` / `query_oracle` — 数据库查询
- `query_loki` — Loki 日志查询（LogQL）
- `query_elasticsearch` — Elasticsearch 日志查询（Query DSL）
- `query_log_metadata` — 日志平台元数据查询（标签、索引、字段映射等）
- `jenkins_list_jobs` — 查看 Jenkins Job 列表
- `jenkins_build_job` — 触发 Jenkins 构建
- `jenkins_get_build_log` — 查看构建日志
- `jenkins_get_job_info` — 查看 Job 详情（参数定义）

Agent 调用示例：

```json
{
  "alias": "my-jenkins",
  "jobName": "devops/TKE_CSI_UAT/my-service"
}
```

### 终端快速操作

预配置好连接后，日常操作不用再记各种参数：

```bash
# 数据库查询
develop-tool query --alias prod -q "SELECT * FROM users WHERE id = 100"

# Jenkins 触发构建
develop-tool jenkins build my-job --alias ci --param env=prod
```

## CLI 命令参考

```
develop-tool [命令] [选项]

命令:
  start                    启动 MCP 服务（默认）
  query                    执行 SQL 查询
  log query                执行日志查询（Loki / Elasticsearch）
  log metadata             查询日志平台元数据
  config add <alias>       添加连接配置
  config remove <alias>    删除连接配置
  config list              列出所有连接
  config show <alias>      查看连接详情
  jenkins list [folder]    查看 Jenkins Job 列表
  jenkins build <job>      触发 Jenkins 构建
  jenkins log <job>        查看构建日志
  jenkins info <job>       查看 Job 详情
  test                     测试数据库连接
  help                     显示帮助
  version                  显示版本

log 选项:
  --alias <alias>          使用预配置的日志平台连接别名
  --base-url <url>         日志平台地址
  --user <user>            认证用户名（可选）
  --password <pwd>         认证密码/Token（可选）
  -q, --query <expr>       查询表达式（LogQL / ES Query DSL）
  --start <time>           起始时间（ISO 8601 或 "1h"/"30m"/"7d"）
  --end <time>             结束时间（默认 "now"）
  --limit <n>              返回行数限制（默认 100，最大 1000）
  --direction <dir>        排序方向: forward | backward（仅 Loki）
  --index <pattern>        ES 索引模式
  --type <type>            日志平台类型 (loki/elasticsearch)
  --metadata-type <type>   元数据类型 (labels/label_values/series/indices/mappings/field_caps)
  --label <name>           标签名（配合 label_values）
  --match <selector>       流选择器（配合 series）
  --org-id <id>            Loki 租户 ID

jenkins 选项:
  --alias <alias>          使用预配置的 Jenkins 连接别名
  --base-url <url>         Jenkins 服务器地址
  --user <user>            Jenkins 用户名
  --token <token>          Jenkins API Token
  --build-number <num>     构建号（log 子命令，默认 lastBuild）
  --param <key=value>      构建参数（build 子命令，可多次指定）

query 选项:
  --alias <alias>          使用预配置的数据库别名
  -q, --query <sql>        SQL 语句
  -t, --type <type>        数据库类型
  -H, --host <host>        主机
  -P, --port <port>        端口
  -u, --user <user>        用户名
  -p, --password <pwd>     密码
  -d, --database <db>      数据库名

config add 选项:
  --type <type>            连接类型 (mysql/postgresql/oracle/mssql/jenkins/loki/elasticsearch)
  --host <host>            主机地址（数据库）
  --port <port>            端口（数据库）
  --base-url <url>         服务器地址（Jenkins/日志平台）
  --user <user>            用户名
  --password <pwd>         密码/Token
  --token <token>          API Token（Jenkins）
  --password-stdin         从 stdin 读取密码
  --database <db>          数据库名
  --org-id <id>            Loki 租户 ID
  --index <pattern>        默认索引模式（Elasticsearch）
  --global                 保存到用户级配置（默认项目级）
```

## 配置文件

| 层级 | 路径 | 说明 |
|------|------|------|
| 用户级 | `~/.develop-tool/config.json` | 全局共享，适合放各环境连接 |
| 项目级 | `.develop-tool.json`（项目根目录） | 仅当前项目，优先级高于用户级 |

建议把 `.develop-tool.json` 加入 `.gitignore`。

支持的连接类型：
- 数据库：`mysql`、`postgresql`、`oracle`、`mssql`
- Jenkins：`jenkins`
- 日志平台：`loki`、`elasticsearch`

密码和 Token 自动加密存储（AES-256-GCM），密钥通过本机用户信息派生。

## Jenkins 嵌套文件夹

Jenkins 的 Job 可以放在多级文件夹中，使用 `/` 分隔路径：

```bash
# Job 路径格式: folder1/folder2/jobName
develop-tool jenkins build devops/UAT/my-service --alias ci
develop-tool jenkins log devops/UAT/my-service --alias ci
develop-tool jenkins info devops/UAT/my-service --alias ci
develop-tool jenkins list devops/UAT --alias ci
```

工具会自动将路径转换为 Jenkins API 格式 (`/job/folder1/job/folder2/job/jobName`)。

## 安全说明

1. 数据库只允许 SELECT/SHOW/DESCRIBE/EXPLAIN 等只读操作
2. 日志查询仅执行只读操作（Loki GET / ES _search），不修改任何远端数据
3. 密码和 Token 使用 AES-256-GCM 加密存储，配置文件权限 `0600`
4. 日志平台支持无认证模式（内网部署无需 user/pwd）
5. 支持 `--password-stdin` 避免密码出现在 shell 历史
6. Jenkins 操作自动处理 CSRF crumb token
7. 建议数据库账号仅授予只读权限

## License

ISC

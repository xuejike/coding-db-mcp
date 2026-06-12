# @xuejike/coding-db-mcp

一个面向 AI Agent 的只读数据库查询工具，同时支持 MCP（Model Context Protocol）协议接入和 CLI 命令行直接使用。

适用于让 AI Agent（如 Cursor、Kiro、Claude Desktop 等）安全地查询数据库，或在终端中通过别名快速执行 SQL。

## 核心特性

- **只读安全** — 自动拦截 INSERT/UPDATE/DELETE/DROP 等写操作
- **多数据库支持** — MySQL、PostgreSQL、MSSQL、Oracle
- **别名配置** — 预存数据库连接，一个别名代替一堆参数
- **两层配置** — 用户级（全局）+ 项目级，项目级优先
- **密码加密** — AES-256-GCM 加密存储，配置文件泄露也不暴露密码
- **双模式运行** — MCP stdio 服务（给 Agent 用）或 CLI 命令行（给人用）

## 安装

```bash
npm install -g @xuejike/coding-db-mcp
```

或用 npx 免安装运行：

```bash
npx @xuejike/coding-db-mcp
```

## 快速开始

### 1. 添加数据库连接

```bash
# 添加一个名为 mydb 的连接（保存到全局配置）
db-query-mcp config add mydb \
  --type mysql \
  --host localhost \
  --port 3306 \
  --user root \
  --password yourpass \
  --database myapp \
  --global
```

### 2. 执行查询

```bash
db-query-mcp query --alias mydb -q "SELECT * FROM users LIMIT 5"
```

### 3. 管理连接

```bash
# 查看所有配置
db-query-mcp config list

# 查看某个连接详情（密码显示为 ****）
db-query-mcp config show mydb

# 删除连接
db-query-mcp config remove mydb --global
```

## 使用场景

### 场景一：AI Agent 通过 MCP 协议查询数据库

将工具配置为 Agent 的 MCP 服务，Agent 自动通过 `alias` 或直接参数查询数据库：

```json
{
  "mcpServers": {
    "database-query": {
      "command": "db-query-mcp",
      "args": []
    }
  }
}
```

npx 方式：

```json
{
  "mcpServers": {
    "database-query": {
      "command": "npx",
      "args": ["@xuejike/coding-db-mcp"]
    }
  }
}
```

Agent 调用示例：

```json
{
  "alias": "mydb",
  "querySql": "SELECT COUNT(*) FROM orders"
}
```

Agent 也可以不用别名，直接传完整连接参数（向后兼容）。

### 场景二：在 Steering 文档中指导 Agent 用 CLI 查询

在项目的 steering 或提示文件中告诉 Agent 用命令行查：

```bash
db-query-mcp query --alias prod-db -q "SELECT * FROM db_order_tracking WHERE sales_order_no = '12345'"
```

适合不方便配 MCP 服务、或在脚本中直接调用的场景。

### 场景三：开发/运维人员终端快速查询

预配置好各环境连接后，日常查询不用再记 host/port/password：

```bash
# 查生产
db-query-mcp query --alias prod -q "SELECT * FROM users WHERE id = 100"

# 查测试
db-query-mcp query --alias dev -q "SHOW TABLES"
```

## CLI 命令参考

```
db-query-mcp [命令] [选项]

命令:
  start                  启动 MCP 服务（默认，无参数时执行）
  query                  执行 SQL 查询
  config add <alias>     添加连接配置
  config remove <alias>  删除连接配置
  config list            列出所有连接
  config show <alias>    查看连接详情
  test                   测试数据库连接
  help                   显示帮助
  version                显示版本

query 选项:
  --alias <alias>        使用预配置的别名
  -q, --query <sql>      SQL 语句
  -t, --type <type>      数据库类型
  -H, --host <host>      主机
  -P, --port <port>      端口
  -u, --user <user>      用户名
  -p, --password <pwd>   密码
  -d, --database <db>    数据库名

config add 选项:
  --type <type>          数据库类型 (mysql/postgresql/oracle/mssql)
  --host <host>          主机地址
  --port <port>          端口
  --user <user>          用户名
  --password <pwd>       密码
  --password-stdin       从 stdin 读取密码（不留命令行历史）
  --database <db>        数据库名
  --global               保存到用户级配置（默认项目级）
```

## 配置文件

| 层级 | 路径 | 说明 |
|------|------|------|
| 用户级 | `~/.coding-db-mcp/config.json` | 全局共享，适合放各环境连接 |
| 项目级 | `.db-mcp.json`（项目根目录） | 仅当前项目，优先级高于用户级 |

建议把 `.db-mcp.json` 加入 `.gitignore`。

配置文件格式：

```json
{
  "version": "1.0",
  "connections": {
    "mydb": {
      "type": "mysql",
      "host": "localhost",
      "port": 3306,
      "user": "root",
      "pwd": "enc:v1:<iv>:<authTag>:<ciphertext>",
      "db": "myapp"
    }
  }
}
```

密码自动加密存储（`enc:v1:` 前缀），密钥通过本机用户信息派生，换机器无法解密。

## MCP 工具参数

四个工具（`query_mysql`、`query_postgresql`、`query_mssql`、`query_oracle`）共享同一参数结构：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `alias` | string | 否 | 连接别名，指定后连接参数可省略 |
| `host` | string | 条件 | 无 alias 时必填 |
| `port` | integer | 条件 | 无 alias 时必填 |
| `user` | string | 条件 | 无 alias 时必填 |
| `pwd` | string | 条件 | 无 alias 时必填 |
| `db` | string | 条件 | 无 alias 时必填 |
| `querySql` | string | **是** | SQL 查询语句 |

直接参数可覆盖 alias 中的对应字段（如用 alias 连接但切换到另一个 database）。

## 安全说明

1. 只允许 SELECT/SHOW/DESCRIBE/EXPLAIN 等只读操作
2. 密码 AES-256-GCM 加密存储，配置文件权限 `0600`
3. 支持 `--password-stdin` 避免密码出现在 shell 历史
4. 建议数据库账号仅授予只读权限

## License

ISC

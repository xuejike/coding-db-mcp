# MCP 数据库查询工具

这是一个用于Coding Agent MCP 服务的数据库查询工具，可以通过提示词，从当前项目配置文件中读取数据库连接信息并连接多种类型的数据库（MySQL、PostgreSQL、MSSQL、Oracle）并执行 SQL 查询。**该工具运行在只读模式下，确保不会意外修改数据库中的数据**。

<a href="https://glama.ai/mcp/servers/@xuejike/coding-db-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@xuejike/coding-db-mcp/badge" alt="Database Query Server MCP server" />
</a>

## 功能特点

- 支持连接多种数据库（MySQL、PostgreSQL、MSSQL、Oracle）
- 执行自定义 SQL 查询（只读模式）
- 自动阻止修改数据的操作（INSERT、UPDATE、DELETE等）
- 返回结构化查询结果
- 包含错误处理机制
- 实现为 MCP stdio 服务

## 安全特性

该工具具有以下安全保护措施：

1. **只读模式**：自动检测并阻止任何修改数据的SQL操作
2. **SQL语句检查**：只允许SELECT、SHOW、DESCRIBE等只读查询
3. **错误处理**：对非法操作返回明确的错误信息

## 安装说明

### 方式一：从 npm 仓库进行全局安装

您可以从 npm 仓库进行全局安装：

```bash
npm install -g coding-db-mcp
```

安装后，您可以通过以下命令启动服务：

```bash
db-query-mcp
```

### 方式二：使用 npx 运行（无需安装）

您也可以直接使用 npx 运行此工具，无需预先安装：

```bash
npx coding-db-mcp
```

这种方式会在每次运行时临时下载并执行最新版本的工具。

## 配置到 Agent 的 MCP 中

要将此服务配置到 Agent 的 MCP 中，请按照以下步骤操作：

### 1. 配置 Agent 的 MCP 设置

在 Agent 的 MCP 配置中添加此服务。通常需要在 Agent 的配置文件中添加类似以下的配置：

```json
{
  "mcpServers": {
    "database-query": {
      "command": "coding-db-mcp",
      "args": [
        
      ]
    }
  }
}
```

如果使用 npx 方式，配置应为：

```json
{
  "mcpServers": {
    "database-query": {
      "command": "npx",
      "args": [
        "coding-db-mcp"
      ]
    }
  }
}
```

### 2. 配置数据库连接信息（可选）

数据库连接信息文件不是必需的，Agent 可以通过提示词从当前项目配置文件中自动读取数据库连接信息。

例如，在 Spring Boot 项目中，Agent 可以直接读取 application-dev.yaml 文件中的数据库连接配置。

如果需要手动配置数据库连接信息，可以创建 `.env` 文件：

```bash
cp .env.example .env
```

在 `.env` 文件中设置以下变量：
- `DB_HOST`: 数据库主机地址
- `DB_PORT`: 数据库端口
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_NAME`: 数据库名称

### 3. 启动 Agent

启动 Agent 并确保 MCP 服务正确加载。Agent 现在应该能够使用以下四个数据库查询工具：
- `query_mysql`: MySQL 数据库查询工具
- `query_postgresql`: PostgreSQL 数据库查询工具
- `query_mssql`: MSSQL 数据库查询工具
- `query_oracle`: Oracle 数据库查询工具

当 Agent 需要查询数据库时，它会自动调用相应的工具并传入必要的参数（主机、端口、用户名、密码、数据库名和SQL查询语句）。

## MCP工具说明

当作为MCP服务运行时，该服务提供以下工具：

### query_mysql

执行MySQL数据库查询（只读模式）

参数：
- `host` (string): 数据库主机地址
- `port` (integer): 数据库端口
- `user` (string): 数据库用户名
- `pwd` (string): 数据库密码
- `db` (string): 数据库名称
- `querySql` (string): 要执行的SQL查询语句（仅支持SELECT等只读操作）

### query_postgresql

执行PostgreSQL数据库查询（只读模式）

参数：
- `host` (string): 数据库主机地址
- `port` (integer): 数据库端口
- `user` (string): 数据库用户名
- `pwd` (string): 数据库密码
- `db` (string): 数据库名称
- `querySql` (string): 要执行的SQL查询语句（仅支持SELECT等只读操作）

### query_mssql

执行MSSQL数据库查询（只读模式）

参数：
- `host` (string): 数据库主机地址
- `port` (integer): 数据库端口
- `user` (string): 数据库用户名
- `pwd` (string): 数据库密码
- `db` (string): 数据库名称
- `querySql` (string): 要执行的SQL查询语句（仅支持SELECT等只读操作）

### query_oracle

执行Oracle数据库查询（只读模式）

参数：
- `host` (string): 数据库主机地址
- `port` (integer): 数据库端口
- `user` (string): 数据库用户名
- `pwd` (string): 数据库密码
- `db` (string): 数据库名称
- `querySql` (string): 要执行的SQL查询语句（仅支持SELECT等只读操作）

## 安全说明

1. 该工具运行在只读模式下，自动阻止任何修改数据的SQL操作
2. 建议限制数据库用户权限，避免使用具有管理员权限的账户
3. 不要在代码中硬编码数据库凭证
4. 生产环境中应启用SSL连接

## 错误处理

工具会返回结构化的错误信息，包括：
- `success`: 布尔值，表示查询是否成功
- `error`: 错误消息
- `code`: 错误代码

## 返回格式

成功的查询将返回以下结构：
- `success`: true
- `data`: 查询结果数组
- `columns`: 列信息数组
- `rowCount`: 返回行数
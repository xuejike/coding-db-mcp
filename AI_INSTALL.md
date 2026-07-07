# develop-tool CLI 安装配置指南

本文档供 AI 阅读，用于指导用户完成 `@xuejike/develop-tool` CLI 工具的安装和连接配置。

## 安装

```bash
npm install -g @xuejike/develop-tool
```

安装后可使用 `develop-tool` 命令。

## 配置数据库连接

```bash
# MySQL
develop-tool config add <别名> --type mysql --host <主机> --port <端口> --user <用户名> --password <密码> --database <数据库名> --global

# PostgreSQL
develop-tool config add <别名> --type postgresql --host <主机> --port <端口> --user <用户名> --password <密码> --database <数据库名> --global

# MSSQL
develop-tool config add <别名> --type mssql --host <主机> --port <端口> --user <用户名> --password <密码> --database <数据库名> --global

# Oracle
develop-tool config add <别名> --type oracle --host <主机> --port <端口> --user <用户名> --password <密码> --database <数据库名> --global
```

## 配置日志平台连接

```bash
# Loki（无认证）
develop-tool config add <别名> --type loki --base-url <Loki地址> --global

# Loki（有认证 + 租户）
develop-tool config add <别名> --type loki --base-url <Loki地址> --user <用户名> --password <密码> --org-id <租户ID> --global

# Elasticsearch（无认证）
develop-tool config add <别名> --type elasticsearch --base-url <ES地址> --global

# Elasticsearch（有认证 + 默认索引）
develop-tool config add <别名> --type elasticsearch --base-url <ES地址> --user <用户名> --password <密码> --index <索引模式> --global
```

## 配置 Jenkins 连接

```bash
develop-tool config add <别名> --type jenkins --base-url <Jenkins地址> --user <用户名> --token <API Token> --global
```

## 常用操作

### 查看已配置连接

```bash
develop-tool config list
```

### 数据库查询

```bash
develop-tool query --alias <别名> -q "<SQL语句>"
```

### 日志查询

```bash
# Loki 日志查询
develop-tool log query --alias <别名> -q '<LogQL表达式>' --start <时间> --limit <条数>

# Elasticsearch 日志查询
develop-tool log query --alias <别名> -q '<Query DSL JSON>' --index <索引> --start <时间> --limit <条数>

# 查询元数据（标签、索引等）
develop-tool log metadata --alias <别名> --metadata-type <类型>
```

元数据类型：
- Loki: `labels`、`label_values`（需 `--label`）、`series`（需 `--match`）
- ES: `indices`、`mappings`（需 `--index`）、`field_caps`

时间格式：`5m`、`1h`、`7d`、`2024-01-15T10:00:00Z`、`now`

### Jenkins 操作

```bash
# 查看 Job 列表
develop-tool jenkins list --alias <别名>

# 触发构建
develop-tool jenkins build <Job名称> --alias <别名> --param <key=value>

# 查看构建日志
develop-tool jenkins log <Job名称> --alias <别名>

# 查看 Job 详情
develop-tool jenkins info <Job名称> --alias <别名>
```

## 删除连接

```bash
develop-tool config remove <别名> --global
```

## 说明

- `--global` 保存到用户级配置（`~/.develop-tool/config.json`），跨项目共享
- 不加 `--global` 则保存到项目级配置（`.develop-tool.json`），仅当前项目可用
- 密码自动加密存储，无需担心明文泄露
- 日志平台 `--user` 和 `--password` 可选，支持内网无认证部署

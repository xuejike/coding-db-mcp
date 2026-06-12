# 实现计划: 数据库别名配置 (database-alias-config)

## 概述

为 `@xuejike/coding-db-mcp` 项目添加数据库别名配置功能。通过创建 ConfigManager 核心类、密码加密模块、MCP 工具 alias 参数扩展、CLI config 子命令，实现别名管理数据库连接配置的完整流程。

## 任务

- [x] 1. 实现密码加密/解密模块
  - [x] 1.1 创建 `lib/crypto.js` 文件，实现 `deriveKey`、`encryptPassword`、`decryptPassword` 函数
    - 使用 Node.js 内置 `crypto` 模块
    - AES-256-GCM 加密，12 字节 IV
    - 密钥通过 `os.homedir()` + `os.userInfo().username` 经 PBKDF2 派生
    - 加密格式: `enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>`
    - 无 `enc:v1:` 前缀的字符串视为明文直接返回
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 1.2 编写密码加密模块的属性测试
    - **Property 8: 密码加密往返一致性** - decryptPassword(encryptPassword(pwd)) === pwd
    - **Property 9: 加密后不含明文** - 加密结果不包含原始密码明文
    - **Property 10: 明文密码兼容** - 不以 `enc:v1:` 开头的字符串原样返回
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.6**

- [x] 2. 实现 ConfigManager 核心类
  - [x] 2.1 创建 `lib/config-manager.js` 文件，实现 ConfigManager 类骨架
    - 构造函数接受 `userConfigPath` 和 `projectConfigPath` 选项
    - 默认路径: 用户级 `~/.coding-db-mcp/config.json`，项目级 `.db-mcp.json`
    - 实现 `loadConfigFile` 和 `loadMergedConfig` 内部方法
    - 配置文件不存在时返回空配置（不抛错）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.1, 7.2_

  - [x] 2.2 实现 `addConnection` 方法
    - 验证别名格式（正则 `/^[a-zA-Z_][a-zA-Z0-9\-_.]{0,63}$/`）
    - 验证连接配置完整性（type、host、port、user、pwd、db）
    - 验证数据库类型（mysql、postgresql、oracle、mssql）
    - 别名统一存储为小写
    - 写入前自动加密密码字段
    - 配置文件权限设为 0600，目录权限设为 0700
    - 支持 `global` 选项控制写入目标
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.4, 7.5_

  - [x] 2.3 实现 `resolveAlias` 方法
    - 大小写不敏感查找（统一转小写）
    - 项目级配置优先于用户级
    - 自动解密密码字段
    - 别名不存在时抛出包含可用别名列表的错误
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3_

  - [x] 2.4 实现 `removeConnection`、`listConnections`、`hasAlias` 方法
    - `removeConnection`: 从指定层级配置中删除别名
    - `listConnections`: 返回所有别名摘要（别名、类型、主机、数据库名、来源）
    - `hasAlias`: 检查别名是否存在
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 2.5 编写 ConfigManager 属性测试
    - **Property 1: 添加-解析往返一致性** - addConnection 后 resolveAlias 返回原配置
    - **Property 3: 配置覆盖优先级** - 同名 alias 项目级优先
    - **Property 5: 别名大小写不敏感** - 任意大小写变体解析结果相同
    - **Property 6: 删除后不可解析** - removeConnection 后 hasAlias 返回 false
    - **Property 7: 非法别名被拒绝** - 不符合规则的别名被拒绝
    - **Property 11: 不存在的别名报错** - 不存在的别名抛出异常
    - **Property 13: 配置文件格式完整性** - 写入的 JSON 包含 version 和 connections
    - **Property 14: listConnections 包含所有已添加的别名**
    - **Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 4.2, 4.7, 5.1, 5.2, 5.3, 7.1**

- [x] 3. 检查点 - 确保核心模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 4. 实现参数解析与 MCP 工具集成
  - [x] 4.1 创建 `lib/resolve-tool-arguments.js`，实现 `resolveToolArguments` 函数
    - 无 alias 时验证直接参数完整性
    - 有 alias 时通过 ConfigManager 解析
    - 直接参数可覆盖 alias 配置中的字段
    - 返回完整的 `{host, port, user, pwd, db, querySql}` 对象
    - _Requirements: 1.3, 3.1, 3.2, 3.3, 9.2, 9.3_

  - [x] 4.2 修改 `mcp.full.config.js`，为所有工具的 inputSchema 增加 `alias` 可选参数
    - 在 properties 中添加 `alias: { type: "string", description: "..." }`
    - 将 `required` 改为 `["querySql"]`（仅 querySql 必填）
    - _Requirements: 9.1, 3.3_

  - [x] 4.3 修改 `mcp-server.js` 和 `bin/db-query-mcp.js` 中的 CallToolRequestSchema 处理器
    - 在工具调用前调用 `resolveToolArguments` 解析参数
    - 保持向后兼容：无 alias 时行为不变
    - _Requirements: 9.2, 9.3, 3.1_

  - [x] 4.4 编写参数解析的属性测试
    - **Property 2: 向后兼容** - 无 alias 时参数透传
    - **Property 4: 直接参数覆盖 alias 配置** - 覆盖字段使用直接值
    - **Property 12: 缺少参数时的错误检测** - 缺少字段时抛出含字段名的错误
    - **Validates: Requirements 1.3, 3.1, 3.2, 9.3**

- [x] 5. 实现 CLI config 子命令
  - [x] 5.1 在 `bin/db-query-mcp.js` 中扩展命令解析，支持 `config add/remove/list/show` 子命令
    - 解析 `config add <alias> --type --host --port --user --password --database [--global]`
    - 解析 `config remove <alias> [--global]`
    - 解析 `config list`
    - 解析 `config show <alias>`
    - 支持 `--password-stdin` 从标准输入读取密码
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 5.2 实现各 config 子命令的处理逻辑
    - `config add`: 调用 ConfigManager.addConnection，输出成功信息
    - `config remove`: 调用 ConfigManager.removeConnection，输出成功信息
    - `config list`: 调用 ConfigManager.listConnections，格式化输出
    - `config show`: 调用 ConfigManager.resolveAlias，展示详情（密码显示为 `****`）
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 5.3 在 CLI `query` 命令中增加 `--alias` 选项支持
    - 解析 `--alias` 参数
    - 使用 `resolveToolArguments` 合并参数后执行查询
    - _Requirements: 9.2_

  - [x] 5.4 编写 CLI 子命令的单元测试
    - 测试 config add/remove/list/show 的参数解析
    - 测试错误处理（无效别名、缺少参数等）
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 10.1, 10.2, 10.3_

- [x] 6. 错误处理与边界情况
  - [x] 6.1 完善错误处理逻辑
    - 别名不存在时返回可用别名列表
    - 文件权限不足时返回具体文件路径
    - 配置文件 JSON 解析错误时返回详情和路径
    - 缺少参数时列出缺少字段并提示两种使用方式
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 6.2 编写错误处理单元测试
    - 测试各类错误场景的消息和恢复提示
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 7. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP
- 每个任务引用了对应的需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试验证设计文档中定义的正确性属性
- 项目使用 JavaScript (Node.js)，无需额外第三方依赖

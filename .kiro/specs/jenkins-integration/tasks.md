# 实现计划: Jenkins CI/CD 集成 (jenkins-integration)

## 概述

为 `@xuejike/develop-tool` 项目新增 Jenkins CI/CD 集成功能，支持 MCP 协议和 CLI 两种调用模式。实现三个核心操作：查看 Jenkins Job 列表、启动 Jenkins Job 构建、查看 Jenkins 构建日志。Jenkins 连接配置支持直接参数和别名两种方式，与现有数据库工具的配置模式保持一致。

## 任务

- [ ] 1. 实现 Jenkins 核心工具模块
  - [x] 1.1 创建 `lib/jenkins-tool.js`，实现 JenkinsTool 类骨架
    - 实现连接配置校验方法 `validateConfig(config)`
    - baseUrl 必须为合法 HTTP/HTTPS URL
    - user 和 token 不能为空字符串或纯空白
    - 实现 Basic Auth 认证头构造
    - 使用 Node.js 内置 `http`/`https` 模块发起请求（或使用项目中已有的 HTTP 方式）
    - _Requirements: 4.1, 4.2_

  - [x] 1.2 实现 `listJobs(config)` 方法
    - 调用 Jenkins API: `GET {baseUrl}/api/json?tree=jobs[name,url,color]`
    - 解析响应，返回 `{success: true, data: {jobs: [...]}}`
    - 处理连接失败、认证失败等错误场景
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.3 实现 `buildJob(config)` 方法
    - 当 parameters 为空/未定义时调用: `POST {baseUrl}/job/{jobName}/build`
    - 当 parameters 非空时调用: `POST {baseUrl}/job/{jobName}/buildWithParameters`
    - 返回 `{success: true, data: {queueUrl: "..."}}`
    - 处理 Job 不存在、触发失败等错误场景
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.4 实现 `getBuildLog(config)` 方法
    - 调用 Jenkins API: `GET {baseUrl}/job/{jobName}/{buildNumber}/consoleText`
    - buildNumber 默认为 "lastBuild"
    - 返回 `{success: true, data: {log: "..."}}`
    - 处理 Job/构建不存在等错误场景
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.5 编写 JenkinsTool 属性测试
    - **属性 3: 构建参数路由选择** - parameters 非空时使用 buildWithParameters，为空时使用 build
    - **属性 5: URL 格式校验** - 非合法 HTTP/HTTPS URL 被拒绝，不发起网络请求
    - **属性 6: 空参数校验** - user 或 token 为空/纯空白时拒绝请求
    - **属性 7: 成功响应格式一致性** - 成功结果包含 success:true 和 data 字段
    - **属性 8: 失败响应格式一致性** - 失败结果包含 success:false、error 和 code 字段
    - **Validates: Requirements 2.2, 2.3, 4.1, 4.2, 6.1, 6.2**

- [ ] 2. 实现 Jenkins 别名配置解析
  - [x] 2.1 创建 `lib/resolve-jenkins-arguments.js`，实现 `resolveJenkinsArguments` 函数
    - 无 alias 时验证直接参数完整性（baseUrl, user, token）
    - 有 alias 时通过 ConfigManager 解析 jenkins 类型的配置
    - 直接参数可覆盖 alias 配置中的字段
    - 返回完整的 `{baseUrl, user, token}` 对象
    - _Requirements: 1.2, 4.3, 4.4_

  - [x] 2.2 扩展 ConfigManager 支持 Jenkins 连接类型
    - 在 `lib/config-manager.js` 中支持 `type: 'jenkins'` 的配置存储
    - Jenkins 配置字段: `{type: 'jenkins', baseUrl, user, token}`
    - 复用现有的加密/解密逻辑加密 token 字段
    - _Requirements: 1.2, 4.4_

  - [ ]* 2.3 编写 Jenkins 别名解析属性测试
    - **属性 2: 别名解析正确性** - 别名配置解析后连接参数与原配置一致
    - **Validates: Requirements 1.2, 4.4**

- [x] 3. 检查点 - 确保核心模块测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [ ] 4. MCP 工具注册与集成
  - [x] 4.1 在 `mcp.full.config.js` 中添加 Jenkins 工具定义
    - 添加 `jenkins_list_jobs` 工具定义（readOnlyHint: true）
    - 添加 `jenkins_build_job` 工具定义（readOnlyHint: false, idempotentHint: false）
    - 添加 `jenkins_get_build_log` 工具定义（readOnlyHint: true）
    - 每个工具的 inputSchema 包含 alias（可选）和各自的必填参数
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.2 修改 `mcp-server.js` 注册 Jenkins 工具处理器
    - 在 CallToolRequestSchema 中添加 jenkins_list_jobs、jenkins_build_job、jenkins_get_build_log 的 case 分支
    - 调用 resolveJenkinsArguments 解析参数
    - 调用 JenkinsTool 对应方法执行操作
    - 响应封装为 MCP text content 格式（JSON.stringify）
    - _Requirements: 5.1, 5.2, 6.3_

  - [x] 4.3 修改 `bin/develop-tool.js` 中 `startMcpServer` 函数
    - 在工具列表中注册 Jenkins 工具
    - 在 CallToolRequestSchema 处理器中添加 Jenkins 工具的 case 分支
    - _Requirements: 5.1, 5.2_

  - [ ]* 4.4 编写 MCP 集成测试
    - 测试 Jenkins 工具能正确出现在工具列表中
    - 测试工具调用参数传递和响应格式
    - **属性 9: 响应 JSON 序列化** - 所有响应可被 JSON.parse 正确解析
    - **Validates: Requirements 5.1, 5.2, 6.3**

- [ ] 5. 实现 CLI jenkins 子命令
  - [x] 5.1 在 `bin/develop-tool.js` 中扩展命令解析，支持 `jenkins` 命令和子命令
    - 解析 `jenkins list` - 查看 Job 列表
    - 解析 `jenkins build <jobName>` - 启动构建
    - 解析 `jenkins log <jobName>` - 查看构建日志
    - 支持 `--alias` 参数从配置解析 Jenkins 连接信息
    - 支持 `--base-url`、`--user`、`--token` 直接指定连接参数
    - 支持 `--build-number` 指定构建号（log 子命令）
    - 支持 `--param key=value` 传递构建参数（build 子命令，可多次指定）
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2_

  - [x] 5.2 实现 `jenkins list` 子命令处理逻辑
    - 调用 resolveJenkinsArguments 解析连接参数
    - 调用 JenkinsTool.listJobs 获取 Job 列表
    - 格式化输出 Job 名称、状态
    - _Requirements: 1.1_

  - [x] 5.3 实现 `jenkins build` 子命令处理逻辑
    - 调用 resolveJenkinsArguments 解析连接参数
    - 解析 `--param key=value` 构建参数
    - 调用 JenkinsTool.buildJob 触发构建
    - 输出构建队列 URL
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 5.4 实现 `jenkins log` 子命令处理逻辑
    - 调用 resolveJenkinsArguments 解析连接参数
    - 支持 `--build-number` 指定构建号，默认 lastBuild
    - 调用 JenkinsTool.getBuildLog 获取日志
    - 输出完整日志内容到终端
    - _Requirements: 3.1, 3.2_

  - [x] 5.5 扩展 CLI `config add` 支持 Jenkins 类型配置
    - 当 `--type jenkins` 时，接受 `--base-url`、`--user`、`--token` 参数
    - 调用 ConfigManager.addConnection 保存 Jenkins 连接配置
    - 示例: `develop-tool config add my-jenkins --type jenkins --base-url http://jenkins:8080 --user admin --token xxx`
    - _Requirements: 1.2, 4.4_

  - [ ]* 5.6 编写 CLI jenkins 子命令单元测试
    - 测试参数解析（jenkins list/build/log 各子命令）
    - 测试 --alias 参数解析
    - 测试 --param key=value 多次传参
    - 测试错误处理（缺少参数、无效子命令等）
    - _Requirements: 1.1, 2.1, 3.1, 4.3_

- [ ] 6. 更新帮助信息和文档
  - [x] 6.1 更新 `bin/develop-tool.js` 中的 showHelp 函数
    - 添加 jenkins 相关命令说明和示例
    - 添加 config add jenkins 类型的示例
    - _Requirements: 5.1_

- [x] 7. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP
- 每个任务引用了对应的需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试验证设计文档中定义的正确性属性
- 项目使用 JavaScript (Node.js)，使用内置 http/https 模块避免引入额外依赖
- CLI 和 MCP 两种模式共用同一个 JenkinsTool 核心类和 resolveJenkinsArguments 解析逻辑

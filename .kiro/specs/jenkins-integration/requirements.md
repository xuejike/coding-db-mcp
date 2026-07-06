# 需求文档

## 简介

本文档定义了 Jenkins CI/CD 集成功能的需求规格。该功能为现有 MCP 数据库查询工具扩展 Jenkins 操作能力，允许 AI Agent 通过 MCP 协议查看 Jenkins Job 列表、启动构建、查看构建日志。

## 术语表

- **MCP_Server**: 基于 Model Context Protocol 的服务端，通过 stdio 传输与客户端通信
- **Jenkins_Tool**: Jenkins 操作工具模块，封装所有 Jenkins API 交互逻辑
- **Jenkins_API**: Jenkins 服务器暴露的 REST API 接口
- **Job**: Jenkins 中的构建任务单元
- **Build**: Job 的一次构建执行实例
- **API_Token**: Jenkins 用户的 API 访问令牌，用于身份认证
- **别名配置**: 通过预定义别名引用 Jenkins 连接参数的配置方式

## 需求

### 需求 1: 查看 Jenkins Job 列表

**用户故事:** 作为开发者，我希望查看 Jenkins 服务器上所有 Job 列表，以便了解当前可用的构建任务。

#### 验收标准

1. WHEN 用户调用 jenkins_list_jobs 工具并提供有效的连接配置 THEN Jenkins_Tool SHALL 返回包含所有 Job 名称、URL 和状态的列表
2. WHEN 用户通过别名方式指定 Jenkins 连接 THEN Jenkins_Tool SHALL 从配置文件解析对应的连接参数并完成请求
3. IF Jenkins 服务器连接失败 THEN Jenkins_Tool SHALL 返回包含错误代码和描述信息的失败响应
4. IF Jenkins 认证信息无效 THEN Jenkins_Tool SHALL 返回认证失败的错误信息

### 需求 2: 启动 Jenkins Job 构建

**用户故事:** 作为开发者，我希望能够启动指定的 Jenkins Job 构建，以便触发 CI/CD 流水线执行。

#### 验收标准

1. WHEN 用户调用 jenkins_build_job 工具并指定有效的 Job 名称 THEN Jenkins_Tool SHALL 触发该 Job 的构建并返回队列 URL
2. WHEN 用户指定构建参数 THEN Jenkins_Tool SHALL 使用 buildWithParameters 接口传递参数启动构建
3. WHEN 用户未指定构建参数 THEN Jenkins_Tool SHALL 使用 build 接口启动无参数构建
4. IF 指定的 Job 名称不存在 THEN Jenkins_Tool SHALL 返回 Job 未找到的错误信息
5. IF 构建触发失败 THEN Jenkins_Tool SHALL 返回包含失败原因的错误响应

### 需求 3: 查看 Jenkins 构建日志

**用户故事:** 作为开发者，我希望查看 Jenkins 构建的编译日志，以便排查构建失败原因或确认构建结果。

#### 验收标准

1. WHEN 用户调用 jenkins_get_build_log 工具并指定 Job 名称和构建号 THEN Jenkins_Tool SHALL 返回该构建的完整控制台日志
2. WHEN 用户未指定构建号 THEN Jenkins_Tool SHALL 默认返回最新一次构建的日志
3. IF 指定的构建号不存在 THEN Jenkins_Tool SHALL 返回构建未找到的错误信息
4. IF 指定的 Job 名称不存在 THEN Jenkins_Tool SHALL 返回 Job 未找到的错误信息

### 需求 4: 连接配置校验

**用户故事:** 作为开发者，我希望系统对 Jenkins 连接参数进行严格校验，以便在请求发出前就能发现配置错误。

#### 验收标准

1. WHEN baseUrl 参数不是合法的 HTTP/HTTPS URL THEN Jenkins_Tool SHALL 拒绝请求并返回 URL 格式错误的提示
2. WHEN user 或 token 参数为空字符串 THEN Jenkins_Tool SHALL 拒绝请求并返回参数缺失的提示
3. WHEN 指定了别名但别名不存在于配置中 THEN Jenkins_Tool SHALL 返回别名未找到的错误信息
4. WHEN 指定了别名 THEN Jenkins_Tool SHALL 使用别名对应的连接参数覆盖手动输入的参数

### 需求 5: MCP 工具注册

**用户故事:** 作为系统管理员，我希望 Jenkins 工具按照现有模式注册到 MCP Server，以便客户端能够发现和调用这些工具。

#### 验收标准

1. WHEN MCP Server 启动时 THEN MCP_Server SHALL 在工具列表中包含 jenkins_list_jobs、jenkins_build_job 和 jenkins_get_build_log 三个工具
2. WHEN 客户端请求工具列表 THEN MCP_Server SHALL 返回包含 Jenkins 工具定义及其输入 Schema 的完整描述
3. THE jenkins_list_jobs 工具 SHALL 标注为只读操作（readOnlyHint: true）
4. THE jenkins_build_job 工具 SHALL 标注为非只读、非幂等操作

### 需求 6: 统一响应格式

**用户故事:** 作为开发者，我希望 Jenkins 工具的响应格式统一且结构化，以便 AI Agent 能够可靠地解析和处理结果。

#### 验收标准

1. WHEN Jenkins 操作成功 THEN Jenkins_Tool SHALL 返回 `{success: true, data: ...}` 格式的响应
2. WHEN Jenkins 操作失败 THEN Jenkins_Tool SHALL 返回 `{success: false, error: "...", code: "..."}` 格式的响应
3. THE Jenkins_Tool SHALL 将所有响应序列化为 JSON 字符串后封装在 MCP text content 中返回

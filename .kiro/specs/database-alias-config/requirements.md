# 需求文档

## 简介

为 `@xuejike/coding-db-mcp` 项目添加数据库别名配置功能，允许用户通过别名管理和引用多个数据库连接配置。用户可预先存储连接信息到配置文件，在使用 MCP 工具或 CLI 查询时通过别名直接引用，无需每次传递完整连接参数。支持用户级和项目级两层配置，密码采用 AES-256-GCM 加密存储。

## 术语表

- **ConfigManager**: 配置管理器，负责配置文件的加载、解析、验证和持久化
- **Alias（别名）**: 数据库连接配置的唯一标识符，用于引用预存的连接信息
- **用户级配置**: 存储在 `~/.coding-db-mcp/config.json` 的全局配置文件
- **项目级配置**: 存储在项目根目录 `.db-mcp.json` 的本地配置文件
- **MCP_Tool**: MCP 协议中定义的数据库查询工具（query_mysql、query_postgresql 等）
- **DatabaseQueryTool**: 数据库查询执行器，负责实际的数据库连接和查询操作
- **CLI**: 命令行接口，即 `db-query-mcp` 命令行工具
- **AES-256-GCM**: 对称加密算法，用于密码的加密存储

## 需求

### 需求 1: 别名解析

**用户故事:** 作为开发者，我希望通过别名引用预配置的数据库连接，这样我可以避免每次查询时重复输入完整的连接信息。

#### 验收标准

1. WHEN 用户传入有效的 alias 参数, THE ConfigManager SHALL 从配置文件中解析出完整的数据库连接配置并返回
2. WHEN 用户传入的 alias 在所有配置文件中均不存在, THEN THE ConfigManager SHALL 抛出包含可用别名列表的错误信息
3. WHEN 用户同时传入 alias 和直接连接参数, THE ConfigManager SHALL 以直接参数覆盖 alias 配置中的对应字段
4. THE ConfigManager SHALL 对别名进行大小写不敏感的匹配（统一转为小写后查找）

### 需求 2: 配置优先级

**用户故事:** 作为开发者，我希望项目级配置能覆盖用户级配置，这样我可以为不同项目定制数据库连接而不影响全局配置。

#### 验收标准

1. WHEN 项目级配置和用户级配置中存在同名 alias, THE ConfigManager SHALL 优先使用项目级配置
2. WHEN 仅用户级配置中存在某 alias, THE ConfigManager SHALL 返回用户级配置中的连接信息
3. WHEN 仅项目级配置中存在某 alias, THE ConfigManager SHALL 返回项目级配置中的连接信息
4. THE ConfigManager SHALL 合并两层配置中的所有不重名 alias，使其均可被访问

### 需求 3: 向后兼容

**用户故事:** 作为现有用户，我希望不使用别名时系统行为与之前完全一致，这样我的现有工作流不受影响。

#### 验收标准

1. WHEN 用户未传入 alias 参数且提供了完整的连接参数（host、port、user、pwd、db）, THE MCP_Tool SHALL 直接使用这些参数执行查询
2. WHEN 用户未传入 alias 参数且连接参数不完整, THEN THE MCP_Tool SHALL 返回缺少字段的列表并提示用户补充参数或使用 alias
3. THE MCP_Tool SHALL 仅将 querySql 设为必填参数，连接参数在有 alias 时变为可选

### 需求 4: 配置管理 - 添加连接

**用户故事:** 作为开发者，我希望通过 CLI 或编程接口添加数据库连接配置，这样我可以方便地管理多个数据库连接。

#### 验收标准

1. WHEN 用户通过 CLI 执行 `config add` 命令并提供完整参数, THE ConfigManager SHALL 将连接配置保存到指定的配置文件中
2. WHEN 用户提供的别名不符合命名规则（长度1-64、仅允许字母数字连字符下划线点、不以连字符或点开头）, THEN THE ConfigManager SHALL 拒绝添加并返回格式要求说明
3. WHEN 用户提供的连接配置缺少必填字段（type、host、port、user、pwd、db）, THEN THE ConfigManager SHALL 拒绝添加并列出缺少的字段
4. WHEN 用户提供的数据库类型不在支持列表（mysql、postgresql、oracle、mssql）中, THEN THE ConfigManager SHALL 拒绝添加并列出支持的类型
5. WHEN 添加连接配置时指定 `--global` 选项, THE ConfigManager SHALL 将配置保存到用户级配置文件
6. WHEN 添加连接配置时不指定 `--global` 选项, THE ConfigManager SHALL 将配置保存到项目级配置文件
7. WHEN 成功添加连接配置, THE ConfigManager SHALL 使该别名立即可通过 resolveAlias 解析

### 需求 5: 配置管理 - 删除与列表

**用户故事:** 作为开发者，我希望能删除不再需要的连接配置并查看所有已配置的连接，这样我可以保持配置的整洁和可管理性。

#### 验收标准

1. WHEN 用户执行 `config remove` 命令并指定有效别名, THE ConfigManager SHALL 从对应的配置文件中删除该别名的连接配置
2. WHEN 删除连接配置成功后, THE ConfigManager SHALL 使该别名无法再通过 resolveAlias 解析
3. WHEN 用户执行 `config list` 命令, THE ConfigManager SHALL 返回所有已配置的别名及其摘要信息（别名、类型、主机、数据库名、配置来源）
4. WHEN 用户执行 `config show` 命令并指定别名, THE ConfigManager SHALL 展示该连接的详细信息，密码字段显示为 `****`

### 需求 6: 密码加密存储

**用户故事:** 作为开发者，我希望配置文件中的密码以加密形式存储，这样即使配置文件被意外泄露，密码也不会直接暴露。

#### 验收标准

1. WHEN 添加新的连接配置, THE ConfigManager SHALL 使用 AES-256-GCM 算法加密密码字段后存储
2. WHEN 解析别名获取连接配置, THE ConfigManager SHALL 自动解密密码字段并返回明文
3. THE ConfigManager SHALL 对加密后的密码使用 `enc:v1:` 前缀标识
4. WHEN 配置文件中的密码不带 `enc:v1:` 前缀, THE ConfigManager SHALL 将其视为明文密码直接使用（兼容旧配置）
5. THE ConfigManager SHALL 使用本机用户信息派生加密密钥，确保加密后的配置文件在其他机器上无法解密
6. WHEN 加密密码后, THE ConfigManager SHALL 确保加密结果不包含原始密码的明文内容

### 需求 7: 配置文件格式与验证

**用户故事:** 作为开发者，我希望配置文件格式清晰且有版本管理，这样系统可以在未来平滑升级配置结构。

#### 验收标准

1. THE ConfigManager SHALL 使用 JSON 格式存储配置文件，包含 `version` 和 `connections` 两个顶级字段
2. WHEN 配置文件不存在, THE ConfigManager SHALL 将其视为空配置（不抛出错误）
3. WHEN 配置文件内容不是合法 JSON, THEN THE ConfigManager SHALL 返回解析错误详情和文件路径
4. WHEN 写入用户级配置文件, THE ConfigManager SHALL 确保配置文件权限为 `0600`（仅所有者可读写）
5. WHEN 创建用户级配置目录, THE ConfigManager SHALL 设置目录权限为 `0700`

### 需求 8: CLI 配置子命令

**用户故事:** 作为开发者，我希望通过命令行管理数据库别名配置，这样我可以快速添加、删除和查看连接配置。

#### 验收标准

1. WHEN 用户执行 `db-query-mcp config add <alias>` 并提供 `--type`、`--host`、`--port`、`--user`、`--password`、`--database` 参数, THE CLI SHALL 调用 ConfigManager 添加连接配置
2. WHEN 用户执行 `db-query-mcp config remove <alias>`, THE CLI SHALL 调用 ConfigManager 删除指定别名的配置
3. WHEN 用户执行 `db-query-mcp config list`, THE CLI SHALL 以表格或列表形式展示所有连接配置摘要
4. WHEN 用户执行 `db-query-mcp config show <alias>`, THE CLI SHALL 展示指定别名的详细配置（密码显示为 `****`）
5. WHEN 用户通过 `--password-stdin` 选项提供密码, THE CLI SHALL 从标准输入读取密码，避免密码出现在命令行历史中

### 需求 9: MCP 工具 alias 参数集成

**用户故事:** 作为 MCP 客户端用户，我希望在工具调用时可以通过 alias 参数引用预配置的连接，这样我的查询请求更简洁。

#### 验收标准

1. THE MCP_Tool SHALL 在所有数据库查询工具（query_mysql、query_postgresql、query_mssql、query_oracle）的 inputSchema 中增加可选的 `alias` 字符串参数
2. WHEN MCP 工具收到包含 alias 的请求, THE MCP_Tool SHALL 通过 ConfigManager 解析别名并合并参数后执行查询
3. WHEN MCP 工具收到不包含 alias 的请求, THE MCP_Tool SHALL 使用原有的直接参数逻辑执行查询

### 需求 10: 错误处理

**用户故事:** 作为开发者，我希望在配置操作出错时收到清晰的错误信息和恢复建议，这样我可以快速定位并解决问题。

#### 验收标准

1. WHEN 别名不存在于任何配置文件中, THEN THE ConfigManager SHALL 返回错误信息并提示使用 `config list` 查看可用别名或使用 `config add` 添加
2. WHEN 文件系统权限不足无法读写配置文件, THEN THE ConfigManager SHALL 返回权限错误并指出具体文件路径
3. IF 配置文件格式损坏, THEN THE ConfigManager SHALL 返回解析错误详情并提示用户检查文件格式或使用 CLI 重新配置

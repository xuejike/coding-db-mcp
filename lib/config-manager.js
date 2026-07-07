'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { encryptPassword, decryptPassword } = require('./crypto');

// 别名命名规则正则: 字母或下划线开头，后续允许字母、数字、连字符、下划线、点，总长度 1-64
const ALIAS_PATTERN = /^[a-zA-Z_][a-zA-Z0-9\-_.]{0,63}$/;

// 支持的数据库类型列表
const VALID_DB_TYPES = ['mysql', 'postgresql', 'oracle', 'mssql'];

// 支持的日志平台类型列表
const VALID_LOG_TYPES = ['loki', 'elasticsearch'];

// 支持的所有连接类型（数据库 + Jenkins + 日志平台）
const VALID_TYPES = [...VALID_DB_TYPES, 'jenkins', ...VALID_LOG_TYPES];

// 数据库连接配置必填字段（db 为可选，不指定时表示该连接可访问服务器上所有数据库）
const REQUIRED_DB_FIELDS = ['type', 'host', 'port', 'user', 'pwd'];

// Jenkins 连接配置必填字段（pwd 存储 API Token）
const REQUIRED_JENKINS_FIELDS = ['type', 'baseUrl', 'user', 'pwd'];

// 日志平台连接配置必填字段（user/pwd 可选，支持无认证的内网部署）
const REQUIRED_LOG_FIELDS = ['type', 'baseUrl'];

// 历史配置路径（旧包名 @xuejike/coding-db-mcp 使用的路径）
const LEGACY_USER_CONFIG_DIR = '.coding-db-mcp';
const LEGACY_PROJECT_CONFIG_FILE = '.coding-db-mcp.json';

/**
 * 数据库别名配置管理器
 * 负责配置文件的加载、解析、验证和持久化管理
 * 支持用户级和项目级两层配置，项目级优先于用户级
 */
class ConfigManager {
  /**
   * 创建 ConfigManager 实例
   * @param {Object} options - 配置选项
   * @param {string} [options.userConfigPath] - 用户级配置文件路径（默认 ~/.develop-tool/config.json）
   * @param {string} [options.projectConfigPath] - 项目级配置文件路径（默认 .develop-tool.json）
   * @param {boolean} [options.skipMigration] - 是否跳过迁移检查（测试用）
   */
  constructor(options = {}) {
    // 用户级配置文件默认路径: ~/.develop-tool/config.json
    this.userConfigPath = options.userConfigPath ||
      path.join(os.homedir(), '.develop-tool', 'config.json');

    // 项目级配置文件默认路径: 当前工作目录下的 .develop-tool.json
    this.projectConfigPath = options.projectConfigPath ||
      path.join(process.cwd(), '.develop-tool.json');

    // 自动迁移历史配置（仅在未指定自定义路径且未跳过迁移时执行）
    if (!options.skipMigration && !options.userConfigPath && !options.projectConfigPath) {
      this._migrateFromLegacy();
    }
  }

  /**
   * 从旧版配置路径迁移到新路径
   * 旧包名 @xuejike/coding-db-mcp 使用 ~/.coding-db-mcp/config.json 和 .coding-db-mcp.json
   * 新包名 @xuejike/develop-tool 使用 ~/.develop-tool/config.json 和 .develop-tool.json
   * 
   * 迁移策略:
   * - 新路径不存在且旧路径存在时，将旧配置合并到新路径
   * - 新路径已存在时，将旧路径中不冲突的配置合并进来
   * - 迁移完成后保留旧文件不删除（避免数据丢失风险）
   */
  _migrateFromLegacy() {
    // 迁移用户级配置
    const legacyUserConfigPath = path.join(os.homedir(), LEGACY_USER_CONFIG_DIR, 'config.json');
    this._migrateConfigFile(legacyUserConfigPath, this.userConfigPath);

    // 迁移项目级配置
    const legacyProjectConfigPath = path.join(process.cwd(), LEGACY_PROJECT_CONFIG_FILE);
    this._migrateConfigFile(legacyProjectConfigPath, this.projectConfigPath);
  }

  /**
   * 将单个旧配置文件迁移到新路径
   * @param {string} legacyPath - 旧配置文件路径
   * @param {string} newPath - 新配置文件路径
   */
  _migrateConfigFile(legacyPath, newPath) {
    // 旧文件不存在，无需迁移
    if (!fs.existsSync(legacyPath)) {
      return;
    }

    let legacyConfig;
    try {
      const content = fs.readFileSync(legacyPath, 'utf-8');
      legacyConfig = JSON.parse(content);
    } catch (err) {
      // 旧文件解析失败，跳过迁移不影响正常功能
      return;
    }

    const legacyConnections = legacyConfig?.connections || {};
    if (Object.keys(legacyConnections).length === 0) {
      // 旧配置中没有连接信息，无需迁移
      return;
    }

    // 加载新路径的配置（可能已有部分配置）
    let newConfig = { version: '1.0', connections: {} };
    if (fs.existsSync(newPath)) {
      try {
        const content = fs.readFileSync(newPath, 'utf-8');
        newConfig = JSON.parse(content);
        if (!newConfig.connections) {
          newConfig.connections = {};
        }
      } catch (err) {
        // 新文件解析失败，使用空配置
        newConfig = { version: '1.0', connections: {} };
      }
    }

    // 将旧配置中不存在于新配置的连接合并进来（不覆盖已有配置）
    let migrated = false;
    for (const [alias, config] of Object.entries(legacyConnections)) {
      if (!newConfig.connections[alias]) {
        newConfig.connections[alias] = config;
        migrated = true;
      }
    }

    if (!migrated) {
      // 所有旧配置都已存在于新配置中，无需写入
      return;
    }

    // 确保目录存在并写入新配置文件
    const dir = path.dirname(newPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(newPath, JSON.stringify(newConfig, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });
    } catch (err) {
      // 迁移写入失败不影响正常功能，静默跳过
    }
  }

  /**
   * 安全加载单个配置文件
   * 文件不存在时返回 null（不抛错），文件存在则解析 JSON 并返回
   * @param {string} filePath - 配置文件路径
   * @returns {Object|null} 配置对象，文件不存在则返回 null
   * @throws {Error} 文件权限不足或内容不是合法 JSON 时抛出详细错误
   */
  loadConfigFile(filePath) {
    // 文件不存在时返回 null，不视为错误
    if (!fs.existsSync(filePath)) {
      return null;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      // 文件权限不足时返回具体文件路径
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        throw new Error(
          `文件权限不足，无法读取配置文件: ${filePath}。请检查文件权限（建议设置为 0600）。`
        );
      }
      throw new Error(`无法读取配置文件 (${filePath}): ${err.message}`);
    }

    try {
      const config = JSON.parse(content);
      return config;
    } catch (err) {
      // JSON 解析错误时提供详细解析错误信息和文件路径
      throw new Error(
        `配置文件 JSON 解析错误 (${filePath}): ${err.message}。请检查文件格式是否为合法 JSON，或使用 CLI 重新配置。`
      );
    }
  }

  /**
   * 加载并合并用户级和项目级配置
   * 优先级: 项目级 > 用户级（同名 alias 以项目级为准）
   * @returns {Object} 合并后的配置对象，包含 connections 字段
   */
  loadMergedConfig() {
    // 加载用户级配置
    const userConfig = this.loadConfigFile(this.userConfigPath);
    // 加载项目级配置
    const projectConfig = this.loadConfigFile(this.projectConfigPath);

    // 合并连接配置，项目级覆盖用户级（同名 alias 以项目级为准）
    const merged = {
      connections: {
        ...(userConfig?.connections || {}),
        ...(projectConfig?.connections || {})
      }
    };

    return merged;
  }

  /**
   * 添加数据库连接配置
   * 验证别名格式和配置完整性后，加密密码并写入指定配置文件
   * @param {string} alias - 数据库别名
   * @param {Object} config - 连接配置 {type, host, port, user, pwd, db}
   * @param {Object} [options] - 选项
   * @param {boolean} [options.global=true] - 是否保存到用户级配置（false 则保存到项目级）
   * @throws {Error} 别名格式无效、配置不完整或数据库类型不支持时抛出错误
   */
  addConnection(alias, config, options = {}) {
    // 1. 验证别名格式
    if (!ALIAS_PATTERN.test(alias)) {
      throw new Error(
        `无效的别名格式: "${alias}"。别名只能包含字母、数字、连字符、下划线和点，且不能以连字符或点开头，长度1-64`
      );
    }

    // 2. 验证连接类型是否在支持列表中
    if (!VALID_TYPES.includes(config.type)) {
      throw new Error(
        `不支持的连接类型: "${config.type}"。支持的类型: ${VALID_TYPES.join(', ')}`
      );
    }

    // 3. 根据连接类型选择对应的必填字段进行验证
    let requiredFields;
    if (config.type === 'jenkins') {
      requiredFields = REQUIRED_JENKINS_FIELDS;
    } else if (VALID_LOG_TYPES.includes(config.type)) {
      requiredFields = REQUIRED_LOG_FIELDS;
    } else {
      requiredFields = REQUIRED_DB_FIELDS;
    }
    const missingFields = requiredFields.filter(field => !config[field] && config[field] !== 0);
    if (missingFields.length > 0) {
      throw new Error(`缺少必填配置字段: ${missingFields.join(', ')}`);
    }

    // 4. 确定配置文件路径: global 不为 false 时写入用户级配置，否则写入项目级配置
    const global = options.global !== false;
    const configPath = global ? this.userConfigPath : this.projectConfigPath;

    // 5. 加载现有配置文件内容，不存在则创建新配置结构
    let fileConfig = this.loadConfigFile(configPath) || { version: '1.0', connections: {} };

    // 确保 connections 字段存在
    if (!fileConfig.connections) {
      fileConfig.connections = {};
    }

    // 6. 加密密码字段（日志类型 pwd 可选，仅在提供时加密）
    const encryptedConfig = { ...config };
    if (config.pwd) {
      encryptedConfig.pwd = encryptPassword(config.pwd);
    }

    // 7. 以小写别名为 key 写入连接配置
    fileConfig.connections[alias.toLowerCase()] = encryptedConfig;

    // 8. 确保目录存在（权限 0700）并写入文件（权限 0600）
    const dir = path.dirname(configPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      // 写入配置文件，权限设为 0600（仅所有者可读写）
      fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });
    } catch (err) {
      // 文件权限不足时返回具体文件路径
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        throw new Error(
          `文件权限不足，无法写入配置文件: ${configPath}。请检查文件及目录的写入权限。`
        );
      }
      throw err;
    }
  }

  /**
   * 通过别名解析数据库连接配置
   * 大小写不敏感查找，项目级配置优先于用户级，自动解密密码字段
   * @param {string} alias - 数据库别名
   * @returns {Object} 数据库连接配置 {type, host, port, user, pwd, db}
   * @throws {Error} 别名不存在时抛出包含可用别名列表的错误
   */
  resolveAlias(alias) {
    // 1. 统一转小写，实现大小写不敏感查找
    const normalizedAlias = alias.toLowerCase();

    // 2. 加载合并后的配置（项目级已优先，因为 loadMergedConfig 的 spread 顺序）
    const merged = this.loadMergedConfig();

    // 3. 查找别名对应的配置
    const config = merged.connections[normalizedAlias];

    // 4. 若别名不存在，抛出包含可用别名列表的错误
    if (!config) {
      const availableAliases = Object.keys(merged.connections);
      const aliasList = availableAliases.length > 0
        ? availableAliases.join(', ')
        : '（无已配置的别名）';
      throw new Error(
        `别名 "${alias}" 不存在。可用的别名: ${aliasList}。` +
        `请使用 config list 查看可用别名，或使用 config add 添加新配置。`
      );
    }

    // 5. 自动解密密码字段（日志类型 pwd 可选，可能不存在）
    const decryptedPwd = config.pwd ? decryptPassword(config.pwd) : undefined;

    // 6. 根据连接类型返回不同格式的配置对象
    if (config.type === 'jenkins') {
      // Jenkins 类型返回: {type, baseUrl, user, pwd}
      return {
        type: config.type,
        baseUrl: config.baseUrl,
        user: config.user,
        pwd: decryptedPwd
      };
    }

    if (VALID_LOG_TYPES.includes(config.type)) {
      // 日志平台类型返回: {type, baseUrl, user, pwd, orgId, index}（额外字段仅在存在时包含）
      const result = {
        type: config.type,
        baseUrl: config.baseUrl,
        user: config.user,
        pwd: decryptedPwd
      };
      if (config.orgId) result.orgId = config.orgId;
      if (config.index) result.index = config.index;
      return result;
    }

    // 数据库类型返回: {type, host, port, user, pwd, db}
    return {
      type: config.type,
      host: config.host,
      port: config.port,
      user: config.user,
      pwd: decryptedPwd,
      db: config.db
    };
  }

  /**
   * 删除数据库连接配置
   * 从指定层级的配置文件中删除别名对应的连接配置
   * @param {string} alias - 要删除的别名
   * @param {Object} [options] - 选项
   * @param {boolean} [options.global=true] - 是否从用户级配置删除（false 则从项目级删除）
   */
  removeConnection(alias, options = {}) {
    // 1. 确定目标配置文件路径: global 不为 false 时操作用户级配置，否则操作项目级配置
    const global = options.global !== false;
    const configPath = global ? this.userConfigPath : this.projectConfigPath;

    // 2. 加载该配置文件（文件不存在时使用空配置）
    let fileConfig = this.loadConfigFile(configPath) || { version: '1.0', connections: {} };

    // 确保 connections 字段存在
    if (!fileConfig.connections) {
      fileConfig.connections = {};
    }

    // 3. 从 connections 中删除别名（统一转小写）
    const normalizedAlias = alias.toLowerCase();
    delete fileConfig.connections[normalizedAlias];

    // 4. 写回文件（确保目录存在）
    const dir = path.dirname(configPath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }

      fs.writeFileSync(configPath, JSON.stringify(fileConfig, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });
    } catch (err) {
      // 文件权限不足时返回具体文件路径
      if (err.code === 'EACCES' || err.code === 'EPERM') {
        throw new Error(
          `文件权限不足，无法写入配置文件: ${configPath}。请检查文件及目录的写入权限。`
        );
      }
      throw err;
    }
  }

  /**
   * 列出所有已配置的数据库连接别名
   * 分别加载用户级和项目级配置，返回所有别名的摘要信息
   * @returns {Array<{alias: string, type: string, host: string, db: string, source: string}>} 别名摘要列表
   */
  listConnections() {
    // 分别加载两层配置
    const userConfig = this.loadConfigFile(this.userConfigPath);
    const projectConfig = this.loadConfigFile(this.projectConfigPath);

    const userConnections = userConfig?.connections || {};
    const projectConnections = projectConfig?.connections || {};

    // 使用 Map 收集所有别名，项目级同名 alias 覆盖用户级
    const result = [];

    // 先遍历用户级连接，标记来源为 "user"
    for (const [alias, config] of Object.entries(userConnections)) {
      // 如果项目级也存在同名别名，跳过用户级的（后面会由项目级添加）
      if (projectConnections[alias]) {
        continue;
      }
      result.push({
        alias,
        type: config.type || '',
        host: (config.type === 'jenkins' || VALID_LOG_TYPES.includes(config.type)) ? (config.baseUrl || '') : (config.host || ''),
        db: config.db || '',
        source: 'user'
      });
    }

    // 遍历项目级连接，标记来源为 "project"
    for (const [alias, config] of Object.entries(projectConnections)) {
      result.push({
        alias,
        type: config.type || '',
        host: (config.type === 'jenkins' || VALID_LOG_TYPES.includes(config.type)) ? (config.baseUrl || '') : (config.host || ''),
        db: config.db || '',
        source: 'project'
      });
    }

    return result;
  }

  /**
   * 检查别名是否存在于任何配置层级中
   * @param {string} alias - 要检查的别名
   * @returns {boolean} 别名存在返回 true，否则返回 false
   */
  hasAlias(alias) {
    // 统一转小写后在合并配置中查找
    const normalizedAlias = alias.toLowerCase();
    const merged = this.loadMergedConfig();
    return normalizedAlias in merged.connections;
  }
}

module.exports = ConfigManager;

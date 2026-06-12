'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { encryptPassword, decryptPassword } = require('./crypto');

// 别名命名规则正则: 字母或下划线开头，后续允许字母、数字、连字符、下划线、点，总长度 1-64
const ALIAS_PATTERN = /^[a-zA-Z_][a-zA-Z0-9\-_.]{0,63}$/;

// 支持的数据库类型列表
const VALID_DB_TYPES = ['mysql', 'postgresql', 'oracle', 'mssql'];

// 连接配置必填字段
const REQUIRED_FIELDS = ['type', 'host', 'port', 'user', 'pwd', 'db'];

/**
 * 数据库别名配置管理器
 * 负责配置文件的加载、解析、验证和持久化管理
 * 支持用户级和项目级两层配置，项目级优先于用户级
 */
class ConfigManager {
  /**
   * 创建 ConfigManager 实例
   * @param {Object} options - 配置选项
   * @param {string} [options.userConfigPath] - 用户级配置文件路径（默认 ~/.coding-db-mcp/config.json）
   * @param {string} [options.projectConfigPath] - 项目级配置文件路径（默认 .db-mcp.json）
   */
  constructor(options = {}) {
    // 用户级配置文件默认路径: ~/.coding-db-mcp/config.json
    this.userConfigPath = options.userConfigPath ||
      path.join(os.homedir(), '.coding-db-mcp', 'config.json');

    // 项目级配置文件默认路径: 当前工作目录下的 .db-mcp.json
    this.projectConfigPath = options.projectConfigPath ||
      path.join(process.cwd(), '.db-mcp.json');
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

    // 2. 验证连接配置完整性（所有必填字段都必须存在且非空）
    const missingFields = REQUIRED_FIELDS.filter(field => !config[field] && config[field] !== 0);
    if (missingFields.length > 0) {
      throw new Error(`缺少必填配置字段: ${missingFields.join(', ')}`);
    }

    // 3. 验证数据库类型是否在支持列表中
    if (!VALID_DB_TYPES.includes(config.type)) {
      throw new Error(
        `不支持的数据库类型: "${config.type}"。支持的类型: ${VALID_DB_TYPES.join(', ')}`
      );
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

    // 6. 加密密码字段
    const encryptedConfig = {
      ...config,
      pwd: encryptPassword(config.pwd)
    };

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

    // 5. 自动解密密码字段
    const decryptedPwd = decryptPassword(config.pwd);

    // 6. 返回解密后的完整配置对象
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
        host: config.host || '',
        db: config.db || '',
        source: 'user'
      });
    }

    // 遍历项目级连接，标记来源为 "project"
    for (const [alias, config] of Object.entries(projectConnections)) {
      result.push({
        alias,
        type: config.type || '',
        host: config.host || '',
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

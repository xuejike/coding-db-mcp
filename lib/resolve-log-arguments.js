'use strict';

/**
 * 解析日志工具调用参数，支持 alias 和直接参数两种模式
 *
 * 情况1: 未传 alias 时，验证 baseUrl 必填（日志平台地址）
 * 情况2: 传入 alias 时，通过 ConfigManager 解析配置，直接参数可覆盖
 *
 * @param {Object} args - 工具调用传入的参数
 * @param {string} [args.alias] - 日志平台连接别名
 * @param {string} [args.baseUrl] - 日志平台地址
 * @param {string} [args.user] - 用户名（可选，部分平台不需要认证）
 * @param {string} [args.pwd] - 密码/Token（可选）
 * @param {string} [args.query] - 查询表达式（LogQL / Query DSL JSON）
 * @param {string} [args.start] - 起始时间（ISO 8601 或相对时间如 "1h"）
 * @param {string} [args.end] - 结束时间（ISO 8601 或 "now"）
 * @param {number} [args.limit] - 返回行数限制
 * @param {Object} [configManagerOptions] - ConfigManager 构造选项，用于测试时指定自定义配置路径
 * @returns {Object} 完整的日志查询配置对象
 * @throws {Error} 缺少必填参数或别名不存在时抛出错误
 */
function resolveLogArguments(args, configManagerOptions) {
  const { alias, baseUrl, user, pwd, ...queryParams } = args;

  // 情况1: 未传 alias，使用直接参数
  if (!alias) {
    // 验证 baseUrl 必填（日志平台地址是连接的基础）
    if (!baseUrl) {
      throw new Error(
        '缺少必填参数: baseUrl（未指定 alias 时需要提供日志平台地址，或使用 alias 指定预配置的连接别名）'
      );
    }
    return { baseUrl, user, pwd, ...queryParams };
  }

  // 情况2: 传入 alias，从配置文件解析
  const ConfigManager = require('./config-manager');
  const configManager = new ConfigManager(configManagerOptions);
  const aliasConfig = configManager.resolveAlias(alias);

  // 直接参数覆盖 alias 配置中的字段（仅当直接参数有值时才覆盖）
  const merged = {
    type: aliasConfig.type,
    baseUrl: (baseUrl || aliasConfig.baseUrl),
    user: (user || aliasConfig.user),
    pwd: (pwd || aliasConfig.pwd),
    ...queryParams
  };

  // 合并别名配置中的额外字段（如 orgId、index），仅在合并结果中不存在时添加
  if (aliasConfig.orgId && !merged.orgId) merged.orgId = aliasConfig.orgId;
  if (aliasConfig.index && !merged.index) merged.index = aliasConfig.index;

  return merged;
}

module.exports = { resolveLogArguments };

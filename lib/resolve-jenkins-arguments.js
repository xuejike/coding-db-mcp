'use strict';

/**
 * 解析 Jenkins 工具调用参数，支持 alias 和直接参数两种模式
 * 
 * 情况1: 未传 alias 时，验证直接参数完整性（baseUrl, user, token）
 * 情况2: 传入 alias 时，通过 ConfigManager 解析 jenkins 类型的配置，直接参数可覆盖
 * 
 * @param {Object} args - 工具调用传入的参数
 * @param {string} [args.alias] - Jenkins 连接别名（可选）
 * @param {string} [args.baseUrl] - Jenkins 服务器地址
 * @param {string} [args.user] - Jenkins 用户名
 * @param {string} [args.token] - Jenkins API Token
 * @param {string} [args.jobName] - Job 名称（部分操作需要）
 * @param {number|string} [args.buildNumber] - 构建号（日志查询时使用）
 * @param {Object} [args.parameters] - 构建参数（启动构建时使用）
 * @param {Object} [configManagerOptions] - ConfigManager 构造选项，用于测试时指定自定义配置路径
 * @returns {Object} 完整的 Jenkins 连接配置及操作参数，格式为 {baseUrl, user, token, ...其他参数}
 * @throws {Error} 缺少必填参数或别名不存在时抛出错误
 */
function resolveJenkinsArguments(args, configManagerOptions) {
  const { alias, baseUrl, user, token, ...otherParams } = args;

  // 情况1: 未传 alias，使用直接参数模式
  if (!alias) {
    // 验证直接参数完整性，连接字段必须存在且非空
    const required = ['baseUrl', 'user', 'token'];
    const directParams = { baseUrl, user, token };
    const missing = required.filter(f => !directParams[f] || (typeof directParams[f] === 'string' && directParams[f].trim() === ''));
    if (missing.length > 0) {
      throw new Error(
        `缺少必填参数: ${missing.join(', ')}（未指定 alias 时需要提供完整连接信息，或使用 --alias 指定预配置的 Jenkins 连接别名）`
      );
    }
    // 返回完整参数对象（包含 jobName, buildNumber, parameters 等）
    return { baseUrl, user, token, ...otherParams };
  }

  // 情况2: 传入 alias，从配置文件解析
  const ConfigManager = require('./config-manager');
  const configManager = new ConfigManager(configManagerOptions);
  const aliasConfig = configManager.resolveAlias(alias);

  // 将 alias 配置映射为 Jenkins 连接参数
  // ConfigManager.resolveAlias 返回 {type, host, port, user, pwd, db}（数据库通用格式）
  // 对于 Jenkins 类型，baseUrl 存储在 host 字段，token 存储在 pwd 字段
  // 但如果 ConfigManager 已扩展支持 Jenkins 类型，可能直接返回 {type, baseUrl, user, pwd}
  const aliasBaseUrl = aliasConfig.baseUrl || aliasConfig.host;
  const aliasUser = aliasConfig.user;
  const aliasToken = aliasConfig.pwd;

  // 直接参数可以覆盖 alias 配置中的字段（局部覆盖）
  // 仅使用非 undefined、非 null 且非空字符串的直接参数进行覆盖
  const merged = {
    baseUrl: (baseUrl !== undefined && baseUrl !== null && baseUrl !== '') ? baseUrl : aliasBaseUrl,
    user: (user !== undefined && user !== null && user !== '') ? user : aliasUser,
    token: (token !== undefined && token !== null && token !== '') ? token : aliasToken,
    ...otherParams
  };

  return merged;
}

module.exports = { resolveJenkinsArguments };

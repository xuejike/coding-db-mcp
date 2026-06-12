'use strict';

/**
 * 解析工具调用参数，支持 alias 和直接参数两种模式
 * 
 * 情况1: 未传 alias 时，验证直接参数完整性（向后兼容）
 * 情况2: 传入 alias 时，通过 ConfigManager 解析配置，直接参数可覆盖
 * 
 * @param {Object} args - 工具调用传入的参数
 * @param {Object} [configManagerOptions] - ConfigManager 构造选项，用于测试时指定自定义配置路径
 * @returns {Object} 完整的数据库连接配置 + querySql，格式为 {host, port, user, pwd, db, querySql}
 * @throws {Error} 缺少必填参数或别名不存在时抛出错误
 */
function resolveToolArguments(args, configManagerOptions) {
  const { alias, querySql, ...directParams } = args;

  // 情况1: 未传 alias，使用直接参数（向后兼容）
  if (!alias) {
    // 验证直接参数完整性，连接字段必须存在（db 可选，不指定时可跨库查询）
    const required = ['host', 'port', 'user', 'pwd'];
    const missing = required.filter(f => !directParams[f] && directParams[f] !== 0);
    if (missing.length > 0) {
      throw new Error(
        `缺少必填参数: ${missing.join(', ')}（未指定 alias 时需要提供完整连接信息，或使用 --alias 指定预配置的连接别名）`
      );
    }
    return { ...directParams, querySql };
  }

  // 情况2: 传入 alias，从配置文件解析
  const ConfigManager = require('./config-manager');
  const configManager = new ConfigManager(configManagerOptions);
  const aliasConfig = configManager.resolveAlias(alias);

  // 直接参数可以覆盖 alias 配置中的字段（局部覆盖）
  // 仅使用非 undefined 和非 null 的直接参数进行覆盖
  const merged = {
    ...aliasConfig,
    ...Object.fromEntries(
      Object.entries(directParams).filter(([_, v]) => v !== undefined && v !== null)
    ),
    querySql
  };

  return merged;
}

module.exports = { resolveToolArguments };

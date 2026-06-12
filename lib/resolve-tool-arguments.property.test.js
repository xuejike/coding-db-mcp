'use strict';

const fc = require('fast-check');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveToolArguments } = require('./resolve-tool-arguments');
const ConfigManager = require('./config-manager');

/**
 * resolveToolArguments 参数解析模块 - 属性测试
 * 使用 fast-check 验证参数解析的核心正确性属性
 *
 * Validates: Requirements 1.3, 3.1, 3.2, 9.3
 */

let passed = 0;
let failed = 0;

/**
 * 运行属性测试的辅助函数
 * @param {string} name - 测试名称
 * @param {Function} propertyFn - 返回 fc.Property 的函数
 */
function runProperty(name, propertyFn) {
  try {
    fc.assert(propertyFn(), { numRuns: 100 });
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

/**
 * 创建临时目录用于测试隔离
 * @returns {string} 临时目录路径
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-args-prop-test-'));
}

/**
 * 清理临时目录
 * @param {string} dir - 临时目录路径
 */
function cleanupTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // 忽略清理错误
  }
}

/**
 * 生成合法别名的 arbitrary
 * 规则: 字母或下划线开头，后续允许字母、数字、连字符、下划线、点，总长度 1-64
 */
const validAliasArb = fc.tuple(
  // 首字符: 字母或下划线
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
  // 后续字符: 字母、数字、连字符、下划线、点，长度 0-15
  fc.array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_.'.split('')),
    { minLength: 0, maxLength: 15 }
  )
).map(([first, rest]) => first + rest.join(''));

/**
 * 生成有效连接配置的 arbitrary（用于 ConfigManager 添加连接）
 */
const validConfigArb = fc.record({
  type: fc.constantFrom('mysql', 'postgresql', 'oracle', 'mssql'),
  host: fc.stringMatching(/^[a-z][a-z0-9.]{0,20}$/),
  port: fc.integer({ min: 1, max: 65535 }),
  user: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
  pwd: fc.string({ minLength: 1, maxLength: 30 }),
  db: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/)
});

/**
 * 生成完整的直接连接参数 arbitrary（不含 alias）
 * 用于 Property 2 测试
 */
const completeDirectParamsArb = fc.record({
  host: fc.stringMatching(/^[a-z][a-z0-9.]{0,20}$/),
  port: fc.integer({ min: 1, max: 65535 }),
  user: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
  pwd: fc.string({ minLength: 1, maxLength: 30 }),
  db: fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/),
  querySql: fc.stringMatching(/^SELECT [a-z0-9_ *,]{1,30}$/)
});

console.log('resolveToolArguments - 属性测试\n');

// ============================================================
// Property 2: 向后兼容 - 无 alias 时参数透传
// 不包含 alias 的完整参数应原样返回
// **Validates: Requirements 3.1, 9.3**
// ============================================================
console.log('Property 2: 向后兼容 - 无 alias 时参数透传');

runProperty(
  '无 alias 的完整连接参数应原样返回，行为与未引入别名功能前一致',
  () => fc.property(
    completeDirectParamsArb,
    (params) => {
      // 调用 resolveToolArguments，不传 alias
      const result = resolveToolArguments(params);

      // 验证返回值中所有字段与原始参数一致
      return (
        result.host === params.host &&
        result.port === params.port &&
        result.user === params.user &&
        result.pwd === params.pwd &&
        result.db === params.db &&
        result.querySql === params.querySql
      );
    }
  )
);

runProperty(
  '无 alias 且包含额外参数时，额外参数也应透传',
  () => fc.property(
    completeDirectParamsArb,
    fc.string({ minLength: 1, maxLength: 20 }),
    (params, extraValue) => {
      // 添加一个额外参数
      const argsWithExtra = { ...params, extraParam: extraValue };
      const result = resolveToolArguments(argsWithExtra);

      // 额外参数也应透传
      return (
        result.host === params.host &&
        result.port === params.port &&
        result.user === params.user &&
        result.pwd === params.pwd &&
        result.db === params.db &&
        result.querySql === params.querySql &&
        result.extraParam === extraValue
      );
    }
  )
);

// ============================================================
// Property 4: 直接参数覆盖 alias 配置
// 被覆盖的字段使用直接值，未覆盖的字段保持 alias 配置值
// **Validates: Requirement 1.3**
// ============================================================
console.log('\nProperty 4: 直接参数覆盖 alias 配置');

// 可覆盖字段列表
const overridableFields = ['host', 'port', 'user', 'pwd', 'db'];

/**
 * 生成非空的覆盖参数子集 arbitrary
 * 从 overridableFields 中随机选取至少一个字段，生成覆盖值
 */
const overrideSubsetArb = fc.subarray(overridableFields, { minLength: 1 }).chain(
  (fields) => {
    // 为选中的字段生成覆盖值
    const recordShape = {};
    for (const field of fields) {
      if (field === 'port') {
        recordShape[field] = fc.integer({ min: 1, max: 65535 });
      } else {
        recordShape[field] = fc.stringMatching(/^override_[a-z0-9]{1,10}$/);
      }
    }
    return fc.record(recordShape).map(overrides => ({ fields, overrides }));
  }
);

runProperty(
  '覆盖字段使用直接参数值，未覆盖字段保持 alias 配置值',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    overrideSubsetArb,
    fc.stringMatching(/^SELECT [a-z0-9_ *,]{1,20}$/),
    (alias, aliasConfig, { fields, overrides }, querySql) => {
      const tempDir = createTempDir();
      try {
        const userConfigPath = path.join(tempDir, 'user', 'config.json');
        const projectConfigPath = path.join(tempDir, 'project', 'config.json');

        // 通过 ConfigManager 添加一条 alias 配置
        const cm = new ConfigManager({ userConfigPath, projectConfigPath });
        cm.addConnection(alias, aliasConfig);

        // 构造带覆盖参数的工具调用参数
        const args = {
          alias,
          querySql,
          ...overrides
        };

        const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });

        // 验证被覆盖的字段使用直接参数值
        for (const field of fields) {
          if (result[field] !== overrides[field]) {
            return false;
          }
        }

        // 验证未覆盖的字段保持 alias 配置原始值
        for (const field of overridableFields) {
          if (!fields.includes(field)) {
            if (result[field] !== aliasConfig[field]) {
              return false;
            }
          }
        }

        // querySql 应使用传入值
        return result.querySql === querySql;
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 12: 缺少参数时的错误检测
// 无 alias 且缺少至少一个必填字段时，抛出包含缺少字段名称的错误
// **Validates: Requirement 3.2**
// ============================================================
console.log('\nProperty 12: 缺少参数时的错误检测');

/**
 * 生成缺少至少一个必填字段的参数 arbitrary
 * 从 required 字段列表中随机移除至少一个字段
 */
const requiredFields = ['host', 'port', 'user', 'pwd', 'db'];

const incompleteParamsArb = fc.subarray(requiredFields, { minLength: 1, maxLength: 5 }).chain(
  (fieldsToRemove) => {
    // 保留未被移除的字段，为其生成有效值
    const remainingFields = requiredFields.filter(f => !fieldsToRemove.includes(f));
    const recordShape = {};
    for (const field of remainingFields) {
      if (field === 'port') {
        recordShape[field] = fc.integer({ min: 1, max: 65535 });
      } else {
        recordShape[field] = fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/);
      }
    }
    // 添加 querySql（必须存在）
    recordShape.querySql = fc.stringMatching(/^SELECT [a-z0-9_ ]{1,15}$/);

    return fc.record(recordShape).map(params => ({
      params,
      missingFields: fieldsToRemove
    }));
  }
);

runProperty(
  '缺少必填字段时抛出包含缺少字段名称的错误',
  () => fc.property(
    incompleteParamsArb,
    ({ params, missingFields }) => {
      try {
        // 不传 alias，且缺少必填字段，应抛出错误
        resolveToolArguments(params);
        // 如果没有抛出错误，测试失败
        return false;
      } catch (err) {
        // 验证错误信息包含每个缺少字段的名称
        for (const field of missingFields) {
          if (!err.message.includes(field)) {
            return false;
          }
        }
        return true;
      }
    }
  )
);

runProperty(
  '仅缺少一个必填字段时错误信息包含该字段名',
  () => fc.property(
    // 选择一个字段移除
    fc.constantFrom(...requiredFields),
    // 为其他字段生成值
    fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
    fc.integer({ min: 1, max: 65535 }),
    fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
    (fieldToRemove, host, port, user, pwd, db) => {
      // 构建完整参数
      const fullParams = { host, port, user, pwd, db, querySql: 'SELECT 1' };
      // 移除选定字段
      delete fullParams[fieldToRemove];

      try {
        resolveToolArguments(fullParams);
        return false;
      } catch (err) {
        // 错误信息应包含缺失字段名
        return err.message.includes(fieldToRemove);
      }
    }
  )
);

// 输出测试结果
console.log(`\n属性测试结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}

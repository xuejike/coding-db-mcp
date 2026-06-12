'use strict';

const fc = require('fast-check');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ConfigManager = require('./config-manager');

/**
 * ConfigManager 属性测试
 * 使用 fast-check 验证 ConfigManager 核心正确性属性
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 4.2, 4.7, 5.1, 5.2, 5.3, 7.1
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-test-'));
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
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')),
  // 后续字符: 字母、数字、连字符、下划线、点，长度 0-20（测试用不需太长）
  fc.array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'.split('')),
    { minLength: 0, maxLength: 20 }
  )
).map(([first, rest]) => first + rest.join(''));

/**
 * 生成有效连接配置的 arbitrary
 */
const validConfigArb = fc.record({
  type: fc.constantFrom('mysql', 'postgresql', 'oracle', 'mssql'),
  host: fc.stringMatching(/^[a-z][a-z0-9.]{0,30}$/),
  port: fc.integer({ min: 1, max: 65535 }),
  user: fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/),
  pwd: fc.string({ minLength: 1, maxLength: 50 }),
  db: fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/)
});

console.log('ConfigManager - 属性测试\n');

// ============================================================
// Property 1: 添加-解析往返一致性
// addConnection 后 resolveAlias 返回原配置（密码经加密解密后一致）
// **Validates: Requirements 1.1, 4.1, 4.7**
// ============================================================
console.log('Property 1: 添加-解析往返一致性');

runProperty(
  'addConnection 后 resolveAlias 返回与原始配置等价的连接信息',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    (alias, config) => {
      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        // 添加连接
        cm.addConnection(alias, config);

        // 解析别名
        const resolved = cm.resolveAlias(alias);

        // 验证各字段一致（密码经加密解密后应还原）
        return (
          resolved.type === config.type &&
          resolved.host === config.host &&
          resolved.port === config.port &&
          resolved.user === config.user &&
          resolved.pwd === config.pwd &&
          resolved.db === config.db
        );
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 3: 配置覆盖优先级
// 同名 alias 项目级优先于用户级
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
// ============================================================
console.log('\nProperty 3: 配置覆盖优先级');

runProperty(
  '同名 alias 项目级配置优先于用户级配置',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    validConfigArb,
    (alias, userConfig, projectConfig) => {
      const tempDir = createTempDir();
      try {
        const userConfigPath = path.join(tempDir, 'user', 'config.json');
        const projectConfigPath = path.join(tempDir, 'project', 'config.json');

        const cm = new ConfigManager({ userConfigPath, projectConfigPath });

        // 先添加到用户级
        cm.addConnection(alias, userConfig, { global: true });
        // 再添加到项目级
        cm.addConnection(alias, projectConfig, { global: false });

        // 解析别名，应返回项目级配置
        const resolved = cm.resolveAlias(alias);

        return (
          resolved.type === projectConfig.type &&
          resolved.host === projectConfig.host &&
          resolved.port === projectConfig.port &&
          resolved.user === projectConfig.user &&
          resolved.pwd === projectConfig.pwd &&
          resolved.db === projectConfig.db
        );
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 5: 别名大小写不敏感
// 任意大小写变体解析结果相同
// **Validates: Requirement 1.4**
// ============================================================
console.log('\nProperty 5: 别名大小写不敏感');

runProperty(
  '使用任意大小写变体解析同一别名，结果相同',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    (alias, config) => {
      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        // 添加连接（使用原始大小写）
        cm.addConnection(alias, config);

        // 使用不同大小写变体解析
        const upperResolved = cm.resolveAlias(alias.toUpperCase());
        const lowerResolved = cm.resolveAlias(alias.toLowerCase());

        // 两种变体解析结果应相同
        return (
          upperResolved.type === lowerResolved.type &&
          upperResolved.host === lowerResolved.host &&
          upperResolved.port === lowerResolved.port &&
          upperResolved.user === lowerResolved.user &&
          upperResolved.pwd === lowerResolved.pwd &&
          upperResolved.db === lowerResolved.db
        );
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 6: 删除后不可解析
// removeConnection 后 hasAlias 返回 false
// **Validates: Requirements 5.1, 5.2**
// ============================================================
console.log('\nProperty 6: 删除后不可解析');

runProperty(
  'removeConnection 后 hasAlias 返回 false',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    (alias, config) => {
      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        // 添加连接
        cm.addConnection(alias, config);

        // 确认已添加
        if (!cm.hasAlias(alias)) return false;

        // 删除连接
        cm.removeConnection(alias);

        // 验证 hasAlias 返回 false
        return cm.hasAlias(alias) === false;
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 7: 非法别名被拒绝
// 不符合 ALIAS_PATTERN 的字符串被 addConnection 拒绝
// **Validates: Requirement 4.2**
// ============================================================
console.log('\nProperty 7: 非法别名被拒绝');

runProperty(
  '不符合命名规则的别名被 addConnection 拒绝',
  () => fc.property(
    // 生成不符合 /^[a-zA-Z_][a-zA-Z0-9\-_.]{0,63}$/ 的字符串
    fc.oneof(
      // 以数字开头
      fc.tuple(
        fc.constantFrom(...'0123456789'.split('')),
        fc.string({ minLength: 0, maxLength: 10 })
      ).map(([first, rest]) => first + rest),
      // 以连字符开头
      fc.string({ minLength: 0, maxLength: 10 }).map(s => '-' + s),
      // 以点开头
      fc.string({ minLength: 0, maxLength: 10 }).map(s => '.' + s),
      // 包含非法字符（空格、特殊符号等）
      fc.tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
        fc.constantFrom(' ', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '+', '=', '/', '\\', '~', '`'),
        fc.string({ minLength: 0, maxLength: 5 })
      ).map(([first, special, rest]) => first + special + rest),
      // 空字符串
      fc.constant(''),
      // 超长字符串（超过64字符）
      fc.string({ minLength: 65, maxLength: 100 }).map(s => 'a' + s.replace(/[^a-zA-Z0-9\-_.]/g, 'x'))
    ),
    (invalidAlias) => {
      // 确认生成的别名确实不匹配规则
      const ALIAS_PATTERN = /^[a-zA-Z_][a-zA-Z0-9\-_.]{0,63}$/;
      if (ALIAS_PATTERN.test(invalidAlias)) {
        // 如果意外生成了合法别名，跳过此用例
        return true;
      }

      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        const validConfig = {
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          user: 'root',
          pwd: 'password',
          db: 'testdb'
        };

        try {
          cm.addConnection(invalidAlias, validConfig);
          // 应该抛出错误，如果没抛出则测试失败
          return false;
        } catch (err) {
          // 验证抛出了包含格式相关信息的错误
          return err.message.includes('无效的别名格式') || err.message.includes('别名');
        }
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 11: 不存在的别名报错
// 不存在的别名调用 resolveAlias 抛出异常
// **Validates: Requirements 1.2, 10.1**
// ============================================================
console.log('\nProperty 11: 不存在的别名报错');

runProperty(
  '解析不存在的别名时抛出包含错误信息的异常',
  () => fc.property(
    validAliasArb,
    (alias) => {
      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        try {
          cm.resolveAlias(alias);
          // 不应该成功，返回 false 表示测试失败
          return false;
        } catch (err) {
          // 验证抛出了包含别名相关信息的错误
          return err.message.includes('不存在') && err.message.includes(alias);
        }
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 13: 配置文件格式完整性
// 写入的 JSON 包含 version 和 connections 字段
// **Validates: Requirement 7.1**
// ============================================================
console.log('\nProperty 13: 配置文件格式完整性');

runProperty(
  'addConnection 写入的配置文件包含 version 和 connections 字段',
  () => fc.property(
    validAliasArb,
    validConfigArb,
    (alias, config) => {
      const tempDir = createTempDir();
      try {
        const userConfigPath = path.join(tempDir, 'user', 'config.json');
        const cm = new ConfigManager({
          userConfigPath,
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        // 添加连接（写入用户级配置文件）
        cm.addConnection(alias, config);

        // 直接读取原始 JSON 文件
        const rawContent = fs.readFileSync(userConfigPath, 'utf-8');
        const parsed = JSON.parse(rawContent);

        // 验证包含 version 和 connections 顶级字段
        return (
          'version' in parsed &&
          'connections' in parsed &&
          typeof parsed.version === 'string' &&
          typeof parsed.connections === 'object' &&
          parsed.connections !== null
        );
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// ============================================================
// Property 14: listConnections 包含所有已添加的别名
// **Validates: Requirement 5.3**
// ============================================================
console.log('\nProperty 14: listConnections 包含所有已添加的别名');

runProperty(
  'listConnections 返回的别名列表包含所有已添加的别名',
  () => fc.property(
    // 生成 1-5 个不重复的别名和对应配置
    fc.array(
      fc.tuple(validAliasArb, validConfigArb),
      { minLength: 1, maxLength: 5 }
    ),
    (entries) => {
      const tempDir = createTempDir();
      try {
        const cm = new ConfigManager({
          userConfigPath: path.join(tempDir, 'user', 'config.json'),
          projectConfigPath: path.join(tempDir, 'project', 'config.json')
        });

        // 添加所有连接（去重，因为同名别名会覆盖）
        const addedAliases = new Set();
        for (const [alias, config] of entries) {
          cm.addConnection(alias, config);
          addedAliases.add(alias.toLowerCase());
        }

        // 获取列表
        const list = cm.listConnections();
        const listedAliases = new Set(list.map(item => item.alias));

        // 验证所有添加的别名都出现在列表中
        for (const addedAlias of addedAliases) {
          if (!listedAliases.has(addedAlias)) {
            return false;
          }
        }

        return true;
      } finally {
        cleanupTempDir(tempDir);
      }
    }
  )
);

// 输出测试结果
console.log(`\n属性测试结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}

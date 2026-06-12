'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveToolArguments } = require('./resolve-tool-arguments');
const ConfigManager = require('./config-manager');

// 测试辅助函数：创建临时目录
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-tool-args-test-'));
}

// 测试辅助函数：清理临时目录
function cleanupDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 简单测试运行器
 */
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    错误: ${err.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n    期望: ${JSON.stringify(expected)}\n    实际: ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, expectedMsg) {
  try {
    fn();
    throw new Error(`期望抛出错误，但没有抛出`);
  } catch (err) {
    if (err.message.includes('期望抛出错误')) throw err;
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      throw new Error(`错误信息不包含预期内容\n    期望包含: "${expectedMsg}"\n    实际: "${err.message}"`);
    }
  }
}

// ===== 测试开始 =====
console.log('\nresolveToolArguments 单元测试\n');

// ===== 无 alias 时的直接参数模式 =====
console.log('无 alias 时 - 验证直接参数完整性:');

test('完整的直接参数应原样返回（向后兼容）', () => {
  const args = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    pwd: 'secret',
    db: 'myapp',
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args);

  assertEqual(result.host, 'localhost', 'host 应正确');
  assertEqual(result.port, 3306, 'port 应正确');
  assertEqual(result.user, 'root', 'user 应正确');
  assertEqual(result.pwd, 'secret', 'pwd 应正确');
  assertEqual(result.db, 'myapp', 'db 应正确');
  assertEqual(result.querySql, 'SELECT 1', 'querySql 应正确');
});

test('无 alias 且缺少 host 字段时抛出错误', () => {
  const args = {
    port: 3306,
    user: 'root',
    pwd: 'secret',
    db: 'myapp',
    querySql: 'SELECT 1'
  };

  assertThrows(() => resolveToolArguments(args), 'host');
});

test('无 alias 且缺少多个字段时错误信息包含所有缺失字段', () => {
  const args = {
    host: 'localhost',
    querySql: 'SELECT 1'
  };

  assertThrows(() => resolveToolArguments(args), 'port');
  assertThrows(() => resolveToolArguments(args), 'user');
  assertThrows(() => resolveToolArguments(args), 'pwd');
  assertThrows(() => resolveToolArguments(args), 'db');
});

test('无 alias 且所有连接字段都缺少时抛出错误', () => {
  const args = { querySql: 'SELECT 1' };
  assertThrows(() => resolveToolArguments(args), '缺少必填参数');
});

test('port 为 0 时不应视为缺失', () => {
  const args = {
    host: 'localhost',
    port: 0,
    user: 'root',
    pwd: 'secret',
    db: 'myapp',
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args);
  assertEqual(result.port, 0, 'port 为 0 时应保留');
});

test('错误信息应包含使用 alias 的提示', () => {
  const args = { querySql: 'SELECT 1' };
  assertThrows(() => resolveToolArguments(args), '--alias');
});

test('alias 为空字符串时视为无 alias，使用直接参数模式', () => {
  const args = {
    alias: '',
    host: 'localhost',
    port: 3306,
    user: 'root',
    pwd: 'secret',
    db: 'myapp',
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args);
  assertEqual(result.host, 'localhost', 'host 应正确');
  // 返回值不应包含 alias 字段
  assertEqual(result.alias, undefined, '返回值不应包含 alias');
});

// ===== 有 alias 时通过 ConfigManager 解析 =====
console.log('\n有 alias 时 - 通过 ConfigManager 解析:');

test('使用 alias 解析已配置的连接', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  // 先通过 ConfigManager 添加一条配置
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('testdb', {
    type: 'mysql',
    host: 'db-host',
    port: 3306,
    user: 'dbuser',
    pwd: 'dbpass',
    db: 'testdb'
  });

  // 使用 resolveToolArguments 解析
  const args = {
    alias: 'testdb',
    querySql: 'SELECT * FROM users'
  };
  const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.host, 'db-host', 'host 应从 alias 配置中解析');
  assertEqual(result.port, 3306, 'port 应从 alias 配置中解析');
  assertEqual(result.user, 'dbuser', 'user 应从 alias 配置中解析');
  assertEqual(result.pwd, 'dbpass', 'pwd 应从 alias 配置中解析（已解密）');
  assertEqual(result.db, 'testdb', 'db 应从 alias 配置中解析');
  assertEqual(result.querySql, 'SELECT * FROM users', 'querySql 应正确');

  cleanupDir(tempDir);
});

test('alias 不存在时抛出错误', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const args = {
    alias: 'nonexistent',
    querySql: 'SELECT 1'
  };

  assertThrows(
    () => resolveToolArguments(args, { userConfigPath, projectConfigPath }),
    'nonexistent'
  );

  cleanupDir(tempDir);
});

// ===== 直接参数覆盖 alias 配置 =====
console.log('\n直接参数覆盖 alias 配置:');

test('直接参数可以覆盖 alias 中的 db 字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('mydb', {
    type: 'mysql',
    host: 'alias-host',
    port: 3306,
    user: 'alias-user',
    pwd: 'alias-pwd',
    db: 'alias-db'
  });

  // 使用 alias 但覆盖 db 字段
  const args = {
    alias: 'mydb',
    db: 'override-db',
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.db, 'override-db', '直接指定的 db 应覆盖 alias 配置');
  assertEqual(result.host, 'alias-host', '未覆盖的 host 应保持 alias 值');
  assertEqual(result.user, 'alias-user', '未覆盖的 user 应保持 alias 值');

  cleanupDir(tempDir);
});

test('直接参数可以覆盖 alias 中的多个字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('mydb', {
    type: 'mysql',
    host: 'alias-host',
    port: 3306,
    user: 'alias-user',
    pwd: 'alias-pwd',
    db: 'alias-db'
  });

  // 覆盖 host 和 port
  const args = {
    alias: 'mydb',
    host: 'new-host',
    port: 3307,
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.host, 'new-host', '直接指定的 host 应覆盖 alias 配置');
  assertEqual(result.port, 3307, '直接指定的 port 应覆盖 alias 配置');
  assertEqual(result.user, 'alias-user', '未覆盖的 user 应保持 alias 值');
  assertEqual(result.pwd, 'alias-pwd', '未覆盖的 pwd 应保持 alias 值');
  assertEqual(result.db, 'alias-db', '未覆盖的 db 应保持 alias 值');

  cleanupDir(tempDir);
});

test('undefined 和 null 的直接参数不应覆盖 alias 配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('mydb', {
    type: 'mysql',
    host: 'alias-host',
    port: 3306,
    user: 'alias-user',
    pwd: 'alias-pwd',
    db: 'alias-db'
  });

  // undefined 和 null 不应覆盖
  const args = {
    alias: 'mydb',
    host: undefined,
    port: null,
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.host, 'alias-host', 'undefined 不应覆盖 alias 配置');
  assertEqual(result.port, 3306, 'null 不应覆盖 alias 配置');

  cleanupDir(tempDir);
});

test('querySql 始终使用传入的值', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('mydb', {
    type: 'mysql',
    host: 'h',
    port: 3306,
    user: 'u',
    pwd: 'p',
    db: 'd'
  });

  const args = {
    alias: 'mydb',
    querySql: 'SELECT COUNT(*) FROM orders'
  };

  const result = resolveToolArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.querySql, 'SELECT COUNT(*) FROM orders', 'querySql 应为传入的值');

  cleanupDir(tempDir);
});

// ===== 返回值结构验证 =====
console.log('\n返回值结构验证:');

test('无 alias 模式返回的对象包含所有必要字段', () => {
  const args = {
    host: 'h',
    port: 3306,
    user: 'u',
    pwd: 'p',
    db: 'd',
    querySql: 'SELECT 1'
  };

  const result = resolveToolArguments(args);
  const expectedKeys = ['host', 'port', 'user', 'pwd', 'db', 'querySql'];
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`返回对象缺少字段: ${key}`);
    }
  }
});

test('alias 模式返回的对象包含所有必要字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('mydb', {
    type: 'mysql',
    host: 'h',
    port: 3306,
    user: 'u',
    pwd: 'p',
    db: 'd'
  });

  const result = resolveToolArguments(
    { alias: 'mydb', querySql: 'SELECT 1' },
    { userConfigPath, projectConfigPath }
  );

  const expectedKeys = ['host', 'port', 'user', 'pwd', 'db', 'querySql'];
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`返回对象缺少字段: ${key}`);
    }
  }

  cleanupDir(tempDir);
});

test('无 alias 模式额外的参数也会被传递', () => {
  const args = {
    host: 'h',
    port: 3306,
    user: 'u',
    pwd: 'p',
    db: 'd',
    querySql: 'SELECT 1',
    extraParam: 'extra-value'
  };

  const result = resolveToolArguments(args);
  assertEqual(result.extraParam, 'extra-value', '额外参数应被透传');
});

// ===== 错误处理测试 (Requirements 10.1, 3.2) =====
console.log('\n错误处理测试 (3.2 缺少参数时的错误信息):');

test('缺少所有连接字段时错误信息包含所有缺失字段名', () => {
  const args = { querySql: 'SELECT 1' };
  try {
    resolveToolArguments(args);
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    // 验证错误信息包含所有 5 个缺失字段
    const requiredFields = ['host', 'port', 'user', 'pwd', 'db'];
    for (const field of requiredFields) {
      if (!err.message.includes(field)) {
        throw new Error(`错误信息应包含缺失字段名 "${field}"，实际: ${err.message}`);
      }
    }
  }
});

test('缺少部分字段时错误信息仅包含实际缺失的字段名', () => {
  const args = { host: 'localhost', port: 3306, querySql: 'SELECT 1' };
  try {
    resolveToolArguments(args);
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    // 应包含缺失的 user、pwd、db
    if (!err.message.includes('user')) {
      throw new Error('错误信息应包含缺失字段 "user"');
    }
    if (!err.message.includes('pwd')) {
      throw new Error('错误信息应包含缺失字段 "pwd"');
    }
    if (!err.message.includes('db')) {
      throw new Error('错误信息应包含缺失字段 "db"');
    }
  }
});

test('缺少参数时错误信息包含 --alias 使用建议', () => {
  const args = { host: 'localhost', querySql: 'SELECT 1' };
  try {
    resolveToolArguments(args);
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    if (!err.message.includes('--alias') && !err.message.includes('alias')) {
      throw new Error('错误信息应包含使用 --alias 的建议');
    }
  }
});

console.log('\n错误处理测试 (10.1 别名不存在):');

test('通过 resolveToolArguments 使用不存在的别名时错误信息包含别名名称', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const args = { alias: 'missing_alias', querySql: 'SELECT 1' };
  try {
    resolveToolArguments(args, { userConfigPath, projectConfigPath });
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    if (!err.message.includes('missing_alias')) {
      throw new Error('错误信息应包含别名名称 "missing_alias"');
    }
  }

  cleanupDir(tempDir);
});

test('通过 resolveToolArguments 使用不存在的别名时错误信息包含恢复建议', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  // 先添加一些别名
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('existing_db', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  const args = { alias: 'wrong_alias', querySql: 'SELECT 1' };
  try {
    resolveToolArguments(args, { userConfigPath, projectConfigPath });
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    // 应包含可用别名
    if (!err.message.includes('existing_db')) {
      throw new Error('错误信息应包含可用别名 "existing_db"');
    }
    // 应包含恢复建议
    if (!err.message.includes('config list') && !err.message.includes('config add')) {
      throw new Error('错误信息应包含 "config list" 或 "config add" 恢复建议');
    }
  }

  cleanupDir(tempDir);
});

// ===== 输出测试结果汇总 =====
console.log(`\n测试完成: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
}

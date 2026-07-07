'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveLogArguments } = require('./resolve-log-arguments');
const ConfigManager = require('./config-manager');

// 测试辅助函数：创建临时目录
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-log-args-test-'));
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
    throw new Error('期望抛出错误，但没有抛出');
  } catch (err) {
    if (err.message.includes('期望抛出错误')) throw err;
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      throw new Error(`错误信息不包含预期内容\n    期望包含: "${expectedMsg}"\n    实际: "${err.message}"`);
    }
  }
}

// ===== 测试开始 =====
console.log('\nresolveLogArguments 单元测试\n');

// ===== 直接参数模式 =====
console.log('直接参数模式（无 alias）:');

test('提供 baseUrl 时应返回完整配置对象', () => {
  const args = {
    baseUrl: 'http://loki.example.com:3100',
    user: 'admin',
    pwd: 'secret',
    query: '{app="svc"} |= "error"',
    start: '1h',
    end: 'now',
    limit: 50
  };

  const result = resolveLogArguments(args);

  assertEqual(result.baseUrl, 'http://loki.example.com:3100', 'baseUrl 应正确');
  assertEqual(result.user, 'admin', 'user 应正确');
  assertEqual(result.pwd, 'secret', 'pwd 应正确');
  assertEqual(result.query, '{app="svc"} |= "error"', 'query 应正确');
  assertEqual(result.start, '1h', 'start 应正确');
  assertEqual(result.end, 'now', 'end 应正确');
  assertEqual(result.limit, 50, 'limit 应正确');
});

test('仅提供 baseUrl 无 user/pwd 时也应正常返回', () => {
  const args = {
    baseUrl: 'http://loki.internal:3100',
    query: '{job="api"}',
    start: '30m'
  };

  const result = resolveLogArguments(args);

  assertEqual(result.baseUrl, 'http://loki.internal:3100', 'baseUrl 应正确');
  assertEqual(result.user, undefined, '无认证模式 user 应为 undefined');
  assertEqual(result.pwd, undefined, '无认证模式 pwd 应为 undefined');
  assertEqual(result.query, '{job="api"}', 'query 应正确');
  assertEqual(result.start, '30m', 'start 应正确');
});

// ===== 缺少 alias 和 baseUrl 时报错 =====
console.log('\n缺少 alias 和 baseUrl 时报错:');

test('未传 alias 且未提供 baseUrl 时应抛出错误', () => {
  const args = {
    query: '{app="svc"}',
    start: '1h'
  };

  assertThrows(() => resolveLogArguments(args), 'baseUrl');
});

test('未传 alias 且 baseUrl 为空字符串时应抛出错误', () => {
  const args = {
    baseUrl: '',
    query: '{app="svc"}',
    start: '1h'
  };

  assertThrows(() => resolveLogArguments(args), 'baseUrl');
});

test('错误信息应包含使用 alias 的提示', () => {
  const args = { query: '{app="svc"}' };

  try {
    resolveLogArguments(args);
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message === '应抛出错误') throw err;
    if (!err.message.includes('alias')) {
      throw new Error('错误信息应包含 alias 使用提示');
    }
  }
});

// ===== 别名模式参数解析 =====
console.log('\n别名模式参数解析:');

test('使用 loki 别名解析已配置的连接', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  // 通过 ConfigManager 添加一条 loki 配置
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('test-loki', {
    type: 'loki',
    baseUrl: 'http://loki.prod:3100',
    user: 'admin',
    pwd: 'loki_pass'
  });

  // 使用 resolveLogArguments 解析
  const args = {
    alias: 'test-loki',
    query: '{app="payment"} |= "error"',
    start: '1h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.type, 'loki', 'type 应从 alias 配置中解析');
  assertEqual(result.baseUrl, 'http://loki.prod:3100', 'baseUrl 应从 alias 配置中解析');
  assertEqual(result.user, 'admin', 'user 应从 alias 配置中解析');
  assertEqual(result.pwd, 'loki_pass', 'pwd 应已解密为明文');
  assertEqual(result.query, '{app="payment"} |= "error"', 'query 应正确传递');
  assertEqual(result.start, '1h', 'start 应正确传递');

  cleanupDir(tempDir);
});

test('使用 elasticsearch 别名解析已配置的连接', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  // 添加 elasticsearch 配置
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('test-es', {
    type: 'elasticsearch',
    baseUrl: 'https://es.prod:9200',
    user: 'elastic',
    pwd: 'es_secret'
  });

  const args = {
    alias: 'test-es',
    query: '{"match": {"level": "ERROR"}}',
    start: '24h',
    limit: 100
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.type, 'elasticsearch', 'type 应为 elasticsearch');
  assertEqual(result.baseUrl, 'https://es.prod:9200', 'baseUrl 应正确');
  assertEqual(result.user, 'elastic', 'user 应正确');
  assertEqual(result.pwd, 'es_secret', 'pwd 应已解密');
  assertEqual(result.query, '{"match": {"level": "ERROR"}}', 'query 应正确传递');
  assertEqual(result.limit, 100, 'limit 应正确传递');

  cleanupDir(tempDir);
});

test('别名不存在时应抛出错误', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const args = {
    alias: 'nonexistent-loki',
    query: '{app="svc"}'
  };

  assertThrows(
    () => resolveLogArguments(args, { userConfigPath, projectConfigPath }),
    'nonexistent-loki'
  );

  cleanupDir(tempDir);
});

// ===== 直接参数覆盖别名配置 =====
console.log('\n直接参数覆盖别名配置:');

test('直接参数 baseUrl 应覆盖别名配置中的 baseUrl', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('override-loki', {
    type: 'loki',
    baseUrl: 'http://alias-loki:3100',
    user: 'alias-user',
    pwd: 'alias-pwd'
  });

  // 提供直接 baseUrl 覆盖别名配置
  const args = {
    alias: 'override-loki',
    baseUrl: 'http://direct-loki:3100',
    query: '{app="svc"}',
    start: '1h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.baseUrl, 'http://direct-loki:3100', '直接指定的 baseUrl 应覆盖 alias 配置');
  assertEqual(result.user, 'alias-user', '未覆盖的 user 应保持 alias 值');
  assertEqual(result.pwd, 'alias-pwd', '未覆盖的 pwd 应保持 alias 值');

  cleanupDir(tempDir);
});

test('直接参数 user 和 pwd 应覆盖别名配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('override-es', {
    type: 'elasticsearch',
    baseUrl: 'https://es.prod:9200',
    user: 'alias-user',
    pwd: 'alias-pwd'
  });

  // 覆盖 user 和 pwd
  const args = {
    alias: 'override-es',
    user: 'direct-user',
    pwd: 'direct-pwd',
    query: '{"match_all": {}}',
    limit: 10
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.user, 'direct-user', '直接指定的 user 应覆盖 alias 配置');
  assertEqual(result.pwd, 'direct-pwd', '直接指定的 pwd 应覆盖 alias 配置');
  assertEqual(result.baseUrl, 'https://es.prod:9200', '未覆盖的 baseUrl 应保持 alias 值');

  cleanupDir(tempDir);
});

test('未提供直接参数时使用别名配置的值', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('keep-alias', {
    type: 'loki',
    baseUrl: 'http://keep-loki:3100',
    user: 'keep-user',
    pwd: 'keep-pwd'
  });

  // 不提供任何直接连接参数
  const args = {
    alias: 'keep-alias',
    query: '{app="svc"}',
    start: '5m'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.baseUrl, 'http://keep-loki:3100', 'baseUrl 应保持 alias 值');
  assertEqual(result.user, 'keep-user', 'user 应保持 alias 值');
  assertEqual(result.pwd, 'keep-pwd', 'pwd 应保持 alias 值');

  cleanupDir(tempDir);
});

// ===== 额外字段合并（orgId、index）=====
console.log('\n额外字段合并（orgId、index）:');

test('别名配置中的 orgId 应合并到结果中', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('loki-with-org', {
    type: 'loki',
    baseUrl: 'http://loki.multi:3100',
    user: 'viewer',
    pwd: 'token',
    orgId: '42'
  });

  const args = {
    alias: 'loki-with-org',
    query: '{namespace="production"}',
    start: '1h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.orgId, '42', 'orgId 应从别名配置中合并');

  cleanupDir(tempDir);
});

test('别名配置中的 index 应合并到结果中', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('es-with-index', {
    type: 'elasticsearch',
    baseUrl: 'http://es.local:9200',
    user: 'admin',
    pwd: 'pass',
    index: 'app-logs-*'
  });

  const args = {
    alias: 'es-with-index',
    query: '{"match_all": {}}',
    start: '24h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.index, 'app-logs-*', 'index 应从别名配置中合并');

  cleanupDir(tempDir);
});

test('直接参数中的 index 不应被别名配置中的 index 覆盖', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('es-idx-override', {
    type: 'elasticsearch',
    baseUrl: 'http://es.local:9200',
    user: 'admin',
    pwd: 'pass',
    index: 'default-index-*'
  });

  // 直接在 args 中传入 index（作为 queryParams 的一部分）
  const args = {
    alias: 'es-idx-override',
    query: '{"match_all": {}}',
    index: 'custom-index-*',
    start: '1h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  // 直接参数中的 index 在 queryParams 中，已存在则不被别名覆盖
  assertEqual(result.index, 'custom-index-*', '直接参数中的 index 应优先于别名配置');

  cleanupDir(tempDir);
});

// ===== 查询参数原样传递 =====
console.log('\n查询参数原样传递:');

test('query、start、end、limit 参数应原样传递', () => {
  const args = {
    baseUrl: 'http://loki:3100',
    query: '{app="payment"} |~ "timeout|error"',
    start: '2024-01-15T00:00:00Z',
    end: '2024-01-15T12:00:00Z',
    limit: 200
  };

  const result = resolveLogArguments(args);

  assertEqual(result.query, '{app="payment"} |~ "timeout|error"', 'query 应原样传递');
  assertEqual(result.start, '2024-01-15T00:00:00Z', 'start 应原样传递');
  assertEqual(result.end, '2024-01-15T12:00:00Z', 'end 应原样传递');
  assertEqual(result.limit, 200, 'limit 应原样传递');
});

test('direction 参数应原样传递', () => {
  const args = {
    baseUrl: 'http://loki:3100',
    query: '{job="api"}',
    start: '1h',
    direction: 'forward'
  };

  const result = resolveLogArguments(args);

  assertEqual(result.direction, 'forward', 'direction 应原样传递');
});

test('别名模式下查询参数也应原样传递', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('passthrough-loki', {
    type: 'loki',
    baseUrl: 'http://loki:3100',
    user: 'u',
    pwd: 'p'
  });

  const args = {
    alias: 'passthrough-loki',
    query: '{namespace="prod"} |= "panic"',
    start: '30m',
    end: 'now',
    limit: 500,
    direction: 'backward'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.query, '{namespace="prod"} |= "panic"', 'query 应原样传递');
  assertEqual(result.start, '30m', 'start 应原样传递');
  assertEqual(result.end, 'now', 'end 应原样传递');
  assertEqual(result.limit, 500, 'limit 应原样传递');
  assertEqual(result.direction, 'backward', 'direction 应原样传递');

  cleanupDir(tempDir);
});

// ===== 返回值不包含 alias 字段 =====
console.log('\n返回值结构验证:');

test('返回值不应包含 alias 字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  cm.addConnection('no-alias-in-result', {
    type: 'loki',
    baseUrl: 'http://loki:3100',
    user: 'u',
    pwd: 'p'
  });

  const args = {
    alias: 'no-alias-in-result',
    query: '{app="svc"}',
    start: '1h'
  };
  const result = resolveLogArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.alias, undefined, '返回值不应包含 alias 字段');

  cleanupDir(tempDir);
});

test('直接参数模式返回值不包含 alias 字段', () => {
  const args = {
    baseUrl: 'http://loki:3100',
    query: '{app="svc"}',
    start: '1h'
  };

  const result = resolveLogArguments(args);

  assertEqual(result.alias, undefined, '返回值不应包含 alias 字段');
});

// ===== 测试结果汇总 =====
console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个测试`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
  process.exit(1);
}

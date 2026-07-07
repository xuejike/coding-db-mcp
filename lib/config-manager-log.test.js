'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ConfigManager = require('./config-manager');

// 测试辅助函数：创建临时目录
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-log-test-'));
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

function assertThrows(fn, msg = '') {
  try {
    fn();
    throw new Error(`${msg}\n    期望抛出错误，但没有抛出`);
  } catch (err) {
    if (err.message.includes('期望抛出错误')) throw err;
    // 正确抛出了错误
  }
}

// ===== 测试开始 =====
console.log('\nConfigManager 日志类型单元测试\n');

// --- 测试添加 loki 类型配置成功 ---
console.log('添加 loki 类型配置:');

test('成功添加 loki 类型配置（含认证信息）', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('prod-loki', {
    type: 'loki',
    baseUrl: 'http://loki.example.com:3100',
    user: 'admin',
    pwd: 'secret123'
  });

  // 验证文件已创建
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.version, '1.0', '配置文件应有 version 字段');
  assertEqual(config.connections['prod-loki'].type, 'loki', '类型应为 loki');
  assertEqual(config.connections['prod-loki'].baseUrl, 'http://loki.example.com:3100', 'baseUrl 应正确');
  assertEqual(config.connections['prod-loki'].user, 'admin', 'user 应正确');
  // 密码应已加密
  if (!config.connections['prod-loki'].pwd.startsWith('enc:v1:')) {
    throw new Error('密码应已加密（以 enc:v1: 开头）');
  }

  cleanupDir(tempDir);
});

test('成功添加 loki 类型配置（含 orgId 额外字段）', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('grafana-loki', {
    type: 'loki',
    baseUrl: 'http://loki.internal:3100',
    user: 'viewer',
    pwd: 'token123',
    orgId: '5'
  });

  // 验证额外字段 orgId 保存成功
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.connections['grafana-loki'].orgId, '5', 'orgId 应正确保存');

  cleanupDir(tempDir);
});

// --- 测试添加 elasticsearch 类型配置成功 ---
console.log('\n添加 elasticsearch 类型配置:');

test('成功添加 elasticsearch 类型配置（含认证信息）', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('prod-es', {
    type: 'elasticsearch',
    baseUrl: 'https://es.example.com:9200',
    user: 'elastic',
    pwd: 'es_pass_456'
  });

  // 验证文件已创建
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.connections['prod-es'].type, 'elasticsearch', '类型应为 elasticsearch');
  assertEqual(config.connections['prod-es'].baseUrl, 'https://es.example.com:9200', 'baseUrl 应正确');
  assertEqual(config.connections['prod-es'].user, 'elastic', 'user 应正确');
  // 密码应已加密
  if (!config.connections['prod-es'].pwd.startsWith('enc:v1:')) {
    throw new Error('密码应已加密（以 enc:v1: 开头）');
  }

  cleanupDir(tempDir);
});

test('成功添加 elasticsearch 类型配置（含 index 额外字段）', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('logs-es', {
    type: 'elasticsearch',
    baseUrl: 'http://localhost:9200',
    user: 'admin',
    pwd: 'admin123',
    index: 'app-logs-*'
  });

  // 验证额外字段 index 保存成功
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.connections['logs-es'].index, 'app-logs-*', 'index 应正确保存');

  cleanupDir(tempDir);
});

// --- 测试缺少 baseUrl 时拒绝添加 ---
console.log('\n缺少 baseUrl 时拒绝添加:');

test('loki 类型缺少 baseUrl 时抛出错误', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json',
    skipMigration: true
  });

  assertThrows(() => {
    cm.addConnection('bad-loki', {
      type: 'loki',
      user: 'admin',
      pwd: 'secret'
      // 缺少 baseUrl
    });
  }, 'loki 类型缺少 baseUrl 应被拒绝');

  cleanupDir(tempDir);
});

test('loki 类型缺少 baseUrl 时错误信息包含字段名', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json',
    skipMigration: true
  });

  try {
    cm.addConnection('bad-loki', {
      type: 'loki',
      user: 'admin',
      pwd: 'secret'
    });
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message === '应抛出错误') throw err;
    if (!err.message.includes('baseUrl')) {
      throw new Error('错误信息应包含缺失字段名 baseUrl');
    }
  }

  cleanupDir(tempDir);
});

test('elasticsearch 类型缺少 baseUrl 时抛出错误', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json',
    skipMigration: true
  });

  assertThrows(() => {
    cm.addConnection('bad-es', {
      type: 'elasticsearch',
      user: 'elastic',
      pwd: 'pass'
      // 缺少 baseUrl
    });
  }, 'elasticsearch 类型缺少 baseUrl 应被拒绝');

  cleanupDir(tempDir);
});

// --- 测试无 user/pwd 的无认证模式 ---
console.log('\n无 user/pwd 的无认证模式:');

test('loki 类型无 user/pwd 时正常保存', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  // 仅提供 type 和 baseUrl，无 user/pwd
  cm.addConnection('internal-loki', {
    type: 'loki',
    baseUrl: 'http://loki.internal:3100'
  });

  // 验证配置保存成功
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.connections['internal-loki'].type, 'loki', '类型应正确');
  assertEqual(config.connections['internal-loki'].baseUrl, 'http://loki.internal:3100', 'baseUrl 应正确');
  // user 和 pwd 不应存在
  assertEqual(config.connections['internal-loki'].user, undefined, '无认证模式不应有 user 字段');
  assertEqual(config.connections['internal-loki'].pwd, undefined, '无认证模式不应有 pwd 字段');

  cleanupDir(tempDir);
});

test('elasticsearch 类型无 user/pwd 时正常保存', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  // 仅提供 type 和 baseUrl
  cm.addConnection('local-es', {
    type: 'elasticsearch',
    baseUrl: 'http://localhost:9200'
  });

  // 验证配置保存成功
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.connections['local-es'].type, 'elasticsearch', '类型应正确');
  assertEqual(config.connections['local-es'].baseUrl, 'http://localhost:9200', 'baseUrl 应正确');

  cleanupDir(tempDir);
});

test('无认证模式下 resolveAlias 返回 user 和 pwd 为 undefined', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('noauth-loki', {
    type: 'loki',
    baseUrl: 'http://loki.local:3100'
  });

  const result = cm.resolveAlias('noauth-loki');
  assertEqual(result.type, 'loki', 'type 应正确');
  assertEqual(result.baseUrl, 'http://loki.local:3100', 'baseUrl 应正确');
  assertEqual(result.user, undefined, '无认证模式 user 应为 undefined');
  assertEqual(result.pwd, undefined, '无认证模式 pwd 应为 undefined');

  cleanupDir(tempDir);
});

// --- 测试 resolveAlias 返回正确的日志配置格式 ---
console.log('\nresolveAlias 返回正确的日志配置格式:');

test('resolveAlias loki 类型返回 {type, baseUrl, user, pwd} 格式', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('test-loki', {
    type: 'loki',
    baseUrl: 'http://loki.prod:3100',
    user: 'admin',
    pwd: 'loki_secret'
  });

  const result = cm.resolveAlias('test-loki');
  assertEqual(result.type, 'loki', 'type 应为 loki');
  assertEqual(result.baseUrl, 'http://loki.prod:3100', 'baseUrl 应正确');
  assertEqual(result.user, 'admin', 'user 应正确');
  assertEqual(result.pwd, 'loki_secret', 'pwd 应已解密为明文');

  // 不应包含数据库相关字段
  assertEqual(result.host, undefined, '日志类型不应有 host 字段');
  assertEqual(result.port, undefined, '日志类型不应有 port 字段');
  assertEqual(result.db, undefined, '日志类型不应有 db 字段');

  cleanupDir(tempDir);
});

test('resolveAlias elasticsearch 类型返回正确格式', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('test-es', {
    type: 'elasticsearch',
    baseUrl: 'https://es.prod:9200',
    user: 'elastic',
    pwd: 'es_password'
  });

  const result = cm.resolveAlias('test-es');
  assertEqual(result.type, 'elasticsearch', 'type 应为 elasticsearch');
  assertEqual(result.baseUrl, 'https://es.prod:9200', 'baseUrl 应正确');
  assertEqual(result.user, 'elastic', 'user 应正确');
  assertEqual(result.pwd, 'es_password', 'pwd 应已解密为明文');

  cleanupDir(tempDir);
});

test('resolveAlias loki 类型包含额外字段 orgId', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('multi-tenant-loki', {
    type: 'loki',
    baseUrl: 'http://loki.multi:3100',
    user: 'viewer',
    pwd: 'token_abc',
    orgId: '42'
  });

  const result = cm.resolveAlias('multi-tenant-loki');
  assertEqual(result.type, 'loki', 'type 应正确');
  assertEqual(result.baseUrl, 'http://loki.multi:3100', 'baseUrl 应正确');
  assertEqual(result.orgId, '42', 'orgId 额外字段应返回');

  cleanupDir(tempDir);
});

test('resolveAlias elasticsearch 类型包含额外字段 index', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('indexed-es', {
    type: 'elasticsearch',
    baseUrl: 'http://es.local:9200',
    user: 'admin',
    pwd: 'admin_pass',
    index: 'service-logs-*'
  });

  const result = cm.resolveAlias('indexed-es');
  assertEqual(result.type, 'elasticsearch', 'type 应正确');
  assertEqual(result.baseUrl, 'http://es.local:9200', 'baseUrl 应正确');
  assertEqual(result.index, 'service-logs-*', 'index 额外字段应返回');

  cleanupDir(tempDir);
});

test('resolveAlias 日志类型大小写不敏感查找', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  cm.addConnection('MyLoki', {
    type: 'loki',
    baseUrl: 'http://loki:3100',
    user: 'u',
    pwd: 'p'
  });

  // 使用不同大小写解析
  const result1 = cm.resolveAlias('myloki');
  const result2 = cm.resolveAlias('MYLOKI');
  const result3 = cm.resolveAlias('MyLoki');

  assertEqual(result1.baseUrl, 'http://loki:3100', '小写应能解析');
  assertEqual(result2.baseUrl, 'http://loki:3100', '大写应能解析');
  assertEqual(result3.baseUrl, 'http://loki:3100', '混合大小写应能解析');

  cleanupDir(tempDir);
});

test('resolveAlias 日志类型密码自动解密', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json',
    skipMigration: true
  });

  const plainPassword = 'my_log_secret!@#$%';
  cm.addConnection('enc-loki', {
    type: 'loki',
    baseUrl: 'http://loki:3100',
    user: 'admin',
    pwd: plainPassword
  });

  // 验证存储的密码是加密的
  const rawConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  if (!rawConfig.connections['enc-loki'].pwd.startsWith('enc:v1:')) {
    throw new Error('密码应以加密形式存储');
  }

  // resolveAlias 应返回解密后的明文密码
  const result = cm.resolveAlias('enc-loki');
  assertEqual(result.pwd, plainPassword, '解析后密码应为原始明文');

  cleanupDir(tempDir);
});

// ===== 测试结果汇总 =====
console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个测试`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
  process.exit(1);
}

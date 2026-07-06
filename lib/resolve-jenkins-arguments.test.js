'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveJenkinsArguments } = require('./resolve-jenkins-arguments');
const ConfigManager = require('./config-manager');

// 测试辅助函数：创建临时目录
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-jenkins-args-test-'));
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
console.log('\nresolveJenkinsArguments 单元测试\n');

// ===== 无 alias 时的直接参数模式 =====
console.log('无 alias 时 - 验证直接参数完整性:');

test('完整的直接参数应原样返回', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin',
    token: 'my-api-token',
    jobName: 'my-job',
    buildNumber: 5
  };

  const result = resolveJenkinsArguments(args);

  assertEqual(result.baseUrl, 'http://jenkins.example.com:8080', 'baseUrl 应正确');
  assertEqual(result.user, 'admin', 'user 应正确');
  assertEqual(result.token, 'my-api-token', 'token 应正确');
  assertEqual(result.jobName, 'my-job', 'jobName 应透传');
  assertEqual(result.buildNumber, 5, 'buildNumber 应透传');
});

test('无 alias 且缺少 baseUrl 字段时抛出错误', () => {
  const args = {
    user: 'admin',
    token: 'my-api-token'
  };

  assertThrows(() => resolveJenkinsArguments(args), 'baseUrl');
});

test('无 alias 且缺少 user 字段时抛出错误', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    token: 'my-api-token'
  };

  assertThrows(() => resolveJenkinsArguments(args), 'user');
});

test('无 alias 且缺少 token 字段时抛出错误', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin'
  };

  assertThrows(() => resolveJenkinsArguments(args), 'token');
});

test('无 alias 且缺少多个字段时错误信息包含所有缺失字段', () => {
  const args = { jobName: 'my-job' };

  assertThrows(() => resolveJenkinsArguments(args), 'baseUrl');
  assertThrows(() => resolveJenkinsArguments(args), 'user');
  assertThrows(() => resolveJenkinsArguments(args), 'token');
});

test('无 alias 且所有连接字段都缺少时抛出错误', () => {
  const args = { jobName: 'my-job' };
  assertThrows(() => resolveJenkinsArguments(args), '缺少必填参数');
});

test('错误信息应包含使用 alias 的提示', () => {
  const args = { jobName: 'my-job' };
  assertThrows(() => resolveJenkinsArguments(args), '--alias');
});

test('alias 为空字符串时视为无 alias，使用直接参数模式', () => {
  const args = {
    alias: '',
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin',
    token: 'my-api-token'
  };

  const result = resolveJenkinsArguments(args);
  assertEqual(result.baseUrl, 'http://jenkins.example.com:8080', 'baseUrl 应正确');
  assertEqual(result.user, 'admin', 'user 应正确');
  assertEqual(result.token, 'my-api-token', 'token 应正确');
});

test('baseUrl 为空字符串时视为缺失', () => {
  const args = {
    baseUrl: '',
    user: 'admin',
    token: 'my-api-token'
  };

  assertThrows(() => resolveJenkinsArguments(args), 'baseUrl');
});

test('user 为纯空白字符串时视为缺失', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: '   ',
    token: 'my-api-token'
  };

  assertThrows(() => resolveJenkinsArguments(args), 'user');
});

test('token 为纯空白字符串时视为缺失', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin',
    token: '  '
  };

  assertThrows(() => resolveJenkinsArguments(args), 'token');
});

test('parameters 参数应正确透传', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin',
    token: 'my-api-token',
    jobName: 'my-job',
    parameters: { branch: 'main', env: 'prod' }
  };

  const result = resolveJenkinsArguments(args);
  assertEqual(result.parameters, { branch: 'main', env: 'prod' }, 'parameters 应透传');
});

// ===== 有 alias 时通过 ConfigManager 解析 =====
console.log('\n有 alias 时 - 通过 ConfigManager 解析:');

test('使用 alias 解析已配置的 Jenkins 连接', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  // 手动写入 Jenkins 类型配置（模拟 ConfigManager 已支持 jenkins 类型）
  // resolveAlias 返回的格式: {type, host, port, user, pwd, db}
  // 对于 Jenkins: baseUrl 存在 baseUrl 字段或 host 字段, token 存在 pwd 字段
  const { encryptPassword } = require('./crypto');
  const configData = {
    version: '1.0',
    connections: {
      'my-jenkins': {
        type: 'jenkins',
        baseUrl: 'http://jenkins.local:8080',
        host: 'http://jenkins.local:8080',
        port: 8080,
        user: 'jenkins-user',
        pwd: encryptPassword('jenkins-token'),
        db: ''
      }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2));

  const args = {
    alias: 'my-jenkins',
    jobName: 'deploy-app'
  };
  const result = resolveJenkinsArguments(args, { userConfigPath, projectConfigPath });

  assertEqual(result.baseUrl, 'http://jenkins.local:8080', 'baseUrl 应从 alias 配置中解析');
  assertEqual(result.user, 'jenkins-user', 'user 应从 alias 配置中解析');
  assertEqual(result.token, 'jenkins-token', 'token 应从 alias 配置中解析（已解密）');
  assertEqual(result.jobName, 'deploy-app', 'jobName 应正确透传');

  cleanupDir(tempDir);
});

test('alias 不存在时抛出错误', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const args = {
    alias: 'nonexistent',
    jobName: 'my-job'
  };

  assertThrows(
    () => resolveJenkinsArguments(args, { userConfigPath, projectConfigPath }),
    'nonexistent'
  );

  cleanupDir(tempDir);
});

// ===== 直接参数覆盖 alias 配置 =====
console.log('\n直接参数覆盖 alias 配置:');

test('直接参数可以覆盖 alias 中的 baseUrl 字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const { encryptPassword } = require('./crypto');
  const configData = {
    version: '1.0',
    connections: {
      'my-jenkins': {
        type: 'jenkins',
        baseUrl: 'http://jenkins.local:8080',
        host: 'http://jenkins.local:8080',
        port: 8080,
        user: 'jenkins-user',
        pwd: encryptPassword('jenkins-token'),
        db: ''
      }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2));

  const args = {
    alias: 'my-jenkins',
    baseUrl: 'http://new-jenkins.local:9090',
    jobName: 'my-job'
  };

  const result = resolveJenkinsArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.baseUrl, 'http://new-jenkins.local:9090', '直接指定的 baseUrl 应覆盖 alias 配置');
  assertEqual(result.user, 'jenkins-user', '未覆盖的 user 应保持 alias 值');
  assertEqual(result.token, 'jenkins-token', '未覆盖的 token 应保持 alias 值');

  cleanupDir(tempDir);
});

test('直接参数可以覆盖 alias 中的多个字段', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const { encryptPassword } = require('./crypto');
  const configData = {
    version: '1.0',
    connections: {
      'my-jenkins': {
        type: 'jenkins',
        baseUrl: 'http://jenkins.local:8080',
        host: 'http://jenkins.local:8080',
        port: 8080,
        user: 'jenkins-user',
        pwd: encryptPassword('jenkins-token'),
        db: ''
      }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2));

  const args = {
    alias: 'my-jenkins',
    user: 'new-user',
    token: 'new-token',
    jobName: 'my-job'
  };

  const result = resolveJenkinsArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.baseUrl, 'http://jenkins.local:8080', '未覆盖的 baseUrl 应保持 alias 值');
  assertEqual(result.user, 'new-user', '直接指定的 user 应覆盖 alias 配置');
  assertEqual(result.token, 'new-token', '直接指定的 token 应覆盖 alias 配置');

  cleanupDir(tempDir);
});

test('undefined 和 null 的直接参数不应覆盖 alias 配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const { encryptPassword } = require('./crypto');
  const configData = {
    version: '1.0',
    connections: {
      'my-jenkins': {
        type: 'jenkins',
        baseUrl: 'http://jenkins.local:8080',
        host: 'http://jenkins.local:8080',
        port: 8080,
        user: 'jenkins-user',
        pwd: encryptPassword('jenkins-token'),
        db: ''
      }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2));

  const args = {
    alias: 'my-jenkins',
    baseUrl: undefined,
    user: null,
    token: undefined,
    jobName: 'my-job'
  };

  const result = resolveJenkinsArguments(args, { userConfigPath, projectConfigPath });
  assertEqual(result.baseUrl, 'http://jenkins.local:8080', 'undefined 不应覆盖 alias 配置');
  assertEqual(result.user, 'jenkins-user', 'null 不应覆盖 alias 配置');
  assertEqual(result.token, 'jenkins-token', 'undefined 不应覆盖 alias 配置');

  cleanupDir(tempDir);
});

// ===== 返回值结构验证 =====
console.log('\n返回值结构验证:');

test('无 alias 模式返回的对象包含所有必要字段', () => {
  const args = {
    baseUrl: 'http://jenkins.example.com:8080',
    user: 'admin',
    token: 'my-token',
    jobName: 'my-job',
    buildNumber: 10,
    parameters: { branch: 'main' }
  };

  const result = resolveJenkinsArguments(args);
  const expectedKeys = ['baseUrl', 'user', 'token', 'jobName', 'buildNumber', 'parameters'];
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`返回对象缺少字段: ${key}`);
    }
  }
});

test('alias 模式返回的对象包含 baseUrl, user, token 及操作参数', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const projectConfigPath = path.join(tempDir, 'project.json');

  const { encryptPassword } = require('./crypto');
  const configData = {
    version: '1.0',
    connections: {
      'my-jenkins': {
        type: 'jenkins',
        baseUrl: 'http://jenkins.local:8080',
        host: 'http://jenkins.local:8080',
        port: 8080,
        user: 'jenkins-user',
        pwd: encryptPassword('jenkins-token'),
        db: ''
      }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2));

  const result = resolveJenkinsArguments(
    { alias: 'my-jenkins', jobName: 'deploy', buildNumber: 'lastBuild' },
    { userConfigPath, projectConfigPath }
  );

  const expectedKeys = ['baseUrl', 'user', 'token', 'jobName', 'buildNumber'];
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`返回对象缺少字段: ${key}`);
    }
  }
  // 返回值不应包含 alias 字段
  assertEqual(result.alias, undefined, '返回值不应包含 alias');

  cleanupDir(tempDir);
});

// ===== 输出测试结果汇总 =====
console.log(`\n测试完成: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
}

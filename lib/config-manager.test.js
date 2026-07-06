'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const ConfigManager = require('./config-manager');

// 测试辅助函数：创建临时目录
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-test-'));
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

function assertNull(actual, msg = '') {
  if (actual !== null) {
    throw new Error(`${msg}\n    期望: null\n    实际: ${JSON.stringify(actual)}`);
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
console.log('\nConfigManager 单元测试\n');

console.log('构造函数测试:');

test('使用默认路径初始化', () => {
  const cm = new ConfigManager();
  const expectedUserPath = path.join(os.homedir(), '.develop-tool', 'config.json');
  assertEqual(cm.userConfigPath, expectedUserPath, '用户级配置路径不正确');
  assertEqual(cm.projectConfigPath, path.join(process.cwd(), '.develop-tool.json'), '项目级配置路径不正确');
});

test('使用自定义路径初始化', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/custom-user.json',
    projectConfigPath: '/tmp/custom-project.json'
  });
  assertEqual(cm.userConfigPath, '/tmp/custom-user.json', '用户级配置路径不正确');
  assertEqual(cm.projectConfigPath, '/tmp/custom-project.json', '项目级配置路径不正确');
});

console.log('\nloadConfigFile 测试:');

test('文件不存在时返回 null（不抛错）', () => {
  const cm = new ConfigManager();
  const result = cm.loadConfigFile('/tmp/non-existent-config-file-12345.json');
  assertNull(result, '文件不存在应返回 null');
});

test('文件存在且为合法 JSON 时正确解析', () => {
  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'config.json');
  const configData = {
    version: '1.0',
    connections: {
      'my-db': { type: 'mysql', host: 'localhost', port: 3306, user: 'root', pwd: 'pass', db: 'test' }
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');

  const cm = new ConfigManager();
  const result = cm.loadConfigFile(configPath);
  assertEqual(result, configData, '解析结果与写入内容不一致');

  cleanupDir(tempDir);
});

test('文件内容不是合法 JSON 时抛出详细错误', () => {
  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'bad-config.json');
  fs.writeFileSync(configPath, '{ invalid json content', 'utf-8');

  const cm = new ConfigManager();
  assertThrows(() => cm.loadConfigFile(configPath), '非法 JSON 应抛出错误');

  cleanupDir(tempDir);
});

console.log('\nloadMergedConfig 测试:');

test('两个配置文件都不存在时返回空配置', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });
  const result = cm.loadMergedConfig();
  assertEqual(result, { connections: {} }, '两个文件不存在时应返回空 connections');
});

test('仅用户级配置存在时返回用户级配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const userConfig = {
    version: '1.0',
    connections: {
      'user-db': { type: 'mysql', host: 'user-host', port: 3306, user: 'u', pwd: 'p', db: 'udb' }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });
  const result = cm.loadMergedConfig();
  assertEqual(result.connections['user-db'], userConfig.connections['user-db'], '应返回用户级配置');

  cleanupDir(tempDir);
});

test('仅项目级配置存在时返回项目级配置', () => {
  const tempDir = createTempDir();
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const projectConfig = {
    version: '1.0',
    connections: {
      'project-db': { type: 'postgresql', host: 'proj-host', port: 5432, user: 'p', pwd: 'pp', db: 'pdb' }
    }
  };
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), 'utf-8');

  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath
  });
  const result = cm.loadMergedConfig();
  assertEqual(result.connections['project-db'], projectConfig.connections['project-db'], '应返回项目级配置');

  cleanupDir(tempDir);
});

test('两层配置合并：不重名的 alias 都可访问', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');

  const userConfig = {
    version: '1.0',
    connections: {
      'user-only': { type: 'mysql', host: 'h1', port: 3306, user: 'u1', pwd: 'p1', db: 'd1' }
    }
  };
  const projectConfig = {
    version: '1.0',
    connections: {
      'project-only': { type: 'postgresql', host: 'h2', port: 5432, user: 'u2', pwd: 'p2', db: 'd2' }
    }
  };

  fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), 'utf-8');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  const result = cm.loadMergedConfig();

  assertEqual(result.connections['user-only'], userConfig.connections['user-only'], '用户级别名应可访问');
  assertEqual(result.connections['project-only'], projectConfig.connections['project-only'], '项目级别名应可访问');

  cleanupDir(tempDir);
});

test('两层配置合并：同名 alias 项目级优先', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');

  const userConfig = {
    version: '1.0',
    connections: {
      'shared-db': { type: 'mysql', host: 'user-host', port: 3306, user: 'u', pwd: 'p', db: 'user-db' }
    }
  };
  const projectConfig = {
    version: '1.0',
    connections: {
      'shared-db': { type: 'postgresql', host: 'project-host', port: 5432, user: 'pu', pwd: 'pp', db: 'project-db' }
    }
  };

  fs.writeFileSync(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
  fs.writeFileSync(projectConfigPath, JSON.stringify(projectConfig, null, 2), 'utf-8');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });
  const result = cm.loadMergedConfig();

  // 项目级配置应覆盖用户级配置
  assertEqual(result.connections['shared-db'].host, 'project-host', '同名 alias 应使用项目级配置');
  assertEqual(result.connections['shared-db'].type, 'postgresql', '同名 alias 的 type 应使用项目级');

  cleanupDir(tempDir);
});

console.log('\naddConnection 测试:');

test('成功添加连接配置到用户级配置文件', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'sub', 'config.json');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('MyDB', {
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    user: 'root',
    pwd: 'secret123',
    db: 'testdb'
  });

  // 验证文件已创建
  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  assertEqual(config.version, '1.0', '配置文件应有 version 字段');
  assertEqual(config.connections['mydb'].type, 'mysql', '数据库类型应正确');
  assertEqual(config.connections['mydb'].host, 'localhost', 'host 应正确');
  // 别名应存储为小写
  assertEqual(config.connections['MyDB'], undefined, '原始大写别名不应存在');
  // 密码应已加密
  if (!config.connections['mydb'].pwd.startsWith('enc:v1:')) {
    throw new Error('密码应已加密（以 enc:v1: 开头）');
  }

  cleanupDir(tempDir);
});

test('global 选项默认为 true，写入用户级配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user', 'config.json');
  const projectConfigPath = path.join(tempDir, 'project', 'config.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  cm.addConnection('testdb', {
    type: 'postgresql',
    host: 'db.example.com',
    port: 5432,
    user: 'admin',
    pwd: 'pass',
    db: 'mydb'
  });

  // 用户级配置文件应存在
  if (!fs.existsSync(userConfigPath)) {
    throw new Error('用户级配置文件应被创建');
  }
  // 项目级配置文件不应被创建
  if (fs.existsSync(projectConfigPath)) {
    throw new Error('项目级配置文件不应被创建');
  }

  cleanupDir(tempDir);
});

test('global 为 false 时写入项目级配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user', 'config.json');
  const projectConfigPath = path.join(tempDir, 'project', 'config.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  cm.addConnection('localdb', {
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    pwd: 'localpass',
    db: 'devdb'
  }, { global: false });

  // 项目级配置文件应存在
  if (!fs.existsSync(projectConfigPath)) {
    throw new Error('项目级配置文件应被创建');
  }
  // 用户级配置文件不应被创建
  if (fs.existsSync(userConfigPath)) {
    throw new Error('用户级配置文件不应被创建');
  }

  cleanupDir(tempDir);
});

test('别名格式无效时抛出错误 - 以连字符开头', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('-invalid', {
      type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
  }, '以连字符开头的别名应被拒绝');

  cleanupDir(tempDir);
});

test('别名格式无效时抛出错误 - 以点开头', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('.invalid', {
      type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
  }, '以点开头的别名应被拒绝');

  cleanupDir(tempDir);
});

test('别名格式无效时抛出错误 - 包含空格', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('has space', {
      type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
  }, '包含空格的别名应被拒绝');

  cleanupDir(tempDir);
});

test('别名格式无效时抛出错误 - 空字符串', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('', {
      type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
  }, '空字符串别名应被拒绝');

  cleanupDir(tempDir);
});

test('缺少必填配置字段时抛出错误', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('testdb', {
      type: 'mysql', host: 'localhost'
      // 缺少 port, user, pwd, db
    });
  }, '缺少必填字段应抛出错误');

  cleanupDir(tempDir);
});

test('不支持的数据库类型抛出错误', () => {
  const tempDir = createTempDir();
  const cm = new ConfigManager({
    userConfigPath: path.join(tempDir, 'config.json'),
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  assertThrows(() => {
    cm.addConnection('testdb', {
      type: 'sqlite', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
  }, '不支持的数据库类型应被拒绝');

  cleanupDir(tempDir);
});

test('别名统一存储为小写', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  cm.addConnection('MyDB_Server', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  if (!config.connections['mydb_server']) {
    throw new Error('别名应存储为小写');
  }
  if (config.connections['MyDB_Server']) {
    throw new Error('不应保留原始大小写');
  }

  cleanupDir(tempDir);
});

test('密码字段自动加密存储', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  const plainPwd = 'my_secret_password_123';
  cm.addConnection('enctest', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: plainPwd, db: 'd'
  });

  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  const storedPwd = config.connections['enctest'].pwd;

  // 密码应以 enc:v1: 开头
  if (!storedPwd.startsWith('enc:v1:')) {
    throw new Error('密码应以 enc:v1: 前缀加密存储');
  }
  // 密码不应包含明文
  if (storedPwd.includes(plainPwd)) {
    throw new Error('加密后的密码不应包含明文');
  }

  cleanupDir(tempDir);
});

test('在已有配置文件基础上追加连接不影响现有配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  // 预先写入一条配置
  const existingConfig = {
    version: '1.0',
    connections: {
      'existing-db': { type: 'mysql', host: 'old-host', port: 3306, user: 'u', pwd: 'enc:v1:test', db: 'olddb' }
    }
  };
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(userConfigPath, JSON.stringify(existingConfig, null, 2), 'utf-8');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  cm.addConnection('newdb', {
    type: 'postgresql', host: 'new-host', port: 5432, user: 'nu', pwd: 'np', db: 'newdb'
  });

  const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  // 原有配置应保留
  assertEqual(config.connections['existing-db'].host, 'old-host', '原有配置不应被修改');
  // 新配置应存在
  if (!config.connections['newdb']) {
    throw new Error('新添加的连接配置应存在');
  }

  cleanupDir(tempDir);
});

test('配置文件权限设为 0600', () => {
  // 仅在 Unix 系统上测试文件权限
  if (process.platform === 'win32') return;

  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'sub', 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  cm.addConnection('permtest', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  const stat = fs.statSync(userConfigPath);
  const mode = (stat.mode & 0o777).toString(8);
  if (mode !== '600') {
    throw new Error(`配置文件权限应为 0600，实际为 0${mode}`);
  }

  cleanupDir(tempDir);
});

test('目录权限设为 0700', () => {
  // 仅在 Unix 系统上测试目录权限
  if (process.platform === 'win32') return;

  const tempDir = createTempDir();
  const subDir = path.join(tempDir, 'newdir');
  const userConfigPath = path.join(subDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-99999.json'
  });

  cm.addConnection('dirtest', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  const stat = fs.statSync(subDir);
  const mode = (stat.mode & 0o777).toString(8);
  if (mode !== '700') {
    throw new Error(`目录权限应为 0700，实际为 0${mode}`);
  }

  cleanupDir(tempDir);
});

console.log('\nresolveAlias 测试:');

test('成功解析已存在的别名', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 先通过 addConnection 添加一条配置
  cm.addConnection('mydb', {
    type: 'mysql', host: 'localhost', port: 3306, user: 'root', pwd: 'secret', db: 'testdb'
  });

  // 解析别名
  const result = cm.resolveAlias('mydb');
  assertEqual(result.type, 'mysql', '数据库类型应正确');
  assertEqual(result.host, 'localhost', 'host 应正确');
  assertEqual(result.port, 3306, 'port 应正确');
  assertEqual(result.user, 'root', 'user 应正确');
  assertEqual(result.pwd, 'secret', '密码应已解密为明文');
  assertEqual(result.db, 'testdb', 'db 应正确');

  cleanupDir(tempDir);
});

test('大小写不敏感查找 - 使用大写解析小写存储的别名', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('MyDB', {
    type: 'mysql', host: 'localhost', port: 3306, user: 'root', pwd: 'pass123', db: 'app'
  });

  // 使用不同大小写变体解析
  const result1 = cm.resolveAlias('mydb');
  const result2 = cm.resolveAlias('MYDB');
  const result3 = cm.resolveAlias('MyDb');

  assertEqual(result1.host, 'localhost', '小写应能解析');
  assertEqual(result2.host, 'localhost', '大写应能解析');
  assertEqual(result3.host, 'localhost', '混合大小写应能解析');

  cleanupDir(tempDir);
});

test('项目级配置优先于用户级配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');

  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  // 添加用户级配置
  cm.addConnection('shared', {
    type: 'mysql', host: 'user-host', port: 3306, user: 'user-u', pwd: 'user-pwd', db: 'user-db'
  }, { global: true });

  // 添加项目级配置（同名别名）
  cm.addConnection('shared', {
    type: 'postgresql', host: 'project-host', port: 5432, user: 'proj-u', pwd: 'proj-pwd', db: 'proj-db'
  }, { global: false });

  // 解析应返回项目级配置
  const result = cm.resolveAlias('shared');
  assertEqual(result.type, 'postgresql', '应使用项目级配置的类型');
  assertEqual(result.host, 'project-host', '应使用项目级配置的 host');
  assertEqual(result.pwd, 'proj-pwd', '应使用项目级配置的密码（已解密）');

  cleanupDir(tempDir);
});

test('自动解密密码字段 - 加密密码', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  const plainPassword = 'my_super_secret_pw!@#$';
  cm.addConnection('encdb', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: plainPassword, db: 'd'
  });

  // 验证存储的密码是加密的
  const rawConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'));
  if (!rawConfig.connections['encdb'].pwd.startsWith('enc:v1:')) {
    throw new Error('密码应以加密形式存储');
  }

  // resolveAlias 应返回解密后的明文密码
  const result = cm.resolveAlias('encdb');
  assertEqual(result.pwd, plainPassword, '解析后密码应为原始明文');

  cleanupDir(tempDir);
});

test('自动解密密码字段 - 明文密码兼容', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');

  // 手动写入含有明文密码的配置文件（模拟旧配置）
  const configData = {
    version: '1.0',
    connections: {
      'olddb': { type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'plaintext_pass', db: 'd' }
    }
  };
  fs.writeFileSync(userConfigPath, JSON.stringify(configData, null, 2), 'utf-8');

  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 明文密码应原样返回
  const result = cm.resolveAlias('olddb');
  assertEqual(result.pwd, 'plaintext_pass', '明文密码应原样返回');

  cleanupDir(tempDir);
});

test('别名不存在时抛出包含可用别名列表的错误', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 添加一些别名
  cm.addConnection('db_one', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });
  cm.addConnection('db_two', {
    type: 'postgresql', host: 'h', port: 5432, user: 'u', pwd: 'p', db: 'd'
  });

  // 查找不存在的别名应抛出错误
  try {
    cm.resolveAlias('nonexistent');
    throw new Error('应抛出别名不存在的错误');
  } catch (err) {
    if (err.message.includes('应抛出别名不存在的错误')) throw err;
    // 错误信息应包含可用别名
    if (!err.message.includes('db_one')) {
      throw new Error('错误信息应包含可用别名 db_one');
    }
    if (!err.message.includes('db_two')) {
      throw new Error('错误信息应包含可用别名 db_two');
    }
    if (!err.message.includes('nonexistent')) {
      throw new Error('错误信息应包含用户查找的别名');
    }
  }

  cleanupDir(tempDir);
});

test('别名不存在时（无任何配置）抛出错误并提示无可用别名', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  try {
    cm.resolveAlias('anything');
    throw new Error('应抛出别名不存在的错误');
  } catch (err) {
    if (err.message.includes('应抛出别名不存在的错误')) throw err;
    if (!err.message.includes('anything')) {
      throw new Error('错误信息应包含用户查找的别名');
    }
  }
});

test('resolveAlias 返回完整的配置对象结构', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('fulltest', {
    type: 'oracle', host: 'oracle-host', port: 1521, user: 'ora_user', pwd: 'ora_pass', db: 'ORCL'
  });

  const result = cm.resolveAlias('fulltest');
  // 验证返回对象包含全部6个必要字段
  const expectedKeys = ['type', 'host', 'port', 'user', 'pwd', 'db'];
  for (const key of expectedKeys) {
    if (!(key in result)) {
      throw new Error(`返回对象缺少字段: ${key}`);
    }
  }
  assertEqual(result.type, 'oracle');
  assertEqual(result.host, 'oracle-host');
  assertEqual(result.port, 1521);
  assertEqual(result.user, 'ora_user');
  assertEqual(result.pwd, 'ora_pass');
  assertEqual(result.db, 'ORCL');

  cleanupDir(tempDir);
});

console.log('\nremoveConnection 测试:');

test('成功从用户级配置中删除别名', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 先添加一条配置
  cm.addConnection('todelete', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  // 确认别名存在
  if (!cm.hasAlias('todelete')) {
    throw new Error('添加后别名应存在');
  }

  // 删除别名
  cm.removeConnection('todelete');

  // 确认别名已删除
  if (cm.hasAlias('todelete')) {
    throw new Error('删除后别名不应存在');
  }

  cleanupDir(tempDir);
});

test('从项目级配置中删除别名（global 为 false）', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  // 添加到项目级配置
  cm.addConnection('projdb', {
    type: 'postgresql', host: 'h', port: 5432, user: 'u', pwd: 'p', db: 'd'
  }, { global: false });

  // 确认别名存在
  if (!cm.hasAlias('projdb')) {
    throw new Error('添加后别名应存在');
  }

  // 从项目级删除
  cm.removeConnection('projdb', { global: false });

  // 确认别名已删除
  if (cm.hasAlias('projdb')) {
    throw new Error('删除后别名不应存在');
  }

  cleanupDir(tempDir);
});

test('删除别名时大小写不敏感', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('MyDB', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  // 使用不同大小写删除
  cm.removeConnection('MYDB');

  if (cm.hasAlias('mydb')) {
    throw new Error('删除后别名不应存在');
  }

  cleanupDir(tempDir);
});

test('删除不存在的别名不抛错', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 先添加一条其他配置，确保文件存在
  cm.addConnection('keepme', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  // 删除不存在的别名不应抛出错误
  cm.removeConnection('nonexistent');

  // 原有配置不受影响
  if (!cm.hasAlias('keepme')) {
    throw new Error('其他别名不应被影响');
  }

  cleanupDir(tempDir);
});

test('删除别名不影响同文件中的其他配置', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('db_a', {
    type: 'mysql', host: 'host-a', port: 3306, user: 'u', pwd: 'p', db: 'a'
  });
  cm.addConnection('db_b', {
    type: 'postgresql', host: 'host-b', port: 5432, user: 'u', pwd: 'p', db: 'b'
  });

  // 删除 db_a
  cm.removeConnection('db_a');

  // db_b 应仍然存在
  if (!cm.hasAlias('db_b')) {
    throw new Error('其他别名不应被影响');
  }
  const result = cm.resolveAlias('db_b');
  assertEqual(result.host, 'host-b', 'db_b 的配置应完好');

  cleanupDir(tempDir);
});

console.log('\nlistConnections 测试:');

test('无任何配置时返回空数组', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  const result = cm.listConnections();
  assertEqual(result, [], '无配置时应返回空数组');
});

test('正确返回用户级配置的别名摘要', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('userdb', {
    type: 'mysql', host: 'user-host', port: 3306, user: 'u', pwd: 'p', db: 'userdb'
  });

  const result = cm.listConnections();
  assertEqual(result.length, 1, '应有一个连接');
  assertEqual(result[0].alias, 'userdb', '别名应正确');
  assertEqual(result[0].type, 'mysql', '类型应正确');
  assertEqual(result[0].host, 'user-host', '主机应正确');
  assertEqual(result[0].db, 'userdb', '数据库名应正确');
  assertEqual(result[0].source, 'user', '来源应为 user');

  cleanupDir(tempDir);
});

test('正确返回项目级配置的别名摘要', () => {
  const tempDir = createTempDir();
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath
  });

  cm.addConnection('projdb', {
    type: 'postgresql', host: 'proj-host', port: 5432, user: 'u', pwd: 'p', db: 'projdb'
  }, { global: false });

  const result = cm.listConnections();
  assertEqual(result.length, 1, '应有一个连接');
  assertEqual(result[0].alias, 'projdb', '别名应正确');
  assertEqual(result[0].type, 'postgresql', '类型应正确');
  assertEqual(result[0].host, 'proj-host', '主机应正确');
  assertEqual(result[0].db, 'projdb', '数据库名应正确');
  assertEqual(result[0].source, 'project', '来源应为 project');

  cleanupDir(tempDir);
});

test('同名 alias 项目级标记为 project 来源', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  // 用户级和项目级都添加同名别名
  cm.addConnection('shared', {
    type: 'mysql', host: 'user-host', port: 3306, user: 'u', pwd: 'p', db: 'user-db'
  }, { global: true });
  cm.addConnection('shared', {
    type: 'postgresql', host: 'proj-host', port: 5432, user: 'u', pwd: 'p', db: 'proj-db'
  }, { global: false });

  const result = cm.listConnections();
  // 同名别名只出现一次，来源为 project
  const sharedItems = result.filter(r => r.alias === 'shared');
  assertEqual(sharedItems.length, 1, '同名 alias 应只出现一次');
  assertEqual(sharedItems[0].source, 'project', '同名 alias 来源应为 project');
  assertEqual(sharedItems[0].host, 'proj-host', '应使用项目级配置数据');

  cleanupDir(tempDir);
});

test('列出多层配置中所有不重名的别名', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  cm.addConnection('user_only', {
    type: 'mysql', host: 'h1', port: 3306, user: 'u', pwd: 'p', db: 'd1'
  }, { global: true });
  cm.addConnection('proj_only', {
    type: 'postgresql', host: 'h2', port: 5432, user: 'u', pwd: 'p', db: 'd2'
  }, { global: false });

  const result = cm.listConnections();
  assertEqual(result.length, 2, '应有两个连接');

  const userOnly = result.find(r => r.alias === 'user_only');
  const projOnly = result.find(r => r.alias === 'proj_only');

  if (!userOnly) throw new Error('应包含 user_only');
  if (!projOnly) throw new Error('应包含 proj_only');

  assertEqual(userOnly.source, 'user', 'user_only 来源应为 user');
  assertEqual(projOnly.source, 'project', 'proj_only 来源应为 project');

  cleanupDir(tempDir);
});

console.log('\nhasAlias 测试:');

test('已存在的别名返回 true', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('existdb', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  assertEqual(cm.hasAlias('existdb'), true, '已存在的别名应返回 true');

  cleanupDir(tempDir);
});

test('不存在的别名返回 false', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  assertEqual(cm.hasAlias('nonexistent'), false, '不存在的别名应返回 false');
});

test('hasAlias 大小写不敏感', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('MyDB', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  assertEqual(cm.hasAlias('mydb'), true, '小写应返回 true');
  assertEqual(cm.hasAlias('MYDB'), true, '大写应返回 true');
  assertEqual(cm.hasAlias('MyDb'), true, '混合大小写应返回 true');

  cleanupDir(tempDir);
});

test('hasAlias 检查项目级配置中的别名', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'user-config.json');
  const projectConfigPath = path.join(tempDir, 'project-config.json');
  const cm = new ConfigManager({ userConfigPath, projectConfigPath });

  cm.addConnection('projdb', {
    type: 'postgresql', host: 'h', port: 5432, user: 'u', pwd: 'p', db: 'd'
  }, { global: false });

  assertEqual(cm.hasAlias('projdb'), true, '项目级别名应能被检测到');

  cleanupDir(tempDir);
});

test('删除后 hasAlias 返回 false', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  cm.addConnection('tempdb', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });

  assertEqual(cm.hasAlias('tempdb'), true, '删除前应存在');
  cm.removeConnection('tempdb');
  assertEqual(cm.hasAlias('tempdb'), false, '删除后应不存在');

  cleanupDir(tempDir);
});

// ===== 错误处理单元测试 (Requirements 10.1, 10.2, 10.3) =====
console.log('\n错误处理测试 (10.1 别名不存在):');

test('别名不存在时错误信息包含别名名称', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  try {
    cm.resolveAlias('my_missing_alias');
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    if (!err.message.includes('my_missing_alias')) {
      throw new Error('错误信息应包含别名名称 "my_missing_alias"');
    }
  }
});

test('别名不存在时错误信息包含可用别名列表', () => {
  const tempDir = createTempDir();
  const userConfigPath = path.join(tempDir, 'config.json');
  const cm = new ConfigManager({
    userConfigPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  // 添加一些已知别名
  cm.addConnection('prod_db', {
    type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
  });
  cm.addConnection('staging_db', {
    type: 'postgresql', host: 'h', port: 5432, user: 'u', pwd: 'p', db: 'd'
  });

  try {
    cm.resolveAlias('unknown');
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    // 错误信息应列出所有可用别名
    if (!err.message.includes('prod_db')) {
      throw new Error('错误信息应包含可用别名 "prod_db"');
    }
    if (!err.message.includes('staging_db')) {
      throw new Error('错误信息应包含可用别名 "staging_db"');
    }
  }

  cleanupDir(tempDir);
});

test('别名不存在时错误信息包含 config list 提示', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  try {
    cm.resolveAlias('nonexistent');
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    if (!err.message.includes('config list')) {
      throw new Error('错误信息应包含 "config list" 恢复建议');
    }
  }
});

test('别名不存在时错误信息包含 config add 提示', () => {
  const cm = new ConfigManager({
    userConfigPath: '/tmp/non-existent-user-99999.json',
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  try {
    cm.resolveAlias('nonexistent');
    throw new Error('应抛出错误');
  } catch (err) {
    if (err.message.includes('应抛出错误')) throw err;
    if (!err.message.includes('config add')) {
      throw new Error('错误信息应包含 "config add" 恢复建议');
    }
  }
});

console.log('\n错误处理测试 (10.2 文件权限不足):');

test('loadConfigFile 权限不足时错误信息包含文件路径', () => {
  // 仅在 Unix 系统上测试文件权限
  if (process.platform === 'win32') return;

  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'no-read.json');

  // 创建文件并设为不可读
  fs.writeFileSync(configPath, '{"version":"1.0","connections":{}}', 'utf-8');
  fs.chmodSync(configPath, 0o000);

  const cm = new ConfigManager();
  try {
    cm.loadConfigFile(configPath);
    // 如果没抛出错误（可能是 root 用户），跳过测试
  } catch (err) {
    if (!err.message.includes(configPath)) {
      throw new Error(`错误信息应包含文件路径 "${configPath}"`);
    }
    // 验证错误信息包含权限相关提示
    if (!err.message.includes('权限')) {
      throw new Error('错误信息应包含 "权限" 关键字');
    }
  } finally {
    // 恢复权限以便清理
    try { fs.chmodSync(configPath, 0o644); } catch (e) { /* 忽略 */ }
    cleanupDir(tempDir);
  }
});

test('addConnection 写入权限不足时错误信息包含文件路径', () => {
  // 仅在 Unix 系统上测试文件权限
  if (process.platform === 'win32') return;

  const tempDir = createTempDir();
  const readonlyDir = path.join(tempDir, 'readonly');
  fs.mkdirSync(readonlyDir, { mode: 0o555 });
  const configPath = path.join(readonlyDir, 'subdir', 'config.json');

  const cm = new ConfigManager({
    userConfigPath: configPath,
    projectConfigPath: '/tmp/non-existent-project-99999.json'
  });

  try {
    cm.addConnection('testdb', {
      type: 'mysql', host: 'h', port: 3306, user: 'u', pwd: 'p', db: 'd'
    });
    // 如果没抛出错误（可能是 root 用户），跳过测试
  } catch (err) {
    if (!err.message.includes(configPath)) {
      throw new Error(`错误信息应包含文件路径 "${configPath}"`);
    }
  } finally {
    // 恢复权限以便清理
    try { fs.chmodSync(readonlyDir, 0o755); } catch (e) { /* 忽略 */ }
    cleanupDir(tempDir);
  }
});

console.log('\n错误处理测试 (10.3 JSON 解析错误):');

test('JSON 解析错误时信息包含文件路径', () => {
  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'invalid.json');
  fs.writeFileSync(configPath, '{ "broken": json }', 'utf-8');

  const cm = new ConfigManager();
  try {
    cm.loadConfigFile(configPath);
    throw new Error('应抛出解析错误');
  } catch (err) {
    if (err.message.includes('应抛出解析错误')) throw err;
    if (!err.message.includes(configPath)) {
      throw new Error(`错误信息应包含文件路径 "${configPath}"`);
    }
  }

  cleanupDir(tempDir);
});

test('JSON 解析错误时信息包含解析错误详情', () => {
  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'invalid2.json');
  fs.writeFileSync(configPath, '{ not valid json at all', 'utf-8');

  const cm = new ConfigManager();
  try {
    cm.loadConfigFile(configPath);
    throw new Error('应抛出解析错误');
  } catch (err) {
    if (err.message.includes('应抛出解析错误')) throw err;
    // 应包含 JSON 解析的具体错误信息（如 Unexpected token 等）
    if (!err.message.includes('JSON')) {
      throw new Error('错误信息应包含 "JSON" 关键字说明是解析错误');
    }
  }

  cleanupDir(tempDir);
});

test('JSON 解析错误时信息包含恢复建议', () => {
  const tempDir = createTempDir();
  const configPath = path.join(tempDir, 'invalid3.json');
  fs.writeFileSync(configPath, 'not a json file', 'utf-8');

  const cm = new ConfigManager();
  try {
    cm.loadConfigFile(configPath);
    throw new Error('应抛出解析错误');
  } catch (err) {
    if (err.message.includes('应抛出解析错误')) throw err;
    // 应包含恢复建议（检查文件格式或重新配置）
    const hasRecoverySuggestion = err.message.includes('检查文件格式') ||
      err.message.includes('CLI') ||
      err.message.includes('重新配置');
    if (!hasRecoverySuggestion) {
      throw new Error('错误信息应包含恢复建议（如检查格式或使用 CLI 重新配置）');
    }
  }

  cleanupDir(tempDir);
});

// ===== 测试结果 =====
console.log(`\n测试结果: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
}

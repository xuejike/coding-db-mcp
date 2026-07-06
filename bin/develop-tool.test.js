'use strict';

/**
 * bin/develop-tool.js CLI 命令解析单元测试
 * 测试 parseArgs 函数对 config 子命令和 --alias 选项的解析能力
 */

// 保存原始 process.argv
const originalArgv = process.argv;

/**
 * 简单测试运行器
 */
let passed = 0;
let failed = 0;

function test(name, fn) {
  // 每次测试前恢复 process.argv
  process.argv = originalArgv.slice();
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

/**
 * 模拟命令行参数并调用 parseArgs
 * @param {string[]} args - 模拟的命令行参数数组
 * @returns {Object} parseArgs 返回结果
 */
function mockParseArgs(args) {
  // 模拟 process.argv: [node路径, 脚本路径, ...用户参数]
  process.argv = ['node', 'bin/develop-tool.js', ...args];
  // 重新加载模块以使用新的 process.argv
  delete require.cache[require.resolve('./develop-tool.js')];
  const { parseArgs } = require('./develop-tool.js');
  return parseArgs();
}

// ===== 测试开始 =====
console.log('\nCLI 命令解析单元测试 (bin/develop-tool.js)\n');

// === Task 5.1: config 子命令解析 ===
console.log('config add 子命令解析:');

test('解析 config add 命令及别名', () => {
  const result = mockParseArgs([
    'config', 'add', 'mydb',
    '--type', 'mysql',
    '--host', 'localhost',
    '--port', '3306',
    '--user', 'root',
    '--password', 'secret',
    '--database', 'testdb'
  ]);
  assertEqual(result.command, 'config', '命令应为 config');
  assertEqual(result.subCommand, 'add', '子命令应为 add');
  assertEqual(result.configAlias, 'mydb', '别名应为 mydb');
  assertEqual(result.options.type, 'mysql', 'type 应为 mysql');
  assertEqual(result.options.host, 'localhost', 'host 应为 localhost');
  assertEqual(result.options.port, 3306, 'port 应为 3306');
  assertEqual(result.options.user, 'root', 'user 应为 root');
  assertEqual(result.options.password, 'secret', 'password 应为 secret');
  assertEqual(result.options.database, 'testdb', 'database 应为 testdb');
});

test('解析 config add 命令带 --global 选项', () => {
  const result = mockParseArgs([
    'config', 'add', 'proddb',
    '--type', 'postgresql',
    '--host', 'db.example.com',
    '--port', '5432',
    '--user', 'admin',
    '--password', 'pass123',
    '--database', 'production',
    '--global'
  ]);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'add');
  assertEqual(result.configAlias, 'proddb');
  assertEqual(result.options.global, true, '--global 应为 true');
  assertEqual(result.options.type, 'postgresql');
});

test('解析 config add 命令带 --password-stdin 选项', () => {
  const result = mockParseArgs([
    'config', 'add', 'securedb',
    '--type', 'mysql',
    '--host', 'localhost',
    '--port', '3306',
    '--user', 'root',
    '--password-stdin',
    '--database', 'mydb'
  ]);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'add');
  assertEqual(result.configAlias, 'securedb');
  assertEqual(result.options.passwordStdin, true, '--password-stdin 应为 true');
  assertEqual(result.options.password, undefined, '不应有 password 值');
});

console.log('\nconfig remove 子命令解析:');

test('解析 config remove 命令', () => {
  const result = mockParseArgs(['config', 'remove', 'olddb']);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'remove');
  assertEqual(result.configAlias, 'olddb');
});

test('解析 config remove 命令带 --global 选项', () => {
  const result = mockParseArgs(['config', 'remove', 'olddb', '--global']);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'remove');
  assertEqual(result.configAlias, 'olddb');
  assertEqual(result.options.global, true);
});

console.log('\nconfig list 子命令解析:');

test('解析 config list 命令', () => {
  const result = mockParseArgs(['config', 'list']);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'list');
  assertEqual(result.configAlias, null, 'list 不需要别名参数');
});

console.log('\nconfig show 子命令解析:');

test('解析 config show 命令', () => {
  const result = mockParseArgs(['config', 'show', 'mydb']);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'show');
  assertEqual(result.configAlias, 'mydb');
});

console.log('\nconfig 无子命令（旧行为）:');

test('config 无子命令时 subCommand 为 null', () => {
  const result = mockParseArgs(['config']);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, null, '无子命令时 subCommand 应为 null');
});

// === Task 5.3: query --alias 解析 ===
console.log('\nquery --alias 选项解析:');

test('解析 query 命令带 --alias 选项', () => {
  const result = mockParseArgs([
    'query', '--alias', 'mydb', '-q', 'SELECT 1'
  ]);
  assertEqual(result.command, 'query');
  assertEqual(result.options.alias, 'mydb', '--alias 应为 mydb');
  assertEqual(result.options.query, 'SELECT 1', 'query 应正确');
});

test('解析 query 命令同时带 --alias 和直接参数', () => {
  const result = mockParseArgs([
    'query', '--alias', 'mydb',
    '-q', 'SELECT 1',
    '-d', 'otherdb'
  ]);
  assertEqual(result.command, 'query');
  assertEqual(result.options.alias, 'mydb');
  assertEqual(result.options.query, 'SELECT 1');
  assertEqual(result.options.database, 'otherdb', 'database 覆盖参数应正确');
});

test('解析 query 命令不带 --alias（旧模式）', () => {
  const result = mockParseArgs([
    'query', '-t', 'mysql', '-H', 'localhost', '-P', '3306',
    '-u', 'root', '-p', 'pass', '-d', 'testdb', '-q', 'SELECT 1'
  ]);
  assertEqual(result.command, 'query');
  assertEqual(result.options.alias, undefined, '不带 --alias 时应为 undefined');
  assertEqual(result.options.host, 'localhost');
  assertEqual(result.options.port, 3306);
});

// === 边界情况 ===
console.log('\n边界情况:');

test('start 命令（默认命令）', () => {
  const result = mockParseArgs([]);
  assertEqual(result.command, 'start', '无参数时默认命令为 start');
});

test('-h 选项覆盖为 help 命令', () => {
  const result = mockParseArgs(['-h']);
  assertEqual(result.command, 'help');
});

test('-v 选项覆盖为 version 命令', () => {
  const result = mockParseArgs(['-v']);
  assertEqual(result.command, 'version');
});

test('config add 选项混合顺序解析', () => {
  const result = mockParseArgs([
    'config', 'add', 'mydb',
    '--host', 'dbhost',
    '--type', 'mssql',
    '--database', 'msdb',
    '--port', '1433',
    '--user', 'sa',
    '--password', 'Password1'
  ]);
  assertEqual(result.command, 'config');
  assertEqual(result.subCommand, 'add');
  assertEqual(result.configAlias, 'mydb');
  assertEqual(result.options.host, 'dbhost');
  assertEqual(result.options.type, 'mssql');
  assertEqual(result.options.database, 'msdb');
  assertEqual(result.options.port, 1433);
  assertEqual(result.options.user, 'sa');
  assertEqual(result.options.password, 'Password1');
});

// ===== 测试总结 =====
console.log('\n' + '='.repeat(40));
console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个测试`);
console.log('='.repeat(40));

// 恢复原始 argv
process.argv = originalArgv;

if (failed > 0) {
  process.exit(1);
}

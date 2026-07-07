'use strict';

/**
 * bin/develop-tool.js CLI log 子命令解析单元测试
 * 测试 parseArgs 函数对 log query / log metadata 子命令及相关选项的解析能力
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
console.log('\nCLI log 子命令解析单元测试 (bin/develop-tool.js)\n');

// === 1. log query 命令解析 ===
console.log('log query 子命令解析:');

test('解析 log query 带 --alias 和 -q 和 --start 选项', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'prod-loki', '-q', '{app="svc"}', '--start', '1h'
  ]);
  assertEqual(result.command, 'log', '命令应为 log');
  assertEqual(result.subCommand, 'query', '子命令应为 query');
  assertEqual(result.options.alias, 'prod-loki', '--alias 应为 prod-loki');
  assertEqual(result.options.query, '{app="svc"}', '-q 应为 {app="svc"}');
  assertEqual(result.options.start, '1h', '--start 应为 1h');
});

test('解析 log query 带 --base-url、-q、--limit、--direction 选项', () => {
  const result = mockParseArgs([
    'log', 'query', '--base-url', 'http://loki:3100',
    '-q', '{job="api"}', '--limit', '50', '--direction', 'forward'
  ]);
  assertEqual(result.command, 'log', '命令应为 log');
  assertEqual(result.subCommand, 'query', '子命令应为 query');
  assertEqual(result.options.baseUrl, 'http://loki:3100', '--base-url 应正确解析');
  assertEqual(result.options.query, '{job="api"}', '-q 应为 {job="api"}');
  assertEqual(result.options.limit, 50, '--limit 应为数字 50');
  assertEqual(result.options.direction, 'forward', '--direction 应为 forward');
});

test('解析 log query 带 --start 和 --end 时间选项', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'my-loki',
    '-q', '{app="web"}',
    '--start', '2024-01-15T00:00:00Z',
    '--end', '2024-01-15T12:00:00Z'
  ]);
  assertEqual(result.options.start, '2024-01-15T00:00:00Z', '--start 应正确解析 ISO 时间');
  assertEqual(result.options.end, '2024-01-15T12:00:00Z', '--end 应正确解析 ISO 时间');
});

test('解析 log query 带 --index 选项（Elasticsearch）', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'prod-es',
    '-q', '{"match":{"level":"ERROR"}}',
    '--index', 'app-logs-*',
    '--start', '24h',
    '--limit', '100'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'query');
  assertEqual(result.options.index, 'app-logs-*', '--index 应为 app-logs-*');
  assertEqual(result.options.limit, 100, '--limit 应为 100');
});

test('解析 log query 带 --type 选项', () => {
  const result = mockParseArgs([
    'log', 'query', '--type', 'elasticsearch',
    '--base-url', 'http://es:9200',
    '-q', '{"match_all":{}}',
    '--index', 'logs-*'
  ]);
  assertEqual(result.options.type, 'elasticsearch', '--type 应为 elasticsearch');
  assertEqual(result.options.baseUrl, 'http://es:9200', '--base-url 应正确');
});

test('解析 log query 所有选项组合', () => {
  const result = mockParseArgs([
    'log', 'query',
    '--alias', 'prod-loki',
    '-q', '{namespace="prod"}',
    '--start', '7d',
    '--end', 'now',
    '--limit', '200',
    '--direction', 'backward',
    '--index', 'my-index',
    '--type', 'loki'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'query');
  assertEqual(result.options.alias, 'prod-loki');
  assertEqual(result.options.query, '{namespace="prod"}');
  assertEqual(result.options.start, '7d');
  assertEqual(result.options.end, 'now');
  assertEqual(result.options.limit, 200);
  assertEqual(result.options.direction, 'backward');
  assertEqual(result.options.index, 'my-index');
  assertEqual(result.options.type, 'loki');
});

// === 2. log metadata 命令解析 ===
console.log('\nlog metadata 子命令解析:');

test('解析 log metadata 带 --alias 和 --metadata-type labels', () => {
  const result = mockParseArgs([
    'log', 'metadata', '--alias', 'prod-loki', '--metadata-type', 'labels'
  ]);
  assertEqual(result.command, 'log', '命令应为 log');
  assertEqual(result.subCommand, 'metadata', '子命令应为 metadata');
  assertEqual(result.options.alias, 'prod-loki', '--alias 应为 prod-loki');
  assertEqual(result.options.metadataType, 'labels', '--metadata-type 应为 labels');
});

test('解析 log metadata 带 --metadata-type mappings 和 --index', () => {
  const result = mockParseArgs([
    'log', 'metadata', '--alias', 'prod-es',
    '--metadata-type', 'mappings',
    '--index', 'app-logs-*'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'metadata');
  assertEqual(result.options.alias, 'prod-es');
  assertEqual(result.options.metadataType, 'mappings', '--metadata-type 应为 mappings');
  assertEqual(result.options.index, 'app-logs-*', '--index 应为 app-logs-*');
});

test('解析 log metadata 带 --label 选项（label_values 场景）', () => {
  const result = mockParseArgs([
    'log', 'metadata', '--alias', 'prod-loki',
    '--metadata-type', 'label_values',
    '--label', 'app'
  ]);
  assertEqual(result.options.metadataType, 'label_values', '--metadata-type 应为 label_values');
  assertEqual(result.options.label, 'app', '--label 应为 app');
});

test('解析 log metadata 带 --match 选项（series 场景）', () => {
  const result = mockParseArgs([
    'log', 'metadata', '--alias', 'prod-loki',
    '--metadata-type', 'series',
    '--match', '{namespace="production"}'
  ]);
  assertEqual(result.options.metadataType, 'series', '--metadata-type 应为 series');
  assertEqual(result.options.match, '{namespace="production"}', '--match 应正确解析');
});

test('解析 log metadata 带 --base-url 直接参数模式', () => {
  const result = mockParseArgs([
    'log', 'metadata',
    '--base-url', 'http://loki:3100',
    '--metadata-type', 'labels',
    '--type', 'loki'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'metadata');
  assertEqual(result.options.baseUrl, 'http://loki:3100');
  assertEqual(result.options.metadataType, 'labels');
  assertEqual(result.options.type, 'loki');
});

// === 3. 缺少 query 参数检测 ===
console.log('\n缺少 query 参数检测:');

test('log query 未提供 -q 参数时 options.query 为 undefined', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'prod-loki', '--start', '1h'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'query');
  assertEqual(result.options.query, undefined, '未指定 -q 时 query 应为 undefined');
});

test('log query 未提供任何选项时正确识别命令和子命令', () => {
  const result = mockParseArgs(['log', 'query']);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'query');
  assertEqual(result.options.query, undefined, 'query 应为 undefined');
  assertEqual(result.options.alias, undefined, 'alias 应为 undefined');
});

// === 4. --alias 参数解析 ===
console.log('\n--alias 参数解析:');

test('log query 的 --alias 参数正确解析', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'my-loki-instance', '-q', '{app="test"}'
  ]);
  assertEqual(result.options.alias, 'my-loki-instance', '--alias 应为 my-loki-instance');
});

test('log metadata 的 --alias 参数正确解析', () => {
  const result = mockParseArgs([
    'log', 'metadata', '--alias', 'es-cluster-1', '--metadata-type', 'indices'
  ]);
  assertEqual(result.options.alias, 'es-cluster-1', '--alias 应为 es-cluster-1');
});

test('log query 不带 --alias 时 alias 为 undefined', () => {
  const result = mockParseArgs([
    'log', 'query', '--base-url', 'http://loki:3100', '-q', '{job="test"}'
  ]);
  assertEqual(result.options.alias, undefined, '不指定 --alias 时应为 undefined');
  assertEqual(result.options.baseUrl, 'http://loki:3100');
});

test('log query 带 --alias 和 --user、--password 认证选项', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'secure-loki',
    '-q', '{app="auth"}',
    '-u', 'admin',
    '-p', 'secret123',
    '--start', '30m'
  ]);
  assertEqual(result.options.alias, 'secure-loki');
  assertEqual(result.options.user, 'admin', '--user 应为 admin');
  assertEqual(result.options.password, 'secret123', '--password 应为 secret123');
  assertEqual(result.options.start, '30m');
});

test('log query 带 --org-id 选项（Loki 租户）', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'multi-tenant-loki',
    '-q', '{app="svc"}',
    '--org-id', 'tenant-42'
  ]);
  assertEqual(result.options.orgId, 'tenant-42', '--org-id 应为 tenant-42');
});

// === 边界情况 ===
console.log('\n边界情况:');

test('log 无子命令时 subCommand 为 null', () => {
  const result = mockParseArgs(['log']);
  assertEqual(result.command, 'log', '命令应为 log');
  assertEqual(result.subCommand, null, '无子命令时 subCommand 应为 null');
});

test('--query 的长格式正确解析', () => {
  const result = mockParseArgs([
    'log', 'query', '--alias', 'prod-loki', '--query', '{app="svc"} |= "error"'
  ]);
  assertEqual(result.options.query, '{app="svc"} |= "error"', '--query 长格式应正确解析');
});

test('选项顺序不影响解析结果', () => {
  const result = mockParseArgs([
    'log', 'query',
    '--start', '2h',
    '-q', '{job="worker"}',
    '--limit', '25',
    '--alias', 'dev-loki',
    '--direction', 'forward'
  ]);
  assertEqual(result.command, 'log');
  assertEqual(result.subCommand, 'query');
  assertEqual(result.options.alias, 'dev-loki');
  assertEqual(result.options.query, '{job="worker"}');
  assertEqual(result.options.start, '2h');
  assertEqual(result.options.limit, 25);
  assertEqual(result.options.direction, 'forward');
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

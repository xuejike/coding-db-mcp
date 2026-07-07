'use strict';

const LogQueryTool = require('./log-query-tool.js');

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

function assertTrue(value, msg = '') {
  if (!value) {
    throw new Error(`${msg}\n    期望为 true，实际为 ${value}`);
  }
}

function assertContains(str, substr, msg = '') {
  if (!str.includes(substr)) {
    throw new Error(`${msg}\n    字符串中未包含: "${substr}"\n    实际: "${str}"`);
  }
}

console.log('\nformatAsMarkdown 单元测试\n');

const tool = new LogQueryTool();

// --- 空结果处理 ---
console.log('空结果处理:');

test('null entries 返回 "(无结果)"', () => {
  assertEqual(tool.formatAsMarkdown(null, 'loki'), '(无结果)');
});

test('undefined entries 返回 "(无结果)"', () => {
  assertEqual(tool.formatAsMarkdown(undefined, 'loki'), '(无结果)');
});

test('空数组返回 "(无结果)"', () => {
  assertEqual(tool.formatAsMarkdown([], 'elasticsearch'), '(无结果)');
});

// --- Loki 格式 ---
console.log('\nLoki 格式:');

test('Loki 格式包含正确表头', () => {
  const entries = [{ timestamp: '1705312981000000000', labels: { app: 'test' }, line: 'hello' }];
  const result = tool.formatAsMarkdown(entries, 'loki');
  assertContains(result, '| 时间 | 标签 | 内容 |', '表头');
  assertContains(result, '|---|---|---|', '分隔行');
});

test('Loki 纳秒时间戳转换为可读日期', () => {
  // 2024-01-15T10:03:01.000Z = 1705312981000 ms = 1705312981000000000 ns
  const entries = [{ timestamp: '1705312981000000000', labels: {}, line: 'test' }];
  const result = tool.formatAsMarkdown(entries, 'loki');
  // 日期部分应包含 2024-01-15（时间因时区可能不同）
  assertContains(result, '2024-01-15', '日期部分');
});

test('Loki 标签格式化为 key=value,key2=value2', () => {
  const entries = [{ timestamp: '1705312981000000000', labels: { app: 'payment', env: 'prod' }, line: 'test' }];
  const result = tool.formatAsMarkdown(entries, 'loki');
  assertContains(result, 'app=payment', '包含标签');
  assertContains(result, 'env=prod', '包含标签');
});

test('Loki 空标签显示为空', () => {
  const entries = [{ timestamp: '1705312981000000000', labels: {}, line: 'test' }];
  const result = tool.formatAsMarkdown(entries, 'loki');
  // 表格行应存在但标签列为空
  assertTrue(result.split('\n').length >= 3, '至少有表头+分隔+数据行');
});

test('Loki 日志内容中管道符被转义', () => {
  const entries = [{ timestamp: '1705312981000000000', labels: {}, line: 'error | detail' }];
  const result = tool.formatAsMarkdown(entries, 'loki');
  assertContains(result, 'error \\| detail', '管道符应被转义');
});

test('Loki 多条日志正确显示', () => {
  const entries = [
    { timestamp: '1705312982000000000', labels: { app: 'a' }, line: 'line1' },
    { timestamp: '1705312981000000000', labels: { app: 'b' }, line: 'line2' },
    { timestamp: '1705312980000000000', labels: { app: 'c' }, line: 'line3' }
  ];
  const result = tool.formatAsMarkdown(entries, 'loki');
  const lines = result.split('\n');
  assertEqual(lines.length, 5, '应有 5 行（表头+分隔+3数据行）');
  assertContains(result, 'line1');
  assertContains(result, 'line2');
  assertContains(result, 'line3');
});

// --- ES 格式 ---
console.log('\nElasticsearch 格式:');

test('ES 格式动态检测字段名', () => {
  const entries = [
    { '@timestamp': '2024-01-15T10:00:01Z', message: 'error', level: 'ERROR' },
    { '@timestamp': '2024-01-15T10:00:00Z', message: 'warn', level: 'WARN' }
  ];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  assertContains(result, '@timestamp');
  assertContains(result, 'message');
  assertContains(result, 'level');
});

test('ES 格式优先显示 @timestamp 和 message 列', () => {
  const entries = [{ level: 'ERROR', '@timestamp': '2024-01-15', message: 'test', host: 'a' }];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  const headerLine = result.split('\n')[0];
  const timestampIdx = headerLine.indexOf('@timestamp');
  const messageIdx = headerLine.indexOf('message');
  const levelIdx = headerLine.indexOf('level');
  assertTrue(timestampIdx < messageIdx, '@timestamp 应在 message 前');
  assertTrue(messageIdx < levelIdx, 'message 应在 level 前');
});

test('ES 格式超长字段被截断并添加 "..."', () => {
  const longMsg = 'A'.repeat(150);
  const entries = [{ message: longMsg }];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  assertContains(result, '...', '应有省略号');
  assertTrue(!result.includes(longMsg), '不应包含完整的 150 字符');
});

test('ES 格式处理 null/undefined 字段值', () => {
  const entries = [{ '@timestamp': '2024-01-15', message: null, level: undefined }];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  // 不应抛出错误
  assertTrue(result.includes('@timestamp'), '应有表头');
});

test('ES 格式处理对象类型字段值', () => {
  const entries = [{ data: { nested: 'value' }, count: 42 }];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  assertContains(result, '{"nested":"value"}', '对象应序列化为 JSON');
  assertContains(result, '42', '数字应转为字符串');
});

test('ES 格式不同文档有不同字段时合并所有列', () => {
  const entries = [
    { '@timestamp': '2024-01-15', message: 'hello' },
    { '@timestamp': '2024-01-16', level: 'INFO' }
  ];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  assertContains(result, '@timestamp');
  assertContains(result, 'message');
  assertContains(result, 'level');
});

test('ES 格式所有文档字段均为空对象时返回 "(无结果)"', () => {
  const entries = [{}];
  const result = tool.formatAsMarkdown(entries, 'elasticsearch');
  assertEqual(result, '(无结果)');
});

// --- 集成测试 ---
console.log('\n集成测试 (executeLoki 使用真实 formatAsMarkdown):');

test('executeLoki 使用真实的 formatAsMarkdown 不抛异常', async () => {
  const integTool = new LogQueryTool();
  integTool.httpGet = async () => ({
    status: 'success',
    data: {
      resultType: 'streams',
      result: [{
        stream: { app: 'payment', env: 'prod' },
        values: [
          ['1705312981000000000', 'Error: timeout'],
          ['1705312980000000000', 'Retrying...']
        ]
      }]
    }
  });

  const result = await integTool.executeLoki({
    baseUrl: 'http://loki:3100',
    query: '{app="payment"}',
    start: '1h',
    limit: 100
  });

  assertTrue(result.success, 'success 应为 true');
  assertEqual(result.platform, 'loki', 'platform');
  assertEqual(result.rowCount, 2, 'rowCount');
  assertContains(result.markdown, '| 时间 | 标签 | 内容 |', '表头');
  assertContains(result.markdown, 'app=payment,env=prod', '标签');
  assertContains(result.markdown, 'Error: timeout', '日志内容');
});

test('executeElasticsearch 使用真实的 formatAsMarkdown 不抛异常', async () => {
  const integTool = new LogQueryTool();
  integTool.httpPost = async () => ({
    hits: {
      total: { value: 2 },
      hits: [
        { _source: { '@timestamp': '2024-01-15T10:00:01Z', message: 'Error: timeout', level: 'ERROR' } },
        { _source: { '@timestamp': '2024-01-15T10:00:00Z', message: 'Warn: slow', level: 'WARN' } }
      ]
    }
  });

  const result = await integTool.executeElasticsearch({
    baseUrl: 'http://es:9200',
    query: '{"match_all": {}}',
    start: '1h',
    limit: 100
  });

  assertTrue(result.success, 'success 应为 true');
  assertEqual(result.platform, 'elasticsearch', 'platform');
  assertEqual(result.rowCount, 2, 'rowCount');
  assertContains(result.markdown, '@timestamp', '表头包含 @timestamp');
  assertContains(result.markdown, 'message', '表头包含 message');
  assertContains(result.markdown, 'Error: timeout', '内容');
});

// --- 输出结果 ---
// 等待异步测试完成
setTimeout(() => {
  console.log('\n' + '='.repeat(50));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个测试`);
  console.log('='.repeat(50) + '\n');
  if (failed > 0) process.exit(1);
}, 500);

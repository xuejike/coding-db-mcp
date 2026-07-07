'use strict';

const LogQueryTool = require('./log-query-tool.js');
const { MAX_LOG_LIMIT } = require('./log-query-tool.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    passed++;
    console.log(`  ✓ ${name}`);
  }).catch(err => {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    错误: ${err.message}`);
  });
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

async function runTests() {
  console.log('\nLogQueryTool.executeLoki 单元测试\n');

  // --- 测试正常 Loki 查询流程 ---
  console.log('正常查询流程:');

  await test('executeLoki 发起正确的 GET 请求到 query_range API', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedParams, capturedHeaders;

    // Mock httpGet
    tool.httpGet = async (url, params, headers) => {
      capturedUrl = url;
      capturedParams = params;
      capturedHeaders = headers;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    // Mock formatAsMarkdown
    tool.formatAsMarkdown = (entries, type) => '';

    await tool.executeLoki({
      baseUrl: 'http://loki.example.com:3100',
      user: 'admin',
      pwd: 'secret',
      query: '{app="payment"}',
      start: '2024-01-15T10:00:00Z',
      end: '2024-01-15T11:00:00Z',
      limit: 50,
      direction: 'backward',
      orgId: '1'
    });

    assertEqual(capturedUrl, 'http://loki.example.com:3100/loki/api/v1/query_range', 'URL 应正确');
    assertEqual(capturedParams.query, '{app="payment"}', 'query 参数应原样传递');
    assertEqual(capturedParams.limit, 50, 'limit 应为 50');
    assertEqual(capturedParams.direction, 'backward', 'direction 应为 backward');
    assertTrue(capturedHeaders.Authorization.startsWith('Basic '), '应有 Basic Auth 头');
    assertEqual(capturedHeaders['X-Scope-OrgID'], '1', '应有 OrgID 头');
  });

  await test('executeLoki 使用默认 limit=100 和 direction=backward', async () => {
    const tool = new LogQueryTool();
    let capturedParams;

    tool.httpGet = async (url, params) => {
      capturedParams = params;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
    });

    assertEqual(capturedParams.limit, 100, '默认 limit 应为 100');
    assertEqual(capturedParams.direction, 'backward', '默认 direction 应为 backward');
  });

  await test('executeLoki limit 超过 MAX_LOG_LIMIT 时被钳位', async () => {
    const tool = new LogQueryTool();
    let capturedParams;

    tool.httpGet = async (url, params) => {
      capturedParams = params;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h',
      limit: 5000
    });

    assertEqual(capturedParams.limit, MAX_LOG_LIMIT, `limit 应被钳位为 ${MAX_LOG_LIMIT}`);
  });

  await test('executeLoki limit 为 0 时被钳位到 1', async () => {
    const tool = new LogQueryTool();
    let capturedParams;

    tool.httpGet = async (url, params) => {
      capturedParams = params;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h',
      limit: 0
    });

    assertEqual(capturedParams.limit, 1, 'limit 为 0 时应被钳位为 1');
  });

  await test('executeLoki 时间参数解析为纳秒时间戳', async () => {
    const tool = new LogQueryTool();
    let capturedParams;

    tool.httpGet = async (url, params) => {
      capturedParams = params;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    tool.formatAsMarkdown = () => '';

    const before = Date.now();
    await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
      // end 未指定，应默认为 now
    });
    const after = Date.now();

    // start 应该是大约 1 小时前的纳秒
    const expectedStartApprox = (before - 3600000) * 1000000;
    assertTrue(capturedParams.start >= expectedStartApprox - 1000000000, 'start 纳秒应在合理范围');
    assertTrue(capturedParams.start <= (after - 3600000) * 1000000 + 1000000000, 'start 纳秒上界');

    // end 应该是 now 的纳秒
    assertTrue(capturedParams.end >= before * 1000000, 'end 纳秒应 >= before');
    assertTrue(capturedParams.end <= after * 1000000 + 1000000000, 'end 纳秒应 <= after');
  });

  // --- 测试 parseLokiResponse ---
  console.log('\nparseLokiResponse:');

  await test('parseLokiResponse 正确解析多流日志数据', async () => {
    const tool = new LogQueryTool();
    const response = {
      status: 'success',
      data: {
        resultType: 'streams',
        result: [
          {
            stream: { app: 'svc-a', env: 'prod' },
            values: [
              ['1705312981000000000', 'Error: timeout'],
              ['1705312980000000000', 'Warning: slow']
            ]
          },
          {
            stream: { app: 'svc-b' },
            values: [
              ['1705312982000000000', 'Fatal: crash']
            ]
          }
        ]
      }
    };

    const entries = tool.parseLokiResponse(response);
    assertEqual(entries.length, 3, '应有 3 条日志');
    // 按时间从新到旧排序
    assertEqual(entries[0].line, 'Fatal: crash', '最新的日志在前');
    assertEqual(entries[0].timestamp, '1705312982000000000', '最新时间戳');
    assertEqual(entries[0].labels.app, 'svc-b', '标签正确');
    assertEqual(entries[2].line, 'Warning: slow', '最旧的日志在后');
  });

  await test('parseLokiResponse 空结果返回空数组', async () => {
    const tool = new LogQueryTool();
    assertEqual(tool.parseLokiResponse({ status: 'success', data: { resultType: 'streams', result: [] } }), [], '空 result');
    assertEqual(tool.parseLokiResponse({}), [], '无 data 字段');
    assertEqual(tool.parseLokiResponse(null), [], 'null 响应');
    assertEqual(tool.parseLokiResponse({ data: {} }), [], '无 result 字段');
  });

  // --- 测试成功结果结构 ---
  console.log('\n成功结果结构:');

  await test('executeLoki 返回正确的结果结构', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({
      status: 'success',
      data: {
        resultType: 'streams',
        result: [{
          stream: { app: 'test' },
          values: [['1705312981000000000', 'log line']]
        }]
      }
    });
    tool.formatAsMarkdown = (entries) => `共 ${entries.length} 条`;

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h',
      limit: 100
    });

    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.platform, 'loki', 'platform 应为 loki');
    assertEqual(result.rowCount, 1, 'rowCount 应为 1');
    assertTrue(result.markdown !== undefined, '应有 markdown 字段');
    assertEqual(result.truncated, false, 'rowCount < limit 时不应截断');
    assertEqual(result.warning, undefined, '不应有警告');
  });

  await test('executeLoki 达到 limit 时附加截断警告', async () => {
    const tool = new LogQueryTool();
    // 返回 5 条结果，limit 设为 5
    const values = [];
    for (let i = 0; i < 5; i++) {
      values.push([String(1705312980000000000 + i * 1000000000), `line ${i}`]);
    }
    tool.httpGet = async () => ({
      status: 'success',
      data: { resultType: 'streams', result: [{ stream: { app: 'x' }, values }] }
    });
    tool.formatAsMarkdown = () => 'table';

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="x"}',
      start: '1h',
      limit: 5
    });

    assertEqual(result.truncated, true, '应标记为截断');
    assertTrue(result.warning && result.warning.includes('5'), '警告应包含 limit 数字');
  });

  // --- 测试错误处理 ---
  console.log('\n错误处理:');

  await test('executeLoki 连接失败返回 CONNECTION_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => { throw new Error('CONNECTION_ERROR:无法连接日志平台: http://loki:3100'); };

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'CONNECTION_ERROR', '错误码应为 CONNECTION_ERROR');
  });

  await test('executeLoki 认证失败返回 AUTH_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => { throw new Error('AUTH_ERROR:认证失败 (HTTP 401)'); };

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'AUTH_ERROR', '错误码应为 AUTH_ERROR');
  });

  await test('executeLoki 超时返回 TIMEOUT', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => { throw new Error('TIMEOUT:查询超时'); };

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'TIMEOUT', '错误码应为 TIMEOUT');
  });

  await test('executeLoki 无效时间格式返回 QUERY_SYNTAX_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({ status: 'success', data: { resultType: 'streams', result: [] } });
    tool.formatAsMarkdown = () => '';

    const result = await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: 'invalid-time-format-xyz'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'QUERY_SYNTAX_ERROR', '错误码应为 QUERY_SYNTAX_ERROR');
  });

  await test('executeLoki 无认证模式不添加 Authorization 头', async () => {
    const tool = new LogQueryTool();
    let capturedHeaders;

    tool.httpGet = async (url, params, headers) => {
      capturedHeaders = headers;
      return { status: 'success', data: { resultType: 'streams', result: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeLoki({
      baseUrl: 'http://loki:3100',
      query: '{app="test"}',
      start: '1h'
      // 不传 user 和 pwd
    });

    assertEqual(capturedHeaders.Authorization, undefined, '无认证模式不应有 Authorization 头');
    assertEqual(capturedHeaders['X-Scope-OrgID'], undefined, '无 orgId 时不应有 OrgID 头');
  });

  // --- 输出结果 ---
  console.log('\n' + '='.repeat(50));
  console.log(`测试结果: ${passed} 通过, ${failed} 失败, 共 ${passed + failed} 个测试`);
  console.log('='.repeat(50) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});

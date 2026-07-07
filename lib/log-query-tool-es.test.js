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
  console.log('\nLogQueryTool.executeElasticsearch 单元测试\n');

  // --- 测试正常 ES 查询流程 ---
  console.log('正常查询流程:');

  await test('executeElasticsearch 发起正确的 POST 请求到 _search API', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedBody, capturedHeaders;

    // Mock httpPost
    tool.httpPost = async (url, body, headers) => {
      capturedUrl = url;
      capturedBody = body;
      capturedHeaders = headers;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    // Mock formatAsMarkdown
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es.example.com:9200',
      user: 'elastic',
      pwd: 'secret',
      index: 'app-logs-*',
      query: '{"match": {"level": "ERROR"}}',
      start: '2024-01-15T10:00:00Z',
      end: '2024-01-15T11:00:00Z',
      limit: 50
    });

    assertEqual(capturedUrl, 'http://es.example.com:9200/app-logs-*/_search', 'URL 应正确');
    assertEqual(capturedBody.size, 50, 'size 应为 50');
    assertTrue(capturedHeaders.Authorization.startsWith('Basic '), '应有 Basic Auth 头');
  });

  await test('executeElasticsearch 未指定 index 时使用 _all', async () => {
    const tool = new LogQueryTool();
    let capturedUrl;

    tool.httpPost = async (url) => {
      capturedUrl = url;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(capturedUrl, 'http://es:9200/_all/_search', '未指定 index 应使用 _all');
  });

  await test('executeElasticsearch 使用默认 limit=100', async () => {
    const tool = new LogQueryTool();
    let capturedBody;

    tool.httpPost = async (url, body) => {
      capturedBody = body;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(capturedBody.size, 100, '默认 size 应为 100');
  });

  await test('executeElasticsearch limit 超过 MAX_LOG_LIMIT 时被钳位', async () => {
    const tool = new LogQueryTool();
    let capturedBody;

    tool.httpPost = async (url, body) => {
      capturedBody = body;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h',
      limit: 5000
    });

    assertEqual(capturedBody.size, MAX_LOG_LIMIT, `size 应被钳位为 ${MAX_LOG_LIMIT}`);
  });

  await test('executeElasticsearch limit 为 0 时被钳位到 1', async () => {
    const tool = new LogQueryTool();
    let capturedBody;

    tool.httpPost = async (url, body) => {
      capturedBody = body;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h',
      limit: 0
    });

    assertEqual(capturedBody.size, 1, 'size 为 0 时应被钳位为 1');
  });

  // --- 测试 buildEsSearchBody ---
  console.log('\nbuildEsSearchBody:');

  await test('buildEsSearchBody JSON Query DSL 正确解析', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody('{"match": {"level": "ERROR"}}', null, null, 100);

    assertEqual(body.query, { match: { level: 'ERROR' } }, '应正确解析 JSON Query DSL');
    assertEqual(body.size, 100, 'size 应为 100');
    assertEqual(body.sort, [{ '@timestamp': { order: 'desc' } }], '应按时间降序排序');
  });

  await test('buildEsSearchBody 纯文本查询包装为 query_string', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody('error AND timeout', null, null, 50);

    assertEqual(body.query, { query_string: { query: 'error AND timeout' } }, '应包装为 query_string');
    assertEqual(body.size, 50, 'size 应为 50');
  });

  await test('buildEsSearchBody 无效 JSON 降级为 query_string', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody('{invalid json}', null, null, 100);

    assertEqual(body.query, { query_string: { query: '{invalid json}' } }, '无效 JSON 应降级为 query_string');
  });

  await test('buildEsSearchBody 含时间范围时使用 bool 查询', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody(
      '{"match_all": {}}',
      '2024-01-15T10:00:00Z',
      '2024-01-15T11:00:00Z',
      100
    );

    assertTrue(body.query.bool !== undefined, '应使用 bool 查询');
    assertEqual(body.query.bool.must, [{ match_all: {} }], 'must 应包含原始查询');
    assertTrue(body.query.bool.filter.length === 1, '应有 1 个过滤条件');
    assertEqual(
      body.query.bool.filter[0].range['@timestamp'].gte,
      '2024-01-15T10:00:00.000Z',
      'gte 应为 ISO 格式'
    );
    assertEqual(
      body.query.bool.filter[0].range['@timestamp'].lte,
      '2024-01-15T11:00:00.000Z',
      'lte 应为 ISO 格式'
    );
  });

  await test('buildEsSearchBody 相对时间正确转换为 ISO 格式', async () => {
    const tool = new LogQueryTool();
    const before = Date.now();
    const body = tool.buildEsSearchBody('{"match_all": {}}', '1h', null, 100);
    const after = Date.now();

    assertTrue(body.query.bool !== undefined, '应使用 bool 查询');
    const gte = body.query.bool.filter[0].range['@timestamp'].gte;
    // gte 应是大约 1 小时前的 ISO 时间
    const gteMs = new Date(gte).getTime();
    assertTrue(gteMs >= before - 3600000 - 1000, 'gte 应在合理范围（下界）');
    assertTrue(gteMs <= after - 3600000 + 1000, 'gte 应在合理范围（上界）');
  });

  await test('buildEsSearchBody 无时间范围不添加 filter', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody('{"match_all": {}}', null, null, 100);

    assertEqual(body.query, { match_all: {} }, '无时间范围时直接使用原始查询');
    assertTrue(body.query.bool === undefined, '不应有 bool 查询包装');
  });

  await test('buildEsSearchBody 空 query 使用通配符查询', async () => {
    const tool = new LogQueryTool();
    const body = tool.buildEsSearchBody('', null, null, 100);

    assertEqual(body.query, { query_string: { query: '*' } }, '空 query 应使用 * 通配符');
  });

  // --- 测试 parseEsResponse ---
  console.log('\nparseEsResponse:');

  await test('parseEsResponse 正确解析 ES hits 文档', async () => {
    const tool = new LogQueryTool();
    const response = {
      hits: {
        total: { value: 3, relation: 'eq' },
        hits: [
          { _index: 'app-logs-2024.01.15', _id: '1', _source: { '@timestamp': '2024-01-15T10:00:01Z', message: 'Error: timeout', level: 'ERROR' } },
          { _index: 'app-logs-2024.01.15', _id: '2', _source: { '@timestamp': '2024-01-15T10:00:00Z', message: 'Connection reset', level: 'WARN' } },
          { _index: 'app-logs-2024.01.15', _id: '3', _source: { '@timestamp': '2024-01-15T09:59:59Z', message: 'Started', level: 'INFO' } }
        ]
      }
    };

    const entries = tool.parseEsResponse(response);
    assertEqual(entries.length, 3, '应有 3 条文档');
    assertEqual(entries[0].message, 'Error: timeout', '第 1 条文档消息正确');
    assertEqual(entries[0].level, 'ERROR', '第 1 条文档级别正确');
    assertEqual(entries[0]['@timestamp'], '2024-01-15T10:00:01Z', '时间戳保留');
    assertEqual(entries[1].message, 'Connection reset', '第 2 条文档消息正确');
  });

  await test('parseEsResponse 空结果返回空数组', async () => {
    const tool = new LogQueryTool();
    assertEqual(tool.parseEsResponse({ hits: { total: { value: 0 }, hits: [] } }), [], '空 hits');
    assertEqual(tool.parseEsResponse({}), [], '无 hits 字段');
    assertEqual(tool.parseEsResponse(null), [], 'null 响应');
    assertEqual(tool.parseEsResponse({ hits: {} }), [], '无 hits.hits 字段');
  });

  await test('parseEsResponse 缺少 _source 的文档返回空对象', async () => {
    const tool = new LogQueryTool();
    const response = {
      hits: {
        total: { value: 1 },
        hits: [{ _index: 'test', _id: '1' }]
      }
    };

    const entries = tool.parseEsResponse(response);
    assertEqual(entries.length, 1, '应有 1 条文档');
    assertEqual(entries[0], {}, '缺少 _source 应返回空对象');
  });

  // --- 测试成功结果结构 ---
  console.log('\n成功结果结构:');

  await test('executeElasticsearch 返回正确的结果结构', async () => {
    const tool = new LogQueryTool();
    tool.httpPost = async () => ({
      hits: {
        total: { value: 2 },
        hits: [
          { _source: { message: 'log 1' } },
          { _source: { message: 'log 2' } }
        ]
      }
    });
    tool.formatAsMarkdown = (entries) => `共 ${entries.length} 条`;

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h',
      limit: 100
    });

    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.platform, 'elasticsearch', 'platform 应为 elasticsearch');
    assertEqual(result.rowCount, 2, 'rowCount 应为 2');
    assertTrue(result.markdown !== undefined, '应有 markdown 字段');
    assertEqual(result.truncated, false, 'rowCount < limit 时不应截断');
  });

  await test('executeElasticsearch 达到 limit 时附加截断警告', async () => {
    const tool = new LogQueryTool();
    const hits = [];
    for (let i = 0; i < 5; i++) {
      hits.push({ _source: { message: `line ${i}` } });
    }
    tool.httpPost = async () => ({ hits: { total: { value: 100 }, hits } });
    tool.formatAsMarkdown = () => 'table';

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h',
      limit: 5
    });

    assertEqual(result.truncated, true, '应标记为截断');
    assertTrue(result.warning && result.warning.includes('5'), '警告应包含 limit 数字');
  });

  // --- 测试错误处理 ---
  console.log('\n错误处理:');

  await test('executeElasticsearch 连接失败返回 CONNECTION_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpPost = async () => { throw new Error('CONNECTION_ERROR:无法连接日志平台: http://es:9200'); };

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'CONNECTION_ERROR', '错误码应为 CONNECTION_ERROR');
  });

  await test('executeElasticsearch 认证失败返回 AUTH_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpPost = async () => { throw new Error('AUTH_ERROR:认证失败 (HTTP 401)'); };

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'AUTH_ERROR', '错误码应为 AUTH_ERROR');
  });

  await test('executeElasticsearch 超时返回 TIMEOUT', async () => {
    const tool = new LogQueryTool();
    tool.httpPost = async () => { throw new Error('TIMEOUT:查询超时'); };

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'TIMEOUT', '错误码应为 TIMEOUT');
  });

  await test('executeElasticsearch 无效时间格式返回 QUERY_SYNTAX_ERROR', async () => {
    const tool = new LogQueryTool();
    tool.httpPost = async () => ({ hits: { total: { value: 0 }, hits: [] } });
    tool.formatAsMarkdown = () => '';

    const result = await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: 'invalid-time-xyz'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'QUERY_SYNTAX_ERROR', '错误码应为 QUERY_SYNTAX_ERROR');
  });

  await test('executeElasticsearch 无认证模式正常工作', async () => {
    const tool = new LogQueryTool();
    let capturedHeaders;

    tool.httpPost = async (url, body, headers) => {
      capturedHeaders = headers;
      return { hits: { total: { value: 0 }, hits: [] } };
    };
    tool.formatAsMarkdown = () => '';

    await tool.executeElasticsearch({
      baseUrl: 'http://es:9200',
      query: '{"match_all": {}}',
      start: '1h'
    });

    assertEqual(capturedHeaders.Authorization, undefined, '无认证模式不应有 Authorization 头');
  });

  // --- 测试 execute 分发 ---
  console.log('\nexecute 分发:');

  await test('execute 正确分发到 executeElasticsearch', async () => {
    const tool = new LogQueryTool();
    let called = false;

    tool.executeElasticsearch = async (config) => {
      called = true;
      return { success: true, platform: 'elasticsearch', rowCount: 0, markdown: '' };
    };

    await tool.execute({ type: 'elasticsearch', baseUrl: 'http://es:9200', query: '{}' });
    assertTrue(called, '应调用 executeElasticsearch');
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

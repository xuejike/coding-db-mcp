'use strict';

const LogQueryTool = require('./log-query-tool.js');

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

function assertContains(str, substr, msg = '') {
  if (!str.includes(substr)) {
    throw new Error(`${msg}\n    字符串中未包含: "${substr}"\n    实际: "${str}"`);
  }
}

async function runTests() {
  console.log('\n元数据查询 (queryMetadata) 单元测试\n');

  // === 4.1 queryMetadata 分发方法 ===
  console.log('queryMetadata 分发与验证:');

  await test('queryMetadata 无效 metadataType 返回描述性错误', async () => {
    const tool = new LogQueryTool();
    const result = await tool.queryMetadata({
      type: 'loki',
      metadataType: 'invalid_type',
      baseUrl: 'http://loki:3100'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'INVALID_METADATA_TYPE', '错误码应正确');
    assertContains(result.error, 'invalid_type', '错误信息应包含无效类型名');
    assertContains(result.error, 'labels', '错误信息应列出支持的类型');
  });

  await test('queryMetadata Loki 不支持 ES 的 metadataType', async () => {
    const tool = new LogQueryTool();
    const result = await tool.queryMetadata({
      type: 'loki',
      metadataType: 'indices',
      baseUrl: 'http://loki:3100'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'INVALID_METADATA_TYPE', '错误码应正确');
    assertContains(result.error, 'indices', '错误信息应包含无效类型名');
  });

  await test('queryMetadata ES 不支持 Loki 的 metadataType', async () => {
    const tool = new LogQueryTool();
    const result = await tool.queryMetadata({
      type: 'elasticsearch',
      metadataType: 'labels',
      baseUrl: 'http://es:9200'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'INVALID_METADATA_TYPE', '错误码应正确');
  });

  await test('queryMetadata 未知平台类型返回错误', async () => {
    const tool = new LogQueryTool();
    const result = await tool.queryMetadata({
      type: 'unknown_platform',
      metadataType: 'labels',
      baseUrl: 'http://example.com'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'INVALID_METADATA_TYPE', '错误码应正确');
  });

  await test('queryMetadata 正确分发到 queryLokiMetadata', async () => {
    const tool = new LogQueryTool();
    let called = false;
    tool.queryLokiMetadata = async (config) => {
      called = true;
      return { success: true, platform: 'loki', metadataType: 'labels', data: [], markdown: '' };
    };

    await tool.queryMetadata({ type: 'loki', metadataType: 'labels', baseUrl: 'http://loki:3100' });
    assertTrue(called, '应调用 queryLokiMetadata');
  });

  await test('queryMetadata 正确分发到 queryEsMetadata', async () => {
    const tool = new LogQueryTool();
    let called = false;
    tool.queryEsMetadata = async (config) => {
      called = true;
      return { success: true, platform: 'elasticsearch', metadataType: 'indices', data: [], markdown: '' };
    };

    await tool.queryMetadata({ type: 'elasticsearch', metadataType: 'indices', baseUrl: 'http://es:9200' });
    assertTrue(called, '应调用 queryEsMetadata');
  });

  // === 4.2 queryLokiMetadata ===
  console.log('\nqueryLokiMetadata:');

  await test('queryLokiMetadata labels 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedParams, capturedHeaders;

    tool.httpGet = async (url, params, headers) => {
      capturedUrl = url;
      capturedParams = params;
      capturedHeaders = headers;
      return { data: ['app', 'namespace', 'pod'] };
    };

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      user: 'admin',
      pwd: 'secret',
      orgId: '1',
      metadataType: 'labels'
    });

    assertEqual(capturedUrl, 'http://loki:3100/loki/api/v1/labels', 'URL 应正确');
    assertEqual(capturedHeaders['X-Scope-OrgID'], '1', '应有 OrgID 头');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.platform, 'loki', 'platform 应为 loki');
    assertEqual(result.metadataType, 'labels', 'metadataType 应正确');
    assertEqual(result.data, ['app', 'namespace', 'pod'], 'data 应正确');
    assertTrue(result.markdown.includes('app'), 'markdown 应包含标签名');
  });

  await test('queryLokiMetadata labels 支持时间范围参数', async () => {
    const tool = new LogQueryTool();
    let capturedParams;

    tool.httpGet = async (url, params) => {
      capturedParams = params;
      return { data: [] };
    };

    await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'labels',
      start: '1h',
      end: 'now'
    });

    assertTrue(capturedParams.start > 0, 'start 应被解析为纳秒时间戳');
    assertTrue(capturedParams.end > 0, 'end 应被解析为纳秒时间戳');
  });

  await test('queryLokiMetadata label_values 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl;

    tool.httpGet = async (url) => {
      capturedUrl = url;
      return { data: ['payment-service', 'user-service', 'gateway'] };
    };

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'label_values',
      label: 'app'
    });

    assertEqual(capturedUrl, 'http://loki:3100/loki/api/v1/label/app/values', 'URL 应包含标签名');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.data, ['payment-service', 'user-service', 'gateway'], 'data 应正确');
    assertEqual(result.label, 'app', '应返回 label 字段');
  });

  await test('queryLokiMetadata label_values 缺少 label 返回错误', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({ data: [] });

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'label_values'
      // 缺少 label 参数
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertContains(result.error, 'label', '错误信息应提到 label');
  });

  await test('queryLokiMetadata label_values URL 编码特殊字符标签', async () => {
    const tool = new LogQueryTool();
    let capturedUrl;

    tool.httpGet = async (url) => {
      capturedUrl = url;
      return { data: [] };
    };

    await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'label_values',
      label: 'app/name'
    });

    assertContains(capturedUrl, 'app%2Fname', '特殊字符应被 URL 编码');
  });

  await test('queryLokiMetadata series 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedParams;

    tool.httpGet = async (url, params) => {
      capturedUrl = url;
      capturedParams = params;
      return { data: [{ app: 'svc-a', namespace: 'prod' }, { app: 'svc-b', namespace: 'prod' }] };
    };

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'series',
      match: '{namespace="production"}'
    });

    assertEqual(capturedUrl, 'http://loki:3100/loki/api/v1/series', 'URL 应正确');
    assertEqual(capturedParams.match, '{namespace="production"}', 'match 参数应原样传递');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.data.length, 2, '应有 2 条 series');
  });

  await test('queryLokiMetadata series 缺少 match 返回错误', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({ data: [] });

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'series'
      // 缺少 match 参数
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertContains(result.error, 'match', '错误信息应提到 match');
  });

  await test('queryLokiMetadata 连接失败返回错误', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => { throw new Error('CONNECTION_ERROR:无法连接日志平台'); };

    const result = await tool.queryLokiMetadata({
      baseUrl: 'http://loki:3100',
      metadataType: 'labels'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'CONNECTION_ERROR', '错误码应正确');
  });

  // === 4.3 queryEsMetadata ===
  console.log('\nqueryEsMetadata:');

  await test('queryEsMetadata indices 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedParams;

    tool.httpGet = async (url, params) => {
      capturedUrl = url;
      capturedParams = params;
      return [
        { index: 'app-logs-2024.01.15', 'docs.count': '125000', 'store.size': '256mb' },
        { index: 'app-logs-2024.01.14', 'docs.count': '100000', 'store.size': '200mb' }
      ];
    };

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      user: 'elastic',
      pwd: 'secret',
      metadataType: 'indices'
    });

    assertEqual(capturedUrl, 'http://es:9200/_cat/indices', 'URL 应正确');
    assertEqual(capturedParams.format, 'json', '应请求 JSON 格式');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.platform, 'elasticsearch', 'platform 应正确');
    assertEqual(result.data.length, 2, '应有 2 个索引');
    assertContains(result.markdown, 'app-logs-2024.01.15', 'markdown 应包含索引名');
  });

  await test('queryEsMetadata mappings 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl;

    tool.httpGet = async (url) => {
      capturedUrl = url;
      return {
        'app-logs': {
          mappings: {
            properties: {
              '@timestamp': { type: 'date' },
              message: { type: 'text' },
              level: { type: 'keyword' }
            }
          }
        }
      };
    };

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'mappings',
      index: 'app-logs'
    });

    assertContains(capturedUrl, 'app-logs/_mapping', 'URL 应包含索引名');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.data['@timestamp'], 'date', '@timestamp 应为 date');
    assertEqual(result.data['message'], 'text', 'message 应为 text');
    assertEqual(result.data['level'], 'keyword', 'level 应为 keyword');
    assertContains(result.markdown, '@timestamp', 'markdown 应包含字段名');
    assertContains(result.markdown, 'date', 'markdown 应包含字段类型');
  });

  await test('queryEsMetadata mappings 缺少 index 返回错误', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({});

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'mappings'
      // 缺少 index 参数
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertContains(result.error, 'index', '错误信息应提到 index');
  });

  await test('queryEsMetadata mappings 处理嵌套字段', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => ({
      'my-index': {
        mappings: {
          properties: {
            host: {
              properties: {
                name: { type: 'keyword' },
                ip: { type: 'ip' }
              }
            },
            message: { type: 'text' }
          }
        }
      }
    });

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'mappings',
      index: 'my-index'
    });

    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.data['host.name'], 'keyword', '嵌套字段应扁平化为 host.name');
    assertEqual(result.data['host.ip'], 'ip', '嵌套字段应扁平化为 host.ip');
    assertEqual(result.data['message'], 'text', '顶层字段正常');
  });

  await test('queryEsMetadata field_caps 发起正确请求', async () => {
    const tool = new LogQueryTool();
    let capturedUrl, capturedParams;

    tool.httpGet = async (url, params) => {
      capturedUrl = url;
      capturedParams = params;
      return {
        fields: {
          '@timestamp': { date: { type: 'date', searchable: true } },
          message: { text: { type: 'text', searchable: true } },
          level: { keyword: { type: 'keyword', searchable: true } }
        }
      };
    };

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'field_caps',
      index: 'app-logs-*'
    });

    assertContains(capturedUrl, 'app-logs-*/_field_caps', 'URL 应包含索引名');
    assertEqual(capturedParams.fields, '*', '应请求所有字段');
    assertEqual(result.success, true, 'success 应为 true');
    assertEqual(result.data['@timestamp'], 'date', '@timestamp 应为 date');
    assertEqual(result.data['message'], 'text', 'message 应为 text');
  });

  await test('queryEsMetadata field_caps 未指定 index 时使用 _all', async () => {
    const tool = new LogQueryTool();
    let capturedUrl;

    tool.httpGet = async (url) => {
      capturedUrl = url;
      return { fields: {} };
    };

    await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'field_caps'
      // 不传 index
    });

    assertContains(capturedUrl, '_all/_field_caps', '未指定 index 应使用 _all');
  });

  await test('queryEsMetadata 连接失败返回错误', async () => {
    const tool = new LogQueryTool();
    tool.httpGet = async () => { throw new Error('CONNECTION_ERROR:无法连接日志平台'); };

    const result = await tool.queryEsMetadata({
      baseUrl: 'http://es:9200',
      metadataType: 'indices'
    });

    assertEqual(result.success, false, 'success 应为 false');
    assertEqual(result.code, 'CONNECTION_ERROR', '错误码应正确');
  });

  // === 4.4 formatMetadataAsMarkdown ===
  console.log('\nformatMetadataAsMarkdown:');

  await test('formatMetadataAsMarkdown labels 生成列表格式', async () => {
    const tool = new LogQueryTool();
    const result = tool.formatMetadataAsMarkdown(['app', 'namespace', 'pod'], 'loki', 'labels');

    assertContains(result, '## 可用标签', '应有标题');
    assertContains(result, '- app', '应有列表项');
    assertContains(result, '- namespace', '应有列表项');
    assertContains(result, '- pod', '应有列表项');
  });

  await test('formatMetadataAsMarkdown labels 空数据', async () => {
    const tool = new LogQueryTool();
    const result = tool.formatMetadataAsMarkdown([], 'loki', 'labels');

    assertContains(result, '## 可用标签', '应有标题');
    assertContains(result, '(无标签)', '应提示无标签');
  });

  await test('formatMetadataAsMarkdown label_values 生成列表格式', async () => {
    const tool = new LogQueryTool();
    const result = tool.formatMetadataAsMarkdown(
      ['payment-service', 'user-service'],
      'loki',
      'label_values',
      { label: 'app' }
    );

    assertContains(result, '## 标签 `app` 的可用值', '应有标题含标签名');
    assertContains(result, '- payment-service', '应有列表项');
    assertContains(result, '- user-service', '应有列表项');
  });

  await test('formatMetadataAsMarkdown series 生成 JSON 格式', async () => {
    const tool = new LogQueryTool();
    const data = [
      { app: 'svc-a', namespace: 'prod' },
      { app: 'svc-b', namespace: 'staging' }
    ];
    const result = tool.formatMetadataAsMarkdown(data, 'loki', 'series');

    assertContains(result, '## Series 信息', '应有标题');
    assertContains(result, 'svc-a', '应包含 series 数据');
    assertContains(result, 'svc-b', '应包含 series 数据');
  });

  await test('formatMetadataAsMarkdown indices 生成表格格式', async () => {
    const tool = new LogQueryTool();
    const data = [
      { index: 'app-logs-2024.01.15', 'docs.count': '125000', 'store.size': '256mb' },
      { index: 'app-logs-2024.01.14', 'docs.count': '100000', 'store.size': '200mb' }
    ];
    const result = tool.formatMetadataAsMarkdown(data, 'elasticsearch', 'indices');

    assertContains(result, '| 索引名 | 文档数 | 大小 |', '应有表头');
    assertContains(result, '|---|---|---|', '应有分隔行');
    assertContains(result, 'app-logs-2024.01.15', '应包含索引名');
    assertContains(result, '125000', '应包含文档数');
    assertContains(result, '256mb', '应包含大小');
  });

  await test('formatMetadataAsMarkdown mappings 生成表格格式', async () => {
    const tool = new LogQueryTool();
    const data = { '@timestamp': 'date', message: 'text', level: 'keyword' };
    const result = tool.formatMetadataAsMarkdown(data, 'elasticsearch', 'mappings', { index: 'app-logs-*' });

    assertContains(result, '## 索引 `app-logs-*` 字段映射', '应有标题含索引名');
    assertContains(result, '| 字段 | 类型 |', '应有表头');
    assertContains(result, '|---|---|', '应有分隔行');
    assertContains(result, '@timestamp', '应包含字段名');
    assertContains(result, 'date', '应包含字段类型');
  });

  await test('formatMetadataAsMarkdown field_caps 生成表格格式', async () => {
    const tool = new LogQueryTool();
    const data = { '@timestamp': 'date', message: 'text' };
    const result = tool.formatMetadataAsMarkdown(data, 'elasticsearch', 'field_caps', { index: '_all' });

    assertContains(result, '## 索引 `_all` 字段能力', '应有标题');
    assertContains(result, '| 字段 | 类型 |', '应有表头');
    assertContains(result, '@timestamp', '应包含字段名');
  });

  await test('formatMetadataAsMarkdown mappings 空数据', async () => {
    const tool = new LogQueryTool();
    const result = tool.formatMetadataAsMarkdown({}, 'elasticsearch', 'mappings', { index: 'test' });

    assertContains(result, '(无字段映射)', '应提示无数据');
  });

  // === 辅助方法测试 ===
  console.log('\n辅助方法:');

  await test('flattenEsMappings 正确扁平化映射', async () => {
    const tool = new LogQueryTool();
    const response = {
      'my-index': {
        mappings: {
          properties: {
            '@timestamp': { type: 'date' },
            message: { type: 'text' },
            host: {
              properties: {
                name: { type: 'keyword' },
                ip: { type: 'ip' }
              }
            }
          }
        }
      }
    };

    const result = tool.flattenEsMappings(response);
    assertEqual(result['@timestamp'], 'date');
    assertEqual(result['message'], 'text');
    assertEqual(result['host.name'], 'keyword');
    assertEqual(result['host.ip'], 'ip');
  });

  await test('flattenEsMappings 处理空响应', async () => {
    const tool = new LogQueryTool();
    assertEqual(tool.flattenEsMappings(null), {}, 'null 应返回空对象');
    assertEqual(tool.flattenEsMappings({}), {}, '空对象应返回空对象');
  });

  await test('flattenFieldCaps 正确扁平化字段能力', async () => {
    const tool = new LogQueryTool();
    const response = {
      fields: {
        '@timestamp': { date: { type: 'date', searchable: true } },
        message: { text: { type: 'text', searchable: true } },
        level: { keyword: { type: 'keyword', searchable: true, aggregatable: true } }
      }
    };

    const result = tool.flattenFieldCaps(response);
    assertEqual(result['@timestamp'], 'date');
    assertEqual(result['message'], 'text');
    assertEqual(result['level'], 'keyword');
  });

  await test('flattenFieldCaps 处理空响应', async () => {
    const tool = new LogQueryTool();
    assertEqual(tool.flattenFieldCaps(null), {}, 'null 应返回空对象');
    assertEqual(tool.flattenFieldCaps({}), {}, '无 fields 应返回空对象');
    assertEqual(tool.flattenFieldCaps({ fields: {} }), {}, '空 fields 应返回空对象');
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

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 单次查询最大返回日志条数
const MAX_LOG_LIMIT = 1000;

// HTTP 请求超时时间（毫秒）
const QUERY_TIMEOUT = 30000;

/**
 * 日志查询工具类
 * 封装多平台日志查询逻辑，支持 Loki 和 Elasticsearch
 * 使用 Node.js 内置 http/https 模块发起请求，不依赖第三方 HTTP 库
 */
class LogQueryTool {

  /**
   * 统一执行入口，根据 config.type 分发到对应平台的查询方法
   * @param {Object} config - 完整配置（含连接信息和查询参数）
   * @param {string} config.type - 日志平台类型 (loki | elasticsearch)
   * @param {string} config.baseUrl - 日志平台地址
   * @param {string} [config.user] - 认证用户名
   * @param {string} [config.pwd] - 认证密码/Token
   * @param {string} config.query - 查询表达式
   * @returns {Promise<Object>} 查询结果
   */
  async execute(config) {
    const { type } = config;
    switch (type) {
      case 'loki':
        return await this.executeLoki(config);
      case 'elasticsearch':
        return await this.executeElasticsearch(config);
      default:
        return {
          success: false,
          error: `不支持的日志平台类型: ${type}`,
          code: 'UNSUPPORTED_TYPE'
        };
    }
  }

  /**
   * 执行 Loki 日志查询
   * 通过 HTTP GET 请求 Loki query_range API，解析日志流数据并格式化返回
   *
   * @param {Object} config - Loki 查询配置
   * @param {string} config.baseUrl - Loki 服务地址
   * @param {string} [config.user] - Basic Auth 用户名
   * @param {string} [config.pwd] - Basic Auth 密码/Token
   * @param {string} config.query - LogQL 查询表达式
   * @param {string} [config.start] - 起始时间（ISO 8601 或相对时间）
   * @param {string} [config.end] - 结束时间（ISO 8601 或 "now"）
   * @param {number} [config.limit=100] - 返回行数限制
   * @param {string} [config.direction='backward'] - 排序方向
   * @param {string} [config.orgId] - Loki 租户 ID
   * @returns {Promise<Object>} 查询结果
   */
  async executeLoki(config) {
    const { baseUrl, user, pwd, query, start, end, limit = 100, direction = 'backward', orgId } = config;

    try {
      // 1. 解析时间参数为纳秒时间戳（Loki API 要求）
      const startNs = this.parseTime(start);
      const endNs = this.parseTime(end || 'now');

      // 2. 限制返回行数在 [1, MAX_LOG_LIMIT] 范围内
      const safeLimit = Math.min(Math.max(1, limit), MAX_LOG_LIMIT);

      // 3. 构建 Loki query_range API 请求
      const url = `${baseUrl}/loki/api/v1/query_range`;
      const params = { query, start: startNs, end: endNs, limit: safeLimit, direction };
      const headers = this.buildAuthHeaders(user, pwd, orgId);

      // 4. 执行 HTTP GET 请求
      const response = await this.httpGet(url, params, headers);

      // 5. 解析 Loki 响应中的日志流数据并格式化
      const entries = this.parseLokiResponse(response);
      return this.buildResult(entries, 'loki', safeLimit);
    } catch (err) {
      // 错误处理：解析错误码并返回结构化错误对象
      const errorMsg = err.message || String(err);
      const code = this.extractErrorCode(errorMsg);
      return {
        success: false,
        error: errorMsg.replace(/^[A-Z_]+:/, ''),
        code: code
      };
    }
  }

  /**
   * 解析 Loki API 响应中的日志流数据
   * Loki query_range API 返回格式:
   * { status: "success", data: { resultType: "streams", result: [{stream: {...labels}, values: [[ns_timestamp, log_line], ...]}] }}
   *
   * @param {Object} response - Loki API 原始响应
   * @returns {Array<Object>} 扁平化的日志条目数组 [{timestamp, labels, line}, ...]
   */
  parseLokiResponse(response) {
    const entries = [];

    // 校验响应基本结构
    if (!response || !response.data || !response.data.result) {
      return entries;
    }

    const streams = response.data.result;

    // 遍历每个日志流
    for (const stream of streams) {
      const labels = stream.stream || {};
      const values = stream.values || [];

      // 遍历流中的每条日志（values 为 [纳秒时间戳, 日志内容] 数组）
      for (const [nsTimestamp, line] of values) {
        entries.push({
          timestamp: nsTimestamp,
          labels,
          line
        });
      }
    }

    // 按时间戳排序（从新到旧）
    entries.sort((a, b) => {
      // 纳秒时间戳为字符串，需要比较数值大小
      const tsA = BigInt(a.timestamp);
      const tsB = BigInt(b.timestamp);
      if (tsB > tsA) return 1;
      if (tsB < tsA) return -1;
      return 0;
    });

    return entries;
  }

  /**
   * 从错误消息中提取错误码
   * 错误码格式为 "ERROR_CODE:错误描述"
   *
   * @param {string} errorMsg - 错误消息
   * @returns {string} 错误码
   */
  extractErrorCode(errorMsg) {
    const match = errorMsg.match(/^([A-Z_]+):/);
    if (match) {
      return match[1];
    }
    // 如果消息中包含 "时间格式" 相关关键词，归为查询语法错误
    if (errorMsg.includes('无效的时间格式')) {
      return 'QUERY_SYNTAX_ERROR';
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * 执行 Elasticsearch 日志查询
   * 通过 HTTP POST 请求 ES _search API，解析文档数据并格式化返回
   *
   * @param {Object} config - ES 查询配置
   * @param {string} config.baseUrl - ES 集群地址
   * @param {string} [config.user] - Basic Auth 用户名
   * @param {string} [config.pwd] - Basic Auth 密码/Token
   * @param {string} [config.index] - 目标索引（默认 _all）
   * @param {string} config.query - 查询表达式（Query DSL JSON 或纯文本）
   * @param {string} [config.start] - 起始时间（ISO 8601 或相对时间）
   * @param {string} [config.end] - 结束时间（ISO 8601 或 "now"）
   * @param {number} [config.limit=100] - 返回文档数限制
   * @returns {Promise<Object>} 查询结果
   */
  async executeElasticsearch(config) {
    const { baseUrl, user, pwd, index, query, start, end, limit = 100 } = config;

    try {
      // 1. 限制返回行数在 [1, MAX_LOG_LIMIT] 范围内
      const safeLimit = Math.min(Math.max(1, limit), MAX_LOG_LIMIT);

      // 2. 构建 ES 查询 DSL（含时间范围过滤和排序）
      const searchBody = this.buildEsSearchBody(query, start, end, safeLimit);

      // 3. 构建请求 URL（未指定索引时使用 _all）
      const targetIndex = index || '_all';
      const url = `${baseUrl}/${targetIndex}/_search`;
      const headers = this.buildAuthHeaders(user, pwd);

      // 4. 执行 HTTP POST 请求（ES _search 使用 POST 方法，但为只读操作）
      const response = await this.httpPost(url, searchBody, headers);

      // 5. 解析 ES 响应中的 hits 文档并格式化
      const entries = this.parseEsResponse(response);
      return this.buildResult(entries, 'elasticsearch', safeLimit);
    } catch (err) {
      // 错误处理：解析错误码并返回结构化错误对象
      const errorMsg = err.message || String(err);
      const code = this.extractErrorCode(errorMsg);
      return {
        success: false,
        error: errorMsg.replace(/^[A-Z_]+:/, ''),
        code: code
      };
    }
  }

  /**
   * 构建 Elasticsearch 查询 DSL 请求体
   * 支持 JSON 格式的 Query DSL 和纯文本 query_string 查询
   * 可选添加 @timestamp 时间范围过滤
   *
   * @param {string} query - 查询表达式（JSON 字符串或纯文本）
   * @param {string} [start] - 起始时间
   * @param {string} [end] - 结束时间
   * @param {number} limit - 返回文档数限制（size）
   * @returns {Object} ES 查询 DSL 对象
   */
  buildEsSearchBody(query, start, end, limit) {
    // 解析查询表达式：JSON 格式视为 Query DSL，纯文本包装为 query_string
    let queryDsl;
    if (query && query.trim().startsWith('{')) {
      try {
        queryDsl = JSON.parse(query);
      } catch (e) {
        // JSON 解析失败，降级为 query_string 查询
        queryDsl = { query_string: { query: query } };
      }
    } else {
      // 纯文本查询，使用 query_string 包装
      queryDsl = { query_string: { query: query || '*' } };
    }

    // 构建时间范围过滤条件
    const filters = [];
    if (start || end) {
      const rangeFilter = { range: { '@timestamp': {} } };
      if (start) {
        // 将纳秒时间戳转换为 ISO 8601 格式（ES 使用毫秒或 ISO 日期）
        const startNs = this.parseTime(start);
        rangeFilter.range['@timestamp'].gte = new Date(startNs / 1000000).toISOString();
      }
      if (end) {
        const endNs = this.parseTime(end);
        rangeFilter.range['@timestamp'].lte = new Date(endNs / 1000000).toISOString();
      }
      filters.push(rangeFilter);
    }

    // 组装最终查询体
    let finalQuery;
    if (filters.length > 0) {
      // 有时间范围过滤时，使用 bool 查询组合查询条件和过滤条件
      finalQuery = {
        bool: {
          must: [queryDsl],
          filter: filters
        }
      };
    } else {
      // 无过滤条件时直接使用查询 DSL
      finalQuery = queryDsl;
    }

    return {
      query: finalQuery,
      size: limit,
      sort: [{ '@timestamp': { order: 'desc' } }]
    };
  }

  /**
   * 解析 Elasticsearch _search API 响应
   * ES 响应格式: {hits: {total: ..., hits: [{_source: {...}, _id, _index}, ...]}}
   *
   * @param {Object} response - ES API 原始响应
   * @returns {Array<Object>} 文档数组（每个元素为 _source 中的所有字段）
   */
  parseEsResponse(response) {
    const entries = [];

    // 校验响应基本结构
    if (!response || !response.hits || !response.hits.hits) {
      return entries;
    }

    const hits = response.hits.hits;

    // 遍历每个命中文档，提取 _source 中的所有字段
    for (const hit of hits) {
      const source = hit._source || {};
      entries.push({ ...source });
    }

    return entries;
  }

  /**
   * 元数据查询统一入口，验证 metadataType 合法性并分发到对应平台方法
   * @param {Object} config - 元数据查询配置
   * @param {string} config.type - 日志平台类型 (loki | elasticsearch)
   * @param {string} config.metadataType - 元数据类型
   * @param {string} config.baseUrl - 日志平台地址
   * @returns {Promise<Object>} 元数据结果
   */
  async queryMetadata(config) {
    const { type, metadataType } = config;

    // 各平台支持的元数据类型
    const validTypes = {
      loki: ['labels', 'label_values', 'series'],
      elasticsearch: ['indices', 'mappings', 'field_caps']
    };

    // 验证 metadataType 是否合法
    if (!validTypes[type] || !validTypes[type].includes(metadataType)) {
      return {
        success: false,
        error: `不支持的元数据类型: "${metadataType}"（${type} 支持: ${(validTypes[type] || []).join(', ')}）`,
        code: 'INVALID_METADATA_TYPE'
      };
    }

    // 根据平台类型分发到对应的元数据查询方法
    switch (type) {
      case 'loki':
        return await this.queryLokiMetadata(config);
      case 'elasticsearch':
        return await this.queryEsMetadata(config);
      default:
        return { success: false, error: `不支持的日志平台类型: ${type}`, code: 'UNSUPPORTED_TYPE' };
    }
  }

  /**
   * 查询 Loki 元数据（标签名、标签值、流信息）
   * - labels: GET /loki/api/v1/labels
   * - label_values: GET /loki/api/v1/label/{label}/values（需要 label 参数）
   * - series: GET /loki/api/v1/series（需要 match 参数）
   *
   * @param {Object} config - Loki 元数据查询配置
   * @param {string} config.baseUrl - Loki 服务地址
   * @param {string} [config.user] - Basic Auth 用户名
   * @param {string} [config.pwd] - Basic Auth 密码/Token
   * @param {string} [config.orgId] - Loki 租户 ID
   * @param {string} config.metadataType - 元数据类型 (labels | label_values | series)
   * @param {string} [config.label] - 标签名（label_values 时必填）
   * @param {string} [config.match] - 流选择器（series 时必填）
   * @param {string} [config.start] - 起始时间（可选）
   * @param {string} [config.end] - 结束时间（可选）
   * @returns {Promise<Object>} Loki 元数据结果
   */
  async queryLokiMetadata(config) {
    const { baseUrl, user, pwd, orgId, metadataType, label, match, start, end } = config;

    try {
      const headers = this.buildAuthHeaders(user, pwd, orgId);
      let url, params;

      switch (metadataType) {
        case 'labels':
          // 获取所有标签名列表
          url = `${baseUrl}/loki/api/v1/labels`;
          params = {};
          if (start) params.start = this.parseTime(start);
          if (end) params.end = this.parseTime(end);
          break;

        case 'label_values':
          // 获取指定标签的所有值
          if (!label) throw new Error('查询标签值时需要指定 label 参数');
          url = `${baseUrl}/loki/api/v1/label/${encodeURIComponent(label)}/values`;
          params = {};
          if (start) params.start = this.parseTime(start);
          if (end) params.end = this.parseTime(end);
          break;

        case 'series':
          // 获取匹配的日志流信息
          if (!match) throw new Error('查询 series 时需要指定 match 参数（流选择器）');
          url = `${baseUrl}/loki/api/v1/series`;
          params = { match: match };
          if (start) params.start = this.parseTime(start);
          if (end) params.end = this.parseTime(end);
          break;
      }

      const response = await this.httpGet(url, params, headers);
      const data = response.data || [];
      const markdown = this.formatMetadataAsMarkdown(data, 'loki', metadataType, { label });

      return { success: true, platform: 'loki', metadataType, data, markdown, label };
    } catch (err) {
      // 错误处理：与 executeLoki 相同的模式
      const errorMsg = err.message || String(err);
      const code = this.extractErrorCode(errorMsg);
      return {
        success: false,
        error: errorMsg.replace(/^[A-Z_]+:/, ''),
        code: code
      };
    }
  }

  /**
   * 查询 Elasticsearch 元数据（索引列表、字段映射、字段能力）
   * - indices: GET /_cat/indices?format=json
   * - mappings: GET /{index}/_mapping（需要 index 参数）
   * - field_caps: GET /{index}/_field_caps?fields=*
   *
   * @param {Object} config - ES 元数据查询配置
   * @param {string} config.baseUrl - ES 集群地址
   * @param {string} [config.user] - Basic Auth 用户名
   * @param {string} [config.pwd] - Basic Auth 密码/Token
   * @param {string} config.metadataType - 元数据类型 (indices | mappings | field_caps)
   * @param {string} [config.index] - 索引名/模式（mappings 时必填，field_caps 时可选）
   * @returns {Promise<Object>} ES 元数据结果
   */
  async queryEsMetadata(config) {
    const { baseUrl, user, pwd, metadataType, index } = config;

    try {
      const headers = this.buildAuthHeaders(user, pwd);
      let url, response, data, markdown;

      switch (metadataType) {
        case 'indices':
          // 获取索引列表
          url = `${baseUrl}/_cat/indices`;
          response = await this.httpGet(url, { format: 'json', h: 'index,docs.count,store.size' }, headers);
          data = response;
          markdown = this.formatMetadataAsMarkdown(data, 'elasticsearch', 'indices');
          break;

        case 'mappings':
          // 获取指定索引的字段映射
          if (!index) throw new Error('查询字段映射时需要指定 index 参数');
          url = `${baseUrl}/${encodeURIComponent(index)}/_mapping`;
          response = await this.httpGet(url, {}, headers);
          data = this.flattenEsMappings(response);
          markdown = this.formatMetadataAsMarkdown(data, 'elasticsearch', 'mappings', { index });
          break;

        case 'field_caps': {
          // 获取字段能力信息
          const targetIndex = index || '_all';
          url = `${baseUrl}/${encodeURIComponent(targetIndex)}/_field_caps`;
          response = await this.httpGet(url, { fields: '*' }, headers);
          data = this.flattenFieldCaps(response);
          markdown = this.formatMetadataAsMarkdown(data, 'elasticsearch', 'field_caps', { index: targetIndex });
          break;
        }
      }

      return { success: true, platform: 'elasticsearch', metadataType, data, markdown, index };
    } catch (err) {
      // 错误处理：与 executeElasticsearch 相同的模式
      const errorMsg = err.message || String(err);
      const code = this.extractErrorCode(errorMsg);
      return {
        success: false,
        error: errorMsg.replace(/^[A-Z_]+:/, ''),
        code: code
      };
    }
  }

  /**
   * 扁平化 ES mapping 响应为 {字段名: 字段类型} 对象
   * ES _mapping 响应格式: {indexName: {mappings: {properties: {field: {type: "keyword"}, ...}}}}
   *
   * @param {Object} response - ES _mapping API 原始响应
   * @returns {Object} 扁平化的字段映射 {fieldName: fieldType}
   */
  flattenEsMappings(response) {
    const result = {};
    if (!response || typeof response !== 'object') return result;

    // 遍历所有索引的映射
    for (const indexName of Object.keys(response)) {
      const mappings = response[indexName]?.mappings;
      if (!mappings) continue;

      const properties = mappings.properties || {};
      this._extractMappingFields(properties, '', result);
    }

    return result;
  }

  /**
   * 递归提取 ES mapping 中的字段及其类型
   * 支持嵌套字段（object 类型的 properties）
   *
   * @param {Object} properties - ES mapping properties 对象
   * @param {string} prefix - 字段名前缀（用于嵌套字段）
   * @param {Object} result - 结果对象（累积字段映射）
   */
  _extractMappingFields(properties, prefix, result) {
    for (const [field, config] of Object.entries(properties)) {
      const fullName = prefix ? `${prefix}.${field}` : field;
      if (config.type) {
        result[fullName] = config.type;
      }
      // 递归处理嵌套字段
      if (config.properties) {
        this._extractMappingFields(config.properties, fullName, result);
      }
    }
  }

  /**
   * 扁平化 ES field_caps 响应为 {字段名: 字段类型} 对象
   * ES _field_caps 响应格式: {fields: {fieldName: {typeFamily: {type: "keyword", ...}}, ...}}
   *
   * @param {Object} response - ES _field_caps API 原始响应
   * @returns {Object} 扁平化的字段能力 {fieldName: fieldType}
   */
  flattenFieldCaps(response) {
    const result = {};
    if (!response || !response.fields) return result;

    const fields = response.fields;
    for (const [fieldName, typeMap] of Object.entries(fields)) {
      // typeMap 结构: {keyword: {type: "keyword", ...}, text: {type: "text", ...}}
      // 取第一个类型族作为主要类型
      const types = Object.keys(typeMap);
      if (types.length > 0) {
        result[fieldName] = typeMap[types[0]].type || types[0];
      }
    }

    return result;
  }

  /**
   * 将元数据格式化为 Markdown 展示
   * 根据平台和元数据类型生成不同格式的 Markdown：
   * - labels → 列表格式
   * - label_values → 列表格式（带标签名标题）
   * - series → JSON 格式的流对象列表
   * - indices → 表格格式（索引名、文档数、大小）
   * - mappings → 表格格式（字段名、类型）
   * - field_caps → 表格格式（字段名、类型）
   *
   * @param {*} data - 元数据原始数据
   * @param {string} platform - 平台类型 (loki | elasticsearch)
   * @param {string} metadataType - 元数据类型
   * @param {Object} [options={}] - 额外选项（如 label、index）
   * @returns {string} Markdown 格式的元数据展示
   */
  formatMetadataAsMarkdown(data, platform, metadataType, options = {}) {
    switch (metadataType) {
      case 'labels':
        return this._formatLabelsMarkdown(data);

      case 'label_values':
        return this._formatLabelValuesMarkdown(data, options.label);

      case 'series':
        return this._formatSeriesMarkdown(data);

      case 'indices':
        return this._formatIndicesMarkdown(data);

      case 'mappings':
        return this._formatMappingsMarkdown(data, options.index);

      case 'field_caps':
        return this._formatFieldCapsMarkdown(data, options.index);

      default:
        return '(无数据)';
    }
  }

  /**
   * 格式化 Loki 标签列表为 Markdown 列表
   * @param {Array} data - 标签名数组
   * @returns {string} Markdown 列表
   */
  _formatLabelsMarkdown(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return '## 可用标签\n\n(无标签)';
    }
    const items = data.map(label => `- ${label}`).join('\n');
    return `## 可用标签\n\n${items}`;
  }

  /**
   * 格式化 Loki 标签值列表为 Markdown 列表
   * @param {Array} data - 标签值数组
   * @param {string} label - 标签名
   * @returns {string} Markdown 列表
   */
  _formatLabelValuesMarkdown(data, label) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return `## 标签 \`${label || ''}\` 的可用值\n\n(无数据)`;
    }
    const items = data.map(value => `- ${value}`).join('\n');
    return `## 标签 \`${label || ''}\` 的可用值\n\n${items}`;
  }

  /**
   * 格式化 Loki series 信息为 Markdown（JSON 格式）
   * @param {Array} data - 流对象数组
   * @returns {string} Markdown 格式的 series 信息
   */
  _formatSeriesMarkdown(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return '## Series 信息\n\n(无匹配的日志流)';
    }
    const jsonStr = data.map(item => `- \`${JSON.stringify(item)}\``).join('\n');
    return `## Series 信息\n\n${jsonStr}`;
  }

  /**
   * 格式化 ES 索引列表为 Markdown 表格
   * @param {Array} data - 索引信息数组 [{index, "docs.count", "store.size"}, ...]
   * @returns {string} Markdown 表格
   */
  _formatIndicesMarkdown(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return '## 索引列表\n\n(无索引)';
    }
    const lines = [
      '## 索引列表\n',
      '| 索引名 | 文档数 | 大小 |',
      '|---|---|---|'
    ];
    for (const item of data) {
      const indexName = item.index || '';
      const docsCount = item['docs.count'] || '0';
      const size = item['store.size'] || '-';
      lines.push(`| ${indexName} | ${docsCount} | ${size} |`);
    }
    return lines.join('\n');
  }

  /**
   * 格式化 ES 字段映射为 Markdown 表格
   * @param {Object} data - 字段映射对象 {fieldName: fieldType}
   * @param {string} index - 索引名
   * @returns {string} Markdown 表格
   */
  _formatMappingsMarkdown(data, index) {
    const title = index ? `## 索引 \`${index}\` 字段映射` : '## 字段映射';
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return `${title}\n\n(无字段映射)`;
    }
    const lines = [
      `${title}\n`,
      '| 字段 | 类型 |',
      '|---|---|'
    ];
    for (const [field, type] of Object.entries(data)) {
      lines.push(`| ${field} | ${type} |`);
    }
    return lines.join('\n');
  }

  /**
   * 格式化 ES field_caps 为 Markdown 表格
   * @param {Object} data - 字段能力对象 {fieldName: fieldType}
   * @param {string} index - 索引名
   * @returns {string} Markdown 表格
   */
  _formatFieldCapsMarkdown(data, index) {
    const title = index ? `## 索引 \`${index}\` 字段能力` : '## 字段能力';
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return `${title}\n\n(无字段信息)`;
    }
    const lines = [
      `${title}\n`,
      '| 字段 | 类型 |',
      '|---|---|'
    ];
    for (const [field, type] of Object.entries(data)) {
      lines.push(`| ${field} | ${type} |`);
    }
    return lines.join('\n');
  }

  /**
   * 将日志条目格式化为 Markdown 表格
   * 根据日志平台类型使用不同的格式化策略：
   * - Loki: 固定列 | 时间 | 标签 | 内容 |
   * - Elasticsearch: 动态检测文档字段生成表头
   *
   * @param {Array} entries - 日志条目数组
   * @param {string} type - 日志平台类型 (loki | elasticsearch)
   * @returns {string} Markdown 格式的日志内容，空结果返回 "(无结果)"
   */
  formatAsMarkdown(entries, type) {
    // 空结果或无效输入处理
    if (!entries || entries.length === 0) {
      return '(无结果)';
    }

    if (type === 'loki') {
      return this._formatLokiMarkdown(entries);
    } else if (type === 'elasticsearch') {
      return this._formatEsMarkdown(entries);
    }

    // 未知类型回退：尝试按 ES 格式处理
    return this._formatEsMarkdown(entries);
  }

  /**
   * 格式化 Loki 日志条目为 Markdown 表格
   * 表格列: | 时间 | 标签 | 内容 |
   * 时间戳从纳秒转换为可读日期格式 (YYYY-MM-DD HH:mm:ss)
   * 标签格式化为 "key=value,key2=value2" 紧凑格式
   *
   * @param {Array} entries - Loki 日志条目 [{timestamp, labels, line}, ...]
   * @returns {string} Markdown 表格字符串
   */
  _formatLokiMarkdown(entries) {
    const lines = [];
    // 表头
    lines.push('| 时间 | 标签 | 内容 |');
    lines.push('|---|---|---|');

    for (const entry of entries) {
      // 将纳秒时间戳转换为可读日期格式
      const time = this._formatNsTimestamp(entry.timestamp);
      // 将标签对象格式化为紧凑字符串
      const labels = this._formatLabels(entry.labels);
      // 转义日志内容中的管道符，避免破坏表格结构
      const content = this._escapeMarkdownCell(entry.line || '');
      lines.push(`| ${time} | ${labels} | ${content} |`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化 Elasticsearch 日志条目为 Markdown 表格
   * 动态检测所有文档中的字段名，优先显示 @timestamp 和 message 列
   * 超过 100 字符的字段值会被截断并添加 "..." 后缀
   *
   * @param {Array} entries - ES 文档条目 [{...document fields}, ...]
   * @returns {string} Markdown 表格字符串
   */
  _formatEsMarkdown(entries) {
    // 收集所有文档中出现的字段名
    const fieldSet = new Set();
    for (const entry of entries) {
      Object.keys(entry).forEach(key => fieldSet.add(key));
    }

    if (fieldSet.size === 0) {
      return '(无结果)';
    }

    // 确定列顺序：优先 @timestamp 和 message，其余按字母排序
    const priorityFields = ['@timestamp', 'message'];
    const columns = [];

    for (const field of priorityFields) {
      if (fieldSet.has(field)) {
        columns.push(field);
        fieldSet.delete(field);
      }
    }

    // 剩余字段按字母排序
    const remainingFields = Array.from(fieldSet).sort();
    columns.push(...remainingFields);

    // 构建表格
    const lines = [];
    // 表头
    lines.push('| ' + columns.join(' | ') + ' |');
    lines.push('|' + columns.map(() => '---').join('|') + '|');

    // 数据行
    for (const entry of entries) {
      const cells = columns.map(col => {
        const value = entry[col];
        const cellStr = this._formatCellValue(value);
        return this._truncateCell(cellStr, 100);
      });
      lines.push('| ' + cells.join(' | ') + ' |');
    }

    return lines.join('\n');
  }

  /**
   * 将纳秒时间戳转换为可读日期格式 (YYYY-MM-DD HH:mm:ss)
   *
   * @param {string|number} nsTimestamp - 纳秒时间戳
   * @returns {string} 格式化的日期字符串
   */
  _formatNsTimestamp(nsTimestamp) {
    try {
      // 纳秒转毫秒（纳秒时间戳可能为字符串）
      const ms = Number(BigInt(nsTimestamp) / BigInt(1000000));
      const date = new Date(ms);
      if (isNaN(date.getTime())) {
        return String(nsTimestamp);
      }
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const ss = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
    } catch (e) {
      return String(nsTimestamp);
    }
  }

  /**
   * 将标签对象格式化为紧凑字符串 "key=value,key2=value2"
   *
   * @param {Object} labels - 标签键值对对象
   * @returns {string} 格式化的标签字符串
   */
  _formatLabels(labels) {
    if (!labels || typeof labels !== 'object') {
      return '';
    }
    return Object.entries(labels)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  /**
   * 格式化单元格值为字符串
   * 对象和数组转为 JSON，null/undefined 显示为空
   *
   * @param {*} value - 任意字段值
   * @returns {string} 字符串表示
   */
  _formatCellValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * 截断超长单元格内容，超过指定长度时添加 "..." 后缀
   * 同时转义管道符避免破坏 Markdown 表格
   *
   * @param {string} str - 原始字符串
   * @param {number} maxLen - 最大长度（默认 100）
   * @returns {string} 截断后的字符串
   */
  _truncateCell(str, maxLen = 100) {
    let result = str;
    if (result.length > maxLen) {
      result = result.substring(0, maxLen) + '...';
    }
    // 转义管道符避免破坏表格结构
    return this._escapeMarkdownCell(result);
  }

  /**
   * 转义 Markdown 表格单元格中的特殊字符
   * 主要处理管道符 | 和换行符
   *
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  _escapeMarkdownCell(str) {
    return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  /**
   * 解析时间字符串为纳秒时间戳
   * 支持格式:
   * - "now" 或 null/undefined → 当前时间的纳秒表示
   * - 相对时间 "5m", "1h", "24h", "7d" → (当前时间 - 偏移量) 的纳秒表示
   * - ISO 8601 → 对应时间的纳秒表示
   * - 无效格式 → 抛出错误
   *
   * @param {string|null|undefined} timeStr - 时间字符串
   * @returns {number} 纳秒时间戳
   * @throws {Error} 时间格式无效时抛出
   */
  parseTime(timeStr) {
    // "now" 或空值：返回当前时间的纳秒表示
    if (!timeStr || timeStr === 'now') {
      return Date.now() * 1000000;
    }

    // 相对时间格式: 数字 + 单位(m/h/d)
    const relativeMatch = timeStr.match(/^(\d+)(m|h|d)$/);
    if (relativeMatch) {
      const value = parseInt(relativeMatch[1], 10);
      const unit = relativeMatch[2];
      // 单位对应的毫秒数
      const msMap = { m: 60000, h: 3600000, d: 86400000 };
      const offsetMs = value * msMap[unit];
      return (Date.now() - offsetMs) * 1000000;
    }

    // ISO 8601 格式
    const parsed = new Date(timeStr);
    if (isNaN(parsed.getTime())) {
      throw new Error(
        `无效的时间格式: "${timeStr}"。支持格式: ISO 8601、"now"、相对时间(如 "1h", "30m", "7d")`
      );
    }
    return parsed.getTime() * 1000000;
  }

  /**
   * 构建 HTTP 认证头
   * - 若提供 user 和 pwd，添加 Basic Auth 认证头
   * - 若提供 orgId，添加 X-Scope-OrgID 头（Loki 多租户支持）
   * - 始终包含 Content-Type: application/json
   *
   * @param {string} [user] - 用户名
   * @param {string} [pwd] - 密码/Token
   * @param {string} [orgId] - Loki 租户 ID
   * @returns {Object} HTTP 请求头对象
   */
  buildAuthHeaders(user, pwd, orgId) {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Basic Auth 认证
    if (user && pwd) {
      const credentials = Buffer.from(`${user}:${pwd}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // Loki 多租户标识
    if (orgId) {
      headers['X-Scope-OrgID'] = orgId;
    }

    return headers;
  }

  /**
   * 封装 HTTP GET 请求
   * 使用 Node.js 内置 http/https 模块，支持查询参数拼接、超时控制、JSON 响应解析
   *
   * @param {string} url - 请求基础 URL
   * @param {Object} [params={}] - URL 查询参数对象
   * @param {Object} [headers={}] - HTTP 请求头
   * @returns {Promise<Object>} 解析后的 JSON 响应
   * @throws {Error} 连接失败、超时或 HTTP 错误时抛出
   */
  httpGet(url, params = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      // 构建完整 URL（拼接查询参数）
      const parsedUrl = new URL(url);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          parsedUrl.searchParams.append(key, String(value));
        }
      });

      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: headers
      };

      const req = transport.request(requestOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const statusCode = res.statusCode;

          // 处理认证失败
          if (statusCode === 401 || statusCode === 403) {
            reject(new Error(`AUTH_ERROR:认证失败 (HTTP ${statusCode})，请检查用户名和密码/Token`));
            return;
          }

          // 处理 404 未找到
          if (statusCode === 404) {
            reject(new Error(`NOT_FOUND:未找到匹配的日志流/索引`));
            return;
          }

          // 处理查询语法错误（400 Bad Request，通常为查询表达式无效）
          if (statusCode === 400) {
            reject(new Error(`QUERY_SYNTAX_ERROR:查询语法错误，${body}`));
            return;
          }

          // 处理其他非 2xx 状态码
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP_ERROR:HTTP 请求失败，状态码: ${statusCode}，响应: ${body}`));
            return;
          }

          // 尝试解析 JSON 响应
          try {
            const jsonData = JSON.parse(body);
            resolve(jsonData);
          } catch (e) {
            // 非 JSON 响应时返回原始文本
            resolve(body);
          }
        });
      });

      // 连接错误处理
      req.on('error', (err) => {
        reject(new Error(`CONNECTION_ERROR:无法连接日志平台: ${url}，错误: ${err.message}`));
      });

      // 超时处理
      req.setTimeout(QUERY_TIMEOUT, () => {
        req.destroy();
        reject(new Error(`TIMEOUT:查询超时（${QUERY_TIMEOUT}ms），请缩小时间范围或添加更精确的过滤条件`));
      });

      req.end();
    });
  }

  /**
   * 封装 HTTP POST 请求
   * 使用 Node.js 内置 http/https 模块，支持 JSON 请求体、超时控制、JSON 响应解析
   *
   * @param {string} url - 请求 URL
   * @param {Object} body - 请求体对象（将序列化为 JSON）
   * @param {Object} [headers={}] - HTTP 请求头
   * @returns {Promise<Object>} 解析后的 JSON 响应
   * @throws {Error} 连接失败、超时或 HTTP 错误时抛出
   */
  httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      // 序列化请求体为 JSON 字符串
      const bodyStr = JSON.stringify(body);

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };

      const req = transport.request(requestOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          const statusCode = res.statusCode;

          // 处理认证失败
          if (statusCode === 401 || statusCode === 403) {
            reject(new Error(`AUTH_ERROR:认证失败 (HTTP ${statusCode})，请检查用户名和密码/Token`));
            return;
          }

          // 处理 404 未找到
          if (statusCode === 404) {
            reject(new Error(`NOT_FOUND:未找到匹配的日志流/索引`));
            return;
          }

          // 处理查询语法错误（400 Bad Request，通常为查询表达式无效）
          if (statusCode === 400) {
            reject(new Error(`QUERY_SYNTAX_ERROR:查询语法错误，${responseBody}`));
            return;
          }

          // 处理其他非 2xx 状态码
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP_ERROR:HTTP 请求失败，状态码: ${statusCode}，响应: ${responseBody}`));
            return;
          }

          // 尝试解析 JSON 响应
          try {
            const jsonData = JSON.parse(responseBody);
            resolve(jsonData);
          } catch (e) {
            // 非 JSON 响应时返回原始文本
            resolve(responseBody);
          }
        });
      });

      // 连接错误处理
      req.on('error', (err) => {
        reject(new Error(`CONNECTION_ERROR:无法连接日志平台: ${url}，错误: ${err.message}`));
      });

      // 超时处理
      req.setTimeout(QUERY_TIMEOUT, () => {
        req.destroy();
        reject(new Error(`TIMEOUT:查询超时（${QUERY_TIMEOUT}ms），请缩小时间范围或添加更精确的过滤条件`));
      });

      // 写入请求体
      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * 构建查询结果对象
   * 包含成功标志、平台标识、行数统计、Markdown 格式化内容、截断警告
   *
   * @param {Array} entries - 日志条目数组
   * @param {string} platform - 日志平台类型 (loki | elasticsearch)
   * @param {number} limit - 本次请求的行数限制
   * @returns {Object} 结构化的查询结果
   */
  buildResult(entries, platform, limit) {
    const rowCount = entries.length;
    const truncated = rowCount >= limit;
    const markdown = this.formatAsMarkdown(entries, platform);

    const result = {
      success: true,
      platform,
      rowCount,
      markdown,
      truncated
    };

    // 达到 limit 上限时附加截断警告
    if (truncated) {
      result.warning = `⚠️ 返回结果已达上限 (${limit} 条)，可能还有更多日志未显示。建议缩小时间范围或添加更精确的过滤条件。`;
    }

    return result;
  }
}

module.exports = LogQueryTool;
module.exports.MAX_LOG_LIMIT = MAX_LOG_LIMIT;
module.exports.QUERY_TIMEOUT = QUERY_TIMEOUT;

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Jenkins 工具类
 * 封装所有 Jenkins REST API 交互逻辑，支持查看 Job 列表、启动构建、查看构建日志
 * 使用 Node.js 内置 http/https 模块发起请求，Basic Auth 认证
 */
class JenkinsTool {

  /**
   * 校验 Jenkins 连接配置
   * - baseUrl 必须为合法 HTTP/HTTPS URL
   * - user 不能为空字符串或纯空白
   * - token 不能为空字符串或纯空白
   *
   * @param {Object} config - Jenkins 连接配置
   * @param {string} config.baseUrl - Jenkins 服务器地址
   * @param {string} config.user - Jenkins 用户名
   * @param {string} config.token - Jenkins API Token
   * @returns {{valid: boolean, error?: string, code?: string}} 校验结果
   */
  validateConfig(config) {
    const { baseUrl, user, token } = config || {};

    // 校验 baseUrl 是否为合法 HTTP/HTTPS URL
    if (!baseUrl || typeof baseUrl !== 'string') {
      return {
        valid: false,
        error: 'baseUrl 参数缺失或不是字符串',
        code: 'INVALID_URL'
      };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(baseUrl);
    } catch (e) {
      return {
        valid: false,
        error: `baseUrl 格式无效: "${baseUrl}"，必须为合法的 HTTP/HTTPS URL`,
        code: 'INVALID_URL'
      };
    }

    // 协议必须为 http 或 https
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        valid: false,
        error: `baseUrl 协议无效: "${parsedUrl.protocol}"，仅支持 http 和 https`,
        code: 'INVALID_URL'
      };
    }

    // 校验 user 不能为空或纯空白
    if (!user || typeof user !== 'string' || user.trim().length === 0) {
      return {
        valid: false,
        error: 'user 参数缺失或为空，Jenkins 用户名不能为空',
        code: 'MISSING_CREDENTIALS'
      };
    }

    // 校验 token 不能为空或纯空白
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return {
        valid: false,
        error: 'token 参数缺失或为空，Jenkins API Token 不能为空',
        code: 'MISSING_CREDENTIALS'
      };
    }

    return { valid: true };
  }

  /**
   * 将 Job 路径（支持嵌套文件夹）转换为 Jenkins API 路径格式
   * 例如: "devops/TKE_CSI_UAT/csi-mid-ops" => "/job/devops/job/TKE_CSI_UAT/job/csi-mid-ops"
   *
   * @param {string} jobPath - Job 路径，使用 / 分隔文件夹层级
   * @returns {string} Jenkins API 格式的路径
   * @private
   */
  _buildJobPath(jobPath) {
    // 按 / 分割路径各段，每段用 encodeURIComponent 编码后拼接为 /job/xxx 格式
    const segments = jobPath.split('/').filter(s => s.length > 0);
    return segments.map(s => `/job/${encodeURIComponent(s)}`).join('');
  }

  /**
   * 获取 Jenkins CSRF Crumb Token
   * 调用 Jenkins API: GET {baseUrl}/crumbIssuer/api/json
   * Jenkins 启用 CSRF 保护时，POST 请求必须携带 crumb
   *
   * @param {string} baseUrl - Jenkins 服务器地址
   * @param {string} user - Jenkins 用户名
   * @param {string} token - Jenkins API Token
   * @returns {Promise<{field: string, crumb: string}|null>} crumb 信息，获取失败返回 null
   * @private
   */
  async _getCrumb(baseUrl, user, token) {
    try {
      const url = `${baseUrl}/crumbIssuer/api/json`;
      const response = await this._request(url, {
        method: 'GET',
        headers: {
          'Authorization': this._buildAuthHeader(user, token),
          'Accept': 'application/json'
        }
      });

      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        return { field: data.crumbRequestField, crumb: data.crumb };
      }
      // crumb 不可用时返回 null（Jenkins 可能未启用 CSRF）
      return null;
    } catch (err) {
      // 获取 crumb 失败时不阻断流程
      return null;
    }
  }

  /**
   * 构造 Basic Auth 认证头
   * 格式: Basic base64(user:token)
   *
   * @param {string} user - Jenkins 用户名
   * @param {string} token - Jenkins API Token
   * @returns {string} Basic Auth 认证头值
   * @private
   */
  _buildAuthHeader(user, token) {
    const credentials = Buffer.from(`${user}:${token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * 使用 Node.js 内置 http/https 模块发起 HTTP 请求
   *
   * @param {string} url - 请求 URL
   * @param {Object} [options={}] - 请求选项
   * @param {string} [options.method='GET'] - HTTP 方法
   * @param {Object} [options.headers={}] - 请求头
   * @param {string|Buffer} [options.body] - 请求体
   * @returns {Promise<{statusCode: number, headers: Object, body: string}>} 响应对象
   * @private
   */
  _request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = transport.request(requestOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      // 设置请求超时（30秒）
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('请求超时（30秒）'));
      });

      // 写入请求体
      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * 获取所有 Jenkins Job 列表
   * 调用 Jenkins API: GET {baseUrl}/api/json?tree=jobs[name,url,color]
   *
   * @param {Object} config - Jenkins 连接配置 {baseUrl, user, token}
   * @returns {Promise<{success: boolean, data?: Object, error?: string, code?: string}>} Job 列表结果
   */
  async listJobs(config) {
    // 校验配置参数
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const { baseUrl, user, token } = config;

    try {
      // 构造请求 URL，支持嵌套文件夹路径
      // 如果指定了 folderPath，则获取该文件夹下的 Job 列表
      const folderPath = config.folderPath;
      const pathPrefix = folderPath ? this._buildJobPath(folderPath) : '';
      const url = `${baseUrl}${pathPrefix}/api/json?tree=jobs[name,url,color]`;

      // 发起 GET 请求，使用 Basic Auth 认证
      const response = await this._request(url, {
        method: 'GET',
        headers: {
          'Authorization': this._buildAuthHeader(user, token),
          'Accept': 'application/json'
        }
      });

      // 处理认证失败（401/403）
      if (response.statusCode === 401 || response.statusCode === 403) {
        return {
          success: false,
          error: 'Jenkins 认证失败，请检查用户名和 Token',
          code: 'AUTH_FAILED'
        };
      }

      // 处理其他非 200 状态码
      if (response.statusCode !== 200) {
        return {
          success: false,
          error: `Jenkins API 请求失败，状态码: ${response.statusCode}`,
          code: 'API_ERROR'
        };
      }

      // 解析响应 JSON，提取 jobs 数组
      const parsedBody = JSON.parse(response.body);
      return {
        success: true,
        data: { jobs: parsedBody.jobs || [] }
      };
    } catch (err) {
      // 处理网络连接错误（连接拒绝、超时等）
      return {
        success: false,
        error: `Jenkins 连接失败: ${err.message}`,
        code: 'CONNECTION_ERROR'
      };
    }
  }

  /**
   * 启动 Jenkins Job 构建
   * - 无参数时调用: POST {baseUrl}/job/{jobName}/build
   * - 有参数时调用: POST {baseUrl}/job/{jobName}/buildWithParameters
   *
   * @param {Object} config - 构建配置 {baseUrl, user, token, jobName, parameters}
   * @returns {Promise<{success: boolean, data?: Object, error?: string, code?: string}>} 构建触发结果
   */
  async buildJob(config) {
    // 校验连接配置参数
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const { baseUrl, user, token, jobName, parameters } = config;

    // 校验 jobName 是否为非空字符串
    if (!jobName || typeof jobName !== 'string' || jobName.trim().length === 0) {
      return {
        success: false,
        error: 'jobName 参数缺失或为空',
        code: 'MISSING_PARAM'
      };
    }

    try {
      // 判断是否为参数化构建（parameters 为包含至少一个键的对象）
      const hasParameters = parameters
        && typeof parameters === 'object'
        && !Array.isArray(parameters)
        && Object.keys(parameters).length > 0;

      // 根据是否有参数确定 API 端点（支持嵌套文件夹路径）
      const jobPath = this._buildJobPath(jobName);
      const endpoint = hasParameters
        ? `${baseUrl}${jobPath}/buildWithParameters`
        : `${baseUrl}${jobPath}/build`;

      // 构建请求头
      const headers = {
        'Authorization': this._buildAuthHeader(user, token)
      };

      // 获取 CSRF crumb（Jenkins 启用 CSRF 保护时必须携带）
      const crumb = await this._getCrumb(baseUrl, user, token);
      if (crumb) {
        headers[crumb.field] = crumb.crumb;
      }

      // 构建请求体（参数化构建时以 URL 编码表单数据发送）
      let body = undefined;
      if (hasParameters) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        // 将参数对象转换为 URL 编码的表单数据
        body = Object.entries(parameters)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&');
      }

      // 发起 POST 请求触发构建
      const response = await this._request(endpoint, {
        method: 'POST',
        headers,
        body
      });

      const { statusCode } = response;

      // 处理 Job 不存在（404）
      if (statusCode === 404) {
        return {
          success: false,
          error: `Job "${jobName}" 不存在`,
          code: 'JOB_NOT_FOUND'
        };
      }

      // 处理认证失败（401/403）
      if (statusCode === 401 || statusCode === 403) {
        return {
          success: false,
          error: 'Jenkins 认证失败，请检查用户名和 Token',
          code: 'AUTH_FAILED'
        };
      }

      // 处理成功响应（201 Created 或 302 重定向）
      if (statusCode === 201 || statusCode === 302) {
        // 从 Location 响应头提取队列 URL
        const queueUrl = response.headers.location || '';
        return {
          success: true,
          data: { queueUrl }
        };
      }

      // 处理其他非成功状态码
      return {
        success: false,
        error: `构建触发失败，状态码: ${statusCode}`,
        code: 'BUILD_FAILED'
      };
    } catch (err) {
      // 处理网络连接错误（连接拒绝、DNS 解析失败、超时等）
      return {
        success: false,
        error: `Jenkins 连接失败: ${err.message}`,
        code: 'CONNECTION_ERROR'
      };
    }
  }

  /**
   * 获取 Jenkins 构建日志
   * 调用 Jenkins API: GET {baseUrl}/job/{jobName}/{buildNumber}/consoleText
   *
   * @param {Object} config - 日志查询配置 {baseUrl, user, token, jobName, buildNumber}
   * @returns {Promise<{success: boolean, data?: Object, error?: string, code?: string}>} 构建日志内容
   */
  async getBuildLog(config) {
    // 校验连接配置参数
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const { baseUrl, user, token, jobName, buildNumber } = config;

    // 校验 jobName 是否为非空字符串
    if (!jobName || typeof jobName !== 'string' || jobName.trim().length === 0) {
      return {
        success: false,
        error: 'jobName 参数缺失或为空',
        code: 'MISSING_PARAM'
      };
    }

    // buildNumber 默认为 "lastBuild"
    const resolvedBuildNumber = (buildNumber !== undefined && buildNumber !== null && buildNumber !== '')
      ? buildNumber
      : 'lastBuild';

    try {
      // 构造请求 URL，获取指定构建的控制台日志（支持嵌套文件夹路径）
      const jobPath = this._buildJobPath(jobName);
      const url = `${baseUrl}${jobPath}/${resolvedBuildNumber}/consoleText`;

      // 发起 GET 请求，使用 Basic Auth 认证
      const response = await this._request(url, {
        method: 'GET',
        headers: {
          'Authorization': this._buildAuthHeader(user, token)
        }
      });

      const { statusCode } = response;

      // 处理构建不存在（404）
      if (statusCode === 404) {
        return {
          success: false,
          error: `Job "${jobName}" 的构建 #${resolvedBuildNumber} 不存在`,
          code: 'BUILD_NOT_FOUND'
        };
      }

      // 处理认证失败（401/403）
      if (statusCode === 401 || statusCode === 403) {
        return {
          success: false,
          error: 'Jenkins 认证失败，请检查用户名和 Token',
          code: 'AUTH_FAILED'
        };
      }

      // 处理其他非 200 状态码
      if (statusCode !== 200) {
        return {
          success: false,
          error: `Jenkins API 请求失败，状态码: ${statusCode}`,
          code: 'API_ERROR'
        };
      }

      // 返回完整日志内容
      return {
        success: true,
        data: { log: response.body }
      };
    } catch (err) {
      // 处理网络连接错误（连接拒绝、DNS 解析失败、超时等）
      return {
        success: false,
        error: `Jenkins 连接失败: ${err.message}`,
        code: 'CONNECTION_ERROR'
      };
    }
  }

  /**
   * 获取 Jenkins Job 详细信息
   * 包括参数定义、最近构建状态、描述等，供 AI 参考以自动补充构建参数
   * 调用 Jenkins API: GET {baseUrl}/job/{jobName}/api/json
   *
   * @param {Object} config - 查询配置 {baseUrl, user, token, jobName}
   * @returns {Promise<{success: boolean, data?: Object, error?: string, code?: string}>} Job 信息
   */
  async getJobInfo(config) {
    // 校验连接配置参数
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error, code: validation.code };
    }

    const { baseUrl, user, token, jobName } = config;

    // 校验 jobName 是否为非空字符串
    if (!jobName || typeof jobName !== 'string' || jobName.trim().length === 0) {
      return {
        success: false,
        error: 'jobName 参数缺失或为空',
        code: 'MISSING_PARAM'
      };
    }

    try {
      // 构造请求 URL（支持嵌套文件夹路径）
      const jobPath = this._buildJobPath(jobName);
      const url = `${baseUrl}${jobPath}/api/json?tree=name,url,description,buildable,color,lastBuild[number,result,timestamp],lastSuccessfulBuild[number,timestamp],property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]`;

      // 发起 GET 请求
      const response = await this._request(url, {
        method: 'GET',
        headers: {
          'Authorization': this._buildAuthHeader(user, token),
          'Accept': 'application/json'
        }
      });

      const { statusCode } = response;

      // 处理 Job 不存在（404）
      if (statusCode === 404) {
        return {
          success: false,
          error: `Job "${jobName}" 不存在`,
          code: 'JOB_NOT_FOUND'
        };
      }

      // 处理认证失败（401/403）
      if (statusCode === 401 || statusCode === 403) {
        return {
          success: false,
          error: 'Jenkins 认证失败，请检查用户名和 Token',
          code: 'AUTH_FAILED'
        };
      }

      // 处理其他非 200 状态码
      if (statusCode !== 200) {
        return {
          success: false,
          error: `Jenkins API 请求失败，状态码: ${statusCode}`,
          code: 'API_ERROR'
        };
      }

      // 解析响应
      const jobData = JSON.parse(response.body);

      // 提取参数定义
      const parameters = [];
      if (jobData.property) {
        for (const prop of jobData.property) {
          if (prop.parameterDefinitions) {
            for (const param of prop.parameterDefinitions) {
              parameters.push({
                name: param.name,
                type: param.type,
                description: param.description || '',
                defaultValue: param.defaultParameterValue ? param.defaultParameterValue.value : null,
                choices: param.choices || null
              });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          name: jobData.name,
          url: jobData.url,
          description: jobData.description || '',
          buildable: jobData.buildable,
          color: jobData.color,
          lastBuild: jobData.lastBuild || null,
          lastSuccessfulBuild: jobData.lastSuccessfulBuild || null,
          parameters
        }
      };
    } catch (err) {
      return {
        success: false,
        error: `Jenkins 连接失败: ${err.message}`,
        code: 'CONNECTION_ERROR'
      };
    }
  }
}

module.exports = JenkinsTool;

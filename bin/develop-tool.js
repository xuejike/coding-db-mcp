#!/usr/bin/env node

/**
 * MCP数据库查询工具全局命令行入口
 * 提供完整的命令行交互功能，包括配置管理子命令
 */

// 加载环境变量
require('dotenv').config();

const path = require('path');
const fs = require('fs');

// 获取包信息
const packageInfo = require('../package.json');

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
${packageInfo.name} - ${packageInfo.description}

用法:
  develop-tool [命令] [选项]

命令:
  start                启动MCP服务（默认命令）
  test                 测试数据库连接
  query                执行单次SQL查询
  config               显示当前环境变量配置信息
  config add <alias>   添加数据库连接配置
  config remove <alias> 删除数据库连接配置
  config list          列出所有已配置的连接
  config show <alias>  显示指定连接的详细信息
  jenkins list         查看 Jenkins Job 列表
  jenkins build <job>  启动 Jenkins Job 构建
  jenkins log <job>    查看 Jenkins 构建日志
  version              显示版本信息
  help                 显示帮助信息

通用选项:
  -h, --help              显示帮助信息
  -v, --version           显示版本信息
  -t, --type <type>       数据库类型 (mysql, postgresql, oracle, mssql)
  -H, --host <host>       数据库主机地址
  -P, --port <port>       数据库端口
  -u, --user <user>       数据库用户名
  -p, --password <pwd>    数据库密码
  -d, --database <db>     数据库名称
  -q, --query <sql>       SQL查询语句
  --alias <alias>         使用预配置的数据库别名连接

config add 选项:
  --type <type>           数据库类型 (mysql, postgresql, oracle, mssql)
  --host <host>           数据库主机地址
  --port <port>           数据库端口
  --user <user>           数据库用户名
  --password <pwd>        数据库密码
  --password-stdin        从标准输入读取密码
  --database <db>         数据库名称
  --global                保存到用户级配置（默认保存到项目级）

config remove 选项:
  --global                从用户级配置中删除（默认从项目级删除）

jenkins 选项:
  --alias <alias>         使用预配置的 Jenkins 连接别名
  --base-url <url>        Jenkins 服务器地址
  --user <user>           Jenkins 用户名
  --token <token>         Jenkins API Token
  --build-number <num>    构建号（log 子命令，默认 lastBuild）
  --param <key=value>     构建参数（build 子命令，可多次指定）

示例:
  # 启动MCP服务
  develop-tool start

  # 添加数据库连接配置
  develop-tool config add mydb --type mysql --host localhost --port 3306 --user root --password pass --database myapp

  # 使用别名查询
  develop-tool query --alias mydb -q "SELECT * FROM users"

  # 列出所有连接
  develop-tool config list

  # 查看连接详情
  develop-tool config show mydb

  # 删除连接
  develop-tool config remove mydb

  # 从标准输入读取密码
  echo "mypassword" | develop-tool config add mydb --type mysql --host localhost --port 3306 --user root --password-stdin --database myapp

  # 添加 Jenkins 连接配置
  develop-tool config add my-jenkins --type jenkins --base-url http://jenkins:8080 --user admin --token api-token

  # 查看 Jenkins Job 列表
  develop-tool jenkins list --alias my-jenkins

  # 启动 Jenkins Job 构建
  develop-tool jenkins build my-job --alias my-jenkins --param branch=main

  # 查看构建日志
  develop-tool jenkins log my-job --alias my-jenkins --build-number 42
`);
}

/**
 * 显示版本信息
 */
function showVersion() {
  console.log(`${packageInfo.name} v${packageInfo.version}`);
}

/**
 * 解析命令行参数
 * 支持多级子命令（如 config add、config remove 等）以及各子命令特有的选项
 * @returns {Object} 解析后的参数对象
 */
function parseArgs() {
  const args = {
    command: 'start',
    subCommand: null,
    configAlias: null,
    options: {}
  };

  const argv = process.argv.slice(2);
  const commands = ['start', 'test', 'query', 'config', 'jenkins', 'version', 'help'];
  const configSubCommands = ['add', 'remove', 'list', 'show'];
  const jenkinsSubCommands = ['list', 'build', 'log', 'info'];

  let commandFound = false;
  let subCommandFound = false;

  // 第一遍: 识别命令和子命令
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('-')) {
      const optionsWithValue = [
        '-t', '--type', '-H', '--host', '-P', '--port',
        '-u', '--user', '-p', '--password', '-d', '--database',
        '-q', '--query', '-c', '--config', '--alias',
        '--base-url', '--token', '--build-number', '--param'
      ];
      if (optionsWithValue.includes(arg)) {
        i++;
      }
      continue;
    }

    if (!commandFound) {
      if (commands.includes(arg)) {
        args.command = arg;
        commandFound = true;
      }
      continue;
    }

    if (args.command === 'config' && !subCommandFound) {
      if (configSubCommands.includes(arg)) {
        args.subCommand = arg;
        subCommandFound = true;
      }
      continue;
    }

    if (args.command === 'config' && subCommandFound &&
        ['add', 'remove', 'show'].includes(args.subCommand) && !args.configAlias) {
      args.configAlias = arg;
      continue;
    }

    // jenkins 子命令识别
    if (args.command === 'jenkins' && !subCommandFound) {
      if (jenkinsSubCommands.includes(arg)) {
        args.subCommand = arg;
        subCommandFound = true;
      }
      continue;
    }

    // jenkins build <jobName>、jenkins log <jobName>、jenkins info <jobName> 的位置参数
    if (args.command === 'jenkins' && subCommandFound &&
        ['build', 'log', 'info'].includes(args.subCommand) && !args.options.jenkinsJobName) {
      args.options.jenkinsJobName = arg;
      continue;
    }

    // jenkins list [folderPath] 的可选位置参数（文件夹路径）
    if (args.command === 'jenkins' && subCommandFound &&
        args.subCommand === 'list' && !args.options.jenkinsFolderPath) {
      args.options.jenkinsFolderPath = arg;
      continue;
    }
  }

  // 第二遍: 解析所有选项
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('-')) {
      continue;
    }

    switch (arg) {
      case '-h':
      case '--help':
        args.command = 'help';
        break;
      case '-v':
      case '--version':
        args.command = 'version';
        break;
      case '-t':
      case '--type':
        args.options.type = argv[++i];
        break;
      case '-H':
      case '--host':
        args.options.host = argv[++i];
        break;
      case '-P':
      case '--port':
        args.options.port = parseInt(argv[++i], 10);
        break;
      case '-u':
      case '--user':
        args.options.user = argv[++i];
        break;
      case '-p':
      case '--password':
        args.options.password = argv[++i];
        break;
      case '-d':
      case '--database':
        args.options.database = argv[++i];
        break;
      case '-q':
      case '--query':
        args.options.query = argv[++i];
        break;
      case '-c':
      case '--config':
        args.options.configFile = argv[++i];
        break;
      case '--alias':
        args.options.alias = argv[++i];
        break;
      case '--base-url':
        args.options.baseUrl = argv[++i];
        break;
      case '--token':
        args.options.token = argv[++i];
        break;
      case '--build-number':
        args.options.buildNumber = argv[++i];
        break;
      case '--param':
        // 支持多次指定 --param key=value
        if (!args.options.params) args.options.params = [];
        args.options.params.push(argv[++i]);
        break;
      case '--global':
        args.options.global = true;
        break;
      case '--password-stdin':
        args.options.passwordStdin = true;
        break;
    }
  }

  return args;
}

/**
 * 获取数据库配置（合并环境变量和命令行参数）
 */
function getDatabaseConfig(cliOptions = {}) {
  return {
    type: cliOptions.type || process.env.DB_TYPE || 'mysql',
    host: cliOptions.host || process.env.DB_HOST || 'localhost',
    port: cliOptions.port || parseInt(process.env.DB_PORT, 10) || 3306,
    user: cliOptions.user || process.env.DB_USER || 'root',
    pwd: cliOptions.password || process.env.DB_PASSWORD || '',
    db: cliOptions.database || process.env.DB_NAME || ''
  };
}

/**
 * 从标准输入同步读取密码
 */
function readPasswordFromStdin() {
  try {
    const input = fs.readFileSync(0, 'utf-8').trim();
    return input;
  } catch (err) {
    throw new Error('从标准输入读取密码失败: ' + err.message);
  }
}

/**
 * 启动MCP服务
 */
async function startMcpServer() {
  const { Server: McpServer } = require("@modelcontextprotocol/sdk/server");
  const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
  const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
  const DatabaseQueryTool = require("../db-query-tool.js");
  const config = require("../mcp.full.config.js");
  const { resolveToolArguments } = require("../lib/resolve-tool-arguments.js");
  const JenkinsTool = require("../lib/jenkins-tool.js");
  const { resolveJenkinsArguments } = require("../lib/resolve-jenkins-arguments.js");

  const dbTool = new DatabaseQueryTool();
  // 创建 Jenkins 工具实例
  const jenkinsTool = new JenkinsTool();

  const server = new McpServer(
    {
      name: config.service.name,
      version: config.service.version,
    },
    {
      capabilities: config.capabilities,
      instructions: config.instructions
    }
  );

  // 注册工具调用处理器
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      // 解析参数：支持 alias 别名解析，无 alias 时保持原有行为
      const resolvedArgs = resolveToolArguments(request.params.arguments);

      let result;

      switch (request.params.name) {
        case config.tools.query_mysql.name:
          result = await dbTool.executeMySQL(resolvedArgs);
          break;
        case config.tools.query_postgresql.name:
          result = await dbTool.executePostgreSQL(resolvedArgs);
          break;
        case config.tools.query_mssql.name:
          result = await dbTool.executeMSSQL(resolvedArgs);
          break;
        case config.tools.query_oracle.name:
          result = await dbTool.executeOracle(resolvedArgs);
          break;

        // Jenkins CI/CD 工具
        case config.tools.jenkins_list_jobs.name:
          result = await jenkinsTool.listJobs(resolveJenkinsArguments(request.params.arguments));
          break;
        case config.tools.jenkins_build_job.name:
          result = await jenkinsTool.buildJob(resolveJenkinsArguments(request.params.arguments));
          break;
        case config.tools.jenkins_get_build_log.name:
          result = await jenkinsTool.getBuildLog(resolveJenkinsArguments(request.params.arguments));
          break;
        case config.tools.jenkins_get_job_info.name:
          result = await jenkinsTool.getJobInfo(resolveJenkinsArguments(request.params.arguments));
          break;

        default:
          throw new Error(`未知工具: ${request.params.name}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }, null, 2) }],
        isError: true
      };
    }
  });

  // 注册工具列表请求处理器
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        config.tools.query_mysql,
        config.tools.query_postgresql,
        config.tools.query_mssql,
        config.tools.query_oracle,
        config.tools.jenkins_list_jobs,
        config.tools.jenkins_build_job,
        config.tools.jenkins_get_build_log,
        config.tools.jenkins_get_job_info
      ]
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP数据库查询服务已启动");
  await server.sendToolListChanged();
}

/**
 * 测试数据库连接
 */
async function testConnection(options) {
  const DatabaseQueryTool = require("../db-query-tool.js");
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);

  console.log(`正在测试${config.type.toUpperCase()}数据库连接...`);
  console.log(`主机: ${config.host}:${config.port}`);
  console.log(`数据库: ${config.db}`);
  console.log(`用户: ${config.user}`);
  console.log('');

  try {
    const testQuery = config.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1 as test';
    const result = await dbTool.execute({ ...config, querySql: testQuery });

    if (result.success) {
      console.log('✓ 数据库连接成功！');
      console.log(`  返回数据: ${JSON.stringify(result.data)}`);
    } else {
      console.log('✗ 数据库连接失败！');
      console.log(`  错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log('✗ 数据库连接失败！');
    console.log(`  错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 执行单次查询，支持 --alias 选项
 */
async function executeQuery(options) {
  const DatabaseQueryTool = require("../db-query-tool.js");
  const { resolveToolArguments } = require("../lib/resolve-tool-arguments.js");
  const dbTool = new DatabaseQueryTool();

  if (!options.query) {
    console.error('错误: 请使用 -q 或 --query 参数指定SQL查询语句');
    process.exit(1);
  }

  const toolArgs = { querySql: options.query };
  if (options.alias) toolArgs.alias = options.alias;
  if (options.host) toolArgs.host = options.host;
  if (options.port) toolArgs.port = options.port;
  if (options.user) toolArgs.user = options.user;
  if (options.password) toolArgs.pwd = options.password;
  if (options.database) toolArgs.db = options.database;
  if (options.type) toolArgs.type = options.type;

  try {
    const resolvedArgs = resolveToolArguments(toolArgs);
    console.log(`执行查询: ${options.query}`);
    console.log('');

    const result = await dbTool.execute({ ...resolvedArgs });

    if (result.success) {
      console.log('查询成功！');
      console.log(`返回 ${result.rowCount} 行数据`);
      console.log('');
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log('查询失败！');
      console.log(`错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log('查询失败！');
    console.log(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 显示当前环境变量配置（旧版 config 命令行为）
 */
function showEnvConfig() {
  const config = getDatabaseConfig();
  console.log('当前数据库配置:');
  console.log('================');
  console.log(`数据库类型: ${config.type}`);
  console.log(`主机地址: ${config.host}`);
  console.log(`端口: ${config.port}`);
  console.log(`用户名: ${config.user}`);
  console.log(`密码: ${'*'.repeat(config.pwd.length || 0)}`);
  console.log(`数据库: ${config.db}`);
  console.log('');
  console.log('配置来源优先级: 命令行参数 > 环境变量 > 默认值');
}

/**
 * 处理 config add 子命令
 * 支持数据库连接和 Jenkins 连接两种类型
 */
function handleConfigAdd(alias, options) {
  const ConfigManager = require('../lib/config-manager.js');

  if (!alias) {
    console.error('错误: 请指定要添加的别名');
    console.error('用法: develop-tool config add <alias> --type <type> [选项]');
    process.exit(1);
  }

  let connectionConfig;

  if (options.type === 'jenkins') {
    // Jenkins 类型配置
    const token = options.token || options.password;
    if (options.passwordStdin) {
      const stdinInput = readPasswordFromStdin();
      connectionConfig = {
        type: 'jenkins',
        baseUrl: options.baseUrl,
        user: options.user,
        pwd: stdinInput
      };
    } else {
      if (!token) {
        console.error('错误: 请通过 --token 或 --password 提供 Jenkins API Token');
        process.exit(1);
      }
      connectionConfig = {
        type: 'jenkins',
        baseUrl: options.baseUrl,
        user: options.user,
        pwd: token
      };
    }
  } else {
    // 数据库类型配置（保持原有逻辑）
    let password = options.password;
    if (options.passwordStdin) {
      password = readPasswordFromStdin();
    }

    if (!password) {
      console.error('错误: 请通过 --password 或 --password-stdin 提供数据库密码');
      process.exit(1);
    }

    connectionConfig = {
      type: options.type,
      host: options.host,
      port: options.port,
      user: options.user,
      pwd: password
    };
    if (options.database) {
      connectionConfig.db = options.database;
    }
  }

  try {
    const configManager = new ConfigManager();
    configManager.addConnection(alias, connectionConfig, { global: !!options.global });

    const target = options.global ? '用户级配置' : '项目级配置';
    const typeLabel = options.type === 'jenkins' ? 'Jenkins 连接' : '数据库连接';
    console.log(`✓ ${typeLabel} '${alias}' 已保存到${target}`);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 config remove 子命令
 */
function handleConfigRemove(alias, options) {
  const ConfigManager = require('../lib/config-manager.js');

  if (!alias) {
    console.error('错误: 请指定要删除的别名');
    console.error('用法: develop-tool config remove <alias> [--global]');
    process.exit(1);
  }

  try {
    const configManager = new ConfigManager();
    configManager.removeConnection(alias, { global: !!options.global });

    const target = options.global ? '用户级配置' : '项目级配置';
    console.log(`✓ 数据库连接 '${alias}' 已从${target}中删除`);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 config list 子命令
 */
function handleConfigList() {
  const ConfigManager = require('../lib/config-manager.js');

  try {
    const configManager = new ConfigManager();
    const connections = configManager.listConnections();

    if (connections.length === 0) {
      console.log('暂无已配置的数据库连接。');
      console.log('使用 develop-tool config add <alias> 添加新连接。');
      return;
    }

    console.log('已配置的数据库连接:');
    console.log('');
    console.log(formatRow('别名', '类型', '主机', '数据库', '来源'));
    console.log(formatRow('----', '----', '----', '------', '----'));

    for (const conn of connections) {
      const sourceLabel = conn.source === 'project' ? '项目级' : '用户级';
      console.log(formatRow(conn.alias, conn.type, conn.host, conn.db, sourceLabel));
    }

    console.log('');
    console.log(`共 ${connections.length} 个连接配置`);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

function formatRow(alias, type, host, db, source) {
  return `  ${padEnd(alias, 20)} ${padEnd(type, 14)} ${padEnd(host, 20)} ${padEnd(db, 16)} ${source}`;
}

function padEnd(str, len) {
  str = String(str || '');
  while (str.length < len) str += ' ';
  return str;
}

/**
 * 处理 config show 子命令
 */
function handleConfigShow(alias) {
  const ConfigManager = require('../lib/config-manager.js');

  if (!alias) {
    console.error('错误: 请指定要查看的别名');
    console.error('用法: db-query-mcp config show <alias>');
    process.exit(1);
  }

  try {
    const configManager = new ConfigManager();
    const config = configManager.resolveAlias(alias);

    console.log(`数据库连接详情 - '${alias}':`);
    console.log('========================');
    console.log(`  类型:     ${config.type}`);
    console.log(`  主机:     ${config.host}`);
    console.log(`  端口:     ${config.port}`);
    console.log(`  用户名:   ${config.user}`);
    console.log(`  密码:     ****`);
    console.log(`  数据库:   ${config.db || '（未指定，可访问所有库）'}`);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 config 命令路由
 */
function handleConfig(subCommand, configAlias, options) {
  switch (subCommand) {
    case 'add':
      handleConfigAdd(configAlias, options);
      break;
    case 'remove':
      handleConfigRemove(configAlias, options);
      break;
    case 'list':
      handleConfigList();
      break;
    case 'show':
      handleConfigShow(configAlias);
      break;
    default:
      showEnvConfig();
      break;
  }
}

/**
 * 处理 jenkins list 子命令
 * 获取 Jenkins Job 列表并格式化输出
 */
async function handleJenkinsList(options) {
  const JenkinsTool = require('../lib/jenkins-tool.js');
  const { resolveJenkinsArguments } = require('../lib/resolve-jenkins-arguments.js');

  // 构造参数对象
  const toolArgs = {};
  if (options.alias) toolArgs.alias = options.alias;
  if (options.baseUrl) toolArgs.baseUrl = options.baseUrl;
  if (options.user) toolArgs.user = options.user;
  if (options.token) toolArgs.token = options.token;

  try {
    // 解析连接参数（支持 alias 和直接参数）
    const resolvedArgs = resolveJenkinsArguments(toolArgs);

    // 如果指定了文件夹路径，添加到参数中
    if (options.jenkinsFolderPath) {
      resolvedArgs.folderPath = options.jenkinsFolderPath;
    }

    // 调用 JenkinsTool 获取 Job 列表
    const jenkinsTool = new JenkinsTool();
    const result = await jenkinsTool.listJobs(resolvedArgs);

    if (result.success) {
      const jobs = result.data.jobs;
      if (jobs.length === 0) {
        console.log('Jenkins 服务器上暂无 Job。');
        return;
      }

      console.log('Jenkins Job 列表:');
      console.log('');
      console.log(`  ${padEnd('Job 名称', 30)} ${padEnd('状态', 10)} URL`);
      console.log(`  ${padEnd('--------', 30)} ${padEnd('----', 10)} ---`);

      for (const job of jobs) {
        // color 字段映射为可读状态
        const statusMap = {
          'blue': '成功',
          'red': '失败',
          'yellow': '不稳定',
          'grey': '未构建',
          'disabled': '已禁用',
          'aborted': '已中止',
          'notbuilt': '未构建',
          'blue_anime': '构建中',
          'red_anime': '构建中',
          'yellow_anime': '构建中'
        };
        const status = statusMap[job.color] || job.color || '未知';
        console.log(`  ${padEnd(job.name, 30)} ${padEnd(status, 10)} ${job.url || ''}`);
      }

      console.log('');
      console.log(`共 ${jobs.length} 个 Job`);
    } else {
      console.error(`错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 jenkins build 子命令
 * 触发 Jenkins Job 构建
 */
async function handleJenkinsBuild(options) {
  const JenkinsTool = require('../lib/jenkins-tool.js');
  const { resolveJenkinsArguments } = require('../lib/resolve-jenkins-arguments.js');

  const jobName = options.jenkinsJobName;
  if (!jobName) {
    console.error('错误: 请指定要构建的 Job 名称');
    console.error('用法: develop-tool jenkins build <jobName> [--alias <alias>] [--param key=value]');
    process.exit(1);
  }

  // 构造参数对象
  const toolArgs = { jobName };
  if (options.alias) toolArgs.alias = options.alias;
  if (options.baseUrl) toolArgs.baseUrl = options.baseUrl;
  if (options.user) toolArgs.user = options.user;
  if (options.token) toolArgs.token = options.token;

  // 解析 --param key=value 构建参数
  if (options.params && options.params.length > 0) {
    const parameters = {};
    for (const param of options.params) {
      const eqIndex = param.indexOf('=');
      if (eqIndex === -1) {
        console.error(`错误: 无效的参数格式 "${param}"，应为 key=value`);
        process.exit(1);
      }
      const key = param.substring(0, eqIndex);
      const value = param.substring(eqIndex + 1);
      parameters[key] = value;
    }
    toolArgs.parameters = parameters;
  }

  try {
    // 解析连接参数（支持 alias 和直接参数）
    const resolvedArgs = resolveJenkinsArguments(toolArgs);

    // 调用 JenkinsTool 触发构建
    const jenkinsTool = new JenkinsTool();
    const result = await jenkinsTool.buildJob(resolvedArgs);

    if (result.success) {
      console.log(`✓ Job "${jobName}" 构建已触发`);
      if (result.data.queueUrl) {
        console.log(`  队列 URL: ${result.data.queueUrl}`);
      }
    } else {
      console.error(`错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 jenkins log 子命令
 * 获取 Jenkins 构建日志并输出到终端
 */
async function handleJenkinsLog(options) {
  const JenkinsTool = require('../lib/jenkins-tool.js');
  const { resolveJenkinsArguments } = require('../lib/resolve-jenkins-arguments.js');

  const jobName = options.jenkinsJobName;
  if (!jobName) {
    console.error('错误: 请指定要查看日志的 Job 名称');
    console.error('用法: develop-tool jenkins log <jobName> [--alias <alias>] [--build-number <num>]');
    process.exit(1);
  }

  // 构造参数对象
  const toolArgs = { jobName };
  if (options.alias) toolArgs.alias = options.alias;
  if (options.baseUrl) toolArgs.baseUrl = options.baseUrl;
  if (options.user) toolArgs.user = options.user;
  if (options.token) toolArgs.token = options.token;
  if (options.buildNumber) toolArgs.buildNumber = options.buildNumber;

  try {
    // 解析连接参数（支持 alias 和直接参数）
    const resolvedArgs = resolveJenkinsArguments(toolArgs);

    // 调用 JenkinsTool 获取构建日志
    const jenkinsTool = new JenkinsTool();
    const result = await jenkinsTool.getBuildLog(resolvedArgs);

    if (result.success) {
      const buildNum = options.buildNumber || 'lastBuild';
      console.log(`Jenkins 构建日志 - ${jobName} #${buildNum}:`);
      console.log('='.repeat(50));
      console.log(result.data.log);
    } else {
      console.error(`错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 jenkins info 子命令
 * 获取 Job 详细信息（参数定义、最近构建等），供 AI 参考自动补充构建参数
 */
async function handleJenkinsInfo(options) {
  const JenkinsTool = require('../lib/jenkins-tool.js');
  const { resolveJenkinsArguments } = require('../lib/resolve-jenkins-arguments.js');

  const jobName = options.jenkinsJobName;
  if (!jobName) {
    console.error('错误: 请指定要查看信息的 Job 名称');
    console.error('用法: develop-tool jenkins info <jobName> [--alias <alias>]');
    process.exit(1);
  }

  // 构造参数对象
  const toolArgs = { jobName };
  if (options.alias) toolArgs.alias = options.alias;
  if (options.baseUrl) toolArgs.baseUrl = options.baseUrl;
  if (options.user) toolArgs.user = options.user;
  if (options.token) toolArgs.token = options.token;

  try {
    const resolvedArgs = resolveJenkinsArguments(toolArgs);
    const jenkinsTool = new JenkinsTool();
    const result = await jenkinsTool.getJobInfo(resolvedArgs);

    if (result.success) {
      const info = result.data;
      console.log(`Job 信息 - ${info.name}:`);
      console.log('='.repeat(50));
      console.log(`  URL:        ${info.url}`);
      console.log(`  描述:       ${info.description || '（无）'}`);
      console.log(`  可构建:     ${info.buildable ? '是' : '否'}`);
      console.log(`  状态:       ${info.color || '未知'}`);

      if (info.lastBuild) {
        const lastTime = new Date(info.lastBuild.timestamp).toLocaleString('zh-CN');
        console.log(`  最近构建:   #${info.lastBuild.number} (${info.lastBuild.result || '进行中'}) ${lastTime}`);
      } else {
        console.log('  最近构建:   无');
      }

      if (info.parameters.length > 0) {
        console.log('');
        console.log('  构建参数:');
        for (const param of info.parameters) {
          const defaultVal = param.defaultValue !== null ? ` (默认: ${param.defaultValue})` : '';
          const choices = param.choices ? ` [可选值: ${param.choices.join(', ')}]` : '';
          console.log(`    - ${param.name} (${param.type})${defaultVal}${choices}`);
          if (param.description) {
            console.log(`      ${param.description}`);
          }
        }
      } else {
        console.log('');
        console.log('  构建参数:   无（可直接触发构建）');
      }
    } else {
      console.error(`错误: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 jenkins 命令路由
 */
async function handleJenkins(subCommand, options) {
  switch (subCommand) {
    case 'list':
      await handleJenkinsList(options);
      break;
    case 'build':
      await handleJenkinsBuild(options);
      break;
    case 'log':
      await handleJenkinsLog(options);
      break;
    case 'info':
      await handleJenkinsInfo(options);
      break;
    default:
      console.error('错误: 请指定 jenkins 子命令 (list, build, log, info)');
      console.log('用法: develop-tool jenkins <list|build|log|info> [选项]');
      process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  const { command, subCommand, configAlias, options } = parseArgs();

  try {
    switch (command) {
      case 'help':
        showHelp();
        break;
      case 'version':
        showVersion();
        break;
      case 'start':
        await startMcpServer();
        break;
      case 'test':
        await testConnection(options);
        break;
      case 'query':
        await executeQuery(options);
        break;
      case 'config':
        handleConfig(subCommand, configAlias, options);
        break;
      case 'jenkins':
        await handleJenkins(subCommand, options);
        break;
      default:
        console.error(`未知命令: ${command}`);
        console.log('使用 --help 查看可用命令');
        process.exit(1);
    }
  } catch (error) {
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

// 导出 parseArgs 以便单元测试
module.exports = { parseArgs, main };

// 当作为主模块直接运行时执行主函数
if (require.main === module) {
  main();
}

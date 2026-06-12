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
  db-query-mcp [命令] [选项]

命令:
  start                启动MCP服务（默认命令）
  test                 测试数据库连接
  query                执行单次SQL查询
  config               显示当前环境变量配置信息
  config add <alias>   添加数据库连接配置
  config remove <alias> 删除数据库连接配置
  config list          列出所有已配置的连接
  config show <alias>  显示指定连接的详细信息
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

示例:
  # 启动MCP服务
  db-query-mcp start

  # 添加数据库连接配置
  db-query-mcp config add mydb --type mysql --host localhost --port 3306 --user root --password pass --database myapp

  # 使用别名查询
  db-query-mcp query --alias mydb -q "SELECT * FROM users"

  # 列出所有连接
  db-query-mcp config list

  # 查看连接详情
  db-query-mcp config show mydb

  # 删除连接
  db-query-mcp config remove mydb

  # 从标准输入读取密码
  echo "mypassword" | db-query-mcp config add mydb --type mysql --host localhost --port 3306 --user root --password-stdin --database myapp
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
  const commands = ['start', 'test', 'query', 'config', 'version', 'help'];
  const configSubCommands = ['add', 'remove', 'list', 'show'];

  let commandFound = false;
  let subCommandFound = false;

  // 第一遍: 识别命令和子命令
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('-')) {
      const optionsWithValue = [
        '-t', '--type', '-H', '--host', '-P', '--port',
        '-u', '--user', '-p', '--password', '-d', '--database',
        '-q', '--query', '-c', '--config', '--alias'
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
  const DatabaseQueryTool = require("../db-query-tool");
  const config = require("../mcp.full.config.js");
  const { resolveToolArguments } = require("../lib/resolve-tool-arguments");

  const dbTool = new DatabaseQueryTool();

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
        config.tools.query_oracle
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
  const DatabaseQueryTool = require("../db-query-tool");
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
  const DatabaseQueryTool = require("../db-query-tool");
  const { resolveToolArguments } = require("../lib/resolve-tool-arguments");
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
 */
function handleConfigAdd(alias, options) {
  const ConfigManager = require('../lib/config-manager');

  if (!alias) {
    console.error('错误: 请指定要添加的别名');
    console.error('用法: db-query-mcp config add <alias> --type <type> --host <host> --port <port> --user <user> --password <pwd> --database <db>');
    process.exit(1);
  }

  let password = options.password;
  if (options.passwordStdin) {
    password = readPasswordFromStdin();
  }

  if (!password) {
    console.error('错误: 请通过 --password 或 --password-stdin 提供数据库密码');
    process.exit(1);
  }

  // 构造连接配置对象（db 可选，不指定时表示可访问该服务器所有数据库）
  const connectionConfig = {
    type: options.type,
    host: options.host,
    port: options.port,
    user: options.user,
    pwd: password
  };
  if (options.database) {
    connectionConfig.db = options.database;
  }

  try {
    const configManager = new ConfigManager();
    configManager.addConnection(alias, connectionConfig, { global: !!options.global });

    const target = options.global ? '用户级配置' : '项目级配置';
    console.log(`✓ 数据库连接 '${alias}' 已保存到${target}`);
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 处理 config remove 子命令
 */
function handleConfigRemove(alias, options) {
  const ConfigManager = require('../lib/config-manager');

  if (!alias) {
    console.error('错误: 请指定要删除的别名');
    console.error('用法: db-query-mcp config remove <alias> [--global]');
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
  const ConfigManager = require('../lib/config-manager');

  try {
    const configManager = new ConfigManager();
    const connections = configManager.listConnections();

    if (connections.length === 0) {
      console.log('暂无已配置的数据库连接。');
      console.log('使用 db-query-mcp config add <alias> 添加新连接。');
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
  const ConfigManager = require('../lib/config-manager');

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

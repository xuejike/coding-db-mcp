#!/usr/bin/env node

/**
 * 数据库查询命令行工具
 * 独立CLI，不依赖MCP协议，可直接执行数据库查询
 */

// 加载环境变量
require('dotenv').config();

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const packageInfo = require('../package.json');
const DatabaseQueryTool = require('../db-query-tool');

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
${packageInfo.name} - 数据库查询命令行工具

用法:
  db-cli [命令] [选项]

命令:
  query, -q      执行SQL查询
  test, -t       测试数据库连接
  tables         列出所有表
  schema         显示表结构
  shell          进入交互式查询模式
  config         显示当前配置
  help, -h       显示帮助信息
  version, -v    显示版本信息

选项:
  -t, --type <type>       数据库类型 (mysql, postgresql, oracle, mssql) [默认: mysql]
  -H, --host <host>       数据库主机地址 [默认: localhost]
  -P, --port <port>       数据库端口 [默认: 根据数据库类型自动选择]
  -u, --user <user>       数据库用户名 [默认: root]
  -p, --password <pwd>    数据库密码
  -d, --database <db>     数据库名称
  -q, --query <sql>       SQL查询语句
  -f, --file <file>       从文件读取SQL语句
  -o, --output <file>     输出结果到文件
  --format <format>       输出格式 (json, table, csv) [默认: table]
  --no-header             CSV/表格输出不显示表头

默认端口:
  MySQL: 3306
  PostgreSQL: 5432
  Oracle: 1521
  MSSQL: 1433

示例:
  # 执行查询
  db-cli query -t mysql -H localhost -u root -p password -d mydb -q "SELECT * FROM users LIMIT 10"

  # 从文件执行SQL
  db-cli query -f query.sql -t mysql -H localhost -u root -p password -d mydb

  # 输出JSON格式
  db-cli query -q "SELECT * FROM users" --format json

  # 输出到文件
  db-cli query -q "SELECT * FROM users" -o result.json

  # 测试连接
  db-cli test -t mysql -H localhost -u root -p password -d mydb

  # 列出所有表
  db-cli tables -t mysql -H localhost -u root -p password -d mydb

  # 显示表结构
  db-cli schema -t mysql -H localhost -u root -p password -d mydb --table users

  # 交互式模式
  db-cli shell -t mysql -H localhost -u root -p password -d mydb

环境变量:
  DB_TYPE         数据库类型
  DB_HOST         数据库主机
  DB_PORT         数据库端口
  DB_USER         数据库用户名
  DB_PASSWORD     数据库密码
  DB_NAME         数据库名称
`);
}

/**
 * 显示版本信息
 */
function showVersion() {
  console.log(`${packageInfo.name} v${packageInfo.version}`);
}

/**
 * 获取默认端口
 * @param {string} type - 数据库类型
 * @returns {number} 默认端口
 */
function getDefaultPort(type) {
  const ports = {
    mysql: 3306,
    postgresql: 5432,
    oracle: 1521,
    mssql: 1433
  };
  return ports[type] || 3306;
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = {
    command: 'help',
    options: {
      format: 'table',
      showHeader: true
    }
  };
  
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    // 命令（不带-前缀）
    if (!arg.startsWith('-')) {
      if (['query', 'test', 'tables', 'schema', 'shell', 'config', 'help', 'version'].includes(arg)) {
        args.command = arg;
      } else if (arg === '-q') {
        args.command = 'query';
      } else if (arg === '-t') {
        args.command = 'test';
      } else if (arg === '-h') {
        args.command = 'help';
      } else if (arg === '-v') {
        args.command = 'version';
      }
      continue;
    }
    
    // 选项处理
    switch (arg) {
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
      case '-f':
      case '--file':
        args.options.file = argv[++i];
        break;
      case '-o':
      case '--output':
        args.options.output = argv[++i];
        break;
      case '--format':
        args.options.format = argv[++i];
        break;
      case '--no-header':
        args.options.showHeader = false;
        break;
      case '--table':
        args.options.table = argv[++i];
        break;
    }
  }
  
  return args;
}

/**
 * 获取数据库配置
 */
function getDatabaseConfig(options = {}) {
  const type = options.type || process.env.DB_TYPE || 'mysql';
  return {
    type,
    host: options.host || process.env.DB_HOST || 'localhost',
    port: options.port || parseInt(process.env.DB_PORT, 10) || getDefaultPort(type),
    user: options.user || process.env.DB_USER || 'root',
    pwd: options.password || process.env.DB_PASSWORD || '',
    db: options.database || process.env.DB_NAME || ''
  };
}

/**
 * 格式化输出结果
 * @param {Object} result - 查询结果
 * @param {string} format - 输出格式
 * @param {boolean} showHeader - 是否显示表头
 * @returns {string} 格式化后的字符串
 */
function formatResult(result, format, showHeader = true) {
  if (!result.success) {
    return `错误: ${result.error}`;
  }
  
  const { data, columns } = result;
  
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
      
    case 'csv':
      if (data.length === 0) return '';
      const headers = columns.map(c => c.name);
      const rows = data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',')
      );
      if (showHeader) {
        return [headers.join(','), ...rows].join('\n');
      }
      return rows.join('\n');
      
    case 'table':
    default:
      if (data.length === 0) return '查询返回 0 行数据';
      
      const colNames = columns.map(c => c.name);
      const colWidths = colNames.map((name, i) => {
        const maxDataWidth = Math.max(
          name.length,
          ...data.map(row => {
            const val = row[name];
            return val === null || val === undefined ? 4 : String(val).length;
          })
        );
        return Math.min(maxDataWidth, 50); // 最大宽度限制
      });
      
      const border = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
      const headerRow = '| ' + colNames.map((name, i) => name.padEnd(colWidths[i])).join(' | ') + ' |';
      
      const dataRows = data.map(row => {
        return '| ' + colNames.map((name, i) => {
          const val = row[name];
          const str = val === null ? 'NULL' : String(val);
          return str.substring(0, colWidths[i]).padEnd(colWidths[i]);
        }).join(' | ') + ' |';
      });
      
      const lines = [border];
      if (showHeader) {
        lines.push(headerRow);
        lines.push(border);
      }
      lines.push(...dataRows);
      lines.push(border);
      lines.push(`共 ${data.length} 行`);
      
      return lines.join('\n');
  }
}

/**
 * 执行查询
 */
async function executeQuery(options) {
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);
  
  // 从文件读取SQL
  let querySql = options.query;
  if (options.file) {
    try {
      querySql = fs.readFileSync(options.file, 'utf-8').trim();
    } catch (error) {
      console.error(`无法读取文件: ${options.file}`);
      process.exit(1);
    }
  }
  
  if (!querySql) {
    console.error('错误: 请使用 -q/--query 或 -f/--file 指定SQL语句');
    process.exit(1);
  }
  
  try {
    const result = await dbTool.execute({
      ...config,
      querySql
    });
    
    const output = formatResult(result, options.format, options.showHeader);
    
    // 输出到文件或控制台
    if (options.output) {
      fs.writeFileSync(options.output, output, 'utf-8');
      console.log(`结果已保存到: ${options.output}`);
    } else {
      console.log(output);
    }
    
    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('查询失败:', error.message);
    process.exit(1);
  }
}

/**
 * 测试数据库连接
 */
async function testConnection(options) {
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);
  
  console.log(`\n正在测试 ${config.type.toUpperCase()} 数据库连接...`);
  console.log('─'.repeat(40));
  console.log(`主机: ${config.host}:${config.port}`);
  console.log(`数据库: ${config.db}`);
  console.log(`用户: ${config.user}`);
  console.log('─'.repeat(40));
  
  try {
    const testQuery = config.type === 'oracle' ? 'SELECT 1 FROM DUAL' : 'SELECT 1 as test';
    const result = await dbTool.execute({
      ...config,
      querySql: testQuery
    });
    
    if (result.success) {
      console.log('\n✓ 连接成功！\n');
    } else {
      console.log('\n✗ 连接失败！');
      console.log(`错误: ${result.error}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.log('\n✗ 连接失败！');
    console.log(`错误: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * 列出所有表
 */
async function listTables(options) {
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);
  
  const tableQueries = {
    mysql: `SELECT TABLE_NAME as name, TABLE_ROWS as rows, DATA_LENGTH as size 
            FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${config.db}'`,
    postgresql: `SELECT tablename as name FROM pg_tables WHERE schemaname = 'public'`,
    oracle: `SELECT table_name as name FROM user_tables`,
    mssql: `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`
  };
  
  const querySql = tableQueries[config.type];
  if (!querySql) {
    console.error(`不支持的数据库类型: ${config.type}`);
    process.exit(1);
  }
  
  try {
    const result = await dbTool.execute({ ...config, querySql });
    console.log(formatResult(result, options.format, options.showHeader));
  } catch (error) {
    console.error('查询失败:', error.message);
    process.exit(1);
  }
}

/**
 * 显示表结构
 */
async function showSchema(options) {
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);
  
  if (!options.table) {
    console.error('错误: 请使用 --table 指定表名');
    process.exit(1);
  }
  
  const schemaQueries = {
    mysql: `SELECT COLUMN_NAME as field, COLUMN_TYPE as type, 
            IS_NULLABLE as nullable, COLUMN_KEY as key, COLUMN_DEFAULT as default_val
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = '${config.db}' AND TABLE_NAME = '${options.table}'
            ORDER BY ORDINAL_POSITION`,
    postgresql: `SELECT column_name as field, data_type as type, 
                 is_nullable as nullable FROM information_schema.columns 
                 WHERE table_name = '${options.table}'`,
    oracle: `SELECT column_name as field, data_type as type, 
             nullable FROM user_tab_columns WHERE table_name = UPPER('${options.table}')`,
    mssql: `SELECT COLUMN_NAME as field, DATA_TYPE as type, 
            IS_NULLABLE as nullable FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '${options.table}'`
  };
  
  const querySql = schemaQueries[config.type];
  if (!querySql) {
    console.error(`不支持的数据库类型: ${config.type}`);
    process.exit(1);
  }
  
  try {
    const result = await dbTool.execute({ ...config, querySql });
    console.log(`\n表结构: ${options.table}`);
    console.log('─'.repeat(60));
    console.log(formatResult(result, options.format, options.showHeader));
  } catch (error) {
    console.error('查询失败:', error.message);
    process.exit(1);
  }
}

/**
 * 交互式查询模式
 */
async function interactiveShell(options) {
  const dbTool = new DatabaseQueryTool();
  const config = getDatabaseConfig(options);
  
  console.log(`\n${config.type.toUpperCase()} 数据库交互式查询模式`);
  console.log('数据库:', config.db);
  console.log('输入SQL语句后按回车执行，输入 exit 或 quit 退出\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'db> '
  });
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    const sql = line.trim();
    
    if (sql === 'exit' || sql === 'quit') {
      console.log('再见！');
      rl.close();
      return;
    }
    
    if (!sql) {
      rl.prompt();
      return;
    }
    
    try {
      const result = await dbTool.execute({ ...config, querySql: sql });
      console.log(formatResult(result, 'table', true));
      console.log('');
    } catch (error) {
      console.error('错误:', error.message);
    }
    
    rl.prompt();
  }).on('close', () => {
    process.exit(0);
  });
}

/**
 * 显示当前配置
 */
function showConfig() {
  const config = getDatabaseConfig();
  
  console.log('\n当前数据库配置:');
  console.log('─'.repeat(40));
  console.log(`数据库类型: ${config.type}`);
  console.log(`主机地址: ${config.host}`);
  console.log(`端口: ${config.port}`);
  console.log(`用户名: ${config.user}`);
  console.log(`密码: ${'*'.repeat(config.pwd.length || 0)}`);
  console.log(`数据库: ${config.db}`);
  console.log('─'.repeat(40));
  console.log('配置来源优先级: 命令行参数 > 环境变量 > 默认值\n');
}

/**
 * 主函数
 */
async function main() {
  const { command, options } = parseArgs();
  
  try {
    switch (command) {
      case 'help':
        showHelp();
        break;
        
      case 'version':
        showVersion();
        break;
        
      case 'query':
        await executeQuery(options);
        break;
        
      case 'test':
        await testConnection(options);
        break;
        
      case 'tables':
        await listTables(options);
        break;
        
      case 'schema':
        await showSchema(options);
        break;
        
      case 'shell':
        await interactiveShell(options);
        break;
        
      case 'config':
        showConfig();
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

main();

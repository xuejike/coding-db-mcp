/**
 * MCP数据库查询工具使用示例
 */

const { spawn } = require('child_process');
const fs = require('fs');

// 示例1: 直接使用DatabaseQueryTool类
console.log('=== 示例1: 直接使用DatabaseQueryTool类 ===');

const { DatabaseQueryTool } = require('../index');

async function directUsageExample() {
  // 创建工具实例
  const tool = new DatabaseQueryTool();
  
  // 模拟配置参数（使用无效的数据库连接以演示错误处理）
  const config = {
    host: 'localhost',
    port: 3306,
    user: 'test_user',
    pwd: 'test_password',
    db: 'test_db',
    querySql: 'SELECT * FROM users LIMIT 1'
  };
  
  try {
    console.log('正在执行数据库查询...');
    const result = await tool.execute(config);
    
    if (result.success) {
      console.log('查询成功!');
      console.log(`返回 ${result.rowCount} 行数据`);
      console.log('列信息:', result.columns);
    } else {
      console.log('查询失败:');
      console.log('错误消息:', result.error);
      console.log('错误代码:', result.code);
    }
  } catch (error) {
    console.error('执行过程中发生异常:', error);
  }
}

// 示例2: 作为MCP服务运行
console.log('\n=== 示例2: 作为MCP服务运行 ===');

function mcpServiceExample() {
  console.log('启动MCP服务...');
  
  // 创建MCP服务进程
  const server = spawn('node', ['mcp-server.js'], {
    cwd: process.cwd()
  });
  
  // 监听服务的输出
  server.stdout.on('data', (data) => {
    console.log(`[MCP服务响应] ${data}`);
  });
  
  server.stderr.on('data', (data) => {
    console.error(`[MCP服务错误] ${data}`);
  });
  
  server.on('close', (code) => {
    console.log(`[MCP服务退出] 退出码: ${code}`);
  });
  
  // 发送初始化请求
  const initializeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "example-client",
        version: "1.0.0"
      }
    }
  };
  
  console.log('[发送] 初始化请求');
  server.stdin.write(JSON.stringify(initializeRequest) + '\n');
  
  // 3秒后关闭服务
  setTimeout(() => {
    console.log('[示例完成] 关闭服务');
    server.stdin.end();
  }, 3000);
}

// 运行示例
async function runExamples() {
  await directUsageExample();
  mcpServiceExample();
}

runExamples().catch(console.error);
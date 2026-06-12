/**
 * 测试MCP数据库查询工具调用
 */

const { spawn } = require('child_process');

// 创建MCP服务进程
const server = spawn('node', ['mcp-server.js']);

console.log('MCP数据库查询工具调用测试');
console.log('======================');

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
      name: "test-client",
      version: "1.0.0"
    }
  }
};

console.log('[发送] 初始化请求');
server.stdin.write(JSON.stringify(initializeRequest) + '\n');

// 发送initialized通知
setTimeout(() => {
  const initializedNotification = {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  };
  
  console.log('[发送] initialized通知');
  server.stdin.write(JSON.stringify(initializedNotification) + '\n');
}, 1000);

// 发送工具列表请求
setTimeout(() => {
  const listToolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  };
  
  console.log('[发送] 工具列表请求');
  server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
}, 1500);

// 发送工具调用请求
setTimeout(() => {
  const callToolRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "query_mysql",
      arguments: {
        host: "localhost",
        port: 3306,
        user: "test_user",
        pwd: "test_password",
        db: "test_db",
        querySql: "SELECT * FROM users LIMIT 1"
      }
    }
  };
  
  console.log('[发送] 工具调用请求');
  server.stdin.write(JSON.stringify(callToolRequest) + '\n');
}, 2000);

// 5秒后关闭服务
setTimeout(() => {
  console.log('[测试完成] 关闭服务');
  server.stdin.end();
}, 5000);
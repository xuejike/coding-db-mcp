/**
 * 简单的测试脚本，用于验证MCP服务是否能够正常启动
 */

const { spawn } = require('child_process');
const path = require('path');

// 启动MCP服务进程
const serviceProcess = spawn('node', ['mcp-server.js'], {
  cwd: path.resolve(__dirname)
});

console.log('启动MCP数据库查询服务测试...');

// 监听stdout输出
serviceProcess.stdout.on('data', (data) => {
  console.log(`[STDOUT]: ${data}`);
});

// 监听stderr输出
serviceProcess.stderr.on('data', (data) => {
  console.log(`[STDERR]: ${data}`);
});

// 监听进程退出
serviceProcess.on('close', (code) => {
  console.log(`MCP服务进程退出，退出码: ${code}`);
});

// 设置超时，3秒后关闭进程
setTimeout(() => {
  console.log('测试完成，关闭服务进程');
  serviceProcess.kill();
}, 3000);
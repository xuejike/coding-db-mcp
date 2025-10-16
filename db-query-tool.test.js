/**
 * DatabaseQueryTool 测试文件
 */

const DatabaseQueryTool = require('./db-query-tool');

// 模拟测试函数
async function runTests() {
  console.log('开始测试 DatabaseQueryTool...');
  
  const tool = new DatabaseQueryTool();
  
  // 测试1: 检查类是否正确导出
  console.log('\\n测试1: 检查类是否正确导出');
  if (typeof DatabaseQueryTool === 'function') {
    console.log('✓ DatabaseQueryTool 类正确导出');
  } else {
    console.log('✗ DatabaseQueryTool 类未正确导出');
  }
  
  // 测试2: 检查实例是否能正确创建
  console.log('\\n测试2: 检查实例是否能正确创建');
  try {
    const toolInstance = new DatabaseQueryTool();
    console.log('✓ DatabaseQueryTool 实例创建成功');
  } catch (error) {
    console.log('✗ DatabaseQueryTool 实例创建失败:', error.message);
  }
  
  // 测试3: 检查 execute 方法是否存在
  console.log('\\n测试3: 检查 execute 方法是否存在');
  if (tool.execute && typeof tool.execute === 'function') {
    console.log('✓ execute 方法存在');
  } else {
    console.log('✗ execute 方法不存在或不是函数');
  }
  
  // 测试4: 尝试执行一个简单的查询配置（应该会失败，因为没有真实的数据库）
  console.log('\\n测试4: 尝试执行查询（预期会失败，因为没有真实数据库）');
  const testConfig = {
    host: 'localhost',
    port: 3306,
    user: 'test_user',
    pwd: 'test_password',
    db: 'test_db',
    querySql: 'SELECT 1'
  };
  
  try {
    const result = await tool.execute(testConfig);
    if (result.success === false) {
      console.log('✓ 正确处理了连接错误:', result.error);
    } else {
      console.log('✗ 应该返回连接错误');
    }
  } catch (error) {
    console.log('✓ 捕获到执行异常:', error.message);
  }
  
  console.log('\\n测试完成。');
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runTests();
}

module.exports = runTests;
/**
 * MCP数据库查询工具主入口文件
 */

const DatabaseQueryTool = require('./db-query-tool');

// 导出核心工具类
module.exports = {
  DatabaseQueryTool
};

// 如果直接运行此文件，显示使用说明
if (require.main === module) {
  console.log('MCP数据库查询工具');
  console.log('==================');
  console.log('使用方法:');
  console.log('1. 作为MCP服务运行: npm start');
  console.log('2. 引入工具: const { DatabaseQueryTool } = require(\'./index\');');
  console.log('3. 创建实例: const tool = new DatabaseQueryTool();');
  console.log('4. 执行查询: tool.execute({host, port, user, pwd, db, type, querySql});');
  console.log('');
  console.log('查看 example.js 获取完整使用示例');
  console.log('查看 README.md 获取详细文档');
}

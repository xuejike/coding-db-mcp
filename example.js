/**
 * 数据库查询工具使用示例
 */

const DatabaseQueryTool = require('./db-query-tool');

async function example() {
  // 创建工具实例
  const tool = new DatabaseQueryTool();
  
  // 配置参数
  const config = {
    host: 'localhost',
    port: 3306,
    user: 'your_username',
    pwd: 'your_password',
    db: 'your_database',
    querySql: 'SELECT * FROM your_table LIMIT 10'
  };
  
  try {
    // 执行查询
    console.log('正在执行数据库查询...');
    const result = await tool.execute(config);
    
    if (result.success) {
      console.log('查询成功!');
      console.log(`返回 ${result.rowCount} 行数据`);
      console.log('列信息:', result.columns);
      console.log('数据:', result.data);
    } else {
      console.error('查询失败:', result.error);
      console.error('错误代码:', result.code);
    }
  } catch (error) {
    console.error('执行过程中发生异常:', error);
  }
}

// 运行示例
if (require.main === module) {
  example();
}

module.exports = example;
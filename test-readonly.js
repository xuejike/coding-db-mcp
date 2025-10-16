/**
 * 测试数据库查询工具的只读功能
 */

const DatabaseQueryTool = require('./db-query-tool');

async function testReadOnlyFunctionality() {
  console.log('测试数据库查询工具的只读功能');
  console.log('========================');
  
  const tool = new DatabaseQueryTool();
  
  // 测试合法的只读查询
  const validQueries = [
    'SELECT * FROM users',
    'select * from users',
    'SHOW TABLES',
    'show tables',
    'DESCRIBE users',
    'describe users',
    'EXPLAIN SELECT * FROM users',
    'explain select * from users'
  ];
  
  console.log('\n测试合法的只读查询:');
  for (const query of validQueries) {
    const isReadOnly = tool.isReadOnlyQuery(query);
    console.log(`${isReadOnly ? '✓' : '✗'} "${query}" -> ${isReadOnly ? '允许' : '拒绝'}`);
  }
  
  // 测试非法的写操作查询
  const invalidQueries = [
    'INSERT INTO users (name) VALUES ("John")',
    'insert into users (name) values ("John")',
    'UPDATE users SET name = "Jane" WHERE id = 1',
    'update users set name = "Jane" where id = 1',
    'DELETE FROM users WHERE id = 1',
    'delete from users where id = 1',
    'DROP TABLE users',
    'drop table users',
    'TRUNCATE TABLE users',
    'truncate table users',
    'ALTER TABLE users ADD COLUMN age INT',
    'alter table users add column age int'
  ];
  
  console.log('\n测试非法的写操作查询:');
  for (const query of invalidQueries) {
    const isReadOnly = tool.isReadOnlyQuery(query);
    console.log(`${isReadOnly ? '✗' : '✓'} "${query}" -> ${isReadOnly ? '错误允许' : '正确拒绝'}`);
  }
  
  // 测试工具的execute方法对非法查询的处理
  console.log('\n测试execute方法对非法查询的处理:');
  const testConfig = {
    host: 'localhost',
    port: 3306,
    user: 'test_user',
    pwd: 'test_password',
    db: 'test_db',
    querySql: 'DELETE FROM users WHERE id = 1'  // 非法查询
  };
  
  try {
    const result = await tool.execute(testConfig);
    console.log('执行非法查询的结果:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success === false && result.code === 'READONLY_VIOLATION') {
      console.log('✓ 工具正确地拒绝了非法查询');
    } else {
      console.log('✗ 工具未能正确拒绝非法查询');
    }
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
  
  console.log('\n测试完成。');
}

// 运行测试
if (require.main === module) {
  testReadOnlyFunctionality().catch(console.error);
}

module.exports = testReadOnlyFunctionality;
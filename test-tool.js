const DatabaseQueryTool = require('./db-query-tool');

async function testDatabaseTypes() {
  const tool = new DatabaseQueryTool();
  
  // 测试 MySQL
  console.log('Testing MySQL...');
  try {
    const mysqlResult = await tool.execute({
      host: 'localhost',
      port: 3306,
      user: 'root',
      pwd: 'password',
      db: 'test',
      type: 'mysql',
      querySql: 'SELECT 1 as id'
    });
    console.log('MySQL Result:', JSON.stringify(mysqlResult, null, 2));
  } catch (error) {
    console.error('MySQL Error:', error.message);
  }
  
  // 测试 PostgreSQL
  console.log('\nTesting PostgreSQL...');
  try {
    const pgResult = await tool.execute({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      pwd: 'password',
      db: 'test',
      type: 'postgresql',
      querySql: 'SELECT 1 as id'
    });
    console.log('PostgreSQL Result:', JSON.stringify(pgResult, null, 2));
  } catch (error) {
    console.error('PostgreSQL Error:', error.message);
  }
  
  // 测试 Oracle
  console.log('\nTesting Oracle...');
  try {
    const oracleResult = await tool.execute({
      host: 'localhost',
      port: 1521,
      user: 'system',
      pwd: 'password',
      db: 'xe',
      type: 'oracle',
      querySql: 'SELECT 1 as id FROM dual'
    });
    console.log('Oracle Result:', JSON.stringify(oracleResult, null, 2));
  } catch (error) {
    console.error('Oracle Error:', error.message);
  }
  
  // MSSQL 需要额外实现
  console.log('\nMSSQL support needs to be implemented');
}

testDatabaseTypes();
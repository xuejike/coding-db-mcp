/**
 * MCP数据库查询工具
 * 该工具连接到多种数据库并执行查询
 */

class DatabaseQueryTool {
  /**
   * 工具配置参数
   * @typedef {Object} ToolConfig
   * @property {string} host - 数据库主机地址
   * @property {number} port - 数据库端口
   * @property {string} user - 数据库用户名
   * @property {string} pwd - 数据库密码
   * @property {string} db - 数据库名称
   * @property {string} querySql - 要执行的SQL查询
   * @property {string} [type=mysql] - 数据库类型 (mysql, postgresql, oracle, mssql)
   */

  /**
   * 执行数据库查询的通用方法
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async execute(config) {
    const { type = 'mysql' } = config;
    
    switch (type.toLowerCase()) {
      case 'mysql':
        return await this.executeMySQL(config);
      case 'postgresql':
        return await this.executePostgreSQL(config);
      case 'oracle':
        return await this.executeOracle(config);
      case 'mssql':
        return await this.executeMSSQL(config);
      default:
        return {
          success: false,
          error: `Unsupported database type: ${type}`,
          code: 'UNSUPPORTED_TYPE'
        };
    }
  }

  /**
   * 设置连接为只读事务模式
   * 通过数据库层面保证只能执行读操作，比SQL关键词匹配更可靠
   * @param {Object} connection - 数据库连接
   * @param {string} type - 数据库类型
   */
  async setReadOnly(connection, type) {
    switch (type) {
      case 'mysql':
        await connection.execute('SET SESSION TRANSACTION READ ONLY');
        break;
      case 'postgresql':
        await connection.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
        break;
    }
  }

  /**
   * 获取MySQL数据库连接
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 数据库连接对象
   */
  async getMySQLConnection(config) {
    const { host, port, user, pwd, db } = config;
    const mysql = require('mysql2/promise');
    return await mysql.createConnection({
      host,
      port,
      user,
      password: pwd,
      database: db,
      charset: 'utf8mb4'
    });
  }

  /**
   * 获取PostgreSQL数据库连接
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 数据库连接对象
   */
  async getPostgreSQLConnection(config) {
    const { host, port, user, pwd, db } = config;
    const { Client } = require('pg');
    const client = new Client({
      host,
      port,
      user,
      password: pwd,
      database: db
    });
    await client.connect();
    return client;
  }

  /**
   * 获取Oracle数据库连接
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 数据库连接对象
   */
  async getOracleConnection(config) {
    const { host, port, user, pwd, db } = config;
    const oracledb = require('oracledb');
    return await oracledb.getConnection({
      host,
      port,
      user,
      password: pwd,
      database: db
    });
  }

  /**
   * 执行MySQL查询
   * @param {Object} connection - 数据库连接
   * @param {string} querySql - SQL查询语句
   * @returns {Promise<Object>} 查询结果
   */
  async executeMySQLQuery(connection, querySql) {
    const [rows, fields] = await connection.execute(querySql);
    const columns = fields ? fields.map(field => ({
      name: field.name,
      type: field.type,
      length: field.length
    })) : [];
    return { data: rows, columns: columns, rowCount: rows.length };
  }

  /**
   * 执行PostgreSQL查询
   * @param {Object} connection - 数据库连接
   * @param {string} querySql - SQL查询语句
   * @returns {Promise<Object>} 查询结果
   */
  async executePostgreSQLQuery(connection, querySql) {
    const result = await connection.query(querySql);
    const pgColumns = result.fields ? result.fields.map(field => ({
      name: field.name,
      dataTypeID: field.dataTypeID
    })) : [];
    return { data: result.rows, columns: pgColumns, rowCount: result.rows.length };
  }

  /**
   * 执行Oracle查询
   * @param {Object} connection - 数据库连接
   * @param {string} querySql - SQL查询语句
   * @returns {Promise<Object>} 查询结果
   */
  async executeOracleQuery(connection, querySql) {
    const oracleResult = await connection.execute(querySql);
    return { data: oracleResult.rows, columns: [], rowCount: oracleResult.rows?.length || 0 };
  }

  /**
   * 关闭MySQL数据库连接
   * @param {Object} connection - 数据库连接
   */
  async closeMySQLConnection(connection) {
    if (connection) {
      await connection.end();
    }
  }

  /**
   * 关闭PostgreSQL数据库连接
   * @param {Object} connection - 数据库连接
   */
  async closePostgreSQLConnection(connection) {
    if (connection) {
      await connection.end();
    }
  }

  /**
   * 关闭Oracle数据库连接
   * @param {Object} connection - 数据库连接
   */
  async closeOracleConnection(connection) {
    if (connection) {
      await connection.close();
    }
  }

  /**
   * 执行MySQL数据库查询
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async executeMySQL(config) {
    const { querySql } = config;
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getMySQLConnection(config);
      
      // 设置只读事务，由数据库层面保证不会执行写操作
      await this.setReadOnly(connection, 'mysql');
      
      // 执行查询
      const result = await this.executeMySQLQuery(connection, querySql);
      
      // 返回结果
      return {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount
      };
    } catch (error) {
      // 如果是只读违规错误，返回友好提示
      if (error.code === 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION' || error.errno === 1792) {
        return {
          success: false,
          error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
          code: "READONLY_VIOLATION"
        };
      }
      // 其他错误
      return {
        success: false,
        error: error.message,
        code: error.code || 'DATABASE_ERROR'
      };
    } finally {
      // 关闭数据库连接
      await this.closeMySQLConnection(connection);
    }
  }

  /**
   * 执行PostgreSQL数据库查询
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async executePostgreSQL(config) {
    const { querySql } = config;
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getPostgreSQLConnection(config);
      
      // 设置只读事务，由数据库层面保证不会执行写操作
      await this.setReadOnly(connection, 'postgresql');
      
      // 执行查询
      const result = await this.executePostgreSQLQuery(connection, querySql);
      
      // 返回结果
      return {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount
      };
    } catch (error) {
      // 如果是只读违规错误，返回友好提示
      if (error.message && error.message.includes('read-only')) {
        return {
          success: false,
          error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
          code: "READONLY_VIOLATION"
        };
      }
      // 其他错误
      return {
        success: false,
        error: error.message,
        code: error.code || 'DATABASE_ERROR'
      };
    } finally {
      // 关闭数据库连接
      await this.closePostgreSQLConnection(connection);
    }
  }

  /**
   * 执行Oracle数据库查询
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async executeOracle(config) {
    const { querySql } = config;
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getOracleConnection(config);
      
      // Oracle通过 SET TRANSACTION READ ONLY 设置只读
      await connection.execute('SET TRANSACTION READ ONLY');
      
      // 执行查询
      const result = await this.executeOracleQuery(connection, querySql);
      
      // 返回结果
      return {
        success: true,
        data: result.data,
        columns: result.columns,
        rowCount: result.rowCount
      };
    } catch (error) {
      // 如果是只读违规错误（ORA-01456），返回友好提示
      if (error.message && (error.message.includes('ORA-01456') || error.message.includes('read-only'))) {
        return {
          success: false,
          error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
          code: "READONLY_VIOLATION"
        };
      }
      // 其他错误
      return {
        success: false,
        error: error.message,
        code: error.code || 'DATABASE_ERROR'
      };
    } finally {
      // 关闭数据库连接
      await this.closeOracleConnection(connection);
    }
  }

  /**
   * 执行MSSQL数据库查询
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async executeMSSQL(config) {
    const { querySql } = config;
    
    // MSSQL 暂未实现
    return {
      success: false,
      error: "MSSQL support needs to be implemented",
      code: "NOT_IMPLEMENTED"
    };
  }
}

module.exports = DatabaseQueryTool;
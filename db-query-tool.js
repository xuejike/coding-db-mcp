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
   */

  /**
   * 检查SQL查询是否为只读操作
   * @param {string} sql - SQL查询语句
   * @returns {boolean} 是否为只读操作
   */
  isReadOnlyQuery(sql) {
    // 转换为小写以便比较
    const lowerSql = sql.trim().toLowerCase();
    
    // 允许的只读操作关键词
    const allowedPatterns = [
      /^select/,
      /^show/,
      /^describe/,
      /^desc/,
      /^explain/,
      /^use/
    ];
    
    // 禁止的写操作关键词
    const forbiddenPatterns = [
      /insert/,
      /update/,
      /delete/,
      /drop/,
      /truncate/,
      /alter/,
      /create/,
      /replace/,
      /grant/,
      /revoke/,
      /commit/,
      /rollback/,
      /savepoint/,
      /set/
    ];
    
    // 检查是否包含禁止的关键词
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(lowerSql)) {
        return false;
      }
    }
    
    // 检查是否以允许的关键词开头
    for (const pattern of allowedPatterns) {
      if (pattern.test(lowerSql)) {
        return true;
      }
    }
    
    // 如果既不明确允许也不明确禁止，默认为不安全
    return false;
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
    
    // 检查是否为只读查询
    if (!this.isReadOnlyQuery(querySql)) {
      return {
        success: false,
        error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
        code: "READONLY_VIOLATION"
      };
    }
    
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getMySQLConnection(config);
      
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
      // 错误处理
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
    
    // 检查是否为只读查询
    if (!this.isReadOnlyQuery(querySql)) {
      return {
        success: false,
        error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
        code: "READONLY_VIOLATION"
      };
    }
    
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getPostgreSQLConnection(config);
      
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
      // 错误处理
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
    
    // 检查是否为只读查询
    if (!this.isReadOnlyQuery(querySql)) {
      return {
        success: false,
        error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
        code: "READONLY_VIOLATION"
      };
    }
    
    let connection;
    
    try {
      // 建立数据库连接
      connection = await this.getOracleConnection(config);
      
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
      // 错误处理
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
    
    // 检查是否为只读查询
    if (!this.isReadOnlyQuery(querySql)) {
      return {
        success: false,
        error: "不允许执行非只读操作。仅支持SELECT、SHOW、DESCRIBE等查询语句。",
        code: "READONLY_VIOLATION"
      };
    }
    
    // MSSQL support needs to be implemented
    return {
      success: false,
      error: "MSSQL support needs to be implemented",
      code: "NOT_IMPLEMENTED"
    };
  }
}

module.exports = DatabaseQueryTool;
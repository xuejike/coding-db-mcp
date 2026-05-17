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
    if (typeof sql !== 'string') {
      return false;
    }

    // 转换为小写以便比较
    const lowerSql = sql.trim().toLowerCase();
    if (!lowerSql) {
      return false;
    }

    // 禁止多语句，避免通过只读语句后追加写操作
    const sqlWithoutTrailingSemicolon = lowerSql.replace(/;\s*$/, '');
    if (sqlWithoutTrailingSemicolon.includes(';')) {
      return false;
    }

    // 允许的只读操作关键词
    const allowedPatterns = [
      /^select\b/,
      /^show\b/,
      /^describe\b/,
      /^desc\b/,
      /^explain\b/,
      /^use\b/
    ];

    // 禁止的写操作关键词
    const forbiddenPatterns = [
      /\binsert\b/,
      /\bupdate\b/,
      /\bdelete\b/,
      /\bdrop\b/,
      /\btruncate\b/,
      /\balter\b/,
      /\bcreate\b/,
      /\breplace\b/,
      /\bmerge\b/,
      /\bgrant\b/,
      /\brevoke\b/,
      /\bcommit\b/,
      /\brollback\b/,
      /\bsavepoint\b/,
      /\bset\b/,
      /\bcall\b/,
      /\bexec\b/,
      /\bexecute\b/
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
   * 按数据库类型分发查询，兼容旧示例中的 execute(config) 调用。
   * @param {ToolConfig & {type?: string}} config - 工具配置参数
   * @returns {Promise<Object>} 查询结果
   */
  async execute(config) {
    if (!config || typeof config !== 'object') {
      return {
        success: false,
        error: '缺少数据库查询配置',
        code: 'INVALID_CONFIG'
      };
    }

    const dbType = (config?.type || 'mysql').toLowerCase();

    switch (dbType) {
      case 'mysql':
        return await this.executeMySQL(config);
      case 'postgresql':
      case 'postgres':
      case 'pg':
        return await this.executePostgreSQL(config);
      case 'mssql':
      case 'sqlserver':
      case 'sql_server':
        return await this.executeMSSQL(config);
      case 'oracle':
        return await this.executeOracle(config);
      default:
        return {
          success: false,
          error: `不支持的数据库类型: ${dbType}`,
          code: 'UNSUPPORTED_DATABASE_TYPE'
        };
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
      user,
      password: pwd,
      connectString: config.connectString || `${host}:${port}/${db}`
    });
  }

  /**
   * 获取MSSQL数据库连接
   * @param {ToolConfig} config - 工具配置参数
   * @returns {Promise<Object>} 数据库连接对象
   */
  async getMSSQLConnection(config) {
    const { host, port, user, pwd, db } = config;
    const { Connection } = require('tedious');
    const connection = new Connection({
      server: host,
      authentication: {
        type: 'default',
        options: {
          userName: user,
          password: pwd
        }
      },
      options: {
        port,
        database: db,
        encrypt: config.encrypt ?? false,
        trustServerCertificate: config.trustServerCertificate ?? true
      }
    });

    return await new Promise((resolve, reject) => {
      connection.connect((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(connection);
      });
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
    const columns = oracleResult.metaData ? oracleResult.metaData.map(field => ({
      name: field.name,
      dbType: field.dbTypeName
    })) : [];
    return { data: oracleResult.rows, columns, rowCount: oracleResult.rows?.length || 0 };
  }

  /**
   * 执行MSSQL查询
   * @param {Object} connection - 数据库连接
   * @param {string} querySql - SQL查询语句
   * @returns {Promise<Object>} 查询结果
   */
  async executeMSSQLQuery(connection, querySql) {
    const { Request } = require('tedious');

    return await new Promise((resolve, reject) => {
      const rows = [];
      let columns = [];

      const request = new Request(querySql, (error, rowCount) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ data: rows, columns, rowCount: rowCount ?? rows.length });
      });

      request.on('columnMetadata', (metadata) => {
        columns = metadata.map(field => ({
          name: field.colName,
          type: field.type?.name,
          length: field.dataLength
        }));
      });

      request.on('row', (rowColumns) => {
        const row = {};
        for (const column of rowColumns) {
          row[column.metadata.colName] = column.value;
        }
        rows.push(row);
      });

      connection.execSql(request);
    });
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
   * 关闭MSSQL数据库连接
   * @param {Object} connection - 数据库连接
   */
  async closeMSSQLConnection(connection) {
    if (connection) {
      connection.close();
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

    let connection;

    try {
      // 建立数据库连接
      connection = await this.getMSSQLConnection(config);

      // 执行查询
      const result = await this.executeMSSQLQuery(connection, querySql);

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
      await this.closeMSSQLConnection(connection);
    }
  }
}

module.exports = DatabaseQueryTool;

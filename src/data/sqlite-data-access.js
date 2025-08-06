import { BaseDataAccess, QueryBuilder, DataTypes } from "./data-access.js";
import SQLiteService from "../utils/sqlite-wrapper.js";
import config from "../config/config.js";

/**
 * SQLite implementation of the Data Access Layer
 * Implements the BaseDataAccess interface using SQLite
 */
class SQLiteDataAccess extends BaseDataAccess {
  constructor(cfg = {}) {
    super(cfg);
    this.sqliteService = new SQLiteService({
      dbPath: config.db.path,
    });
  }

  /**
   * Connect to the database
   */
  async connect() {
    try {
      await this.sqliteService.createConnection();
      this.isConnected = true;
      console.log("Connected to SQLite database via Data Access Layer");
      return { success: true };
    } catch (error) {
      console.error("Failed to connect via Data Access Layer:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect() {
    try {
      await this.sqliteService.closeConnection();
      this.isConnected = false;
      console.log("Disconnected from SQLite database");
      return { success: true };
    } catch (error) {
      console.error("Failed to disconnect:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a new record
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @returns {Promise<Object>} Result with inserted ID
   */
  async create(table, data) {
    try {
      const { query, params } = QueryBuilder.buildInsertQuery(table, data);
      const result = await this.sqliteService.executeQuery(query, params);

      if (result.success) {
        return {
          success: true,
          id: result.lastID,
          changes: result.changes,
          data: { id: result.lastID, ...data },
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      console.error(
        `Create operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Read records from table
   * @param {string} table - Table name
   * @param {Object} conditions - WHERE conditions
   * @param {Object} options - Query options (columns, orderBy, limit, offset)
   * @returns {Promise<Object>} Result with data array
   */
  async read(table, conditions = {}, options = {}) {
    try {
      const { query, params } = QueryBuilder.buildSelectQuery(
        table,
        conditions,
        options
      );
      const result = await this.sqliteService.selectQuery(query, params);

      return {
        success: result.success,
        data: result.data || [],
        count: result.count || 0,
        error: result.error,
      };
    } catch (error) {
      console.error(`Read operation failed for table ${table}:`, error.message);
      return {
        success: false,
        data: [],
        count: 0,
        error: error.message,
      };
    }
  }

  /**
   * Read a single record
   * @param {string} table - Table name
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Result with single record or null
   */
  async readOne(table, conditions = {}) {
    try {
      const { query, params } = QueryBuilder.buildSelectQuery(
        table,
        conditions,
        { limit: 1 }
      );
      const result = await this.sqliteService.selectOne(query, params);

      return {
        success: result.success,
        data: result.data,
        error: result.error,
      };
    } catch (error) {
      console.error(
        `ReadOne operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        data: null,
        error: error.message,
      };
    }
  }

  /**
   * Update records
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Result with number of affected rows
   */
  async update(table, data, conditions = {}) {
    try {
      if (Object.keys(conditions).length === 0) {
        throw new Error(
          "Update operations must include WHERE conditions for safety"
        );
      }

      const { query, params } = QueryBuilder.buildUpdateQuery(
        table,
        data,
        conditions
      );
      const result = await this.sqliteService.executeQuery(query, params);

      return {
        success: result.success,
        changes: result.changes || 0,
        error: result.error,
      };
    } catch (error) {
      console.error(
        `Update operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        changes: 0,
        error: error.message,
      };
    }
  }

  /**
   * Delete records
   * @param {string} table - Table name
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Result with number of deleted rows
   */
  async delete(table, conditions = {}) {
    try {
      const { query, params } = QueryBuilder.buildDeleteQuery(
        table,
        conditions
      );
      const result = await this.sqliteService.executeQuery(query, params);

      return {
        success: result.success,
        changes: result.changes || 0,
        error: result.error,
      };
    } catch (error) {
      console.error(
        `Delete operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        changes: 0,
        error: error.message,
      };
    }
  }

  /**
   * Count records in table
   * @param {string} table - Table name
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Result with count
   */
  async count(table, conditions = {}) {
    try {
      const { where, params } = QueryBuilder.buildWhereClause(conditions);
      const query = `SELECT COUNT(*) as count FROM ${table} ${where}`;

      const result = await this.sqliteService.selectOne(query, params);

      if (result.success) {
        return {
          success: true,
          count: result.data ? result.data.count : 0,
        };
      } else {
        return {
          success: false,
          count: 0,
          error: result.error,
        };
      }
    } catch (error) {
      console.error(
        `Count operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        count: 0,
        error: error.message,
      };
    }
  }

  /**
   * Check if records exist
   * @param {string} table - Table name
   * @param {Object} conditions - WHERE conditions
   * @returns {Promise<Object>} Result with exists boolean
   */
  async exists(table, conditions = {}) {
    try {
      const countResult = await this.count(table, conditions);

      return {
        success: countResult.success,
        exists: countResult.count > 0,
        error: countResult.error,
      };
    } catch (error) {
      console.error(
        `Exists operation failed for table ${table}:`,
        error.message
      );
      return {
        success: false,
        exists: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute raw SQL query
   * @param {string} query - Raw SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeRaw(query, params = []) {
    try {
      const queryType = query.trim().toUpperCase();

      if (queryType.startsWith("SELECT")) {
        return await this.sqliteService.selectQuery(query, params);
      } else {
        return await this.sqliteService.executeQuery(query, params);
      }
    } catch (error) {
      console.error("Raw query execution failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute multiple operations in a transaction
   * @param {Array} operations - Array of operation objects
   * @returns {Promise<Object>} Transaction result
   */
  async executeTransaction(operations) {
    try {
      const queries = operations.map((op) => {
        switch (op.type) {
          case "create":
            return QueryBuilder.buildInsertQuery(op.table, op.data);
          case "update":
            return QueryBuilder.buildUpdateQuery(
              op.table,
              op.data,
              op.conditions
            );
          case "delete":
            return QueryBuilder.buildDeleteQuery(op.table, op.conditions);
          case "raw":
            return { query: op.query, params: op.params || [] };
          default:
            throw new Error(`Unsupported operation type: ${op.type}`);
        }
      });

      const result = await this.sqliteService.executeTransaction(queries);

      return result;
    } catch (error) {
      console.error("Transaction execution failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a table with schema
   * @param {string} tableName - Table name
   * @param {Object} schema - Table schema definition
   * @returns {Promise<Object>} Result
   */
  async createTable(tableName, schema) {
    try {
      const columns = Object.entries(schema.columns).map(([name, config]) => {
        let columnDef = `${name} ${config.type || DataTypes.STRING}`;

        if (config.primaryKey) {
          columnDef += " PRIMARY KEY";
          if (config.autoIncrement) {
            columnDef += " AUTOINCREMENT";
          }
        }

        if (config.notNull) {
          columnDef += " NOT NULL";
        }

        if (config.unique) {
          columnDef += " UNIQUE";
        }

        if (config.defaultValue !== undefined) {
          columnDef += ` DEFAULT ${config.defaultValue}`;
        }

        return columnDef;
      });

      const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(
        ", "
      )})`;
      const result = await this.sqliteService.executeQuery(query);

      return {
        success: result.success,
        error: result.error,
        table: tableName,
      };
    } catch (error) {
      console.error(`Create table failed for ${tableName}:`, error.message);
      return {
        success: false,
        error: error.message,
        table: tableName,
      };
    }
  }

  /**
   * Drop a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object>} Result
   */
  async dropTable(tableName) {
    try {
      const query = `DROP TABLE IF EXISTS ${tableName}`;
      const result = await this.sqliteService.executeQuery(query);

      return {
        success: result.success,
        error: result.error,
        table: tableName,
      };
    } catch (error) {
      console.error(`Drop table failed for ${tableName}:`, error.message);
      return {
        success: false,
        error: error.message,
        table: tableName,
      };
    }
  }

  /**
   * Get database schema
   * @returns {Promise<Object>} Schema information
   */
  async getSchema() {
    try {
      return await this.sqliteService.getSchema();
    } catch (error) {
      console.error("Get schema failed:", error.message);
      return {
        success: false,
        error: error.message,
        schema: {},
        tableCount: 0,
      };
    }
  }

  /**
   * Get database information
   * @returns {Promise<Object>} Database info
   */
  async getDatabaseInfo() {
    try {
      return await this.sqliteService.getDatabaseInfo();
    } catch (error) {
      console.error("Get database info failed:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default SQLiteDataAccess;

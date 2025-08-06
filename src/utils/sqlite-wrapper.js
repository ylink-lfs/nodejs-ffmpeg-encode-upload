import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import config from "../config/config.js";

/**
 * SQLite Service
 * Provides low-level SQLite database operations
 */
class SQLiteService {
  constructor() {
    this.dbPath = config.db.path;
    this.db = null;
    this.isConnected = false;

    // Ensure database directory exists
    this.ensureDatabaseDirectory();
  }

  /**
   * Ensure database directory exists
   */
  ensureDatabaseDirectory() {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
  }

  /**
   * Create and open database connection
   * @returns {Promise<Object>} Database connection
   */
  async createConnection() {
    try {
      if (this.isConnected && this.db) {
        return this.db;
      }

      console.log(`Connecting to SQLite database: ${this.dbPath}`);

      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database,
      });

      this.isConnected = true;
      console.log("SQLite database connected successfully");

      // Enable foreign keys
      await this.db.exec("PRAGMA foreign_keys = ON");

      return this.db;
    } catch (error) {
      console.error("Failed to connect to SQLite database:", error.message);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   * @param {string} query - SQL query string
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(query, params = []) {
    try {
      if (!this.isConnected) {
        await this.createConnection();
      }

      console.log(`Executing query: ${query.substring(0, 100)}...`);

      const result = await this.db.run(query, params);

      return {
        success: true,
        lastID: result.lastID,
        changes: result.changes,
        query: query,
        params: params,
      };
    } catch (error) {
      console.error("Query execution failed:", error.message);
      return {
        success: false,
        error: error.message,
        query: query,
        params: params,
      };
    }
  }

  /**
   * Execute a SELECT query and return results
   * @param {string} query - SQL SELECT query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>} Query results
   */
  async selectQuery(query, params = []) {
    try {
      if (!this.isConnected) {
        await this.createConnection();
      }

      console.log(`Executing SELECT: ${query.substring(0, 100)}...`);

      const rows = await this.db.all(query, params);

      return {
        success: true,
        data: rows,
        count: rows.length,
        query: query,
        params: params,
      };
    } catch (error) {
      console.error("SELECT query failed:", error.message);
      return {
        success: false,
        error: error.message,
        data: [],
        count: 0,
        query: query,
        params: params,
      };
    }
  }

  /**
   * Execute a SELECT query and return single result
   * @param {string} query - SQL SELECT query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Single result or null
   */
  async selectOne(query, params = []) {
    try {
      if (!this.isConnected) {
        await this.createConnection();
      }

      console.log(`Executing SELECT ONE: ${query.substring(0, 100)}...`);

      const row = await this.db.get(query, params);

      return {
        success: true,
        data: row || null,
        query: query,
        params: params,
      };
    } catch (error) {
      console.error("SELECT ONE query failed:", error.message);
      return {
        success: false,
        error: error.message,
        data: null,
        query: query,
        params: params,
      };
    }
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Array} queries - Array of {query, params} objects
   * @returns {Promise<Object>} Transaction result
   */
  async executeTransaction(queries) {
    try {
      if (!this.isConnected) {
        await this.createConnection();
      }

      console.log(`Executing transaction with ${queries.length} queries`);

      await this.db.exec("BEGIN TRANSACTION");

      const results = [];

      for (const { query, params = [] } of queries) {
        const result = await this.db.run(query, params);
        results.push({
          success: true,
          lastID: result.lastID,
          changes: result.changes,
          query: query,
        });
      }

      await this.db.exec("COMMIT");

      console.log("Transaction completed successfully");

      return {
        success: true,
        results: results,
        message: "Transaction completed successfully",
      };
    } catch (error) {
      console.error("Transaction failed:", error.message);

      try {
        await this.db.exec("ROLLBACK");
        console.log("Transaction rolled back");
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }

      return {
        success: false,
        error: error.message,
        message: "Transaction failed and was rolled back",
      };
    }
  }

  /**
   * Get database schema information
   * @returns {Promise<Object>} Schema information
   */
  async getSchema() {
    try {
      const tablesResult = await this.selectQuery(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      if (!tablesResult.success) {
        throw new Error(tablesResult.error);
      }

      const schema = {};

      for (const table of tablesResult.data) {
        const columnsResult = await this.selectQuery(
          `PRAGMA table_info(${table.name})`
        );

        if (columnsResult.success) {
          schema[table.name] = {
            columns: columnsResult.data.map((col) => ({
              name: col.name,
              type: col.type,
              nullable: !col.notnull,
              defaultValue: col.dflt_value,
              primaryKey: col.pk === 1,
            })),
          };
        }
      }

      return {
        success: true,
        schema: schema,
        tableCount: Object.keys(schema).length,
      };
    } catch (error) {
      console.error("Failed to get schema:", error.message);
      return {
        success: false,
        error: error.message,
        schema: {},
        tableCount: 0,
      };
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async closeConnection() {
    try {
      if (this.isConnected && this.db) {
        await this.db.close();
        this.isConnected = false;
        this.db = null;
        console.log("SQLite database connection closed");
      }
    } catch (error) {
      console.error("Failed to close database connection:", error.message);
      throw error;
    }
  }

  /**
   * Check if database connection is active
   * @returns {boolean} Connection status
   */
  isConnectionActive() {
    return this.isConnected && this.db !== null;
  }

  /**
   * Get database file information
   * @returns {Promise<Object>} Database file stats
   */
  async getDatabaseInfo() {
    try {
      const stats = fs.statSync(this.dbPath);

      return {
        success: true,
        path: this.dbPath,
        size: stats.size,
        sizeFormatted: `${(stats.size / 1024).toFixed(2)} KB`,
        created: stats.birthtime,
        modified: stats.mtime,
        exists: true,
        connected: this.isConnected,
      };
    } catch (error) {
      return {
        success: false,
        path: this.dbPath,
        size: 0,
        sizeFormatted: "0 KB",
        created: null,
        modified: null,
        exists: false,
        connected: this.isConnected,
        error: error.message,
      };
    }
  }
}

export default SQLiteService;

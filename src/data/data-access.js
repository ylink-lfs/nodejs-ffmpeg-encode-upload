/**
 * Abstract Data Access Layer
 * Provides a database-agnostic interface for data operations
 * This allows switching between different database implementations
 */

/**
 * Base Data Access Object interface
 * All database implementations should implement this interface
 */
class BaseDataAccess {
  constructor(config = {}) {
    this.config = config;
    this.isConnected = false;
  }

  // Connection management
  async connect() {
    throw new Error("connect() method must be implemented");
  }

  async disconnect() {
    throw new Error("disconnect() method must be implemented");
  }

  // CRUD operations
  async create(table, data) {
    throw new Error("create() method must be implemented");
  }

  async read(table, conditions = {}, options = {}) {
    throw new Error("read() method must be implemented");
  }

  async readOne(table, conditions = {}) {
    throw new Error("readOne() method must be implemented");
  }

  async update(table, data, conditions = {}) {
    throw new Error("update() method must be implemented");
  }

  async delete(table, conditions = {}) {
    throw new Error("delete() method must be implemented");
  }

  // Advanced operations
  async count(table, conditions = {}) {
    throw new Error("count() method must be implemented");
  }

  async exists(table, conditions = {}) {
    throw new Error("exists() method must be implemented");
  }

  async executeRaw(query, params = []) {
    throw new Error("executeRaw() method must be implemented");
  }

  async executeTransaction(operations) {
    throw new Error("executeTransaction() method must be implemented");
  }

  // Schema operations
  async createTable(tableName, schema) {
    throw new Error("createTable() method must be implemented");
  }

  async dropTable(tableName) {
    throw new Error("dropTable() method must be implemented");
  }

  async getSchema() {
    throw new Error("getSchema() method must be implemented");
  }
}

/**
 * Data Access Factory
 * Creates and returns appropriate data access implementation
 */
class DataAccessFactory {
  static async create(type, config = {}) {
    switch (type.toLowerCase()) {
      case "sqlite":
        // Import SQLiteDataAccess dynamically to avoid circular imports
        const { default: SQLiteDataAccess } = await import(
          "./sqlite-data-access.js"
        );
        return new SQLiteDataAccess(config);
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  static getSupportedTypes() {
    return ["sqlite"]; // Add more as implementations are added
  }
}

/**
 * Common data types for schema definitions
 */
const DataTypes = {
  STRING: "TEXT",
  INTEGER: "INTEGER",
  FLOAT: "REAL",
  BOOLEAN: "INTEGER", // SQLite doesn't have native boolean
  DATE: "TEXT", // ISO 8601 format
  TIMESTAMP: "TEXT", // ISO 8601 format with time
  JSON: "TEXT", // JSON as text
  BLOB: "BLOB",
};

/**
 * Query builder utilities
 */
class QueryBuilder {
  static buildWhereClause(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { where: "", params: [] };
    }

    const whereParts = [];
    const params = [];

    Object.entries(conditions).forEach(([key, value]) => {
      if (value === null) {
        whereParts.push(`${key} IS NULL`);
      } else if (value === undefined) {
        // Skip undefined values
        return;
      } else if (typeof value === "object" && value.operator) {
        // Support for complex conditions like { operator: 'LIKE', value: '%test%' }
        whereParts.push(`${key} ${value.operator} ?`);
        params.push(value.value);
      } else {
        whereParts.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      where: whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "",
      params: params,
    };
  }

  static buildInsertQuery(table, data) {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((key) => data[key]);

    return {
      query: `INSERT INTO ${table} (${keys.join(
        ", "
      )}) VALUES (${placeholders})`,
      params: values,
    };
  }

  static buildUpdateQuery(table, data, conditions) {
    const setParts = Object.keys(data).map((key) => `${key} = ?`);
    const setValues = Object.values(data);

    const { where, params: whereParams } =
      QueryBuilder.buildWhereClause(conditions);

    return {
      query: `UPDATE ${table} SET ${setParts.join(", ")} ${where}`,
      params: [...setValues, ...whereParams],
    };
  }

  static buildSelectQuery(table, conditions = {}, options = {}) {
    const { columns = "*", orderBy, limit, offset } = options;
    const { where, params } = QueryBuilder.buildWhereClause(conditions);

    let query = `SELECT ${columns} FROM ${table} ${where}`;

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
      if (offset) {
        query += ` OFFSET ${offset}`;
      }
    }

    return { query, params };
  }

  static buildDeleteQuery(table, conditions) {
    const { where, params } = QueryBuilder.buildWhereClause(conditions);

    if (!where) {
      throw new Error(
        "DELETE queries must include WHERE conditions for safety"
      );
    }

    return {
      query: `DELETE FROM ${table} ${where}`,
      params: params,
    };
  }
}

export { BaseDataAccess, DataAccessFactory, DataTypes, QueryBuilder };

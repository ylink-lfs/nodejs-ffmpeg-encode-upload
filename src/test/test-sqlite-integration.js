import { DataAccessFactory, DataTypes } from "../data/data-access.js";
import fs from "fs";

/**
 * Test script for SQLite Database Integration
 * This script demonstrates the functionality of the abstracted data layer
 */

// Test data for demonstrations
const testUsers = [
  {
    name: "John Doe",
    email: "john.doe@example.com",
    age: 30,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: "Jane Smith",
    email: "jane.smith@example.com",
    age: 25,
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    name: "Bob Johnson",
    email: "bob.johnson@example.com",
    age: 35,
    isActive: false,
    createdAt: new Date().toISOString(),
  },
];

const testPosts = [
  {
    title: "Introduction to SQLite",
    content: "SQLite is a lightweight, serverless database engine...",
    authorId: 1,
    published: true,
    createdAt: new Date().toISOString(),
  },
  {
    title: "Building REST APIs",
    content: "REST APIs are essential for modern web applications...",
    authorId: 1,
    published: false,
    createdAt: new Date().toISOString(),
  },
  {
    title: "Database Design Patterns",
    content: "Good database design is crucial for application performance...",
    authorId: 2,
    published: true,
    createdAt: new Date().toISOString(),
  },
];

/**
 * Initialize database with test schema
 */
async function initializeDatabase(dataAccess) {
  console.log("🏗️ Initializing database schema...");

  // Define Users table schema
  const usersSchema = {
    columns: {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        notNull: true,
      },
      name: {
        type: DataTypes.STRING,
        notNull: true,
      },
      email: {
        type: DataTypes.STRING,
        notNull: true,
        unique: true,
      },
      age: {
        type: DataTypes.INTEGER,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: 1,
      },
      createdAt: {
        type: DataTypes.TIMESTAMP,
        notNull: true,
      },
    },
  };

  // Define Posts table schema
  const postsSchema = {
    columns: {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        notNull: true,
      },
      title: {
        type: DataTypes.STRING,
        notNull: true,
      },
      content: {
        type: DataTypes.STRING,
      },
      authorId: {
        type: DataTypes.INTEGER,
        notNull: true,
      },
      published: {
        type: DataTypes.BOOLEAN,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.TIMESTAMP,
        notNull: true,
      },
    },
  };

  // Create tables
  const usersResult = await dataAccess.createTable("users", usersSchema);
  const postsResult = await dataAccess.createTable("posts", postsSchema);

  console.log(
    "Users table:",
    usersResult.success ? "✅ Created" : `❌ Failed: ${usersResult.error}`
  );
  console.log(
    "Posts table:",
    postsResult.success ? "✅ Created" : `❌ Failed: ${postsResult.error}`
  );

  return usersResult.success && postsResult.success;
}

/**
 * Test basic CRUD operations
 */
async function testCrudOperations(dataAccess) {
  console.log("\n🧪 Testing CRUD Operations...\n");

  try {
    // CREATE operations
    console.log("📝 Testing CREATE operations...");
    const createdUsers = [];

    for (const userData of testUsers) {
      const result = await dataAccess.create("users", userData);

      if (result.success) {
        console.log(`✅ Created user: ${userData.name} (ID: ${result.id})`);
        createdUsers.push(result.data);
      } else {
        console.log(
          `❌ Failed to create user ${userData.name}: ${result.error}`
        );
      }
    }

    // Create posts
    for (const postData of testPosts) {
      const result = await dataAccess.create("posts", postData);

      if (result.success) {
        console.log(`✅ Created post: ${postData.title} (ID: ${result.id})`);
      } else {
        console.log(
          `❌ Failed to create post ${postData.title}: ${result.error}`
        );
      }
    }

    // READ operations
    console.log("\n📖 Testing READ operations...");

    // Read all users
    const allUsers = await dataAccess.read("users");
    console.log(`📋 Found ${allUsers.count} users total`);

    // Read active users only
    const activeUsers = await dataAccess.read("users", { isActive: true });
    console.log(`👤 Found ${activeUsers.count} active users`);

    // Read single user
    const singleUser = await dataAccess.readOne("users", {
      email: "john.doe@example.com",
    });
    if (singleUser.success && singleUser.data) {
      console.log(`🔍 Found user: ${singleUser.data.name}`);
    }

    // Read with options (ordering, limiting)
    const orderedUsers = await dataAccess.read(
      "users",
      {},
      {
        orderBy: "age DESC",
        limit: 2,
        columns: "name, email, age",
      }
    );
    console.log(`📊 Ordered users (top 2 by age):`);
    orderedUsers.data.forEach((user) => {
      console.log(`   ${user.name} (${user.age} years)`);
    });

    // Complex queries with JOIN-like operations
    console.log("\n🔗 Testing complex queries...");
    const publishedPosts = await dataAccess.read("posts", { published: true });
    console.log(`📰 Found ${publishedPosts.count} published posts`);

    // UPDATE operations
    console.log("\n✏️ Testing UPDATE operations...");

    const updateResult = await dataAccess.update(
      "users",
      { age: 31, isActive: true },
      { email: "john.doe@example.com" }
    );

    if (updateResult.success) {
      console.log(`✅ Updated ${updateResult.changes} user record(s)`);
    } else {
      console.log(`❌ Update failed: ${updateResult.error}`);
    }

    // Verify update
    const updatedUser = await dataAccess.readOne("users", {
      email: "john.doe@example.com",
    });
    if (updatedUser.success && updatedUser.data) {
      console.log(
        `🔍 Verified: ${updatedUser.data.name} is now ${updatedUser.data.age} years old`
      );
    }

    // COUNT and EXISTS operations
    console.log("\n🔢 Testing COUNT and EXISTS operations...");

    const userCount = await dataAccess.count("users");
    console.log(`📊 Total users: ${userCount.count}`);

    const activeUserCount = await dataAccess.count("users", { isActive: true });
    console.log(`👥 Active users: ${activeUserCount.count}`);

    const userExists = await dataAccess.exists("users", {
      email: "john.doe@example.com",
    });
    console.log(`🔍 John Doe exists: ${userExists.exists ? "Yes" : "No"}`);

    console.log("\n✅ CRUD operations test completed successfully!");
    return true;
  } catch (error) {
    console.error("❌ CRUD operations test failed:", error.message);
    return false;
  }
}

/**
 * Test transaction operations
 */
async function testTransactions(dataAccess) {
  console.log("\n🧪 Testing Transaction Operations...\n");

  try {
    // Test successful transaction
    console.log("💳 Testing successful transaction...");

    const operations = [
      {
        type: "create",
        table: "users",
        data: {
          name: "Transaction User",
          email: "transaction@example.com",
          age: 28,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      },
      {
        type: "create",
        table: "posts",
        data: {
          title: "Transaction Post",
          content: "This post was created in a transaction",
          authorId: 1,
          published: true,
          createdAt: new Date().toISOString(),
        },
      },
    ];

    const transactionResult = await dataAccess.executeTransaction(operations);

    if (transactionResult.success) {
      console.log("✅ Transaction completed successfully");
      console.log(`📝 Executed ${transactionResult.results.length} operations`);
    } else {
      console.log(`❌ Transaction failed: ${transactionResult.error}`);
    }

    console.log("\n✅ Transaction test completed!");
    return true;
  } catch (error) {
    console.error("❌ Transaction test failed:", error.message);
    return false;
  }
}

/**
 * Test raw SQL operations
 */
async function testRawSQL(dataAccess) {
  console.log("\n🧪 Testing Raw SQL Operations...\n");

  try {
    // Complex query with JOIN simulation
    console.log("🔍 Testing complex raw SQL query...");

    const complexQuery = `
      SELECT 
        u.name as author_name,
        u.email as author_email,
        COUNT(p.id) as post_count,
        COUNT(CASE WHEN p.published = 1 THEN 1 END) as published_count
      FROM users u
      LEFT JOIN posts p ON u.id = p.authorId
      GROUP BY u.id, u.name, u.email
      ORDER BY post_count DESC
    `;

    const result = await dataAccess.executeRaw(complexQuery);

    if (result.success) {
      console.log("📊 Author statistics:");
      result.data.forEach((row) => {
        console.log(
          `   ${row.author_name}: ${row.post_count} posts (${row.published_count} published)`
        );
      });
    } else {
      console.log(`❌ Complex query failed: ${result.error}`);
    }

    // Test data aggregation
    console.log("\n📈 Testing data aggregation...");

    const aggregateQuery = `
      SELECT 
        AVG(age) as average_age,
        MIN(age) as min_age,
        MAX(age) as max_age,
        COUNT(*) as total_users
      FROM users
      WHERE isActive = 1
    `;

    const aggregateResult = await dataAccess.executeRaw(aggregateQuery);

    if (aggregateResult.success && aggregateResult.data.length > 0) {
      const stats = aggregateResult.data[0];
      console.log(`📊 User statistics:`);
      console.log(
        `   Average age: ${parseFloat(stats.average_age).toFixed(1)} years`
      );
      console.log(`   Age range: ${stats.min_age} - ${stats.max_age} years`);
      console.log(`   Total active users: ${stats.total_users}`);
    }

    console.log("\n✅ Raw SQL test completed!");
    return true;
  } catch (error) {
    console.error("❌ Raw SQL test failed:", error.message);
    return false;
  }
}

/**
 * Test schema operations
 */
async function testSchemaOperations(dataAccess) {
  console.log("\n🧪 Testing Schema Operations...\n");

  try {
    // Get database schema
    console.log("🏗️ Getting database schema...");

    const schemaResult = await dataAccess.getSchema();

    if (schemaResult.success) {
      console.log(`📋 Database contains ${schemaResult.tableCount} tables:`);

      Object.entries(schemaResult.schema).forEach(([tableName, tableInfo]) => {
        console.log(`\n   📄 Table: ${tableName}`);
        tableInfo.columns.forEach((column) => {
          const pkIndicator = column.primaryKey ? " [PK]" : "";
          const nullIndicator = column.nullable ? "" : " [NOT NULL]";
          console.log(
            `      ${column.name}: ${column.type}${pkIndicator}${nullIndicator}`
          );
        });
      });
    } else {
      console.log(`❌ Failed to get schema: ${schemaResult.error}`);
    }

    // Get database info
    console.log("\n💽 Database information:");
    const dbInfo = await dataAccess.getDatabaseInfo();

    if (dbInfo.success) {
      console.log(`   📁 Path: ${dbInfo.path}`);
      console.log(`   📏 Size: ${dbInfo.sizeFormatted}`);
      console.log(
        `   📅 Created: ${
          dbInfo.created ? dbInfo.created.toLocaleString() : "Unknown"
        }`
      );
      console.log(
        `   🔄 Modified: ${
          dbInfo.modified ? dbInfo.modified.toLocaleString() : "Unknown"
        }`
      );
      console.log(`   🔌 Connected: ${dbInfo.connected ? "Yes" : "No"}`);
    }

    console.log("\n✅ Schema operations test completed!");
    return true;
  } catch (error) {
    console.error("❌ Schema operations test failed:", error.message);
    return false;
  }
}

/**
 * Test performance with larger dataset
 */
async function testPerformance(dataAccess) {
  console.log("\n🧪 Testing Performance with Larger Dataset...\n");

  try {
    console.log("📊 Creating performance test data...");

    const startTime = Date.now();
    const batchSize = 100;

    // Create batch users
    for (let i = 0; i < batchSize; i++) {
      const userData = {
        name: `User ${i + 100}`,
        email: `user${i + 100}@example.com`,
        age: 20 + (i % 50),
        isActive: i % 3 !== 0,
        createdAt: new Date().toISOString(),
      };

      await dataAccess.create("users", userData);
    }

    const insertTime = Date.now() - startTime;
    console.log(
      `✅ Inserted ${batchSize} users in ${insertTime}ms (${(
        insertTime / batchSize
      ).toFixed(2)}ms per record)`
    );

    // Performance test: bulk read
    const readStartTime = Date.now();
    const allUsersResult = await dataAccess.read("users");
    const readTime = Date.now() - readStartTime;

    console.log(`📖 Read ${allUsersResult.count} users in ${readTime}ms`);

    // Performance test: filtered read
    const filterStartTime = Date.now();
    const activeUsersResult = await dataAccess.read("users", {
      isActive: true,
    });
    const filterTime = Date.now() - filterStartTime;

    console.log(
      `🔍 Filtered ${activeUsersResult.count} active users in ${filterTime}ms`
    );

    console.log("\n✅ Performance test completed!");
    return true;
  } catch (error) {
    console.error("❌ Performance test failed:", error.message);
    return false;
  }
}

/**
 * Clean up test data and files
 */
async function cleanup() {
  console.log("\n🧹 Cleaning up test data...");

  try {
    // Remove test database file
    const dbPath = "../assets/data/test-database.sqlite";
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log("🗑️ Removed test database file");
    }

    // Remove data directory if empty
    const dataDir = "../assets/data";
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      if (files.length === 0) {
        fs.rmdirSync(dataDir);
        console.log("🗑️ Removed empty data directory");
      }
    }

    console.log("✅ Cleanup completed");
  } catch (error) {
    console.warn("⚠️ Cleanup warning:", error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log("🗄️ SQLite Database Integration Test Suite\n");
  console.log("==========================================\n");

  let dataAccess = null;

  try {
    // Initialize data access layer
    console.log("🚀 Initializing Data Access Layer...");
    dataAccess = await DataAccessFactory.create("sqlite", {
      dbPath: "./data/test-database.sqlite",
    });

    // Connect to database
    const connectResult = await dataAccess.connect();
    if (!connectResult.success) {
      throw new Error(`Failed to connect: ${connectResult.error}`);
    }

    // Initialize database schema
    const initSuccess = await initializeDatabase(dataAccess);
    if (!initSuccess) {
      throw new Error("Failed to initialize database schema");
    }

    // Run test suites
    const tests = [
      { name: "CRUD Operations", fn: () => testCrudOperations(dataAccess) },
      { name: "Transactions", fn: () => testTransactions(dataAccess) },
      { name: "Raw SQL", fn: () => testRawSQL(dataAccess) },
      { name: "Schema Operations", fn: () => testSchemaOperations(dataAccess) },
      { name: "Performance", fn: () => testPerformance(dataAccess) },
    ];

    const results = [];

    for (const test of tests) {
      try {
        const success = await test.fn();
        results.push({ name: test.name, success });
      } catch (error) {
        console.error(`❌ Test "${test.name}" crashed:`, error.message);
        results.push({ name: test.name, success: false });
      }
    }

    // Display results
    console.log("\n📊 Test Results Summary");
    console.log("==========================================");

    results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      console.log(`${status} ${result.name}`);
    });

    const passedTests = results.filter((r) => r.success).length;
    console.log(`\n🎯 Overall: ${passedTests}/${results.length} tests passed`);

    if (passedTests === results.length) {
      console.log(
        "🎉 All tests passed! The database integration is working correctly."
      );
    } else {
      console.log(
        "⚠️ Some tests failed. Please check the error messages above."
      );
    }
  } catch (error) {
    console.error("💥 Test suite crashed:", error.stack);
  } finally {
    // Cleanup
    if (dataAccess) {
      await dataAccess.disconnect();
    }
    await cleanup();
  }
}

/**
 * Check if SQLite package is available
 */
async function checkSQLite() {
  try {
    await import("sqlite3");
    await import("sqlite");
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🔍 Checking SQLite availability...");

  const sqliteAvailable = await checkSQLite();

  if (!sqliteAvailable) {
    console.error("❌ SQLite packages are not available. Please install them:");
    console.log("📥 Install SQLite packages:");
    console.log("   npm install sqlite3 sqlite");
    console.log("   or");
    console.log("   yarn add sqlite3 sqlite");
    process.exit(1);
  }

  console.log("✅ SQLite packages are available\n");

  await runAllTests();
}

main().catch((error) => {
  console.error("💥 Test suite crashed:", error);
  process.exit(1);
});

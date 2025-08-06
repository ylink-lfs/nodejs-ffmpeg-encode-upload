/**
 * Test script for S3Service
 * This script demonstrates and tests all functionality of src/utils/s3-service.js
 * Based on examples from the awss3 folder with comprehensive test cases
 */

import S3Service from "../utils/s3-service.js";
import fs from "fs";
import path from "path";

/**
 * Test configuration
 */
const TEST_CONFIG = {
  testFilesDir: "../../temp",
  downloadsDir: "../../temp",
  testPrefix: "test-s3-service",
  timestamp: new Date().toISOString().replace(/[:.]/g, "-"),
};

/**
 * Create test files for upload testing
 */
async function createTestFiles() {
  console.log("📝 Creating test files...");

  // Ensure test directory exists
  if (!fs.existsSync(TEST_CONFIG.testFilesDir)) {
    fs.mkdirSync(TEST_CONFIG.testFilesDir, { recursive: true });
  }

  const testFiles = [
    {
      name: "test-document.txt",
      content: `Test Document for S3Service
Created: ${new Date().toISOString()}
This is a sample text document for testing S3 upload functionality.

Features to test:
- File upload
- File download
- Metadata handling
- Content type detection
- Error handling
`,
    },
    {
      name: "test-data.json",
      content: JSON.stringify(
        {
          testSuite: "S3Service Test",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          features: [
            "uploadFile",
            "uploadBuffer",
            "downloadFile",
            "listObjects",
            "deleteFile",
            "getObjectMetadata",
            "generatePresignedUrl",
            "objectExists",
          ],
          metadata: {
            purpose: "testing",
            environment: "development",
          },
        },
        null,
        2
      ),
    },
    {
      name: "test-config.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<testConfiguration>
  <service>S3Service</service>
  <timestamp>${new Date().toISOString()}</timestamp>
  <testCases>
    <case name="upload" enabled="true" />
    <case name="download" enabled="true" />
    <case name="metadata" enabled="true" />
    <case name="list" enabled="true" />
    <case name="delete" enabled="true" />
  </testCases>
</testConfiguration>`,
    },
    {
      name: "test-binary.dat",
      content: Buffer.from([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
        0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
      ]),
    },
  ];

  const createdFiles = [];

  for (const file of testFiles) {
    const filePath = path.join(TEST_CONFIG.testFilesDir, file.name);

    if (Buffer.isBuffer(file.content)) {
      fs.writeFileSync(filePath, file.content);
    } else {
      fs.writeFileSync(filePath, file.content, "utf8");
    }

    const stats = fs.statSync(filePath);
    createdFiles.push({
      name: file.name,
      path: filePath,
      size: stats.size,
    });

    console.log(`   ✅ Created: ${file.name} (${stats.size} bytes)`);
  }

  return createdFiles;
}

/**
 * Test 1: File Upload Operations
 */
async function testFileUpload(s3Service, testFiles) {
  console.log("\n🧪 Test 1: File Upload Operations\n");

  const uploadResults = [];

  try {
    for (const file of testFiles) {
      console.log(`📤 Testing upload: ${file.name}`);

      const s3Key = `${TEST_CONFIG.testPrefix}/uploads/${TEST_CONFIG.timestamp}/${file.name}`;
      const metadata = {
        "test-suite": "s3-service-test",
        "upload-timestamp": new Date().toISOString(),
        "file-type": path.extname(file.name).substring(1) || "unknown",
        "original-name": file.name,
      };

      const result = await s3Service.uploadFile(file.path, s3Key, metadata);

      if (result.success) {
        console.log(`   ✅ Upload successful:`);
        console.log(`      Key: ${result.key}`);
        console.log(`      Location: ${result.location}`);
        console.log(`      ETag: ${result.etag}`);

        uploadResults.push({
          success: true,
          file: file.name,
          key: result.key,
          etag: result.etag,
          location: result.location,
        });
      } else {
        console.log(`   ❌ Upload failed: ${result.error}`);
        uploadResults.push({
          success: false,
          file: file.name,
          error: result.error,
        });
      }
      console.log("");
    }

    console.log(`📊 Upload Summary: ${uploadResults.filter(r => r.success).length}/${uploadResults.length} successful`);
    return uploadResults;
  } catch (error) {
    console.error("❌ Upload test failed:", error.message);
    throw error;
  }
}

/**
 * Test 2: Buffer Upload Operations
 */
async function testBufferUpload(s3Service) {
  console.log("\n🧪 Test 2: Buffer Upload Operations\n");

  try {
    // Test uploading different types of buffers
    const bufferTests = [
      {
        name: "text-buffer.txt",
        buffer: Buffer.from("This is a text buffer upload test", "utf8"),
        contentType: "text/plain",
      },
      {
        name: "json-buffer.json",
        buffer: Buffer.from(
          JSON.stringify({ message: "Buffer upload test", timestamp: new Date() }),
          "utf8"
        ),
        contentType: "application/json",
      },
      {
        name: "binary-buffer.bin",
        buffer: Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa]),
        contentType: "application/octet-stream",
      },
    ];

    const bufferResults = [];

    for (const test of bufferTests) {
      console.log(`📤 Testing buffer upload: ${test.name}`);

      const s3Key = `${TEST_CONFIG.testPrefix}/buffers/${TEST_CONFIG.timestamp}/${test.name}`;
      const metadata = {
        "test-type": "buffer-upload",
        "buffer-size": test.buffer.length.toString(),
        "content-encoding": "identity",
      };

      const result = await s3Service.uploadBuffer(
        test.buffer,
        s3Key,
        test.contentType,
        metadata
      );

      if (result.success) {
        console.log(`   ✅ Buffer upload successful:`);
        console.log(`      Key: ${result.key}`);
        console.log(`      Size: ${result.size} bytes`);
        console.log(`      ETag: ${result.etag}`);

        bufferResults.push({
          success: true,
          name: test.name,
          key: result.key,
          size: result.size,
        });
      } else {
        console.log(`   ❌ Buffer upload failed`);
        bufferResults.push({
          success: false,
          name: test.name,
          error: "Upload failed",
        });
      }
      console.log("");
    }

    console.log(`📊 Buffer Upload Summary: ${bufferResults.filter(r => r.success).length}/${bufferResults.length} successful`);
    return bufferResults;
  } catch (error) {
    console.error("❌ Buffer upload test failed:", error.message);
    throw error;
  }
}

/**
 * Test 3: List Objects Operations
 */
async function testListObjects(s3Service) {
  console.log("\n🧪 Test 3: List Objects Operations\n");

  try {
    // Test 3.1: List all objects
    console.log("📋 Testing list all objects...");
    const allObjects = await s3Service.listObjects("", 100);

    if (allObjects && allObjects.length > 0) {
      console.log(`   ✅ Found ${allObjects.length} objects in bucket`);
      
      // Show first few objects
      const showCount = Math.min(5, allObjects.length);
      console.log(`   📄 First ${showCount} objects:`);
      for (let i = 0; i < showCount; i++) {
        const obj = allObjects[i];
        console.log(`      ${i + 1}. ${obj.key} (${(obj.size / 1024).toFixed(2)} KB)`);
      }
    } else {
      console.log("   📭 No objects found in bucket");
    }

    // Test 3.2: List objects with prefix
    console.log(`\n📋 Testing list objects with prefix: "${TEST_CONFIG.testPrefix}"`);
    const prefixObjects = await s3Service.listObjects(TEST_CONFIG.testPrefix, 50);

    if (prefixObjects && prefixObjects.length > 0) {
      console.log(`   ✅ Found ${prefixObjects.length} objects with test prefix`);
      
      prefixObjects.forEach((obj, index) => {
        const sizeKB = (obj.size / 1024).toFixed(2);
        const modifiedDate = new Date(obj.lastModified).toLocaleString();
        console.log(`   ${index + 1}. ${obj.key}`);
        console.log(`      Size: ${sizeKB} KB, Modified: ${modifiedDate}`);
      });
    } else {
      console.log("   📭 No objects found with test prefix");
    }

    return {
      allObjectsCount: allObjects ? allObjects.length : 0,
      prefixObjectsCount: prefixObjects ? prefixObjects.length : 0,
      testObjects: prefixObjects || [],
    };
  } catch (error) {
    console.error("❌ List objects test failed:", error.message);
    throw error;
  }
}

/**
 * Test 4: Object Metadata Operations
 */
async function testObjectMetadata(s3Service, testObjects) {
  console.log("\n🧪 Test 4: Object Metadata Operations\n");

  try {
    if (!testObjects || testObjects.length === 0) {
      console.log("⚠️ No test objects available for metadata testing");
      return [];
    }

    const metadataResults = [];

    // Test metadata for each uploaded object
    for (const obj of testObjects.slice(0, 3)) {
      console.log(`🔍 Testing metadata for: ${obj.key}`);

      try {
        const metadata = await s3Service.getObjectMetadata(obj.key);

        console.log(`   ✅ Metadata retrieved successfully:`);
        console.log(`      Content Type: ${metadata.contentType}`);
        console.log(`      Content Length: ${metadata.contentLength} bytes`);
        console.log(`      Last Modified: ${new Date(metadata.lastModified).toLocaleString()}`);
        console.log(`      ETag: ${metadata.etag}`);

        if (metadata.metadata && Object.keys(metadata.metadata).length > 0) {
          console.log("      Custom Metadata:");
          Object.entries(metadata.metadata).forEach(([key, value]) => {
            console.log(`        ${key}: ${value}`);
          });
        }

        metadataResults.push({
          success: true,
          key: obj.key,
          metadata: metadata,
        });
      } catch (error) {
        console.log(`   ❌ Failed to get metadata: ${error.message}`);
        metadataResults.push({
          success: false,
          key: obj.key,
          error: error.message,
        });
      }
      console.log("");
    }

    console.log(`📊 Metadata Summary: ${metadataResults.filter(r => r.success).length}/${metadataResults.length} successful`);
    return metadataResults;
  } catch (error) {
    console.error("❌ Metadata test failed:", error.message);
    throw error;
  }
}

/**
 * Test 5: Object Existence Check
 */
async function testObjectExists(s3Service, testObjects) {
  console.log("\n🧪 Test 5: Object Existence Check\n");

  try {
    const existenceResults = [];

    // Test existing objects
    if (testObjects && testObjects.length > 0) {
      const testObject = testObjects[0];
      console.log(`🔍 Testing existence of: ${testObject.key}`);

      const exists = await s3Service.objectExists(testObject.key);
      console.log(`   ${exists ? "✅" : "❌"} Object exists: ${exists}`);

      existenceResults.push({
        key: testObject.key,
        exists: exists,
        expected: true,
        correct: exists === true,
      });
    }

    // Test non-existing object
    const nonExistentKey = `${TEST_CONFIG.testPrefix}/non-existent-file-${Date.now()}.txt`;
    console.log(`🔍 Testing existence of non-existent object: ${nonExistentKey}`);

    const notExists = await s3Service.objectExists(nonExistentKey);
    console.log(`   ${!notExists ? "✅" : "❌"} Object exists: ${notExists}`);

    existenceResults.push({
      key: nonExistentKey,
      exists: notExists,
      expected: false,
      correct: notExists === false,
    });

    const correctResults = existenceResults.filter(r => r.correct).length;
    console.log(`📊 Existence Check Summary: ${correctResults}/${existenceResults.length} correct`);

    return existenceResults;
  } catch (error) {
    console.error("❌ Object existence test failed:", error.message);
    throw error;
  }
}

/**
 * Test 6: Pre-signed URL Generation
 */
async function testPresignedUrl(s3Service, testObjects) {
  console.log("\n🧪 Test 6: Pre-signed URL Generation\n");

  try {
    if (!testObjects || testObjects.length === 0) {
      console.log("⚠️ No test objects available for pre-signed URL testing");
      return [];
    }

    const urlResults = [];

    // Test pre-signed URLs with different expiration times
    const expirationTests = [
      { name: "5 minutes", seconds: 300 },
      { name: "1 hour", seconds: 3600 },
      { name: "custom (10 minutes)", seconds: 600 },
    ];

    const testObject = testObjects[0];

    for (const expTest of expirationTests) {
      console.log(`🔗 Generating pre-signed URL for ${testObject.key} (${expTest.name})`);

      try {
        const url = await s3Service.generatePresignedUrl(testObject.key, expTest.seconds);

        console.log(`   ✅ URL generated successfully`);
        console.log(`      Expires in: ${expTest.seconds} seconds`);
        console.log(`      URL preview: ${url.substring(0, 80)}...`);

        // Basic URL validation
        const isValidUrl = url.startsWith("http") && url.includes(testObject.key);
        console.log(`      URL validation: ${isValidUrl ? "✅ Valid" : "❌ Invalid"}`);

        urlResults.push({
          success: true,
          key: testObject.key,
          expiration: expTest.seconds,
          urlLength: url.length,
          isValid: isValidUrl,
        });
      } catch (error) {
        console.log(`   ❌ Failed to generate URL: ${error.message}`);
        urlResults.push({
          success: false,
          key: testObject.key,
          expiration: expTest.seconds,
          error: error.message,
        });
      }
      console.log("");
    }

    console.log(`📊 Pre-signed URL Summary: ${urlResults.filter(r => r.success).length}/${urlResults.length} successful`);
    return urlResults;
  } catch (error) {
    console.error("❌ Pre-signed URL test failed:", error.message);
    throw error;
  }
}

/**
 * Test 7: File Download Operations
 */
async function testFileDownload(s3Service, testObjects) {
  console.log("\n🧪 Test 7: File Download Operations\n");

  try {
    if (!testObjects || testObjects.length === 0) {
      console.log("⚠️ No test objects available for download testing");
      return [];
    }

    // Ensure downloads directory exists
    if (!fs.existsSync(TEST_CONFIG.downloadsDir)) {
      fs.mkdirSync(TEST_CONFIG.downloadsDir, { recursive: true });
    }

    const downloadResults = [];

    // Test downloading first few objects
    const objectsToDownload = testObjects.slice(0, 2);

    for (const obj of objectsToDownload) {
      console.log(`📥 Testing download: ${obj.key}`);

      const fileName = path.basename(obj.key);
      const downloadPath = path.join(TEST_CONFIG.downloadsDir, `downloaded-${fileName}`);

      try {
        const result = await s3Service.downloadFile(obj.key, downloadPath);

        if (result.success) {
          console.log(`   ✅ Download successful:`);
          console.log(`      Downloaded to: ${result.downloadPath}`);
          console.log(`      Content Type: ${result.contentType}`);
          console.log(`      Content Length: ${result.contentLength} bytes`);

          // Verify file exists and has content
          const downloadedStats = fs.statSync(downloadPath);
          console.log(`      Local file size: ${downloadedStats.size} bytes`);

          const sizeMatch = downloadedStats.size === result.contentLength;
          console.log(`      Size verification: ${sizeMatch ? "✅ Match" : "❌ Mismatch"}`);

          downloadResults.push({
            success: true,
            key: obj.key,
            downloadPath: downloadPath,
            size: downloadedStats.size,
            sizeMatch: sizeMatch,
          });
        } else {
          console.log(`   ❌ Download failed`);
          downloadResults.push({
            success: false,
            key: obj.key,
            error: "Download failed",
          });
        }
      } catch (error) {
        console.log(`   ❌ Download error: ${error.message}`);
        downloadResults.push({
          success: false,
          key: obj.key,
          error: error.message,
        });
      }
      console.log("");
    }

    console.log(`📊 Download Summary: ${downloadResults.filter(r => r.success).length}/${downloadResults.length} successful`);
    return downloadResults;
  } catch (error) {
    console.error("❌ Download test failed:", error.message);
    throw error;
  }
}

/**
 * Test 8: Error Handling
 */
async function testErrorHandling(s3Service) {
  console.log("\n🧪 Test 8: Error Handling\n");

  const errorTests = [
    {
      name: "Upload non-existent file",
      test: async () => {
        return await s3Service.uploadFile(
          "./non-existent-file.txt",
          `${TEST_CONFIG.testPrefix}/error-test/non-existent.txt`
        );
      },
    },
    {
      name: "Download non-existent object",
      test: async () => {
        return await s3Service.downloadFile(
          `${TEST_CONFIG.testPrefix}/non-existent-object.txt`,
          "./downloads/non-existent.txt"
        );
      },
    },
    {
      name: "Get metadata for non-existent object",
      test: async () => {
        return await s3Service.getObjectMetadata(
          `${TEST_CONFIG.testPrefix}/non-existent-metadata.txt`
        );
      },
    },
  ];

  const errorResults = [];

  for (const errorTest of errorTests) {
    console.log(`🔥 Testing error handling: ${errorTest.name}`);

    try {
      const result = await errorTest.test();
      console.log(`   ❌ Should have thrown error but got result:`, result);
      errorResults.push({
        name: errorTest.name,
        handledCorrectly: false,
        note: "Should have thrown error",
      });
    } catch (error) {
      console.log(`   ✅ Correctly handled error: ${error.message}`);
      errorResults.push({
        name: errorTest.name,
        handledCorrectly: true,
        errorMessage: error.message,
      });
    }
    console.log("");
  }

  const correctlyHandled = errorResults.filter(r => r.handledCorrectly).length;
  console.log(`📊 Error Handling Summary: ${correctlyHandled}/${errorResults.length} correctly handled`);

  return errorResults;
}

/**
 * Test 9: File Deletion (Clean up test objects)
 */
async function testFileDelete(s3Service, testObjects) {
  console.log("\n🧪 Test 9: File Deletion (Cleanup)\n");

  try {
    if (!testObjects || testObjects.length === 0) {
      console.log("⚠️ No test objects available for deletion testing");
      return [];
    }

    const deleteResults = [];

    // Delete each test object
    for (const obj of testObjects) {
      console.log(`🗑️ Testing deletion: ${obj.key}`);

      try {
        // Verify object exists before deletion
        const existsBefore = await s3Service.objectExists(obj.key);
        console.log(`   📋 Object exists before deletion: ${existsBefore}`);

        if (existsBefore) {
          const result = await s3Service.deleteFile(obj.key);

          if (result.success) {
            console.log(`   ✅ Deletion successful: ${result.message}`);

            // Verify object no longer exists
            const existsAfter = await s3Service.objectExists(obj.key);
            console.log(`   🔍 Object exists after deletion: ${existsAfter}`);

            deleteResults.push({
              success: true,
              key: obj.key,
              existedBefore: existsBefore,
              existsAfter: existsAfter,
              properlyDeleted: !existsAfter,
            });
          } else {
            console.log(`   ❌ Deletion failed`);
            deleteResults.push({
              success: false,
              key: obj.key,
              error: "Deletion failed",
            });
          }
        } else {
          console.log(`   ⚠️ Object did not exist, skipping deletion`);
          deleteResults.push({
            success: true,
            key: obj.key,
            existedBefore: false,
            skipped: true,
          });
        }
      } catch (error) {
        console.log(`   ❌ Deletion error: ${error.message}`);
        deleteResults.push({
          success: false,
          key: obj.key,
          error: error.message,
        });
      }
      console.log("");
    }

    const successfulDeletions = deleteResults.filter(r => r.success && r.properlyDeleted).length;
    console.log(`📊 Deletion Summary: ${successfulDeletions} objects properly deleted`);

    return deleteResults;
  } catch (error) {
    console.error("❌ Deletion test failed:", error.message);
    throw error;
  }
}

/**
 * Clean up test files and directories
 */
async function cleanup() {
  console.log("\n🧹 Cleaning up test files and directories...");

  try {
    // Remove test files directory
    if (fs.existsSync(TEST_CONFIG.testFilesDir)) {
      fs.rmSync(TEST_CONFIG.testFilesDir, { recursive: true, force: true });
      console.log(`   ✅ Removed ${TEST_CONFIG.testFilesDir}`);
    }

    // Remove downloads directory
    if (fs.existsSync(TEST_CONFIG.downloadsDir)) {
      fs.rmSync(TEST_CONFIG.downloadsDir, { recursive: true, force: true });
      console.log(`   ✅ Removed ${TEST_CONFIG.downloadsDir}`);
    }

    console.log("   🎉 Cleanup completed successfully");
  } catch (error) {
    console.warn("   ⚠️ Cleanup warning:", error.message);
  }
}

/**
 * Generate test summary report
 */
function generateTestReport(results) {
  console.log("\n📊 S3Service Test Report");
  console.log("=====================================");

  const tests = [
    { name: "File Upload", results: results.uploadResults },
    { name: "Buffer Upload", results: results.bufferResults },
    { name: "List Objects", results: results.listResults },
    { name: "Object Metadata", results: results.metadataResults },
    { name: "Object Existence", results: results.existenceResults },
    { name: "Pre-signed URLs", results: results.urlResults },
    { name: "File Download", results: results.downloadResults },
    { name: "Error Handling", results: results.errorResults },
    { name: "File Deletion", results: results.deleteResults },
  ];

  let totalTests = 0;
  let passedTests = 0;

  tests.forEach((test) => {
    if (test.results && Array.isArray(test.results)) {
      const testCount = test.results.length;
      const successCount = test.results.filter(r => 
        r.success || r.handledCorrectly || r.correct || r.properlyDeleted
      ).length;

      console.log(`${test.name}: ${successCount}/${testCount} passed`);
      totalTests += testCount;
      passedTests += successCount;
    } else if (test.results && typeof test.results === 'object') {
      console.log(`${test.name}: ✅ Completed`);
      totalTests += 1;
      passedTests += 1;
    }
  });

  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
  console.log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log("🎉 All tests passed! S3Service is working correctly.");
  } else {
    console.log("⚠️ Some tests failed. Please check the error messages above.");
  }

  return {
    totalTests,
    passedTests,
    successRate: (passedTests / totalTests) * 100,
    allPassed: passedTests === totalTests,
  };
}

/**
 * Main test execution function
 */
async function runS3ServiceTests() {
  console.log("🚀 S3Service Test Suite");
  console.log("=====================================");
  console.log(`Test ID: ${TEST_CONFIG.timestamp}`);
  console.log(`Test Prefix: ${TEST_CONFIG.testPrefix}`);
  console.log("");

  let s3Service;
  const results = {};

  try {
    // Initialize S3 service
    console.log("🔧 Initializing S3Service...");
    s3Service = new S3Service();
    console.log("✅ S3Service initialized successfully");

    // Create test files
    const testFiles = await createTestFiles();

    // Run tests in sequence
    results.uploadResults = await testFileUpload(s3Service, testFiles);
    results.bufferResults = await testBufferUpload(s3Service);
    results.listResults = await testListObjects(s3Service);
    results.metadataResults = await testObjectMetadata(s3Service, results.listResults.testObjects);
    results.existenceResults = await testObjectExists(s3Service, results.listResults.testObjects);
    results.urlResults = await testPresignedUrl(s3Service, results.listResults.testObjects);
    results.downloadResults = await testFileDownload(s3Service, results.listResults.testObjects);
    results.errorResults = await testErrorHandling(s3Service);
    results.deleteResults = await testFileDelete(s3Service, results.listResults.testObjects);

    // Generate final report
    const report = generateTestReport(results);

    console.log("\n💡 Test Notes:");
    console.log("- Make sure your AWS/S3 service is running and properly configured");
    console.log("- Check src/config/config.js for S3 configuration settings");
    console.log("- Some tests require existing objects in the bucket");
    console.log("- Error handling tests are expected to fail gracefully");

    return report;
  } catch (error) {
    console.error("💥 Test suite crashed:", error.message);
    console.error("Stack trace:", error.stack);
    throw error;
  } finally {
    // Clean up test files
    await cleanup();
  }
}

/**
 * Entry point - check dependencies and run tests
 */
async function main() {
  try {
    console.log("🔍 Checking dependencies...");

    // Check if required modules are available
    try {
      await import("../utils/s3-service.js");
      console.log("✅ S3Service module is available");
    } catch (error) {
      console.error("❌ S3Service module not found:", error.message);
      console.log("💡 Make sure the file exists at: src/utils/s3-service.js");
      process.exit(1);
    }

    // Check AWS configuration
    try {
      const config = await import("../config/config.js");
      if (config.default.awsCliConfig && config.default.awsBucketName) {
        console.log("✅ AWS configuration found");
      } else {
        console.warn("⚠️ AWS configuration may be incomplete");
      }
    } catch (error) {
      console.warn("⚠️ Could not load AWS configuration:", error.message);
    }

    console.log("");

    // Run the test suite
    const report = await runS3ServiceTests();

    // Exit with appropriate code
    process.exit(report.allPassed ? 0 : 1);
  } catch (error) {
    console.error("💥 Test suite failed to start:", error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  runS3ServiceTests,
  createTestFiles,
  testFileUpload,
  testBufferUpload,
  testListObjects,
  testObjectMetadata,
  testObjectExists,
  testPresignedUrl,
  testFileDownload,
  testErrorHandling,
  testFileDelete,
  generateTestReport,
  TEST_CONFIG,
};

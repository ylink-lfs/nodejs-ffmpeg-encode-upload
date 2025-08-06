#!/usr/bin/env node

/**
 * Single File Upload Client Script (Demo Version)
 * 
 * This script uploads a single file to AWS S3 bucket.
 * This is a simplified demo version with fixed configuration values.
 * 
 * Usage:
 *   node scripts/client_upload.js <file_path>
 * 
 * Arguments:
 *   file_path  - Local file to upload (required)
 * 
 * Examples:
 *   node scripts/client_upload.js ./temp/document.pdf
 *   node scripts/client_upload.js ./assets/video.mp4
 */

import S3Service from "../src/utils/s3-service.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for the upload operation
 */
const UPLOAD_CONFIG = {
  // Default S3 prefix if not specified
  defaultS3Prefix: "uploads",
  
  // File extensions to exclude from upload
  excludeExtensions: ['.DS_Store', '.gitkeep', '.tmp'],
  
  // Maximum file size in bytes (0 means no limit)
  maxFileSize: 0, // e.g., 100 * 1024 * 1024 for 100MB
  
  // Additional metadata to add to uploaded files
  metadata: {
    "upload-tool": "client-upload-script",
    "upload-timestamp": new Date().toISOString(),
  },
};

/**
 * Statistics tracking for upload operations
 */
class UploadStats {
  constructor() {
    this.startTime = Date.now();
    this.success = false;
    this.error = null;
    this.fileSize = 0;
    this.uploadedBytes = 0;
  }

  addSuccess(fileSize, uploadResult) {
    this.success = true;
    this.fileSize = fileSize;
    this.uploadedBytes = fileSize;
  }

  addFailure(error) {
    this.success = false;
    this.error = error.message;
  }

  getElapsedTime() {
    return (Date.now() - this.startTime) / 1000;
  }

  getUploadSpeed() {
    const elapsed = this.getElapsedTime();
    return elapsed > 0 ? (this.uploadedBytes / elapsed) : 0;
  }

  generateReport() {
    const elapsed = this.getElapsedTime();
    const speed = this.getUploadSpeed();
    
    return {
      success: this.success,
      elapsedTime: elapsed,
      fileSize: this.fileSize,
      uploadedBytes: this.uploadedBytes,
      averageSpeed: speed,
      averageSpeedMB: speed / (1024 * 1024),
      error: this.error,
    };
  }
}

/**
 * Validate and get file information
 */
function validateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
  
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  
  // Check if file extension should be excluded
  if (UPLOAD_CONFIG.excludeExtensions.includes(extension)) {
    throw new Error(`File type not allowed: ${extension}`);
  }
  
  // Check file size limit
  if (UPLOAD_CONFIG.maxFileSize > 0 && stats.size > UPLOAD_CONFIG.maxFileSize) {
    throw new Error(`File too large: ${stats.size} bytes (max: ${UPLOAD_CONFIG.maxFileSize} bytes)`);
  }
  
  return {
    fullPath: filePath,
    name: fileName,
    size: stats.size,
    extension: extension,
  };
}

/**
 * Generate S3 key for a file
 */
function generateS3Key(file, s3Prefix) {
  let s3Key = s3Prefix;
  
  // Ensure prefix ends with slash if it's not empty
  if (s3Key && !s3Key.endsWith('/')) {
    s3Key += '/';
  }
  
  // Just use the filename
  s3Key += file.name;
  
  return s3Key;
}

/**
 * Upload a single file to S3
 */
async function uploadSingleFile(s3Service, file, s3Key, metadata, stats) {
  try {
    console.log(`📤 Uploading: ${file.name} → ${s3Key}`);
    console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
    
    const fileMetadata = {
      ...metadata,
      "original-path": file.fullPath,
      "file-size": file.size.toString(),
      "file-extension": file.extension,
    };
    
    const result = await s3Service.uploadFile(file.fullPath, s3Key, fileMetadata);
    
    if (result.success) {
      console.log(`   ✅ Success: ${result.location}`);
      console.log(`   ETag: ${result.etag}`);
      stats.addSuccess(file.size, result);
      
      return {
        success: true,
        file: file.name,
        s3Key: result.key,
        location: result.location,
        etag: result.etag,
        size: file.size,
      };
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
      stats.addFailure(new Error(result.error));
      return {
        success: false,
        file: file.name,
        error: result.error,
      };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    stats.addFailure(error);
    return {
      success: false,
      file: file.name,
      error: error.message,
    };
  }
}

/**
 * Print upload report
 */
function printUploadReport(stats, result) {
  const report = stats.generateReport();
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 UPLOAD REPORT");
  console.log("=".repeat(50));
  
  if (report.success) {
    console.log("\n✅ UPLOAD SUCCESSFUL:");
    console.log(`   File: ${result.file}`);
    console.log(`   S3 Key: ${result.s3Key}`);
    console.log(`   Location: ${result.location}`);
    console.log(`   Size: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`   ETag: ${result.etag}`);
    
    console.log("\n⚡ PERFORMANCE:");
    console.log(`   Upload Time: ${report.elapsedTime.toFixed(2)} seconds`);
    console.log(`   Average Speed: ${report.averageSpeedMB.toFixed(2)} MB/s`);
    
    console.log("\n🎉 File uploaded successfully!");
  } else {
    console.log("\n❌ UPLOAD FAILED:");
    console.log(`   Error: ${report.error}`);
    console.log(`   Duration: ${report.elapsedTime.toFixed(2)} seconds`);
  }
  
  console.log("=".repeat(50));
}

/**
 * Main single file upload function
 */
async function performSingleFileUpload(filePath) {
  const stats = new UploadStats();
  const s3Prefix = UPLOAD_CONFIG.defaultS3Prefix;
  
  try {
    console.log("🚀 Single File Upload to S3");
    console.log("=" .repeat(40));
    console.log(`� File: ${filePath}`);
    console.log(`🗂️  S3 Prefix: ${s3Prefix || '(root)'}`);
    console.log("");
    
    // Validate the file
    console.log("🔍 Validating file...");
    const file = validateFile(filePath);
    console.log(`✅ File validated: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    
    // Initialize S3 service
    console.log("🔧 Initializing S3 service...");
    const s3Service = new S3Service();
    console.log("✅ S3 service initialized");
    
    // Generate S3 key
    const s3Key = generateS3Key(file, s3Prefix);
    console.log(`� S3 Key: ${s3Key}`);
    console.log("");
    
    // Perform upload
    const result = await uploadSingleFile(s3Service, file, s3Key, UPLOAD_CONFIG.metadata, stats);
    
    // Print final report
    printUploadReport(stats, result);
    
    return stats.generateReport();
    
  } catch (error) {
    console.error("💥 File upload failed:", error.message);
    stats.addFailure(error);
    const report = stats.generateReport();
    printUploadReport(stats, { success: false, error: error.message });
    throw error;
  }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    throw new Error("File path is required. Use --help for usage information.");
  }
  
  const filePath = path.resolve(args[0]);
  
  return { filePath };
}

/**
 * Print usage information
 */
function printUsage() {
  console.log("📖 Single File Upload Client");
  console.log("Usage: node scripts/client_upload.js <file_path>");
  console.log("");
  console.log("Arguments:");
  console.log("  file_path  Local file to upload (required)");
  console.log("");
  console.log("Examples:");
  console.log("  node scripts/client_upload.js ./temp/document.pdf");
  console.log("  node scripts/client_upload.js ./assets/video.mp4");
  console.log("");
  console.log("Configuration:");
  console.log(`  S3 Prefix: ${UPLOAD_CONFIG.defaultS3Prefix}`);
  console.log(`  Excluded Extensions: ${UPLOAD_CONFIG.excludeExtensions.join(', ') || 'None'}`);
  console.log(`  Max File Size: ${UPLOAD_CONFIG.maxFileSize || 'No limit'}`);
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Handle help argument
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      printUsage();
      return;
    }
    
    const { filePath } = parseArguments();
    
    console.log("🔍 Checking dependencies...");
    
    // Verify S3Service is available
    try {
      const S3ServiceModule = await import("../src/utils/s3-service.js");
      console.log("✅ S3Service module available");
    } catch (error) {
      console.error("❌ S3Service module not found:", error.message);
      console.log("💡 Make sure the file exists at: src/utils/s3-service.js");
      process.exit(1);
    }
    
    // Start single file upload
    await performSingleFileUpload(filePath);
    
  } catch (error) {
    console.error("💥 Script execution failed:", error.message);
    process.exit(1);
  }
}

// Run the script if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  performSingleFileUpload,
  validateFile,
  generateS3Key,
  uploadSingleFile,
  UploadStats,
  UPLOAD_CONFIG,
};

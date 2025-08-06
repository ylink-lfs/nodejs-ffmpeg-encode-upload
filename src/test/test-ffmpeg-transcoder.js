import VideoTranscoder from "../workers/video-transcode-worker.js";
import { createTranscodingConfig } from "../utils/ffmpeg-utils.js";
import fs from "fs";
import path from "path";

/**
 * Test script for Video Transcoder
 * This script demonstrates how to use the video transcoding worker module
 */

async function createTestVideo() {
  const testVideoPath = "../../temp/sample.mp4";

  if (fs.existsSync(testVideoPath)) {
    console.log("✅ Test video already exists");
    return testVideoPath;
  }

  console.log("🎬 Creating test video with FFmpeg...");

  // Create a simple test video using FFmpeg
  const { spawn } = await import("child_process");

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=10:size=1920x1080:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1000:duration=10",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-y",
      testVideoPath,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Test video created successfully");
        resolve(testVideoPath);
      } else {
        reject(new Error(`Failed to create test video: ${code}`));
      }
    });

    ffmpeg.on("error", (error) => {
      reject(new Error(`FFmpeg error: ${error.message}`));
    });
  });
}

async function testBasicTranscoding() {
  console.log("\n🧪 Testing Basic Video Transcoding...\n");

  const transcoder = new VideoTranscoder({
    tempDir: "../../temp",
  });

  try {
    // Create or use existing test video
    const inputPath = await createTestVideo();

    // Test 1: Get video metadata
    console.log("📊 Getting video metadata...");
    const metadata = await transcoder.getVideoMetadata(inputPath);
    console.log("Metadata:", JSON.stringify(metadata, null, 2));

    // Test 2: Simple transcoding to 720p
    console.log("\n🔄 Test 2: Basic 720p transcoding...");
    const basicConfig = createTranscodingConfig({
      input: { path: inputPath },
      quality: "720p30av1",
    });
    const result1 = await transcoder.transcodeVideo(
      basicConfig.input,
      basicConfig.output,
      (progress) => {
        if (progress.currentTime) {
          console.log(
            `⏳ Progress: ${progress.currentTime.toFixed(1)}s | FPS: ${
              progress.fps || "N/A"
            }`
          );
        }
      }
    );

    console.log(
      "Basic transcoding result:",
      result1.success ? "✅ Success" : "❌ Failed"
    );
    if (result1.success) {
      console.log(
        `📁 Output: ${result1.output.path} (${(
          result1.output.size /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );
    }

    return result1.success;
  } catch (error) {
    console.error("❌ Basic transcoding test failed:", error.message);
    return false;
  }
}

async function testAdvancedFeatures() {
  console.log("\n🧪 Testing Advanced Features...\n");

  const transcoder = new VideoTranscoder({
    tempDir: "../../temp",
  });

  try {
    const inputPath = await createTestVideo();

    // Test 4: Custom filters and advanced options
    console.log("🔄 Test 4: Advanced transcoding with filters...");

    const advancedConfig = createTranscodingConfig({
      input: { path: inputPath },
      quality: "720p30av1",
      videoCodec: "av1",
      filters: {
        scale: {
          width: 854,
          height: 480,
        },
        fps: 24,
      },
      advanced: {
        crf: 50,
        preset: "11",
        additionalArgs: ["-vsync", "0"],
      },
    });
    const result = await transcoder.transcodeVideo(
      advancedConfig.input,
      advancedConfig.output,
      (progress) => {
        if (progress.currentTime) {
          console.log(
            `⏳ Advanced encoding: ${progress.currentTime.toFixed(
              1
            )}s | Bitrate: ${progress.bitrate || "N/A"} kbps`
          );
        }
      }
    );

    console.log(
      "Advanced transcoding result:",
      result.success ? "✅ Success" : "❌ Failed"
    );
    if (result.success) {
      console.log(`📁 Output: ${result.output.path}`);
      console.log(`⚙️ Command: ${result.metric.command}`);
    }

    return result.success;
  } catch (error) {
    console.error("❌ Advanced features test failed:", error.stack);
    return false;
  }
}

async function testErrorHandling() {
  console.log("\n🧪 Testing Error Handling...\n");

  const transcoder = new VideoTranscoder();

  try {
    // Test 5: Invalid input file
    console.log("🔄 Test 5: Error handling with invalid input...");

    const result = await transcoder.transcodeVideo(
      { path: "./non-existent-file.mp4" },
      { width: 720, height: 480, format: "mp4" }
    );

    console.log(
      "Error handling result:",
      result.success ? "❌ Should have failed" : "✅ Correctly failed"
    );
    if (!result.success) {
      console.log(`📝 Error message: ${result.error}`);
    }

    return !result.success; // Success means it correctly handled the error
  } catch (error) {
    console.error("❌ Error handling test failed:", error.message);
    return false;
  }
}

async function runTests() {
  console.log("🎬 Video Transcoder Test Suite\n");
  console.log("=====================================\n");

  const tests = [
    { name: "Basic Transcoding", fn: testBasicTranscoding },
    { name: "Advanced Features", fn: testAdvancedFeatures },
    { name: "Error Handling", fn: testErrorHandling },
  ];

  const results = [];

  for (const test of tests) {
    try {
      const success = await test.fn();
      results.push({ name: test.name, success });
    } catch (error) {
      console.error(`❌ Test "${test.name}" crashed:`, error.stack);
      results.push({ name: test.name, success: false });
    }
  }

  // Summary
  console.log("\n📊 Test Results Summary");
  console.log("=====================================");

  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.name}`);
  });

  const passedTests = results.filter((r) => r.success).length;
  console.log(`\n🎯 Overall: ${passedTests}/${results.length} tests passed`);

  if (passedTests === results.length) {
    console.log(
      "🎉 All tests passed! The video transcoder is working correctly."
    );
  } else {
    console.log("⚠️ Some tests failed. Please check the error messages above.");
  }

  // Cleanup test files
  console.log("\n🧹 Cleaning up test files...");
  try {
    const tempFiles = fs
      .readdirSync("./temp")
      .map((file) => path.join("./temp", file));
    for (const file of tempFiles) {
      if (file.endsWith(".mp4") || file.endsWith(".webm")) {
        fs.unlinkSync(file);
        console.log(`🗑️ Removed: ${file}`);
      }
    }
  } catch (error) {
    console.warn("⚠️ Cleanup warning:", error.message);
  }
}

// Check if FFmpeg is available
async function checkFFmpeg() {
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"]);

    ffmpeg.on("close", (code) => {
      resolve(code === 0);
    });

    ffmpeg.on("error", () => {
      resolve(false);
    });
  });
}

// Main execution
async function main() {
  console.log("🔍 Checking FFmpeg availability...");

  const ffmpegAvailable = await checkFFmpeg();

  if (!ffmpegAvailable) {
    console.error(
      "❌ FFmpeg is not available. Please install FFmpeg to run these tests."
    );
    console.log("📥 Install FFmpeg:");
    console.log("   macOS: brew install ffmpeg");
    console.log("   Ubuntu: sudo apt install ffmpeg");
    console.log("   Windows: Download from https://ffmpeg.org/download.html");
    process.exit(1);
  }

  console.log("✅ FFmpeg is available\n");

  await runTests();
}

main().catch((error) => {
  console.error("💥 Test suite crashed:", error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * End-to-End Testing Script for Node.js FFmpeg Encode Upload
 * 
 * This script orchestrates a complete end-to-end test of the system:
 * 0. Installs dependencies automatically (npm install)
 * 1. Verifies prerequisites (devDependencies, FFmpeg)
 * 2. Prepares database (creates SQLite database)
 * 3. Starts s3rver mock S3 service
 * 4. Starts the HTTP server
 * 5. Creates test video files
 * 6. Tests the complete workflow (upload → transcode → verify)
 * 7. Cleans up resources
 * 
 * Usage:
 *   node scripts/e2e-test.js
 * 
 * Prerequisites:
 *   - Node.js 16+ installed
 *   - FFmpeg installed and available in PATH
 *   - Ports 3000 and 4568 available
 *   - Dependencies will be installed automatically
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { setTimeout } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test configuration
 */
const E2E_CONFIG = {
  server: {
    host: "127.0.0.1",
    port: 3000,
    url: "http://127.0.0.1:3000",
  },
  s3rver: {
    host: "127.0.0.1",
    port: 4568,
    dataDir: "/tmp/s3rver",
  },
  test: {
    videoFile: "e2e-test-video.mp4",
    tempDir: path.resolve(__dirname, "../temp"),
    maxWaitTime: 300000, // 5 minutes
    pollInterval: 2000, // 2 seconds
    resolutionPresets: ["720p30av1", "1080p30av1"],
    expectedTranscodedVideoPath: [
      "uploads/e2e-test-video_720p30av1.mp4",
      "uploads/e2e-test-video_1080p30av1.mp4",
    ],
  },
};

/**
 * Global process tracking
 */
const processes = {
  s3rver: null,
  server: null
};

/**
 * Test statistics
 */
class E2EStats {
  constructor() {
    this.startTime = Date.now();
    this.tests = {
      dependencies: { passed: 0, failed: 0 },
      prerequisites: { passed: 0, failed: 0 },
      database: { passed: 0, failed: 0 },
      services: { passed: 0, failed: 0 },
      video: { passed: 0, failed: 0 },
      upload: { passed: 0, failed: 0 },
      transcode: { passed: 0, failed: 0 },
      validation: { passed: 0, failed: 0 },
      cleanup: { passed: 0, failed: 0 }
    };
    this.errors = [];
  }

  addSuccess(category) {
    this.tests[category].passed++;
  }

  addFailure(category, error) {
    this.tests[category].failed++;
    this.errors.push({ category, error: error.message, timestamp: new Date().toISOString() });
  }

  getElapsedTime() {
    return (Date.now() - this.startTime) / 1000;
  }

  generateReport() {
    const totalPassed = Object.values(this.tests).reduce((sum, test) => sum + test.passed, 0);
    const totalFailed = Object.values(this.tests).reduce((sum, test) => sum + test.failed, 0);
    const total = totalPassed + totalFailed;
    
    return {
      duration: this.getElapsedTime(),
      total,
      passed: totalPassed,
      failed: totalFailed,
      successRate: total > 0 ? (totalPassed / total) * 100 : 0,
      tests: this.tests,
      errors: this.errors
    };
  }
}

/**
 * Colored console output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Step 0: Install Dependencies
 */
async function installDependencies(stats) {
  console.log('\n� Step 0: Installing Dependencies');
  console.log('=====================================');

  try {
    // Check if package.json exists
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }
    colorLog('green', '✅ package.json found');

    console.log("🔄 Running npm install...");
    await runNpmInstall();
    colorLog("green", "✅ Dependencies installed successfully");
    
    stats.addSuccess('dependencies');

  } catch (error) {
    colorLog('red', `❌ Dependency installation failed: ${error.message}`);
    stats.addFailure('dependencies', error);
    throw error;
  }
}

/**
 * Run npm install
 */
function runNpmInstall() {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(__dirname, '..');
    const npmProcess = spawn('npm', ['install'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    npmProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      // Show some progress
      if (data.toString().includes('added') || data.toString().includes('installed')) {
        process.stdout.write('.');
      }
    });

    npmProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    npmProcess.on('close', (code) => {
      console.log(''); // New line after progress dots
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}:\n${stderr}`));
      }
    });

    npmProcess.on('error', (error) => {
      reject(new Error(`npm install process error: ${error.message}`));
    });
  });
}

/**
 * Step 1: Check Prerequisites
 */
async function checkPrerequisites(stats) {
  console.log('\n🔍 Step 1: Checking Prerequisites');
  console.log('=====================================');

  try {
    // Dependencies should already be installed from Step 0
    const nodeModulesPath = path.resolve(__dirname, "../node_modules");
    if (!fs.existsSync(nodeModulesPath)) {
      throw new Error('Dependencies installation failed - node_modules not found');
    }
    colorLog('green', '✅ Dependencies verified');
    stats.addSuccess('prerequisites');

    // Check port availability
    await checkPortAvailability(E2E_CONFIG.server.port);
    colorLog('green', '✅ Required ports available');
    stats.addSuccess('prerequisites');

    // Ensure temp directory exists
    if (!fs.existsSync(E2E_CONFIG.test.tempDir)) {
      fs.mkdirSync(E2E_CONFIG.test.tempDir, { recursive: true });
    }
    if (!fs.existsSync("/tmp/s3rver/test-bucket")) {
      fs.mkdirSync("/tmp/s3rver/test-bucket", { recursive: true });
    }
    if (!fs.existsSync("/tmp/s3rver/test-bucket.localhost")) {
      fs.mkdirSync("/tmp/s3rver/test-bucket.localhost", { recursive: true });
    }
    colorLog('green', '✅ Temp directory ready');
    stats.addSuccess('prerequisites');

    // Check FFmpeg executable
    console.log('🔧 Checking FFmpeg availability...');
    try {
      await new Promise((resolve, reject) => {
        const ffmpegProcess = spawn("ffmpeg", ["-h", "encoder=libsvtav1"], {
          stdio: "pipe",
        });

        let stdout = '';
        let stderr = '';

        ffmpegProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        ffmpegProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ffmpegProcess.on('close', (code) => {
          const output = stdout + stderr;
          if (output.includes('SVT-AV1')) {
            resolve();
          } else {
            reject(new Error('ffmpeg found but SVT-AV1 encoder not available'));
          }
        });

        ffmpegProcess.on('error', (error) => {
          if (error.code === 'ENOENT') {
            reject(new Error('ffmpeg not found in PATH'));
          } else {
            reject(new Error(`ffmpeg check failed: ${error.message}`));
          }
        });
      });
      colorLog('green', '✅ FFmpeg executable found with SVT-AV1 support');
      stats.addSuccess('prerequisites');
    } catch (error) {
      throw new Error(`FFmpeg check failed: ${error.message}`);
    }

    // Check ffprobe executable
    console.log('🔧 Checking ffprobe availability...');
    try {
      await new Promise((resolve, reject) => {
        const ffprobeProcess = spawn('ffprobe', ['--help'], {
          stdio: 'pipe'
        });

        ffprobeProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error('ffprobe not found in PATH or not working properly'));
          }
        });

        ffprobeProcess.on('error', (error) => {
          if (error.code === 'ENOENT') {
            reject(new Error('ffprobe not found in PATH'));
          } else {
            reject(new Error(`ffprobe check failed: ${error.message}`));
          }
        });
      });
      colorLog('green', '✅ ffprobe executable found');
      stats.addSuccess('prerequisites');
    } catch (error) {
      throw new Error(`ffprobe check failed: ${error.message}`);
    }

  } catch (error) {
    colorLog('red', `❌ Prerequisites check failed: ${error.message}`);
    stats.addFailure('prerequisites', error);
    throw error;
  }
}

/**
 * Check if port is available
 */
function checkPortAvailability(port) {
  return new Promise((resolve, reject) => {
    import('net').then(({ createServer }) => {
      const server = createServer();
      
      server.listen(port, (err) => {
        if (err) {
          reject(new Error(`Port ${port} is already in use`));
        } else {
          server.close(() => resolve());
        }
      });
    }).catch(reject);
  });
}

/**
 * Step 2: Prepare Database
 */
async function prepareDatabase(stats) {
  console.log('\n🗄️ Step 2: Preparing Database');
  console.log('=====================================');

  try {
    console.log('📦 Creating SQLite database...');
    await createSQLiteDatabase();
    colorLog('green', '✅ SQLite database created successfully');
    stats.addSuccess('database');

  } catch (error) {
    colorLog('red', `❌ Database preparation failed: ${error.message}`);
    stats.addFailure('database', error);
    throw error;
  }
}

/**
 * Create SQLite database using create-sqlite-db.sh script
 */
function createSQLiteDatabase() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, './create-sqlite-db.sh');

    const dbProcess = spawn('bash', [scriptPath], {
      stdio: 'pipe',
      cwd: path.resolve(__dirname, '..'), // Run from project root
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    dbProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    dbProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    dbProcess.on('close', (code) => {
      if (code === 0) {
        // Verify database file was created
        const dbPath = path.resolve(__dirname, '/tmp/database.sqlite');
        if (fs.existsSync(dbPath)) {
          resolve();
        } else {
          reject(new Error('Database file was not created'));
        }
      } else {
        reject(new Error(`Database creation script failed with code ${code}: ${stderr}`));
      }
    });

    dbProcess.on('error', (error) => {
      reject(new Error(`Database creation script error: ${error.message}`));
    });
  });
}

/**
 * Step 4: Start Services
 */
async function startServices(stats) {
  console.log('\n🚀 Step 4: Starting Services');
  console.log('=====================================');

  try {
    // Start s3rver mock S3 service
    console.log('📦 Starting s3rver...');
    await startS3rver();
    colorLog('green', '✅ s3rver started successfully');
    stats.addSuccess('services');

    // Wait a moment for s3rver to be ready
    await setTimeout(2000);

    // Start HTTP server
    console.log('🌐 Starting HTTP server...');
    await startHTTPServer();
    colorLog('green', '✅ HTTP server started successfully');
    stats.addSuccess('services');

    // Wait for server to be ready
    await setTimeout(3000);

    // Verify services are responding
    await verifyServices();
    colorLog('green', '✅ Services verification passed');
    stats.addSuccess('services');

  } catch (error) {
    colorLog('red', `❌ Service startup failed: ${error.message}`);
    stats.addFailure('services', error);
    throw error;
  }
}

/**
 * Start s3rver mock S3 service
 */
function startS3rver() {
  return new Promise((resolve, reject) => {
    const s3rverPath = path.resolve(__dirname, '../node_modules/.bin/s3rver');
    
    processes.s3rver = spawn('node', [
      s3rverPath,
      '-a', E2E_CONFIG.s3rver.host,
      '-d', E2E_CONFIG.s3rver.dataDir,
      '--configure-bucket', 'test-bucket'
    ], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let output = '';
    
    processes.s3rver.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('S3rver listening')) {
        resolve();
      }
    });

    processes.s3rver.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('EADDRINUSE')) {
        reject(new Error(`s3rver port already in use`));
      }
    });

    processes.s3rver.on('error', (error) => {
      reject(new Error(`Failed to start s3rver: ${error.message}`));
    });

    processes.s3rver.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`s3rver exited with code ${code}`));
      }
    });

    // Timeout after 3 seconds
    setTimeout(3000, () => {
      if (!processes.s3rver.killed) {
        reject(new Error('s3rver startup timeout'));
      }
    });
  });
}

/**
 * Start HTTP server
 */
function startHTTPServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.resolve(__dirname, '../src/main.js');
    
    processes.server = spawn('node', [serverPath], {
      stdio: 'pipe',
    });

    let output = '';
    
    processes.server.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Server running on')) {
        resolve();
      }
    });

    processes.server.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('EADDRINUSE')) {
        reject(new Error(`HTTP server port ${E2E_CONFIG.server.port} already in use`));
      }
    });

    processes.server.on('error', (error) => {
      reject(new Error(`Failed to start HTTP server: ${error.message}`));
    });

    processes.server.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`HTTP server exited with code ${code}`));
      }
    });

    // Timeout after 3 seconds
    setTimeout(3000, () => {
      if (!processes.server.killed) {
        reject(new Error('HTTP server startup timeout'));
      }
    });
  });
}

/**
 * Verify services are responding
 */
async function verifyServices() {
  // Test HTTP server
  const response = await fetch(`${E2E_CONFIG.server.url}/`);
  if (!response.ok) {
    throw new Error('HTTP server not responding correctly');
  }

  // Test s3rver (simple connection test)
  const s3Response = await fetch(`http://${E2E_CONFIG.s3rver.host}:${E2E_CONFIG.s3rver.port}/`);
  // s3rver might return 404 for root, but that means it's running
  if (s3Response.status !== 404 && !s3Response.ok) {
    throw new Error('s3rver not responding correctly');
  }
}

/**
 * Step 3: Create Test Video Files
 */
async function createTestVideos(stats) {
  console.log('\n🎬 Step 3: Creating Test Video Files');
  console.log('=====================================');

  try {
    const videoPath = path.join(E2E_CONFIG.test.tempDir, E2E_CONFIG.test.videoFile);
    
    // Remove existing test video if it exists
    if (fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    console.log('📹 Generating test video with FFmpeg...');
    await createTestVideo(videoPath);
    
    // Verify video file was created
    if (!fs.existsSync(videoPath)) {
      throw new Error('Test video file was not created');
    }

    const stats_file = fs.statSync(videoPath);
    colorLog('green', `✅ Test video created: ${videoPath}`);
    colorLog('green', `📊 Video size: ${(stats_file.size / 1024 / 1024).toFixed(2)} MB`);
    stats.addSuccess('video');

  } catch (error) {
    colorLog('red', `❌ Video creation failed: ${error.message}`);
    stats.addFailure('video', error);
    throw error;
  }
}

/**
 * Create test video using FFmpeg
 */
function createTestVideo(outputPath) {
  return new Promise((resolve, reject) => {
    console.log(
      "🔧 FFmpeg command: Creating 10-second 2560x1440 test video..."
    );
    
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'lavfi',
      '-i', 'testsrc=duration=10:size=2560x1440:rate=60',
      '-f', 'lavfi', 
      '-i', 'sine=frequency=1000:duration=10',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '50',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath
    ], {
      stdio: 'pipe'
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (error) => {
      reject(new Error(`FFmpeg error: ${error.message}`));
    });
  });
}

/**
 * Step 5: Test Upload Workflow
 */
async function testUploadWorkflow(stats) {
  console.log('\n📤 Step 5: Testing Upload Workflow');
  console.log('=====================================');

  try {
    const videoPath = path.join(E2E_CONFIG.test.tempDir, E2E_CONFIG.test.videoFile);
    
    // Use the client upload script to upload the test video
    console.log('📤 Uploading test video to S3...');
    const uploadResult = await uploadTestVideo(videoPath);
    
    colorLog('green', `✅ Video uploaded successfully: ${uploadResult.s3Key}`);
    stats.addSuccess('upload');

    return uploadResult;

  } catch (error) {
    colorLog('red', `❌ Upload workflow failed: ${error.message}`);
    stats.addFailure('upload', error);
    throw error;
  }
}

/**
 * Upload test video using client upload script
 */
function uploadTestVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const uploadScriptPath = path.resolve(__dirname, './client_upload.js');
    
    const uploadProcess = spawn('node', [uploadScriptPath, videoPath], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    uploadProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    uploadProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    uploadProcess.on('close', (code) => {
      if (code === 0) {
        // Parse output to extract S3 key
        const s3KeyMatch = stdout.match(/S3 Key:\s*([^\s\n]+)/);
        if (s3KeyMatch) {
          resolve({ s3Key: s3KeyMatch[1] });
        } else {
          reject(new Error('Could not extract S3 key from upload output'));
        }
      } else {
        reject(new Error(`Upload script failed with code ${code}: ${stderr}`));
      }
    });

    uploadProcess.on('error', (error) => {
      reject(new Error(`Upload script error: ${error.message}`));
    });
  });
}

/**
 * Step 6: Test Transcoding Workflow
 */
async function testTranscodingWorkflow(uploadResult, stats) {
  console.log('\n🔄 Step 6: Testing Transcoding Workflow');
  console.log('=====================================');

  const transcodeResults = [];

  try {
    for (const preset of E2E_CONFIG.test.resolutionPresets) {
      console.log(`🎯 Testing transcode with preset: ${preset}`);
      
      const result = await testSingleTranscode(uploadResult.s3Key, preset);
      transcodeResults.push(result);
      
      colorLog('green', `✅ Transcode ${preset} completed successfully`);
      stats.addSuccess('transcode');
    }

    return transcodeResults;

  } catch (error) {
    colorLog('red', `❌ Transcoding workflow failed: ${error.message}`);
    stats.addFailure('transcode', error);
    throw error;
  }
}

/**
 * Test single transcode operation
 */
async function testSingleTranscode(s3Key, resolutionPreset) {
  // Start transcode job
  const response = await fetch(`${E2E_CONFIG.server.url}/api/video/transcode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      s3Key: s3Key,
      resolutionPreset: resolutionPreset
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Transcode request failed: ${errorData.message}`);
  }

  const transcodeResult = await response.json();
  const jobId = transcodeResult.jobId;

  console.log(`🔄 Transcode job started: ${jobId}`);
  console.log(`📊 Polling job status...`);

  // Poll job status until completion
  const jobResult = await pollJobStatus(jobId);
  
  return {
    preset: resolutionPreset,
    jobId: jobId,
    result: jobResult
  };
}

/**
 * Poll job status until completion
 */
async function pollJobStatus(jobId) {
  const maxAttempts = Math.floor(E2E_CONFIG.test.maxWaitTime / E2E_CONFIG.test.pollInterval);
  let attempts = 0;

  while (attempts < maxAttempts) {
    await setTimeout(E2E_CONFIG.test.pollInterval);
    
    const response = await fetch(`${E2E_CONFIG.server.url}/api/video/jobs/${jobId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const jobData = await response.json();
    console.log(`📊 Job ${jobId} state: ${jobData.state} (attempt ${attempts + 1})`);

    if (jobData.state === 'completed') {
      return jobData;
    } else if (jobData.state === 'failed') {
      throw new Error(`Job failed: ${JSON.stringify(jobData)}`);
    }

    attempts++;
  }

  throw new Error(`Job timeout: Job did not complete within ${E2E_CONFIG.test.maxWaitTime}ms`);
}

/**
 * Step 7: Download and Validate Transcoded Videos
 */
async function downloadAndValidateVideos(transcodeResults, stats) {
  console.log('\n📥 Step 7: Downloading and Validating Transcoded Videos');
  console.log('========================================================');

  const validationResults = [];

  try {
    for (let i = 0; i < E2E_CONFIG.test.expectedTranscodedVideoPath.length; i++) {
      const s3Key = E2E_CONFIG.test.expectedTranscodedVideoPath[i];
      const preset = E2E_CONFIG.test.resolutionPresets[i];
      
      console.log(`📥 Downloading transcoded video: ${s3Key}`);
      
      // Download video from S3
      const downloadPath = path.join(E2E_CONFIG.test.tempDir, `downloaded_${s3Key}`);
      await downloadVideoFromS3(s3Key, downloadPath);
      
      colorLog('green', `✅ Downloaded: ${s3Key}`);
      stats.addSuccess('validation');

      // Validate video properties using ffprobe
      console.log(`🔍 Validating video properties for ${preset}...`);
      const videoInfo = await getVideoInfo(downloadPath);
      
      // Validate based on preset
      const validation = validateVideoProperties(videoInfo, preset, s3Key);
      
      if (validation.isValid) {
        colorLog('green', `✅ Video validation passed for ${preset}`);
        colorLog('green', `   📊 Resolution: ${videoInfo.width}x${videoInfo.height}`);
        colorLog('green', `   🎬 Codec: ${videoInfo.codec}`);
        stats.addSuccess('validation');
      } else {
        throw new Error(`Video validation failed for ${preset}: ${validation.errors.join(', ')}`);
      }

      validationResults.push({
        s3Key,
        preset,
        downloadPath,
        videoInfo,
        validation
      });
    }

    return validationResults;

  } catch (error) {
    colorLog('red', `❌ Video validation failed: ${error.message}`);
    stats.addFailure('validation', error);
    throw error;
  }
}

/**
 * Download video file from S3 using S3Service
 */
async function downloadVideoFromS3(s3Key, downloadPath) {
  // Import S3Service
  const S3Service = (await import('../src/utils/s3-service.js')).default;
  const s3Service = new S3Service();
  
  try {
    await s3Service.downloadFile(s3Key, downloadPath);
    
    // Verify file was downloaded and has content
    if (!fs.existsSync(downloadPath)) {
      throw new Error(`Downloaded file not found: ${downloadPath}`);
    }
    
    const fileStats = fs.statSync(downloadPath);
    if (fileStats.size === 0) {
      throw new Error(`Downloaded file is empty: ${downloadPath}`);
    }
    
    console.log(`📊 Downloaded file size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    throw new Error(`S3 download failed for ${s3Key}: ${error.message}`);
  }
}

/**
 * Get video information using ffprobe
 */
function getVideoInfo(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath
    ], {
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const probeData = JSON.parse(stdout);
          const videoStream = probeData.streams.find(stream => stream.codec_type === 'video');
          
          if (!videoStream) {
            reject(new Error('No video stream found in file'));
            return;
          }

          resolve({
            width: videoStream.width,
            height: videoStream.height,
            codec: videoStream.codec_name,
            duration: parseFloat(videoStream.duration || probeData.format.duration),
            bitrate: parseInt(videoStream.bit_rate || probeData.format.bit_rate),
            frameRate: eval(videoStream.r_frame_rate) // Convert fraction to decimal
          });
        } catch (error) {
          reject(new Error(`Failed to parse ffprobe output: ${error.message}`));
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}: ${stderr}`));
      }
    });

    ffprobe.on('error', (error) => {
      reject(new Error(`ffprobe error: ${error.message}`));
    });
  });
}

/**
 * Validate video properties against expected values for preset
 */
function validateVideoProperties(videoInfo, preset, s3Key) {
  const errors = [];
  let expectedWidth, expectedHeight, expectedCodec;

  // Define expected properties based on preset
  switch (preset) {
    case '720p30av1':
      expectedWidth = 1280;
      expectedHeight = 720;
      expectedCodec = 'av1';
      break;
    case '1080p30av1':
      expectedWidth = 1920;
      expectedHeight = 1080;
      expectedCodec = 'av1';
      break;
    default:
      errors.push(`Unknown preset: ${preset}`);
  }

  // Validate dimensions
  if (videoInfo.width !== expectedWidth) {
    errors.push(`Width mismatch: expected ${expectedWidth}, got ${videoInfo.width}`);
  }
  
  if (videoInfo.height !== expectedHeight) {
    errors.push(`Height mismatch: expected ${expectedHeight}, got ${videoInfo.height}`);
  }

  // Validate codec
  if (videoInfo.codec !== expectedCodec) {
    errors.push(`Codec mismatch: expected ${expectedCodec}, got ${videoInfo.codec}`);
  }

  // Validate duration (should be around 10 seconds from test video)
  if (videoInfo.duration < 9 || videoInfo.duration > 11) {
    errors.push(`Duration suspicious: expected ~10s, got ${videoInfo.duration}s`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    properties: videoInfo
  };
}

/**
 * Step 8: Cleanup Resources
 */
async function cleanup(stats) {
  console.log('\n🧹 Step 8: Cleaning Up Resources');
  console.log('=====================================');

  try {
    // Stop processes
    if (processes.server && !processes.server.killed) {
      console.log('🛑 Stopping HTTP server...');
      processes.server.kill('SIGTERM');
      await setTimeout(2000);
      if (!processes.server.killed) {
        processes.server.kill('SIGKILL');
      }
      colorLog('green', '✅ HTTP server stopped');
      stats.addSuccess('cleanup');
    }

    if (processes.s3rver && !processes.s3rver.killed) {
      console.log('🛑 Stopping s3rver...');
      processes.s3rver.kill('SIGTERM');
      await setTimeout(2000);
      if (!processes.s3rver.killed) {
        processes.s3rver.kill('SIGKILL');
      }
      colorLog('green', '✅ s3rver stopped');
      stats.addSuccess('cleanup');
    }

    // Clean up test files
    console.log('🗑️ Cleaning up test files...');
    fs.rmdirSync(E2E_CONFIG.test.tempDir, {
      recursive: true,
    });

    colorLog('green', '✅ Test files cleaned up');
    stats.addSuccess('cleanup');

  } catch (error) {
    colorLog('yellow', `⚠️ Cleanup warning: ${error.message}`);
    stats.addFailure('cleanup', error);
  }
}

/**
 * Generate and display final report
 */
function displayFinalReport(stats, results = {}) {
  const report = stats.generateReport();
  
  console.log('\n📊 End-to-End Test Report');
  console.log('==========================================');
  console.log(`🕒 Duration: ${report.duration.toFixed(2)} seconds`);
  console.log(`📈 Success Rate: ${report.successRate.toFixed(1)}%`);
  console.log(`✅ Passed: ${report.passed}`);
  console.log(`❌ Failed: ${report.failed}`);
  console.log(`📊 Total: ${report.total}`);
  
  console.log('\n📋 Test Categories:');
  Object.entries(report.tests).forEach(([category, test]) => {
    const total = test.passed + test.failed;
    const status = test.failed === 0 ? '✅' : '❌';
    console.log(`   ${status} ${category}: ${test.passed}/${total} passed`);
  });

  if (report.errors.length > 0) {
    console.log('\n❌ Errors:');
    report.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. [${error.category}] ${error.error}`);
    });
  }

  if (results.transcodes && results.transcodes.length > 0) {
    console.log('\n🎬 Transcode Results:');
    results.transcodes.forEach((transcode, index) => {
      console.log(`   ${index + 1}. ${transcode.preset}: ${transcode.result.state}`);
    });
  }

  if (results.validations && results.validations.length > 0) {
    console.log('\n✅ Validation Results:');
    results.validations.forEach((validation, index) => {
      console.log(`   ${index + 1}. ${validation.preset}: ${validation.validation.isValid ? 'PASSED' : 'FAILED'}`);
      console.log(`      📊 ${validation.videoInfo.width}x${validation.videoInfo.height}, ${validation.videoInfo.codec}`);
    });
  }

  console.log('\n' + '='.repeat(50));
  
  if (report.failed === 0) {
    colorLog('green', '🎉 All tests passed! End-to-end testing completed successfully.');
  } else {
    colorLog('red', '⚠️ Some tests failed. Please check the errors above.');
  }

  return report;
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown(stats) {
  const gracefulShutdown = async (signal) => {
    console.log(`\n⚠️ Received ${signal}. Initiating graceful shutdown...`);
    try {
      await cleanup(stats);
    } catch (error) {
      console.error('Error during shutdown:', error.message);
    }
    process.exit(1);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

/**
 * Main execution function
 */
async function main() {
  const stats = new E2EStats();
  const results = {};

  console.log('🚀 Node.js FFmpeg Encode Upload - End-to-End Test Suite');
  console.log('========================================================');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Config: Server=${E2E_CONFIG.server.url}, S3rver=${E2E_CONFIG.s3rver.host}:${E2E_CONFIG.s3rver.port}`);

  setupGracefulShutdown(stats);

  try {
    // Step 0: Install Dependencies
    await installDependencies(stats);

    // Step 1: Check Prerequisites
    await checkPrerequisites(stats);

    // Step 2: Prepare Database
    await prepareDatabase(stats);

    // Step 3: Create Test Videos
    await createTestVideos(stats);

    // Step 4: Start Services
    await startServices(stats);

    // Step 5: Test Upload Workflow
    results.upload = await testUploadWorkflow(stats);

    // Step 6: Test Transcoding Workflow
    results.transcodes = await testTranscodingWorkflow(results.upload, stats);

    // Step 7: Download and Validate Transcoded Videos
    results.validations = await downloadAndValidateVideos(results.transcodes, stats);

    colorLog("green", "\n🎉 All workflow tests completed successfully!");
  } catch (error) {
    colorLog('red', `\n💥 End-to-end testing failed: ${error.message}`);
  } finally {
    // Step 8: Cleanup
    await cleanup(stats);
    
    // Generate final report
    const report = displayFinalReport(stats, results);
    
    // Exit with appropriate code
    process.exit(report.failed === 0 ? 0 : 1);
  }
}

/**
 * Entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export {
  main,
  installDependencies,
  prepareDatabase,
  startServices,
  createTestVideos,
  testUploadWorkflow,
  testTranscodingWorkflow,
  downloadAndValidateVideos,
  cleanup,
  E2E_CONFIG
};

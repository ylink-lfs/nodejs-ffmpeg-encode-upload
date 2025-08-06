#!/usr/bin/env node

/**
 * Video Transcode Worker
 * Handles downloading, renaming, and re-uploading video files from S3
 * This is a simplified worker that doesn't do actual transcoding - just file renaming
 */

import S3Service from "../utils/s3-service.js";
import {
  QUALITY_TO_PRESETS,
  createTranscodingConfig,
  createFluentFFmpegIns,
} from "../utils/ffmpeg-utils.js";
import { ensureTempDirectory } from "../utils/utils.js";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "../config/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    throw new Error("Usage: node video-transcode-worker.js <job-id> <s3-key> <s3-key-output> <resolution-preset>");
  }
  const jobId = args[0];
  const s3Key = args[1];
  const outputS3Key = args[2];
  const resolutionPreset = args[3];
  
  return { jobId, s3Key, outputS3Key, resolutionPreset };
}

/**
 * Validate S3 key
 */
function validateS3Key(s3Key) {
  if (!s3Key || typeof s3Key !== 'string') {
    throw new Error('Invalid S3 key: must be a non-empty string');
  }
  
  if (s3Key.trim() === '') {
    throw new Error('Invalid S3 key: cannot be empty');
  }
}

/**
 * Validate resolution preset
 */
function validateResolutionPreset(preset) {
  if (!QUALITY_TO_PRESETS[preset]) {
    const available = Object.keys(QUALITY_TO_PRESETS).join(', ');
    throw new Error(`Invalid resolution preset: ${preset}. Available: ${available}`);
  }
}

/**
 * Call the job completion callback endpoint
 */
async function callJobCallback(jobId, result) {
  try {
    const callbackUrl = `http://${config.server.host}:${config.server.port}/api/video/jobs/${jobId}/callback`;
    console.log(`Calling callback: ${callbackUrl}`);
    
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result),
    });
    
    if (response.ok) {
      console.log(`Callback successful for job ${jobId}`);
    } else {
      const errorData = await response.text();
      console.error(`Callback failed for job ${jobId}: ${response.status} - ${errorData}`);
    }
  } catch (callbackError) {
    console.error(`Callback request failed for job ${jobId}:`, callbackError.message);
  }
}

/**
 * Main worker function
 */
async function processVideoFile(jobId, s3Key, outputS3Key, resolutionPreset) {
  console.log("Video Rename Worker Starting");
  console.log("=" .repeat(40));
  console.log(`Job ID: ${jobId}`);
  console.log(`Input S3 Key: ${s3Key}`);
  console.log(`Output S3 Key: ${outputS3Key}`);
  console.log(`ResolutionPreset: ${resolutionPreset}`);
  console.log("");
  
  const tempDir = path.join(__dirname, "../../temp");
  ensureTempDirectory(tempDir);
  
  const s3Service = new S3Service();
  const t1 = performance.now();
  
  try {
    // Generate paths
    const originalFilename = path.basename(s3Key);
    const tempInputPath = path.join(
      tempDir,
      `input_${Date.now()}_${originalFilename}`
    );
    const tempOutputPath = path.join(
      tempDir,
      `output_${Date.now()}_${originalFilename}`
    );

    console.log("Downloading original file from S3...");

    // Download the original file from S3
    const downloadResult = await s3Service.downloadFile(s3Key, tempInputPath);
    console.log(
      `Downloaded: ${downloadResult.key} (${downloadResult.contentLength} bytes)`
    );

    console.log("Processing file (transcoding)...");

    // Create transcoding configuration
    const transcodingConfig = createTranscodingConfig({
      input: { path: tempInputPath },
      quality: resolutionPreset,
    });

    // Initialize video transcoder
    const transcoder = new VideoTranscoder({
      tempDir: tempDir,
    });

    // Get input metadata
    const metadata = await transcoder.getVideoMetadata(transcodingConfig.input.path);
    console.log(`Input metadata:`, {
      duration: `${metadata.duration}s`,
      resolution: `${metadata.video?.width}x${metadata.video?.height}`,
      framerate: `${metadata.video?.framerate}fps`,
      codec: metadata.video?.codec,
    });

    // Perform actual transcoding
    const transcodingResult = await transcoder.transcodeVideo(
      transcodingConfig.input,
      { ...transcodingConfig.output, path: tempOutputPath },
      (progress) => {
        if (progress.currentTime) {
          console.log(
            `Transcoding progress: ${progress.currentTime.toFixed(
              1
            )}s | FPS: ${progress.fps || "N/A"}`
          );
        }
      }
    );

    if (!transcodingResult.success) {
      throw new Error(`Transcoding failed: ${transcodingResult.error}`);
    }

    console.log("File transcoding completed");

    // Generate new S3 key for the "transcoded" file
    const newS3Key = outputS3Key;
    console.log(`New S3 Key: ${newS3Key}`);

    // Prepare metadata for the new file
    const newMetadata = {
      "original-s3-key": s3Key,
      "resolution-preset": resolutionPreset,
      "processed-timestamp": new Date().toISOString(),
      worker: "video-transcode-worker",
    };

    console.log("Uploading processed file to S3...");

    // Upload the "transcoded" file back to S3
    const uploadResult = await s3Service.uploadFile(
      tempOutputPath,
      newS3Key,
      newMetadata
    );

    console.log(`Upload completed: ${uploadResult.location}`);
    console.log(`   ETag: ${uploadResult.etag}`);

    // Clean up temporary files
    console.log("Cleaning up temporary files...");
    if (fs.existsSync(tempInputPath)) {
      fs.unlinkSync(tempInputPath);
    }
    if (fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath);
    }
    console.log("Cleanup completed");

    const t2 = performance.now();

    // Return the result
    const result = {
      success: true,
      detail: {
        inputS3Key: s3Key,
        outputS3Key: outputS3Key,
        quality: resolutionPreset,
        jobId: jobId,
        jobDuration: (t2 - t1).toFixed(2) + " ms",
        command: transcodingResult.metric?.command || "transcoding command",
        errorStack: "",
      },
    };

    console.log("\n" + "=".repeat(50));
    console.log("VIDEO PROCESSING COMPLETED");
    console.log("=".repeat(50));
    console.log(`Input: ${result.detail.inputS3Key}`);
    console.log(`Output: ${result.detail.outputS3Key}`);
    console.log("=".repeat(50));

    // Call the completion callback
    await callJobCallback(jobId, result);

    // Also output the result as JSON for backward compatibility
    console.log("RESULT_JSON:", JSON.stringify(result));

    return result;
  } catch (error) {
    console.error("Worker failed:", error.message);
    
    // Clean up temporary files on error
    const tempInputPath = path.join(tempDir, `input_${Date.now()}_${path.basename(s3Key)}`);
    const tempOutputPath = path.join(tempDir, `output_${Date.now()}_${path.basename(s3Key)}`);
    
    [tempInputPath, tempOutputPath].forEach(file => {
      if (fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch (cleanupError) {
          console.error(`Failed to cleanup ${file}:`, cleanupError.message);
        }
      }
    });

    const errorResult = {
      success: false,
      detail: {
        inputS3Key: s3Key,
        outputS3Key: outputS3Key,
        quality: resolutionPreset,
        jobId: jobId,
        jobDuration: (performance.now() - t1).toFixed(2) + " ms",
        command: "transcoding error command",
        errorStack: error.stack,
      },
    };
    
    // Call the failure callback
    await callJobCallback(jobId, errorResult);
    
    // Also output the error result as JSON for backward compatibility
    console.log("RESULT_JSON:", JSON.stringify(errorResult));
    
    throw error;
  }
}

/**
 * Video Transcoding Worker Module
 * Handles video transcoding using FFmpeg
 */
class VideoTranscoder {
  constructor(options = {}) {
    this.ffmpegPath = options.ffmpegPath || "ffmpeg";
    this.ffprobePath = options.ffprobePath || "ffprobe";
    this.tempDir = options.tempDir || "./temp";
    this.outputFormats = options.outputFormats || ["mp4", "webm"];
    this.defaultPresets = QUALITY_TO_PRESETS;

    // Configure fluent-ffmpeg with custom paths if provided
    if (options.ffmpegPath) {
      ffmpeg.setFfmpegPath(options.ffmpegPath);
    }
    if (options.ffprobePath) {
      ffmpeg.setFfprobePath(options.ffprobePath);
    }

    ensureTempDirectory(this.tempDir);
  }

  /**
   * Get video metadata using ffprobe via fluent-ffmpeg
   * @param {string} inputPath - Path to input video file
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoMetadata(inputPath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input file does not exist: ${inputPath}`));
      }

      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          return reject(new Error(`ffprobe failed: ${error.message}`));
        }

        try {
          const videoStream = metadata.streams.find(
            (stream) => stream.codec_type === "video"
          );
          const audioStream = metadata.streams.find(
            (stream) => stream.codec_type === "audio"
          );

          const result = {
            format: metadata.format,
            duration: parseFloat(metadata.format.duration),
            size: parseInt(metadata.format.size),
            bitrate: parseInt(metadata.format.bit_rate),
            video: videoStream
              ? {
                  codec: videoStream.codec_name,
                  width: videoStream.width,
                  height: videoStream.height,
                  framerate: this.parseFramerate(videoStream.r_frame_rate),
                  bitrate: videoStream.bit_rate
                    ? parseInt(videoStream.bit_rate)
                    : null,
                  pixelFormat: videoStream.pix_fmt,
                }
              : null,
            audio: audioStream
              ? {
                  codec: audioStream.codec_name,
                  sampleRate: parseInt(audioStream.sample_rate),
                  channels: audioStream.channels,
                  bitrate: audioStream.bit_rate
                    ? parseInt(audioStream.bit_rate)
                    : null,
                }
              : null,
          };

          resolve(result);
        } catch (parseError) {
          reject(
            new Error(`Failed to parse ffprobe output: ${parseError.message}`)
          );
        }
      });
    });
  }

  /**
   * Parse framerate from FFmpeg format (e.g., "30/1" -> 30)
   * @param {string} frameRate - Framerate string from FFmpeg
   * @returns {number} Parsed framerate
   */
  parseFramerate(frameRate) {
    if (!frameRate) return null;
    const parts = frameRate.split("/");
    return parts.length === 2
      ? parseFloat(parts[0]) / parseFloat(parts[1])
      : parseFloat(frameRate);
  }

  /**
   * Execute FFmpeg command using fluent-ffmpeg
   * @param {Object} command - Fluent-ffmpeg command object
   * @param {string} outputPath - Output file path
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Execution result
   */
  async executeFFmpeg(command, outputPath, progressCallback = null) {
    let ffmpegCmd = ''
    return new Promise((resolve, reject) => {
      console.log(`Executing fluent-ffmpeg transcoding to: ${outputPath}`);

      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(`Spawned FFmpeg with command: ${commandLine}`);
          ffmpegCmd = commandLine; // Store the command for debugging
        })
        .on('progress', (progress) => {
          if (progressCallback && progress.timemark) {
            // Convert timemark (HH:MM:SS.mmm) to seconds for compatibility
            const timeComponents = progress.timemark.split(':');
            if (timeComponents.length === 3) {
              const hours = parseInt(timeComponents[0]) || 0;
              const minutes = parseInt(timeComponents[1]) || 0;
              const seconds = parseFloat(timeComponents[2]) || 0;
              const currentTime = hours * 3600 + minutes * 60 + seconds;
              
              const progressInfo = {
                currentTime,
                fps: progress.currentFps || null,
                size: progress.targetSize ? parseInt(progress.targetSize) : null,
                bitrate: progress.currentKbps || null,
                percent: progress.percent || null
              };
              
              progressCallback(progressInfo);
            }
          }
        })
        .on('end', () => {
          console.log("FFmpeg transcoding completed successfully");
          resolve({
            success: true,
            code: 0,
            output: "Transcoding completed successfully",
          });
        })
        .on('error', (error, stdout, stderr) => {
          console.error("FFmpeg transcoding failed");
          reject(new Error(`FFmpeg failed: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Parse progress from FFmpeg output (deprecated - now using fluent-ffmpeg progress events)
   * @param {string} output - FFmpeg stderr output
   * @returns {Object|null} Progress information
   * @deprecated This method is kept for backwards compatibility
   */
  parseProgress(output) {
    const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
    const fpsMatch = output.match(/fps=\s*(\d+\.?\d*)/);
    const sizeMatch = output.match(/size=\s*(\d+)kB/);
    const bitrateMatch = output.match(/bitrate=\s*(\d+\.?\d*)kbits\/s/);

    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseFloat(timeMatch[3]);
      const currentTime = hours * 3600 + minutes * 60 + seconds;

      return {
        currentTime,
        fps: fpsMatch ? parseFloat(fpsMatch[1]) : null,
        size: sizeMatch ? parseInt(sizeMatch[1]) : null,
        bitrate: bitrateMatch ? parseFloat(bitrateMatch[1]) : null,
      };
    }

    return null;
  }

  /**
   * Generate output filename
   * @param {string} inputPath - Input file path
   * @param {Object} config - Output configuration
   * @returns {string} Output file path
   */
  generateOutputPath(inputPath, config) {
    const inputName = path.basename(inputPath, path.extname(inputPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = config.suffix || `${config.width}x${config.height}`;
    const extension = config.format || "mp4";

    return path.join(
      this.tempDir,
      `${inputName}_${suffix}_${timestamp}.${extension}`
    );
  }

  /**
   * Transcode video with single output configuration
   * @param {Object} input - Input configuration
   * @param {Object} output - Output configuration
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Transcoding result
   */
  async transcodeVideo(input, output, progressCallback = null) {
    try {
      console.log(`Starting video transcoding...`);
      console.log(`Input: ${input.path}`);

      // Generate output path if not provided
      if (!output.path) {
        output.path = this.generateOutputPath(input.path, output);
      }

      console.log(`Output: ${output.path}`);

      // Generate fluent-ffmpeg command
      const fluentFfmpegIns = createFluentFFmpegIns(input, output);

      // Execute transcoding
      const startTime = Date.now();
      const result = await this.executeFFmpeg(fluentFfmpegIns, output.path, progressCallback);
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      // Get output file stats
      const outputStats = fs.existsSync(output.path)
        ? fs.statSync(output.path)
        : null;

      return {
        success: true,
        input: {
          path: input.path,
        },
        output: {
          path: output.path,
          size: outputStats ? outputStats.size : 0,
          exists: !!outputStats,
        },
        metric: {
          duration: duration,
          command: result.command, // Updated since we no longer have raw command
          result: result,
        },
      };
    } catch (error) {
      console.error("Transcoding failed:", error.message);
      return {
        success: false,
        error: error.message,
        input: input,
        output: output,
      };
    }
  }

  /**
   * Create preset configurations for common resolutions
   * @param {string} inputPath - Input file path
   * @param {Array} presets - Array of preset names (e.g., ['1080p', '720p'])
   * @param {Object} options - Additional options
   * @returns {Array} Array of output configurations
   */
  createPresetConfigurations(inputPath, presets, options = {}) {
    return presets.map((presetName) => {
      const preset = this.defaultPresets[presetName];
      if (!preset) {
        throw new Error(`Unknown preset: ${presetName}`);
      }

      return {
        width: preset.width,
        height: preset.height,
        format: options.format || "mp4",
        videoCodec: options.videoCodec || "libx264",
        audioCodec: options.audioCodec || "aac",
        suffix: presetName,
        ...options,
      };
    });
  }

  /**
   * Clean up temporary files
   * @param {Array} filePaths - Array of file paths to delete
   */
  async cleanup(filePaths) {
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up: ${filePath}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup ${filePath}: ${error.message}`);
      }
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { jobId, s3Key, outputS3Key, resolutionPreset } = parseArguments();

    validateS3Key(s3Key);
    validateResolutionPreset(resolutionPreset);

    await processVideoFile(jobId, s3Key, outputS3Key, resolutionPreset);
    
    process.exit(0);
    
  } catch (error) {
    console.error("Worker execution failed:", error.stack);
    process.exit(1);
  }
}

// Run the worker if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default VideoTranscoder;

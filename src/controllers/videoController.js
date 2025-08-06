import express from "express";
import {
  QUALITY_TO_PRESETS,
} from "../utils/ffmpeg-utils.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DataAccessFactory } from "../data/data-access.js";
import config from "../config/config.js";

/**
 * Video Processing Controller
 * Integrates the video transcoding worker with the HTTP API
 */

// Initialize SQLite data access
let dataAccess = null;

/**
 * Initialize database connection
 */
async function initializeDatabase() {
  if (!dataAccess) {
    try {
      dataAccess = await DataAccessFactory.create("sqlite", config);
      await dataAccess.connect();
      console.log("Database connection initialized for video controller");
    } catch (error) {
      console.error("Failed to initialize database connection:", error.message);
      throw error;
    }
  }
  return dataAccess;
}

/**
 * Get transcoding job status
 */
export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    await initializeDatabase();
    
    const jobResult = await dataAccess.readOne("transcoding_jobs", { job_id: jobId });
    
    if (!jobResult.success || !jobResult.data) {
      return res.status(404).json({
        error: "Job not found",
        message: `Job ID ${jobId} does not exist`,
        timestamp: new Date().toISOString(),
      });
    }

    const job = jobResult.data;
    const response = {
      jobId: job.job_id,
      state: job.job_state,
    };
    
    const termState = ["failed", "completed"];
    if (termState.includes(job.job_state)) {
      // Parse callback data from JSON if it exists
      const callbackData = job.callback_data ? JSON.parse(job.callback_data) : null;
      if (callbackData) {
        response.callback = {
          success: callbackData.success,
          detail: callbackData.detail,
        };
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error("Error getting job status:", error.message);
    res.status(500).json({
      error: "Database error",
      message: "Failed to retrieve job status",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Transcode video from S3 object key
 * Accepts S3 object key and spawns a worker process
 */
export const transcodeStart = async (req, res) => {
  try {
    const { s3Key, resolutionPreset } = req.body;
    
    // Validate input
    if (!s3Key) {
      return res.status(400).json({
        error: "Missing s3Key",
        message: "Please provide S3 object key",
        timestamp: new Date().toISOString(),
      });
    }
    
    if (!resolutionPreset) {
      return res.status(400).json({
        error: "Missing resolutionPreset", 
        message: "Please provide target resolution preset",
        timestamp: new Date().toISOString(),
      });
    }
    
    // Validate S3 key format
    if (typeof s3Key !== 'string' || s3Key.trim() === '') {
      return res.status(400).json({
        error: "Invalid s3Key",
        message: "S3 key must be a non-empty string",
        timestamp: new Date().toISOString(),
      });
    }
    
    // Validate resolution preset
    if (!QUALITY_TO_PRESETS[resolutionPreset]) {
      const available = Object.keys(QUALITY_TO_PRESETS).join(', ');
      return res.status(400).json({
        error: "Invalid resolution preset",
        message: `Available presets: ${available}`,
        timestamp: new Date().toISOString(),
      });
    }
    
    const jobId = `transcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`Starting transcode job ${jobId}`);
    console.log(`   Input: ${s3Key}`);
    console.log(`   Preset: ${resolutionPreset}`);
    
    // Extract filename from S3 key for job tracking
    const fileName = path.basename(s3Key);
    
    // Initialize database and store job info
    await initializeDatabase();

    const parsedPath = path.parse(s3Key);
    const nameWithoutExt = parsedPath.name;
    const dir = parsedPath.dir;
    const newFilename = `${nameWithoutExt}_${resolutionPreset}${parsedPath.ext}`;
    const outputS3Key = dir ? `${dir}/${newFilename}` : newFilename;
    
    const jobData = {
      job_id: jobId,
      job_state: "waiting",
      input_s3_key: s3Key,
      output_s3_key: outputS3Key,
      target_quality: resolutionPreset,
      submit_ts: Date.now(),
    };
    
    const createResult = await dataAccess.create("transcoding_jobs", jobData);
    
    if (!createResult.success) {
      console.error(`Failed to create job record: ${createResult.error}`);
      return res.status(500).json({
        error: "Database error",
        message: "Failed to create job record",
        timestamp: new Date().toISOString(),
      });
    }
    
    // Spawn worker process
    const { spawn } = await import('child_process');
    const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workers/video-transcode-worker.js');
    
    const workerArgs = [
      jobId,
      s3Key,
      outputS3Key,
      resolutionPreset
    ];
    
    console.log(`Spawning worker: node ${workerPath} ${workerArgs}`);
    
    const workerProcess = spawn('node', [workerPath, ...workerArgs], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    await dataAccess.update(
      "transcoding_jobs",
      { job_state: "progressing" },
      { job_id: jobId }
    );
    
    let workerOutput = '';
    let workerError = '';
    
    workerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      workerOutput += output;
      console.log(`[Worker ${jobId} StdOut] ${output.trim()}`);
    
    workerProcess.stderr.on("data", (data) => {
      workerError += data.toString();
      console.log(`[Worker ${jobId} StdErr] ${data.toString().trim()}`);
    });
      // Job remains in 'progressing' state - no need to parse output for state changes
    });

    workerProcess.on('error', async (error) => {
      try {
        await dataAccess.update(
          "transcoding_jobs",
          { job_state: 'failed' },
          { job_id: jobId }
        );
        console.error(`Job ${jobId} spawn failed: ${error.message}`);
      } catch (updateError) {
        console.error(`Failed to update job ${jobId} state to failed:`, updateError.message);
      }
    });
    
    // Return job ID immediately
    res.json({
      message: "Transcode job started",
      method: "POST",
      timestamp: new Date().toISOString(),
      jobId: jobId,
      input: {
        s3Key: s3Key,
        fileName: fileName,
      },
      targetPreset: resolutionPreset,
      status: "progressing",
    });
    
  } catch (error) {
    console.error("Transcode from S3 error:", error.stack);
    res.status(500).json({
      error: "Transcode job failed to start",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Job completion callback endpoint for worker processes
 * Workers call this to report their completion status
 */
export const jobCallback = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { success, detail } = req.body;

    await initializeDatabase();
    
    const jobResult = await dataAccess.readOne("transcoding_jobs", { job_id: jobId });
    
    if (!jobResult.success || !jobResult.data) {
      return res.status(404).json({
        success: false,
        message: `Job ID ${jobId} does not exist`,
        timestamp: new Date().toISOString(),
      });
    }

    const updateData = {
      job_state: success ? 'completed' : 'failed',
      callback_data: JSON.stringify(req.body),
    };
    
    // If the job completed successfully and we have output S3 key, store it
    if (success && detail && detail.outputS3Key) {
      updateData.output_s3_key = detail.outputS3Key;
    }
    
    const updateResult = await dataAccess.update(
      "transcoding_jobs",
      updateData,
      { job_id: jobId }
    );
    
    if (!updateResult.success) {
      console.error(`Failed to update job ${jobId}:`, updateResult.error);
      return res.status(500).json({
        success: false,
        message: "Failed to update job status",
        timestamp: new Date().toISOString(),
      });
    }
    
    if (success) {
      console.log(`Job ${jobId} completed via callback, detail ${JSON.stringify(detail)}`);
    } else {
      console.error(`Job ${jobId} failed via callback: ${JSON.stringify(detail)}`);
    }

    res.status(200).json({
      success: true,
      message: `Job ${jobId} status updated successfully`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in job callback:", error.message);
    res.status(500).json({
      success: false,
      message: "Database error during callback processing",
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Clean up old jobs (should be called periodically)
 */
export const cleanupOldJobs = () => {
  throw("Unimplemented error: cleanupOldJobs function may be implemented in a seperated process.");
};

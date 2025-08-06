/**
 * FFmpeg Utilities
 * Helper functions for generating FFmpeg commands and handling video processing
 * Now uses fluent-ffmpeg for better FFmpeg integration
 */

import ffmpeg from 'fluent-ffmpeg';

/**
 * Video codec configurations
 */
export const VIDEO_CODECS = {
  av1: {
    name: "libsvtav1",
    extension: "mp4",
    quality: { min: 0, max: 63, default: 49 },
    presets: [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
    ],
    default: {
      crf: 60,
      preset: "16",
      width: 896,
      height: 504,
    },
  },
};

/**
 * Audio codec configurations
 */
export const AUDIO_CODECS = {
  aac: {
    name: "aac",
    bitrates: ["96k", "128k", "320k"],
    default: { bitrate: "96k" },
  },
};

/**
 * Common quality presets
 */
export const QUALITY_TO_PRESETS = {
  "1080p60av1": {
    width: 1920,
    height: 1080,
    crf: 49,
    preset: "10",
    filters: { fps: 60 },
    advanced: {
      additionalArgs: [
        "-svtav1-params",
        "hierarchical-levels=3:keyint=180:lookahead=11:lp=14:scm=0",
      ],
    },
  },
  "1080p30av1": {
    width: 1920,
    height: 1080,
    crf: 49,
    preset: "10",
    filters: { fps: 30 },
    advanced: {
      additionalArgs: [
        "-svtav1-params",
        "hierarchical-levels=2:keyint=90:lookahead=11:lp=10:scm=0:enable-tf=0",
      ],
    },
  },
  "720p30av1": {
    width: 1280,
    height: 720,
    crf: 49,
    preset: "12",
    filters: { fps: 30 },
    advanced: {
      additionalArgs: [
        "-svtav1-params",
        "hierarchical-levels=2:keyint=90:lookahead=11:lp=10:scm=0:enable-tf=0",
      ],
    },
  },
};

/**
 * Generate scaling filter for FFmpeg
 * @param {number} targetWidth - Target width
 * @param {number} targetHeight - Target height
 * @param {Object} options - Scaling options
 * @returns {string} FFmpeg scale filter
 */
export function generateScaleFilter(targetWidth, targetHeight, options = {}) {
  const {
    maintainAspectRatio = true,
    force = false,
    algorithm = "bicubic",
  } = options;

  if (maintainAspectRatio && !force) {
    return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=${algorithm}`;
  } else {
    return `scale=${targetWidth}:${targetHeight}:flags=${algorithm}`;
  }
}

/**
 * Generate video filter chain
 * @param {Object} filters - Filter configuration
 * @returns {Array} FFmpeg filter arguments
 */
export function generateVideoFilters(filters) {
  const filterChain = [];

  if (filters.scale) {
    filterChain.push(
      generateScaleFilter(
        filters.scale.width,
        filters.scale.height,
        filters.scale.options
      )
    );
  }

  if (filters.fps) {
    filterChain.push(`fps=${filters.fps}`);
  }

  if (filters.deinterlace) {
    filterChain.push("yadif");
  }

  if (filters.denoise) {
    filterChain.push(`hqdn3d=${filters.denoise.strength || "default"}`);
  }

  if (filters.crop) {
    const { width, height, x = 0, y = 0 } = filters.crop;
    filterChain.push(`crop=${width}:${height}:${x}:${y}`);
  }

  if (filters.pad) {
    const { width, height, x = 0, y = 0, color = "black" } = filters.pad;
    filterChain.push(`pad=${width}:${height}:${x}:${y}:${color}`);
  }

  if (filters.custom) {
    filterChain.push(...filters.custom);
  }

  return filterChain.length > 0 ? ["-vf", filterChain.join(",")] : [];
}

/**
 * Validate input parameters
 * @param {Object} input - Input configuration
 * @throws {Error} If validation fails
 */
export function validateInput(input) {
  if (!input.path) {
    throw new Error("Input path is required");
  }

  if (typeof input.path !== "string") {
    throw new Error("Input path must be a string");
  }
}

/**
 * Validate output configuration
 * @param {Object} output - Output configuration
 * @throws {Error} If validation fails
 */
export function validateOutput(output) {
  if (output.width && (typeof output.width !== "number" || output.width <= 0)) {
    throw new Error("Output width must be a positive number");
  }

  if (
    output.height &&
    (typeof output.height !== "number" || output.height <= 0)
  ) {
    throw new Error("Output height must be a positive number");
  }

  if (
    output.framerate &&
    (typeof output.framerate !== "number" || output.framerate <= 0)
  ) {
    throw new Error("Output framerate must be a positive number");
  }

  if (
    output.crf &&
    (typeof output.crf !== "number" || output.crf < 0 || output.crf > 51)
  ) {
    throw new Error("CRF must be a number between 0 and 51");
  }
}

/**
 * Create a complete transcoding configuration
 * @param {Object} options - Configuration options
 * @returns {Object} Complete configuration object
 */
export function createTranscodingConfig(options) {
  const {
    input,
    quality = "720p30av1",
    videoCodec = "av1",
    audioCodec = "aac",
    format = "mp4",
    filters = {},
    advanced = {},
  } = options;

  validateInput(input);

  const videoCodecConfig = VIDEO_CODECS[videoCodec];
  const audioCodecConfig = AUDIO_CODECS[audioCodec];
  const qualityConfig = QUALITY_TO_PRESETS[quality];

  if (!videoCodecConfig) {
    throw new Error(`Unsupported video codec: ${videoCodec}`);
  }

  if (!audioCodecConfig) {
    throw new Error(`Unsupported audio codec: ${audioCodec}`);
  }
  let mutateFilters = filters
  if (JSON.stringify(mutateFilters) === JSON.stringify({})) {
    mutateFilters = qualityConfig.filters;
  }
  let mutateAdvanced = advanced;
  if (JSON.stringify(mutateAdvanced) === JSON.stringify({})) {
    mutateAdvanced = qualityConfig.advanced;
  }

  const config = {
    input,
    output: {
      videoCodec: videoCodecConfig.name,
      audioCodec: audioCodecConfig.name,
      format: format,
      crf: qualityConfig?.crf || videoCodecConfig.default.crf,
      preset: qualityConfig?.preset || videoCodecConfig.default.preset,
      width: qualityConfig?.width || videoCodecConfig.default.width,
      height: qualityConfig?.height || videoCodecConfig.default.height,
      audioBitrate: qualityConfig?.audioBitrate || audioCodecConfig.default.bitrate,
      ...mutateAdvanced,
    },
  };
  

  // Add video filters
  const filterArgs = generateVideoFilters(mutateFilters);
  if (filterArgs.length > 0) {
    config.output.additionalArgs = (config.output.additionalArgs || []).concat(
      filterArgs
    );
  }

  validateOutput(config.output);
  return config;
}

/**
 * Create a fluent-ffmpeg command object with the given configuration
 * @param {Object} input - Input configuration
 * @param {Object} output - Output configuration
 * @returns {Object} Fluent-ffmpeg command object
 */
export function createFluentFFmpegIns(input, output) {
  if (!input.path) {
    throw new Error("Input path is required");
  }

  const command = ffmpeg(input.path);

  // Set video codec and options
  if (output.video !== false) {
    command.videoCodec(output.videoCodec || "libx264");

    // Set resolution
    if (output.width && output.height) {
      command.size(`${output.width}x${output.height}`);
    }

    // Set framerate
    if (output.framerate) {
      command.fps(output.framerate);
    }

    // Add video filters
    if (output.additionalArgs) {
      const videoFilterArgs = [];
      for (let i = 0; i < output.additionalArgs.length; i++) {
        if (output.additionalArgs[i] === '-vf' && i + 1 < output.additionalArgs.length) {
          videoFilterArgs.push(output.additionalArgs[i + 1]);
          i++; // Skip the next argument as it's the filter value
        }
      }
      if (videoFilterArgs.length > 0) {
        command.videoFilters(videoFilterArgs);
      }
    }

    // Add FFmpeg output options
    const outputOptions = [];
    
    // CRF quality setting
    if (output.crf) {
      outputOptions.push(`-crf ${output.crf}`);
    } else {
      outputOptions.push("-crf 23"); // Default quality
    }

    // Preset for encoding speed vs compression
    if (output.preset) {
      outputOptions.push(`-preset ${output.preset}`);
    } else {
      outputOptions.push("-preset medium");
    }

    if (outputOptions.length > 0) {
      command.outputOptions(outputOptions);
    }
  } else {
    command.noVideo();
  }

  // Set audio codec and options
  if (output.audio !== false) {
    command.audioCodec(output.audioCodec || "aac");

    if (output.audioBitrate) {
      let audioBitrateValue;
      if (typeof output.audioBitrate === 'string') {
        audioBitrateValue = output.audioBitrate;
      } else if (typeof output.audioBitrate === 'number') {
        audioBitrateValue = `${output.audioBitrate}k`;
      } else {
        audioBitrateValue = output.audioBitrate.toString();
      }
      command.audioBitrate(audioBitrateValue);
    }

    if (output.audioSampleRate) {
      command.audioFrequency(output.audioSampleRate);
    }
  } else {
    command.noAudio();
  }

  // Add any additional arguments not handled above
  if (output.additionalArgs) {
    const remainingArgs = [];
    for (let i = 0; i < output.additionalArgs.length; i++) {
      // Skip video filter args as they're handled above
      if (output.additionalArgs[i] === '-vf' && i + 1 < output.additionalArgs.length) {
        i++; // Skip both -vf and its value
        continue;
      }
      remainingArgs.push(output.additionalArgs[i]);
    }
    if (remainingArgs.length > 0) {
      command.outputOptions(remainingArgs);
    }
  }

  return command;
}

/**
 * Estimate transcoding time based on input duration and complexity
 * @param {number} duration - Input duration in seconds
 * @param {Object} outputConfig - Output configuration
 * @returns {number} Estimated time in seconds
 */
export function estimateTranscodingTime(duration, outputConfig) {
  const baseMultiplier = {
    ultrafast: 0.1,
    superfast: 0.15,
    veryfast: 0.2,
    faster: 0.25,
    fast: 0.3,
    medium: 0.5,
    slow: 1.0,
    slower: 1.5,
    veryslow: 2.0,
  };

  const preset = outputConfig.preset || "medium";
  const multiplier = baseMultiplier[preset] || 0.5;

  // Additional time for resolution changes
  const resolutionMultiplier =
    outputConfig.width && outputConfig.height ? 1.2 : 1.0;

  return Math.ceil(duration * multiplier * resolutionMultiplier);
}

export default {
  VIDEO_CODECS,
  AUDIO_CODECS,
  QUALITY_TO_PRESETS,
  generateScaleFilter,
  generateVideoFilters,
  validateInput,
  validateOutput,
  createTranscodingConfig,
  estimateTranscodingTime,
  createFluentFFmpegIns,
};

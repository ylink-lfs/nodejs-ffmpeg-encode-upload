# Node.js FFmpeg Encode Upload

A comprehensive Node.js backend server for video transcoding and processing, built with Express.js, FFmpeg, and AWS S3 integration. This server provides a complete video processing pipeline with background workers, job queuing, and automatic file management.

## Features

- 🎬 **Video Transcoding**: Full FFmpeg integration with AV1 codec support
- ☁️ **S3 Storage**: Upload, download, and manage video files in AWS S3 (or S3-compatible storage)
- ⚙️ **Job Management**: SQLite-based asynchronous job processing with status management
- 🎯 **Quality Presets**: Transcoding presets definition structure (720p, 1080p with AV1)
- 🚀 **Express.js API**: RESTful API integration
- 🔧 **Development Tools**: Hot reloading with nodemon, AWS s3 service mock with s3rver
- 🧪 **Comprehensive Testing**: End-to-end testing with automated workflow validation

## Project Structure

```
nodejs-ffmpeg-encode-upload/
├── scripts/
│   ├── e2e-test.js              # End-to-end testing script
│   ├── client_upload.js         # Mocking client upload
│   └── create-sqlite-db.sh      # Database creation script
├── src/
│   ├── controllers/             # Business logic controllers
│   │   ├── echoController.js    # Debug echo endpoints
│   │   └── videoController.js   # Video transcoding controller
│   ├── routes/                  # API route definitions
│   │   ├── echo.js             # Echo routes
│   │   └── video.js            # Video processing routes
│   ├── config/                 # Configuration files
│   │   └── config.js           # Environment-based configuration
│   ├── data/                   # Data access layer
│   │   ├── data-access.js      # Abstract data access interface
│   │   └── sqlite-data-access.js # SQLite implementation
│   ├── utils/                  # Utility functions
│   │   ├── ffmpeg-utils.js     # FFmpeg configuration and presets
│   │   ├── s3-service.js       # S3 service wrapper
│   │   ├── sqlite-wrapper.js   # SQLite utilities
│   │   └── utils.js            # General utilities
│   ├── workers/                # Background workers
│   │   └── video-transcode-worker.js # Video transcoding worker
│   ├── test/                   # Component tests
│   │   ├── test-ffmpeg-transcoder.js
│   │   ├── test-s3-service.js
│   │   └── test-sqlite-integration.js
│   └── main.js                 # Main server entry point
├── package.json
└── README.md
```

## Quick Start

### Prerequisites

1. **Node.js+** and npm installed
2. **FFmpeg** and **FFprobe** installed and available in $PATH
3. **Ports 3000 and 4568** available (for local server and S3 mock)

### Installation

1. Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd nodejs-ffmpeg-encode-upload
npm install
```

2. Install FFmpeg:

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**Windows:**
- Download from [FFmpeg official website](https://ffmpeg.org/download.html)
- Add to PATH environment variable

3. Check `src/config/config.js` for necessary environment variables and adjust as needed.

### Running End-to-End Tests

**It's strongly recommended to run end-to-end tests locally for dependency check and workflow verification.**

Test the complete workflow automatically:

```bash
npm run test-e2e
```

This will automatically:
- Install dependencies
- Start required services (S3 mock, HTTP server)
- Create test videos
- Test upload and transcoding workflows
- Validate results and clean up

A successful E2E test run produces output like this:

```
🚀 Node.js FFmpeg Encode Upload - End-to-End Test Suite
========================================================
📅 Started at: 2025-08-08T14:08:46.489Z
🔧 Config: Server=http://127.0.0.1:3000, S3rver=127.0.0.1:4568

🔍 Step 1: Checking Prerequisites
=====================================
✅ Dependencies verified
✅ Required ports available
✅ Temp directory ready

🛢 Step 2: Preparing Database
=====================================
📦 Creating SQLite database...
✅ SQLite database created successfully

🎬 Step 3: Creating Test Video Files
=====================================
📹 Generating test video with FFmpeg...
✅ Test video created: /Users/ylink/nodejs-ffmpeg-encode-upload/temp/e2e-test-video.mp4
📊 Video size: 0.45 MB

🌐 Step 4: Starting Services
=====================================
📦 Starting s3rver...
✅ s3rver started successfully
🌐 Starting HTTP server...
✅ HTTP server started successfully
✅ Services verification passed

📤 Step 5: Testing Upload Workflow
=====================================
📤 Uploading test video to S3...
✅ Video uploaded successfully: uploads/e2e-test-video.mp4

🔄 Step 6: Testing Transcoding Workflow
=====================================
🎯 Testing transcode with preset: 720p30av1
🔄 Transcode job started: transcode_1754662149323_y5443md28
📊 Polling job status...
📊 Job transcode_1754662149323_y5443md28 state: completed (attempt 1)
✅ Transcode 720p30av1 completed successfully
🎯 Testing transcode with preset: 1080p30av1
🔄 Transcode job started: transcode_1754662151353_eb8ys53uz
📊 Polling job status...
📊 Job transcode_1754662151353_eb8ys53uz state: progressing (attempt 1)
📊 Job transcode_1754662151353_eb8ys53uz state: completed (attempt 2)
✅ Transcode 1080p30av1 completed successfully

📥 Step 7: Downloading and Validating Transcoded Videos
========================================================
📥 Downloading transcoded video: uploads/e2e-test-video_720p30av1.mp4
📊 Downloaded file size: 0.23 MB
✅ Downloaded: uploads/e2e-test-video_720p30av1.mp4
🔍 Validating video properties for 720p30av1...
✅ Video validation passed for 720p30av1
   🎬 Codec: av1
📥 Downloading transcoded video: uploads/e2e-test-video_1080p30av1.mp4
📊 Downloaded file size: 0.30 MB
✅ Downloaded: uploads/e2e-test-video_1080p30av1.mp4
🔍 Validating video properties for 1080p30av1...
✅ Video validation passed for 1080p30av1

🎉 All workflow tests completed successfully!

🧹 Step 8: Cleaning Up Resources
=====================================
🛑 Stopping HTTP server...
✅ HTTP server stopped
🛑 Stopping s3rver...
✅ s3rver stopped
🗑️ Cleaning up test files...
✅ Test files cleaned up

📊 End-to-End Test Report
==========================================
🕒 Duration: 45.2 seconds
📈 Success Rate: 100.0%
✅ Passed: 12
❌ Failed: 0
📊 Total: 12

🎉 All tests passed! End-to-end testing completed successfully.
```

### Basic Usage

1. **Start the server:**

```bash
npm start
```

The server will start on `http://localhost:3000`.

2. **Upload a video file to S3:**

```bash
# Using the built-in upload client
node scripts/client_upload.js /path/to/your/video.mp4
```

3. **Start a transcoding job:**

```bash
curl -X POST http://localhost:3000/api/video/transcode \
  -H "Content-Type: application/json" \
  -d '{
    "s3Key": "uploads/your-video.mp4",
    "resolutionPreset": "720p30av1"
  }'
```

4. **Check job status:**

```bash
curl http://localhost:3000/api/video/jobs/<job-id>
```

## API Endpoints

### Server Information
- `GET /` - Server information and available endpoints

### Echo Endpoints (Debug)
- `GET /api/echo` - Echo GET request details with headers, query params, etc.
- `POST /api/echo` - Echo POST request with body data

### Video Processing
- `POST /api/video/transcode` - Start a video transcoding job
- `GET /api/video/jobs/:jobId` - Get transcoding job status
- `POST /api/video/jobs/:jobId/callback` - Job completion callback (internal use)

## Video Transcoding API

### Start Transcoding Job

**Endpoint:** `POST /api/video/transcode`

**Request Body:**
```json
{
  "s3Key": "uploads/input-video.mp4",
  "resolutionPreset": "720p30av1"
}
```

**Available Resolution Presets:**
- `720p30av1` - 1280x720, 30fps, AV1 codec
- `1080p30av1` - 1920x1080, 30fps, AV1 codec  
- `1080p60av1` - 1920x1080, 60fps, AV1 codec

**Response:**
```json
{
  "message": "Transcode job started",
  "method": "POST",
  "timestamp": "2025-08-08T14:08:46.489Z",
  "jobId": "transcode_1754662149323_y5443md28",
  "input": {
    "s3Key": "uploads/input-video.mp4",
    "fileName": "input-video.mp4"
  },
  "targetPreset": "720p30av1",
  "status": "progressing"
}
```

### Check Job Status

**Endpoint:** `GET /api/video/jobs/:jobId`

**Response (In Progress):**
```json
{
  "jobId": "transcode_1754662149323_y5443md28",
  "state": "progressing"
}
```

**Response (Completed):**
```json
{
  "jobId": "transcode_1754662149323_y5443md28",
  "state": "completed",
  "callback": {
    "success": true,
    "detail": {
      "inputS3Key": "uploads/input-video.mp4",
      "outputS3Key": "uploads/input-video_720p30av1.mp4",
      "quality": "720p30av1",
      "jobId": "transcode_1754662149323_y5443md28",
      "jobDuration": "15432.50 ms"
    }
  }
}
```

**Job States:**
- `waiting` - Job queued but not started
- `progressing` - Job currently being processed
- `completed` - Job finished successfully
- `failed` - Job failed with error

## Video Transcoding Examples

### Basic Video Upload and Transcoding

1. **Upload a video file:**
```bash
node scripts/client_upload.js /path/to/video.mp4
# Output: S3 Key: uploads/video.mp4
```

2. **Start transcoding to 720p AV1:**
```bash
curl -X POST http://localhost:3000/api/video/transcode \
  -H "Content-Type: application/json" \
  -d '{
    "s3Key": "uploads/video.mp4",
    "resolutionPreset": "720p30av1"
  }'
# Output: {"jobId": "transcode_1754662149323_y5443md28", ...}
```

3. **Monitor job progress:**
```bash
curl http://localhost:3000/api/video/jobs/transcode_1754662149323_y5443md28
```

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   S3 Storage    │    │     Database    │
│                 │    │  (AWS S3 or     │    │   (SQLite)      │
│ - Web Apps      │    │   s3rver mock)  │    │                 │
│ - Upload Tool   │    │                 │    │ - Job Tracking  │
│ - API Clients   │    │ - Video Files   │    │ - Status        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │ HTTP API              │ S3 API                │ SQL
         │                       │                       │
         └─────────────┬─────────┴───────────────────────┘
                       │
              ┌─────────────────┐
              │  Express Server │
              │                 │
              │ - REST API      │
              │ - Job Mgmt      │
              │ - File Upload   │
              └─────────────────┘
                       │
                       │ Spawn Process
                       │
              ┌─────────────────┐
              │ Worker Process  │
              │                 │
              │ - Download S3   │
              │ - FFmpeg        │
              │ - Upload Result │
              │ - Update Status │
              └─────────────────┘
```

### Data Flow

1. **Upload**: Client uploads video → S3 Storage
2. **Job Creation**: API creates transcoding job → Database  
3. **Worker Spawn**: Server spawns background worker process
4. **Processing**: Worker downloads → transcodes → uploads result
5. **Status Update**: Worker reports completion → Database
6. **Client Polling**: Client checks job status via API

### Job States

```
[waiting] → [progressing] → [completed]
                  │
                  └────────→ [failed]
```

**Note:** Currently the retry mechanism to return jobs from `failed` state back to `waiting` state is not implemented.

## Development

### Development Mode

Start with hot reloading:

```bash
npm run dev
```

### Adding New Features

1. **Controllers**: Business logic in `src/controllers/`
2. **Routes**: API endpoints in `src/routes/`
3. **Utils**: Helper functions in `src/utils/`
4. **Workers**: Background processing in `src/workers/`
5. **Tests**: Component tests in `src/test/`

### Adding New Transcoding Presets

Edit `src/utils/ffmpeg-utils.js` and add to `QUALITY_TO_PRESETS`:

```javascript
export const QUALITY_TO_PRESETS = {
  "480p30av1": {
    width: 854,
    height: 480,
    crf: 52,
    preset: "12",
    filters: { fps: 30 },
    // ... advanced options
  },
  // ... existing presets
};
```

## License

ISC

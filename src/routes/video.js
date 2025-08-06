import express from "express";
import {
  transcodeStart,
  getJobStatus,
  jobCallback,
} from "../controllers/videoController.js";

const router = express.Router();

// Video processing routes
router.post("/transcode", transcodeStart);
router.get("/jobs/:jobId", getJobStatus);
router.post("/jobs/:jobId/callback", jobCallback);

export default router;

import express from "express";
import { echoGet, echoPost } from "../controllers/echoController.js";

const router = express.Router();

// Echo routes for different HTTP methods
router.get("/", echoGet);
router.post("/", echoPost);

export default router;

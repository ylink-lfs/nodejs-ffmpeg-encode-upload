import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import config from "./config/config.js";

// Import routes
import echoRoutes from "./routes/echo.js";
import videoRoutes from "./routes/video.js";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan("combined")); // Logging
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse URL-encoded bodies

// Routes
app.use("/api/echo", echoRoutes);
app.use("/api/video", videoRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Node.js Backend API Server",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      echo: "/api/echo",
      video: "/api/video",
    },
  });
});

// 404 handler
app.use(/(.*)/, (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Error:", error);

  res.status(error.status || 500).json({
    error: error.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  });
});

// Server configuration
const PORT = config.server.port;
const HOST = config.server.host;

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Started at: ${new Date().toISOString()}`);
});

export default server;

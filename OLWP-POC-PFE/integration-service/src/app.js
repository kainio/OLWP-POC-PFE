const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const dataRoutes = require("./controllers/dataController");
const healthRoutes = require("./controllers/healthController");
const webhookRoutes = require("./controllers/webhookController");

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for Grafana compatibility
    crossOriginEmbedderPolicy: false,
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow any localhost:* and grafana:3000
      if (
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        origin === "http://grafana:3000"
      ) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Middleware to capture raw body
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString("utf8");
  }
};

// In your main app.js or server.js, use:
app.use(
  express.json({
    verify: rawBodySaver,
  })
);

// Logging middleware
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/webhooks", webhookRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Integration Service",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, "0.0.0.0", () => {
  logger.info(`Integration Service started on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

module.exports = app;

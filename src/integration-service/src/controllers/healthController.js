const express = require("express");
const axios = require("axios");
const logger = require("../utils/logger");

const router = express.Router();

// Health check endpoint
router.get("/", async (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: "OK",
    timestamp: new Date().toISOString(),
    services: {},
  };

  try {
    // Check Gitea connectivity
    try {
      const giteaResponse = await axios.get(
        `${process.env.GITEA_URL}/api/v1/version`,
        {
          timeout: 5000,
        }
      );
      healthCheck.services.gitea = {
        status: "healthy",
        version: giteaResponse.data.version,
        responseTime: Date.now(),
      };
    } catch (error) {
      healthCheck.services.gitea = {
        status: "unhealthy",
        error: error.message,
      };
    }

    // Check OpenSearch connectivity
    try {
      const opensearchResponse = await axios.get(
        `${process.env.OPENSEARCH_URL}/_cluster/health`,
        {
          timeout: 5000,
        }
      );
      healthCheck.services.opensearch = {
        status: "healthy",
        cluster_status: opensearchResponse.data.status,
        responseTime: Date.now(),
      };
    } catch (error) {
      healthCheck.services.opensearch = {
        status: "unhealthy",
        error: error.message,
      };
    }

    // Check if any critical services are down
    const criticalServices = ["gitea", "opensearch"];
    const unhealthyServices = criticalServices.filter(
      (service) => healthCheck.services[service]?.status === "unhealthy"
    );

    if (unhealthyServices.length > 0) {
      healthCheck.message = `Critical services unhealthy: ${unhealthyServices.join(
        ", "
      )}`;
      res.status(503).json(healthCheck);
    } else {
      res.status(200).json(healthCheck);
    }
  } catch (error) {
    logger.error("Health check error:", error);
    res.status(500).json({
      uptime: process.uptime(),
      message: "Health check failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check
router.get("/detailed", async (req, res) => {
  const detailedHealth = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    services: {},
    configuration: {
      gitea_url: process.env.GITEA_URL,
      opensearch_url: process.env.OPENSEARCH_URL,
      moqui_url: process.env.MOQUI_URL,
    },
  };

  res.json(detailedHealth);
});

module.exports = router;

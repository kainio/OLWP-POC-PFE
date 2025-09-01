const express = require("express");
const Joi = require("joi");
const logger = require("../utils/logger");
const { transformToCdmContact } = require("../models/cdmModels");
const GiteaService = require("../services/giteaService");
const OpenSearchService = require("../services/openSearchService");
const MoquiService = require("../services/moquiService");
const NotificationService = require("../services/notificationService");

const router = express.Router();
const giteaService = new GiteaService();
const openSearchService = new OpenSearchService();
const moquiService = new MoquiService();
const notificationService = new NotificationService();

// Initialize services
const initializeServices = async () => {
  try {
    await openSearchService.initialize();
    await giteaService.ensureRepository();
    logger.info("All services initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize services:", error);
    process.exit(1); // Exit if initialization fails
  }
};

// Initialize on startup
initializeServices();

// Validation schema for contact form submission
const contactSubmissionSchema = Joi.object({
  fullName: Joi.string().required().min(1).max(255),
  emailAddress: Joi.string().email().required(),
  phoneNumber: Joi.string()
    .pattern(/^[\+]?[0-9\s\-\(\)]+$/)
    .optional()
    .allow(null, ""),
  company: Joi.string().max(255).optional().allow(null, ""),
  addressLine1: Joi.string().max(255).optional().allow(null, ""),
  addressLine2: Joi.string().max(255).optional().allow(null, ""),
  city: Joi.string().max(100).optional().allow(null, ""),
  stateProvince: Joi.string().max(100).optional().allow(null, ""),
  postalCode: Joi.string().max(20).optional().allow(null, ""),
  country: Joi.string().max(100).optional().allow(null, ""),
  jobTitle: Joi.string().max(255).optional().allow(null, ""),
  department: Joi.string().max(255).optional().allow(null, ""),
  preferredContactMethod: Joi.string()
    .valid("email", "phone", "mail")
    .default("email"),
  notes: Joi.string().max(1000).optional().allow(null, ""),
  tags: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()),
      Joi.string().valid("", null),
      Joi.allow(null)
    )
    .optional(),
  customFields: Joi.object().optional().allow(null, {}),
  submittedBy: Joi.string().default("grafana-user"),
  source: Joi.string().default("grafana-form"),
});

// POST /api/data/contacts - Submit contact form data
router.post("/contacts", async (req, res) => {
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  logger.info("Contact submission started", {
    requestId,
    source: req.body.source,
  });

  try {
    // Validate input data
    const { error, value: validatedData } = contactSubmissionSchema.validate(
      req.body
    );
    if (error) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: error.details.map((d) => d.message),
        requestId,
      });
    }

    // Transform to CDM format
    const cdmContact = transformToCdmContact(
      validatedData,
      validatedData.submittedBy
    );
    logger.info("Data transformed to CDM format", {
      requestId,
      contactId: cdmContact.contactId,
      fullName: cdmContact.fullName,
    });

    // Phase 1: Commit to Git repository
    const gitResult = await giteaService.commitCdmData(cdmContact, {
      requestId,
      submittedBy: validatedData.submittedBy,
      source: validatedData.source,
      originalData: validatedData,
    });

    logger.info("Data committed to Git repository", {
      requestId,
      branchName: gitResult.branchName,
      submissionId: gitResult.submissionId,
      pullRequestUrl: gitResult.pullRequest.html_url,
    });

    // Phase 2: Index in OpenSearch for searchability
    await openSearchService.indexContact(cdmContact);
    logger.info("Contact indexed in OpenSearch", {
      requestId,
      contactId: cdmContact.contactId,
    });

    const processingTime = Date.now() - startTime;

    // Success response
    res.status(201).json({
      success: true,
      message: "Contact data submitted successfully",
      data: {
        contactId: cdmContact.contactId,
        submissionId: gitResult.submissionId,
        status: "pending_review",
        git: {
          branchName: gitResult.branchName,
          pullRequestId: gitResult.pullRequest.number,
          pullRequestUrl: gitResult.pullRequest.html_url,
        },
        opensearch: {
          indexed: true,
          indexName: openSearchService.contactsIndex,
        },
        processingTime: `${processingTime}ms`,
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Contact submission failed", {
      requestId,
      error: safeError,
      processingTime: `${processingTime}ms`,
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Failed to process contact submission",
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/data/reference - Get reference data for form dropdowns
router.get("/reference", async (req, res) => {
  try {
    const { type } = req.query;

    if (type) {
      // Get specific reference data type
      const data = await openSearchService.getReferenceData(type);
      res.json({
        success: true,
        data: data.map((item) => ({ value: item.value, label: item.label })),
      });
    } else {
      // Get all form dropdown data
      const dropdownData = await openSearchService.getFormDropdownData();
      res.json({
        success: true,
        data: dropdownData,
      });
    }
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to get reference data:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve reference data",
      message: error.message,
    });
  }
});

// GET /api/data/contacts - Search contacts
router.get("/contacts", async (req, res) => {
  try {
    const { q, company, department, country, page = 1, size = 20 } = req.query;

    const filters = {};
    if (company) filters.company = company;
    if (department) filters.department = department;
    if (country) filters.country = country;

    const results = await openSearchService.searchContacts(
      q,
      filters,
      parseInt(page),
      parseInt(size)
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to search contacts:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to search contacts",
      message: error.message,
    });
  }
});

// GET /api/data/contacts/:id - Get specific contact
router.get("/contacts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await openSearchService.getContactById(id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: "Contact not found",
        contactId: id,
      });
    }

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error(`Failed to get contact ${req.params.id}:`, safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve contact",
      message: error.message,
    });
  }
});

// GET /api/data/git/stats - Get Git repository statistics
router.get("/git/stats", async (req, res) => {
  try {
    const stats = await giteaService.getRepositoryStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      stack: error.stack,
    };
    logger.error("Failed to get Git stats:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve Git statistics",
      details: safeError,
    });
  }
});

// POST /api/data/git/merge/:pullNumber - Merge a pull request (for testing)
router.post("/git/merge/:pullNumber", async (req, res) => {
  try {
    const { pullNumber } = req.params;
    const result = await giteaService.mergePullRequest(parseInt(pullNumber));

    res.json({
      success: true,
      message: `Pull request #${pullNumber} merged successfully`,
      data: result,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error(
      `Failed to merge pull request #${req.params.pullNumber}:`,
      safeError
    );
    res.status(500).json({
      success: false,
      error: "Failed to merge pull request",
      details: safeError,
    });
  }
});

// GET /api/data/opensearch/health - Get OpenSearch health status
router.get("/opensearch/health", async (req, res) => {
  try {
    const health = await openSearchService.getHealthStatus();
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to get OpenSearch health:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve OpenSearch health",
      details: safeError,
    });
  }
});

// POST /api/data/opensearch/ensureIndices - Ensure OpenSearch indices
router.post("/opensearch/ensureIndices", async (req, res) => {
  try {
    await openSearchService.ensureIndices();
    res.json({
      success: true,
      message: "OpenSearch indices ensured",
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to ensure OpenSearch indices:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to ensure OpenSearch indices",
      details: safeError,
    });
  }
});

// POST /api/data/moqui/sync/:contactId - Manually sync contact to Moqui (Phase 4)
router.post("/moqui/sync/:contactId", async (req, res) => {
  const { contactId } = req.params;
  const requestId = `manual-sync-${Date.now()}`;

  try {
    logger.info("Manual Moqui sync requested", { contactId, requestId });

    // Get contact data from OpenSearch
    const contactData = await openSearchService.getContactById(contactId);
    if (!contactData) {
      return res.status(404).json({
        success: false,
        error: "Contact not found",
        contactId,
      });
    }

    // Sync to Moqui
    const moquiResult = await moquiService.createContact(contactData);

    if (moquiResult.success) {
      // Update contact in OpenSearch with Moqui ID
      await openSearchService.updateContact(contactId, {
        moquiId: moquiResult.moquiId,
        syncStatus: "synced",
        syncedAt: new Date().toISOString(),
        lastSyncType: "manual",
      });

      res.json({
        success: true,
        message: "Contact successfully synced to Moqui",
        data: {
          contactId,
          moquiId: moquiResult.moquiId,
          syncType: "manual",
          details: moquiResult.details,
        },
        requestId,
      });
    } else {
      // Update sync status to failed
      await openSearchService.updateContact(contactId, {
        syncStatus: "failed",
        syncError: moquiResult.error,
        syncAttemptedAt: new Date().toISOString(),
        lastSyncType: "manual",
      });

      res.status(500).json({
        success: false,
        error: "Moqui sync failed",
        message: moquiResult.error,
        contactId,
        requestId,
      });
    }
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Manual Moqui sync failed", {
      contactId,
      requestId,
      error: safeError,
    });
    res.status(500).json({
      success: false,
      error: "Sync operation failed",
      message: safeError.message,
      contactId,
      requestId,
    });
  }
});

// GET /api/data/moqui/health - Check Moqui service health
router.get("/moqui/health", async (req, res) => {
  try {
    const health = await moquiService.getHealthStatus();
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to get Moqui health:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve Moqui health",
      message: safeError.message,
    });
  }
});

// GET /api/data/notifications - Get notifications
router.get("/notifications", async (req, res) => {
  try {
    const { limit = 50, type } = req.query;
    const notifications = await notificationService.getNotifications(
      parseInt(limit),
      type
    );

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to get notifications:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve notifications",
      message: safeError.message,
    });
  }
});

// GET /api/data/notifications/stats - Get notification statistics
router.get("/notifications/stats", async (req, res) => {
  try {
    const stats = await notificationService.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to get notification stats:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve notification statistics",
      message: safeError.message,
    });
  }
});

// POST /api/data/notifications/test - Test notification systems
router.post("/notifications/test", async (req, res) => {
  try {
    const { channel } = req.body;

    const testNotification = {
      type: "system_alert",
      title: "Test Notification",
      message: "This is a test notification from the CDM integration system",
      metadata: {
        testId: `test-${Date.now()}`,
        requestedBy: "api-test",
        channels: channel || "all",
      },
    };

    const result = await notificationService.sendNotification(testNotification);

    res.json({
      success: true,
      message: "Test notification sent",
      data: {
        notificationId: result.notificationId,
        channels: result.channels,
        results: result.results,
      },
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to send test notification:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to send test notification",
      message: safeError.message,
    });
  }
});

// GET /api/data/reset/contacts - Search contacts
router.get("/reset/contacts", async (req, res) => {
  try {
    await openSearchService.ResetContactIndices();

    res.status(201).json({
      success: true,
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Failed to reset contacts:", safeError);
    res.status(500).json({
      success: false,
      error: "Failed to reset contacts",
      message: safeError.message,
    });
  }
});

// POST /api/data/test/complete-flow - Test complete data flow (Phases 1-4)
router.post("/test/complete-flow", async (req, res) => {
  const testId = `test-${Date.now()}`;

  try {
    const testData = {
      fullName: "Flane weld flane",
      emailAddress: `flane.test.${testId}@hooli.com`,
      phoneNumber: "+212610000000",
      company: "Hooli Corporation Inc",
      jobTitle: "Senior Developer",
      department: "Engineering",
      country: "MA",
      stateProvince: "MA-04",
      city: "Rabat",
      source: "complete-flow-test",
      submittedBy: "test-automation",
    };

    logger.info("Starting complete flow test", { testId });

    // Phase 1 & 2: Submit contact (transform to CDM, commit to Git, index in OpenSearch)
    const cdmContact = transformToCdmContact(testData, "test-automation");

    const gitResult = await giteaService.commitCdmData(cdmContact, {
      testId,
      phase: "complete-flow-test",
      source: "automation",
    });

    await openSearchService.indexContact(cdmContact);

    // Simulate Phase 3: Auto-approve for testing
    // Add retry logic for merge in case of pending validation
    let mergeSuccess = false;
    let mergeError = null;
    const maxRetries = 5;
    const retryDelayMs = 2000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await giteaService.mergePullRequest(gitResult.pullRequest.number);
        mergeSuccess = true;
        break;
      } catch (err) {
        mergeError = err;
        logger.warn(
          `Merge attempt ${attempt} failed for PR #${gitResult.pullRequest.number}: ${err.message}`
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    // Phase 4: Sync to Moqui
    const moquiResult = await moquiService.createContact(cdmContact);

    if (moquiResult.success) {
      await openSearchService.updateContact(cdmContact.contactId, {
        moquiId: moquiResult.moquiId,
        syncStatus: "synced",
        syncedAt: new Date().toISOString(),
        testId,
      });
    }

    res.json({
      success: true,
      message: "Complete flow test executed successfully",
      data: {
        testId,
        phases: {
          phase1_2: {
            contactId: cdmContact.contactId,
            gitBranch: gitResult.branchName,
            pullRequestId: gitResult.pullRequest.number,
            opensearchIndexed: true,
          },
          phase3: {
            pullRequestMerged: mergeSuccess,
            validationPassed: mergeSuccess,
            mergeError: mergeSuccess ? undefined : mergeError?.message,
          },
          phase4: {
            moquiSynced: moquiResult.success,
            moquiId: moquiResult.moquiId,
          },
        },
        executionTime: Date.now(),
      },
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Complete flow test failed", { testId, error: safeError });
    res.status(500).json({
      success: false,
      error: "Complete flow test failed",
      message: safeError.message,
      testId,
    });
  }
});

// POST /api/data/test - Test endpoint for validation
router.post("/test", async (req, res) => {
  try {
    const testData = {
      fullName: "John Doe Test",
      emailAddress: "john.doe.test@example.com",
      phoneNumber: "+1-555-123-4567",
      company: "Test Corporation",
      jobTitle: "Software Developer",
      department: "IT",
      country: "US",
      stateProvince: "CA",
      city: "San Francisco",
      source: "api-test",
    };

    // Transform to CDM
    const cdmContact = transformToCdmContact(testData, "test-user");

    res.json({
      success: true,
      message: "Test data transformation successful",
      data: {
        original: testData,
        cdm: cdmContact,
      },
    });
  } catch (error) {
    const safeError = {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack,
    };
    logger.error("Test endpoint failed:", safeError);
    res.status(500).json({
      success: false,
      error: "Test failed",
      message: safeError.message,
    });
  }
});

module.exports = router;

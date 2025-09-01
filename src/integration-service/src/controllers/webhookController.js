const express = require("express");
const crypto = require("crypto");
const logger = require("../utils/logger");
const MoquiService = require("../services/moquiService");
const OpenSearchService = require("../services/openSearchService");
const NotificationService = require("../services/notificationService");

const router = express.Router();
const moquiService = new MoquiService();
const openSearchService = new OpenSearchService();
const notificationService = new NotificationService();

// Webhook secret for validation (should be set in environment)
const WEBHOOK_SECRET =
  process.env.GITEA_WEBHOOK_SECRET || "your-webhook-secret";

// Middleware to verify webhook signature
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.headers["x-gitea-signature"];
  const payload = req.rawBody;

  if (!signature) {
    logger.warn("Webhook received without signature");
    return res.status(401).json({ error: "Missing signature" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  logger.debug("Verifying webhook signature", { signature, expectedSignature });

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    logger.warn("Webhook signature verification failed");
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
};

// POST /api/webhooks/gitea - Handle Gitea webhooks
router.post("/gitea", verifyWebhookSignature, async (req, res) => {
  const { action, pull_request, repository } = req.body;
  const webhookId = `webhook-${Date.now()}-${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  logger.info("Gitea webhook received", {
    webhookId,
    action,
    repository: repository?.name,
    pullRequest: pull_request?.number,
  });

  try {
    // Handle repository deleted event
    if (action === "deleted" && repository) {
      await handleRepositoryDeleted(repository, webhookId);
    }
    // Handle pull request events
    else if (pull_request && action === "closed" && pull_request.merged) {
      await handlePullRequestMerged(pull_request, repository, webhookId);
    } else if (pull_request && action === "opened") {
      await handlePullRequestOpened(pull_request, repository, webhookId);
    } else if (pull_request && action === "synchronized") {
      await handlePullRequestUpdated(pull_request, repository, webhookId);
    }

    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      webhookId,
      action,
    });
  } catch (error) {
    logger.error("Webhook processing failed", {
      webhookId,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: "Webhook processing failed",
      webhookId,
    });
  }
});

// Handle pull request merged - Trigger Phase 4 (Moqui Integration)
async function handlePullRequestMerged(pullRequest, repository, webhookId) {
  logger.info("Processing pull request merge", {
    webhookId,
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
    mergedBy: pullRequest.merged_by?.login,
  });

  try {
    // Extract contact data from the merged changes
    const contactData = await extractContactDataFromPR(pullRequest, repository);
    logger.debug("Extracted contact data", { contactData });

    if (contactData) {
      // Phase 4: Send to Moqui Framework
      const moquiResult = await moquiService.createContact(contactData);

      if (moquiResult.success) {
        logger.info("Contact successfully sent to Moqui", {
          webhookId,
          contactId: contactData.contactId,
          moquiId: moquiResult.moquiId,
        });

        // Update contact in OpenSearch with Moqui ID
        await openSearchService.updateContact(contactData.contactId, {
          moquiId: moquiResult.moquiId,
          syncStatus: "synced",
          syncedAt: new Date().toISOString(),
        });

        // Send success notification
        await notificationService.sendNotification({
          type: "contact_synced",
          title: "Contact Successfully Synced to Moqui",
          message: `Contact ${contactData.fullName} has been successfully synced to Moqui framework`,
          metadata: {
            contactId: contactData.contactId,
            moquiId: moquiResult.moquiId,
            pullRequestNumber: pullRequest.number,
          },
        });
      } else {
        throw new Error(`Moqui integration failed: ${moquiResult.error}`);
      }
    }
  } catch (error) {
    logger.error("Failed to process merged pull request", {
      webhookId,
      error: error.message,
      pullRequestNumber: pullRequest.number,
    });

    // // Update contact status to indicate sync failure
    // if (contactData?.contactId) {
    //   await openSearchService.updateContact(contactData.contactId, {
    //     syncStatus: "failed",
    //     syncError: error.message,
    //     syncAttemptedAt: new Date().toISOString(),
    //   });
    // }

    // // Send failure notification
    // await notificationService.sendNotification({
    //   type: "sync_failed",
    //   title: "Contact Sync to Moqui Failed",
    //   message: `Failed to sync contact to Moqui framework: ${error.message}`,
    //   metadata: {
    //     contactId: contactData?.contactId,
    //     pullRequestNumber: pullRequest.number,
    //     error: error.message,
    //   },
    // });

    throw error;
  }
}

// Handle pull request opened - Start review process
async function handlePullRequestOpened(pullRequest, repository, webhookId) {
  logger.info("Processing new pull request", {
    webhookId,
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
    author: pullRequest.user?.login,
  });

  try {
    // Extract contact data for notification
    const contactData = await extractContactDataFromPR(pullRequest, repository);

    // Send notification to reviewers
    await notificationService.sendNotification({
      type: "review_requested",
      title: "New Contact Data Submitted for Review",
      message: `Pull request #${pullRequest.number} contains new contact data that requires review`,
      metadata: {
        pullRequestNumber: pullRequest.number,
        contactName: contactData?.fullName,
        submittedBy: pullRequest.user?.login,
        reviewUrl: pullRequest.html_url,
      },
    });

    // Auto-assign reviewers if configured
    // This would typically be done through Gitea's API
  } catch (error) {
    logger.error("Failed to process new pull request", {
      webhookId,
      error: error.message,
      pullRequestNumber: pullRequest.number,
    });
  }
}

// Handle pull request updated - Re-validate
async function handlePullRequestUpdated(pullRequest, repository, webhookId) {
  logger.info("Processing pull request update", {
    webhookId,
    pullRequestNumber: pullRequest.number,
    title: pullRequest.title,
  });

  // The CI/CD pipeline will handle re-validation automatically
  // We just log and notify if needed

  await notificationService.sendNotification({
    type: "review_updated",
    title: "Pull Request Updated",
    message: `Pull request #${pullRequest.number} has been updated and is being re-validated`,
    metadata: {
      pullRequestNumber: pullRequest.number,
      reviewUrl: pullRequest.html_url,
    },
  });
}

// Extract contact data from pull request changes
async function extractContactDataFromPR(pullRequest, repository) {
  try {
    // This is a simplified extraction - in practice, you'd need to analyze
    // the actual file changes in the pull request

    // For now, we'll extract from the PR title and description
    const titleMatch = pullRequest.title.match(/Add Contact: (.+)/);
    if (!titleMatch) {
      return null;
    }

    const fullName = titleMatch[1];

    // Extract additional info from description if available
    const body = pullRequest.body || "";
    const contactId = body.match(/\*\*Contact ID:\*\* (.+)/);
    const emailMatch = body.match(/\*\*Email:\*\* (.+)/);
    const companyMatch = body.match(/\*\*Company:\*\* (.+)/);

    return {
      fullName,
      emailAddress: emailMatch ? emailMatch[1] : null,
      company: companyMatch ? companyMatch[1] : null,
      contactId: contactId ? contactId[1] : null,
    };
  } catch (error) {
    logger.error("Failed to extract contact data from PR", {
      error: error.message,
      pullRequestNumber: pullRequest.number,
    });
    return null;
  }
}

// Handle repository deleted - Trigger notification
async function handleRepositoryDeleted(repository, webhookId) {
  logger.info("Processing repository deleted event", {
    webhookId,
    repositoryName: repository.name,
    repositoryId: repository.id,
  });

  try {
    await openSearchService.ResetContactIndices();

    logger.info("OpenSearch indices reset for deleted repository");

    await notificationService.sendNotification({
      type: "repository_deleted",
      title: "Repository Deleted",
      message: `Repository "${repository.name}" has been deleted.`,
      metadata: {
        repositoryName: repository.name,
        repositoryId: repository.id,
        webhookId,
      },
    });
  } catch (error) {
    logger.error("Failed to process repository deleted event", {
      webhookId,
      error: error.message,
      repositoryName: repository.name,
    });
    throw error;
  }
}

// POST /api/webhooks/test - Test webhook endpoint
router.post("/test", async (req, res) => {
  const testWebhook = {
    action: "test",
    repository: { name: "cdm-data" },
    pull_request: {
      number: 999,
      title: "Add Contact: Test User",
      body: "**Email:** test@example.com\n**Company:** Test Corp",
      merged: true,
      user: { login: "test-user" },
      html_url: "https://git.example.com/test/pr/999",
    },
  };

  try {
    await handlePullRequestMerged(
      testWebhook.pull_request,
      testWebhook.repository,
      "test-webhook"
    );

    res.json({
      success: true,
      message: "Test webhook processed successfully",
      testData: testWebhook,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Test webhook failed",
      message: error.message,
    });
  }
});

module.exports = router;

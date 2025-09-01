const logger = require("../utils/logger");
const OpenSearchService = require("./openSearchService");

class NotificationService {
  constructor() {
    this.openSearchService = new OpenSearchService();
    this.notificationsIndex =
      process.env.OPENSEARCH_INDEX_NOTIFICATIONS || "notifications";
    this.webhooks = process.env.NOTIFICATION_WEBHOOKS
      ? process.env.NOTIFICATION_WEBHOOKS.split(",")
      : [];
    this.emailEnabled = process.env.EMAIL_NOTIFICATIONS === "true";
  }

  async sendNotification(notification) {
    const notificationId = `notif-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const fullNotification = {
      id: notificationId,
      ...notification,
      timestamp: new Date().toISOString(),
      status: "pending",
      read: false,
    };

    logger.info("Sending notification", {
      notificationId,
      type: notification.type,
      title: notification.title,
    });

    try {
      // Store notification in OpenSearch
      await this.openSearchService.client.index({
        index: this.notificationsIndex,
        id: notificationId,
        body: fullNotification,
      });

      // Send to various channels
      const results = await Promise.allSettled([
        this.sendToConsole(fullNotification),
      ]);

      // Update status based on results
      const hasSuccess = results.some(
        (result) => result.status === "fulfilled"
      );
      fullNotification.status = hasSuccess ? "sent" : "failed";
      fullNotification.results = results;

      logger.info("Notification processing completed", {
        notificationId,
        status: fullNotification.status,
        channels: results.length,
      });

      // Update notification status in OpenSearch
      await this.openSearchService.client.update({
        index: this.notificationsIndex,
        id: notificationId,
        body: {
          doc: {
            status: fullNotification.status,
            results,
          },
        },
      });

      return {
        success: hasSuccess,
        notificationId,
        channels: results.length,
        results,
      };
    } catch (error) {
      logger.error("Failed to send notification", {
        notificationId,
        error: error.message,
      });

      fullNotification.status = "failed";
      fullNotification.error = error.message;

      // Update notification status in OpenSearch
      await this.openSearchService.client.update({
        index: this.notificationsIndex,
        id: notificationId,
        body: {
          doc: {
            status: "failed",
            error: error.message,
          },
        },
      });

      return {
        success: false,
        notificationId,
        error: error.message,
      };
    }
  }

  async sendToConsole(notification) {
    // Always log to console for debugging
    const logLevel = this.getLogLevel(notification.type);
    const message = `🔔 ${notification.title}: ${notification.message}`;

    logger[logLevel](message, {
      notificationId: notification.id,
      type: notification.type,
      metadata: notification.metadata,
    });

    return { channel: "console", status: "sent" };
  }

  async sendToEmail(notification) {
    if (!this.emailEnabled) {
      return {
        channel: "email",
        status: "skipped",
        reason: "email notifications disabled",
      };
    }

    // Email implementation would go here
    // For demo purposes, we'll just log
    logger.info("Email notification (mock)", {
      to: process.env.NOTIFICATION_EMAIL || "admin@example.com",
      subject: notification.title,
      body: notification.message,
      notificationId: notification.id,
    });

    return {
      channel: "email",
      status: "sent",
      note: "mock implementation - configure SMTP for real emails",
    };
  }

  getLogLevel(notificationType) {
    const logLevels = {
      contact_synced: "info",
      sync_failed: "error",
      review_requested: "info",
      review_updated: "info",
      validation_failed: "warn",
      system_alert: "warn",
    };

    return logLevels[notificationType] || "info";
  }

  async getNotifications(limit = 50, type = null) {
    // Query OpenSearch for notifications
    const query = {
      bool: {
        must: [],
      },
    };
    if (type) {
      query.bool.must.push({ term: { type } });
    }
    // Only get active notifications
    query.bool.must.push({ match_all: {} });

    const response = await this.openSearchService.client.search({
      index: this.notificationsIndex,
      body: {
        query,
        sort: [{ timestamp: { order: "desc" } }],
        size: limit,
      },
    });

    const notifications = response.body.hits.hits.map((hit) => hit._source);

    return {
      notifications,
      total: response.body.hits.total.value,
      types: [...new Set(notifications.map((n) => n.type))],
    };
  }

  async markAsRead(notificationId) {
    try {
      await this.openSearchService.client.update({
        index: this.notificationsIndex,
        id: notificationId,
        body: {
          doc: {
            read: true,
            readAt: new Date().toISOString(),
          },
        },
      });
      return true;
    } catch (error) {
      logger.error("Failed to mark notification as read", {
        notificationId,
        error: error.message,
      });
      return false;
    }
  }

  async getStats() {
    // Get all notifications from OpenSearch
    const response = await this.openSearchService.client.search({
      index: this.notificationsIndex,
      body: {
        query: { match_all: {} },
        size: 1000,
      },
    });
    const notifications = response.body.hits.hits.map((hit) => hit._source);

    const now = new Date();
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const lastDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentNotifications = notifications.filter(
      (n) => new Date(n.timestamp) >= lastHour
    );

    const dailyNotifications = notifications.filter(
      (n) => new Date(n.timestamp) >= lastDay
    );

    const byType = {};
    notifications.forEach((n) => {
      byType[n.type] = (byType[n.type] || 0) + 1;
    });

    const byStatus = {};
    notifications.forEach((n) => {
      byStatus[n.status] = (byStatus[n.status] || 0) + 1;
    });

    return {
      total: notifications.length,
      lastHour: recentNotifications.length,
      lastDay: dailyNotifications.length,
      byType,
      byStatus,
      unread: notifications.filter((n) => !n.read).length,
    };
  }
}

module.exports = NotificationService;

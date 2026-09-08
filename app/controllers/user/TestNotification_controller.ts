import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { pushToUser } from "../../services/notification.service";
import Logging from "../../library/Logging";

const sendTestNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return errorMessage(res, "user_id is required");
    }

    // Verify user exists and has an FCM token
    const user = await db.User.findByPk(user_id, {
      attributes: ["id", "name", "fcm_token"],
    });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    if (!user.fcm_token) {
      return errorMessage(res, "User does not have an FCM token registered");
    }

    // Find the user's device so we can persist a notification record.
    // The Notifications table requires a device_id (NOT NULL).
    const device = await db.Device.findOne({
      where: { owner_id: user_id },
      attributes: ["id"],
    });

    if (!device) {
      return errorMessage(
        res,
        "User does not have a device registered; cannot create notification record"
      );
    }

    const metadata = {
      test: true,
      sent_at: new Date().toISOString(),
    };

    // Persist the notification record in the database.
    const notification = await db.Notification.create({
      device_id: device.id,
      user_id: user.id,
      type: "general",
      title: "Test Notification",
      body: "This is a test notification from the server.",
      metadata,
      is_read: "0",
    });

    Logging.info(
      `Test notification record created: id=${notification.id} user=${user.id} device=${device.id}`
    );

    // Send the push notification via FCM.
    const response = await pushToUser(user.id, {
      title: "Test Notification",
      body: "This is a test notification from the server.",
      type: "body_temp",
      metadata: {
        ...metadata,
        notification_id: notification.id,
      },
    });

    if (!response) {
      return errorMessage(
        res,
        "Failed to send test notification (no FCM response)"
      );
    }

    // If there were failures, log the details for debugging.
    if (response.failureCount > 0 && response.responses) {
      response.responses.forEach((resp: any, index: number) => {
        if (!resp.success && resp.error) {
          Logging.error(
            `FCM test notification failed for token[${index}]: ${resp.error.code} - ${resp.error.message}`
          );
        }
      });
    }

    return successMessage(res, "Test notification sent successfully", {
      user_id: user.id,
      user_name: user.name,
      fcm_token: user.fcm_token,
      device_id: device.id,
      notification_id: notification.id,
      success_count: response.successCount,
      failure_count: response.failureCount,
    });
  } catch (err: any) {
    Logging.error(`sendTestNotification error: ${err?.message || err}`);
    return errorMessage(
      res,
      `Error sending test notification: ${err?.message || "Unknown error"}`
    );
  }
};

export default {
  sendTestNotification,
};

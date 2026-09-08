import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { pushToUser } from "../../services/notification.service";

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

    // Verify user exists
    const user = await db.User.findByPk(user_id, {
      attributes: ["id", "name", "fcm_token"],
    });

    if (!user) {
      return errorMessage(res, "User not found");
    }

    if (!user.fcm_token) {
      return errorMessage(res, "User does not have an FCM token registered");
    }

    // Send test notification
    const response = await pushToUser(user_id, {
      title: "Test Notification",
      body: "This is a test notification from the server.",
      type: "general",
      metadata: {
        test: true,
        sent_at: new Date().toISOString(),
      },
    });

    if (!response) {
      return errorMessage(res, "Failed to send test notification");
    }

    return successMessage(res, "Test notification sent successfully", {
      user_id: user.id,
      user_name: user.name,
      fcm_token: user.fcm_token,
      success_count: response.successCount,
      failure_count: response.failureCount,
    });
  } catch (err) {
    console.error("sendTestNotification error:", err);
    return errorMessage(res, "Error sending test notification");
  }
};

export default {
  sendTestNotification,
};

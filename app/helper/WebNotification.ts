import { io } from "../app";
import db from "../models";

interface SendNotificationParams {
  user_id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}

export const sendNotification = async ({
  user_id,
  type,
  title,
  message,
  data = {},
}: SendNotificationParams) => {
  try {
    // 1. Save notification
    console.log("user_iddsdsdsdsdsd", user_id);

    await db.Notification.create({
      user_id,
      type,
      title,
      message,
      is_read: false,
    });

    // 2. Get unread count
    const unreadCount = await db.Notification.count({
      where: {
        user_id,
        is_read: false,
      },
    });

    // 3. Emit socket event
    io.to(user_id).emit("notification", {
      type,
      title,
      message,
      notification_count: unreadCount,
      data,
    });

    return true;
  } catch (error) {
    console.log("Notification Error:", error);
    return false;
  }
};

export const getAppCallNotify = async ({
  user_id,
  type,
  title,
  message,
  data = {},
}: SendNotificationParams) => {
  try {
    console.log("inside the socket");
    io.to(user_id).emit("isDeviceConnected", {
      type,
      title,
      message,
      data,
    });
    console.log("Notification sent to the socket");

    return true;
  } catch (error) {
    console.log("Notification Error:", error);
    return false;
  }
};

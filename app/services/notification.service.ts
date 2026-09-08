import admin from "../config/firebase";
import db from "../models";
import Logging from "../library/Logging";

/**
 * Notification types supported by the watch / server.
 */
export type NotificationType =
  | "sos"
  | "geo_fence_out"
  | "geo_fence_in"
  | "low_battery"
  | "sim_remove"
  | "network"
  | "fall_detection"
  | "device_offline"
  | "health_alert"
  | "general";

export interface NotificationPayload {
  device_id: string;
  user_id?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

/**
 * Create a notification record in the database and (optionally) push
 * it to the device owner's Firebase Cloud Messaging tokens.
 *
 * @param payload - Notification data
 * @returns The created Notification record
 */
export const createNotification = async (
  payload: NotificationPayload
): Promise<any> => {
  const { device_id, user_id, type, title, body, metadata } = payload;

  const notification = await db.Notification.create({
    device_id,
    user_id: user_id ?? null,
    type,
    title,
    body,
    metadata: metadata ?? null,
    is_read: "0",
  });

  Logging.info(
    `Notification created: id=${notification.id} device=${device_id} type=${type}`
  );

  // If we know the user, try to push via FCM.
  if (user_id) {
    await pushToUser(user_id, {
      title,
      body,
      type,
      metadata: { ...metadata, notification_id: notification.id },
    }).catch((err) =>
      Logging.warn(
        `FCM push failed for notification ${notification.id}: ${err.message}`
      )
    );
  }

  return notification;
};

/**
 * Push a notification to a specific user's FCM tokens.
 */
export const pushToUser = async (
  userId: string,
  data: {
    title: string;
    body: string;
    type: string;
    metadata?: Record<string, any>;
  }
): Promise<any> => {
  const user = await db.User.findByPk(userId, {
    attributes: ["fcm_token"],
  });

  if (!user || !user.fcm_token) {
    Logging.warn(`No FCM token found for user ${userId}`);
    return null;
  }

  const tokens = [user.fcm_token];

  const response = await (admin as any).messaging().sendEachForMulticast({
    tokens,
    notification: { title: data.title, body: data.body },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        channelId: "default_channel",
        icon: "@drawable/ic_notification",
        color: "#FF0000",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
          contentAvailable: true,
          mutableContent: true,
          category: data.type,
        },
      },
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
    },
    data: {
      type: data.type,
      title: data.title,
      body: data.body,
      channelId: "default_channel",
      ...data.metadata,
    },
  });

  Logging.info(
    `FCM push to user ${userId}: success=${response.successCount}, failed=${response.failureCount}`
  );

  await handleInvalidTokens(tokens, response);

  return response;
};

/**
 * Remove invalid/expired FCM tokens from the User table.
 */
const handleInvalidTokens = async (
  tokens: string[],
  response: any
): Promise<void> => {
  const invalidTokens: string[] = [];

  response.responses.forEach((res: any, index: any) => {
    if (!res.success) {
      const errorCode = res.error?.code;
      if (
        errorCode === "messaging/registration-token-not-registered" ||
        errorCode === "messaging/invalid-registration-token"
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await db.User.update(
      { fcm_token: null },
      {
        where: {
          fcm_token: invalidTokens,
        },
      }
    );
    Logging.info(`Cleared ${invalidTokens.length} invalid FCM tokens`);
  }
};

/**
 * Helper: build a geo-fence notification payload.
 */
export const buildGeoFenceNotification = (
  deviceId: string,
  geofenceName: string,
  event: "in" | "out"
): NotificationPayload => {
  const type: NotificationType =
    event === "in" ? "geo_fence_in" : "geo_fence_out";
  const title = event === "in" ? "Entered geofence" : "Left geofence";
  const body = `Device ${deviceId} ${
    event === "in" ? "entered" : "left"
  } ${geofenceName}`;

  return {
    device_id: deviceId,
    type,
    title,
    body,
    metadata: {
      kind: "geo_fence",
      geofenceName,
      event,
      deviceId,
    },
  };
};

/**
 * Helper: build an SOS notification payload.
 */
export const buildSosNotification = (
  deviceId: string,
  phoneNumber: string
): NotificationPayload => {
  return {
    device_id: deviceId,
    type: "sos",
    title: "SOS Alert",
    body: `SOS triggered from device ${deviceId} (${phoneNumber})`,
    metadata: {
      kind: "sos",
      deviceId,
      phoneNumber,
    },
  };
};

/**
 * Helper: build a low-battery notification payload.
 */
export const buildLowBatteryNotification = (
  deviceId: string,
  batteryLevel: number
): NotificationPayload => {
  return {
    device_id: deviceId,
    type: "low_battery",
    title: "Low Battery",
    body: `Device ${deviceId} battery is at ${batteryLevel}%`,
    metadata: {
      kind: "low_battery",
      deviceId,
      batteryLevel,
    },
  };
};

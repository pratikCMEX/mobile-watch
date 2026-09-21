import db from "../models";
import Logging from "../library/Logging";
import { messaging } from "../config/firebase";

// firebase-admin v14 is ESM-only; require() directly to avoid CJS interop issues.
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
  | "general"
  | "chat";

export interface NotificationPayload {
  device_id: string;
  user_id?: string | null;
  /**
   * When set, the notification is created once per recipient and the
   * FCM push is fanned out to every member of the watch. This is what
   * makes alarms on a shared watch reach all members instead of only
   * the (possibly stale) owner_id.
   */
  user_ids?: string[] | null;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

/**
 * Create a notification record in the database and (optionally) push
 * it to the device owner's / members' Firebase Cloud Messaging tokens.
 *
 * - `user_id`  → single-recipient notification (legacy callers).
 * - `user_ids` → one Notification row per recipient, FCM fanned out to
 *   every member of the watch (used by the TCP alarm pipeline so a
 *   shared watch alerts all members).
 *
 * @param payload - Notification data
 * @returns The created Notification record (or the last one when
 *          fanning out to multiple recipients)
 */
export const createNotification = async (
  payload: NotificationPayload
): Promise<any> => {
  const { device_id, user_id, user_ids, type, title, body, metadata } = payload;

  // Normalise the recipient list. user_ids takes precedence so the TCP
  // alarm path can fan out to every member; otherwise fall back to the
  // single legacy user_id.
  let recipients: string[] = [];
  if (user_ids && user_ids.length) {
    recipients = [...new Set(user_ids.filter(Boolean))];
  } else if (user_id) {
    recipients = [user_id];
  }

  if (recipients.length === 0) {
    // No recipient known — still persist the record so it is visible to
    // admins, but skip the FCM push.
    const notification = await db.Notification.create({
      device_id,
      user_id: null,
      type,
      title,
      body,
      metadata: metadata ?? null,
      is_read: "0",
    });
    Logging.info(
      `Notification created (no recipient): id=${notification.id} device=${device_id} type=${type}`
    );
    return notification;
  }

  let lastNotification: any = null;
  for (const recipientId of recipients) {
    const notification = await db.Notification.create({
      device_id,
      user_id: recipientId,
      type,
      title,
      body,
      metadata: metadata ?? null,
      is_read: "0",
    });

    lastNotification = notification;

    Logging.info(
      `Notification created: id=${notification.id} device=${device_id} user=${recipientId} type=${type}`
    );

    // Push via FCM to this specific recipient.
    await pushToUser(recipientId, {
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

  return lastNotification;
};

/**
 * Convert all values in a metadata object to strings.
 *
 * Firebase Cloud Messaging requires every value in the `data` payload to be
 * a string. Non-string values (booleans, numbers, objects) will cause the
 * send request to fail with a validation error.
 */
const stringifyMetadata = (
  metadata: Record<string, any> | undefined
): Record<string, string> => {
  if (!metadata) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
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
    attributes: ["fcm_token", "device_type"],
  });

  if (!user || !user.fcm_token) {
    Logging.warn(`No FCM token found for user ${userId}`);
    return null;
  }

  const tokens = [user.fcm_token];
  let response: any;

  if (user.device_type === "ios") {
    response = await messaging().sendEachForMulticast({
      tokens,
      notification: { title: data.title, body: data.body },
      apns: {
        /* unchanged */
      },
      data: {
        type: data.type,
        title: data.title,
        body: data.body,
        channelId: "default_channel",
        device_type: user.device_type ?? "ios",
        ...stringifyMetadata(data.metadata),
      },
    });
  } else {
    response = await messaging().sendEachForMulticast({
      tokens,
      android: { priority: "high" },
      data: {
        type: data.type,
        title: data.title,
        body: data.body,
        channelId: "default_channel",
        device_type: user.device_type ?? "android",
        ...stringifyMetadata(data.metadata),
      },
    });
  }

  Logging.info(
    `FCM push to user ${userId}: success=${response.successCount}, failed=${response.failureCount}`
  );

  /**
   * Log every failed token individually so the exact token, error
   * code and message are visible in the logs (e.g. a
   * "mismatched-credential / SenderId mismatch" points straight at
   * a credential/project pairing problem instead of being buried
   * in a count).
   */
  if (response.failureCount > 0) {
    response.responses.forEach((res: any, index: any) => {
      if (!res.success) {
        Logging.error(
          `FCM push failed for token[${index}] ` +
            `token=${tokens[index]} code=${res.error?.code ?? "unknown"} ` +
            `message=${res.error?.message ?? "no message"} ` +
            `detail=${res.error?.detail ?? ""}`
        );
      }
    });
  }

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
  deviceName: string,
  geofenceName: string,
  event: "in" | "out"
): NotificationPayload => {
  const type: NotificationType =
    event === "in" ? "geo_fence_in" : "geo_fence_out";
  const title = event === "in" ? "Entered geofence" : "Left geofence";
  const body = `${deviceName} ${
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
      deviceName,
    },
  };
};

/**
 * Helper: build an SOS notification payload.
 *
 * @param deviceId   The device UUID (used for the FK `device_id` column).
 * @param deviceName The human-readable device name (used in the body text).
 * @param phoneNumber The SOS phone number / slot label.
 */
export const buildSosNotification = (
  deviceId: string,
  deviceName: string,
  phoneNumber: string
): NotificationPayload => {
  return {
    device_id: deviceId,
    type: "sos",
    title: "SOS Alert",
    body: `SOS triggered from device ${deviceName} (${phoneNumber})`,
    metadata: {
      kind: "sos",
      deviceId,
      deviceName,
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

/**
 * Helper: build a fall-down / fall-detection notification payload.
 */
export const buildFallDownNotification = (
  deviceId: string,
  deviceName: string
): NotificationPayload => {
  return {
    device_id: deviceId,
    type: "fall_detection",
    title: "Fall-down Alert",
    body: `Fall-down detected from ${deviceName}`,
    metadata: {
      kind: "fall_down",
      deviceId,
      deviceName,
    },
  };
};

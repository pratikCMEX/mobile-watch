import db from "../models";
import Logging from "../library/Logging";
import { messaging } from "../config/firebase";
import { Op } from "sequelize";

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
   * Optional pre-resolved recipient list. When omitted, recipients are
   * resolved from DeviceMembers for the supplied device_id.
   */
  user_ids?: string[] | null;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

/**
 * Return every user that is currently assigned to a device. DeviceMembers is
 * the canonical recipient list for shared watches; Devices.owner_id is only a
 * legacy ownership pointer and must not be used to select push recipients.
 */
export const getDeviceMemberUserIds = async (
  deviceId: string
): Promise<string[]> => {
  const members = await db.DeviceMember.findAll({
    where: { device_id: deviceId },
    attributes: ["user_id"],
    raw: true,
  });

  return [
    ...new Set(
      (members as Array<{ user_id?: string | null }>)
        .map((member) => member.user_id)
        .filter((userId): userId is string => Boolean(userId))
    ),
  ];
};

/**
 * Create a notification record and push it to every DeviceMember assigned
 * to the supplied device. DeviceMembers is the canonical recipient source.
 *
 * - `user_ids` → optional pre-resolved recipients; one row and FCM push
 *   are created per user.
 * - `user_id`  → legacy direct recipient, used only when no device_id
 *   membership lookup applies.
 *
 * @param payload - Notification data
 * @returns The created Notification record (or the last one when
 *          fanning out to multiple recipients)
 */
export const createNotification = async (
  payload: NotificationPayload
): Promise<any> => {
  const { device_id, user_id, user_ids, type, title, body, metadata } = payload;

  // Resolve recipients from DeviceMembers for device-scoped notifications.
  // An explicit user_ids list is accepted for callers that have already
  // resolved the membership set; user_id remains available only for direct
  // single-recipient notifications without a device membership lookup.
  const resolveRecipients = async (): Promise<string[]> => {
    if (user_ids !== undefined && user_ids !== null) {
      return [...new Set(user_ids.filter(Boolean))];
    }

    if (device_id) {
      try {
        return await getDeviceMemberUserIds(device_id);
      } catch (err: any) {
        Logging.warn(
          `Could not resolve DeviceMembers for notification device=${device_id}: ${
            err?.message || err
          }`
        );
        return [];
      }
    }

    return user_id ? [user_id] : [];
  };

  const recipients = await resolveRecipients();

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
 * Helper: build a voice-chat notification payload.
 *
 * Sent when the watch uploads a new voice-chat message so watch
 * members are alerted to open the app and listen to it.
 */
export const buildChatNotification = (
  deviceId: string,
  deviceName: string
): NotificationPayload => {
  return {
    device_id: deviceId,
    type: "chat",
    title: "New Voice Message",
    body: `${deviceName} sent a voice message`,
    metadata: {
      kind: "chat",
      deviceId,
      deviceName,
    },
  };
};

/**
 * Check if a device's step count has reached its target and send a
 * one-time "Steps target achieved" notification.
 *
 * Logic:
 *   - If currentSteps >= target AND step_target_achieved is "0":
 *       → Send notification (type: "general")
 *       → Set step_target_achieved to "1"
 *   - If currentSteps < target:
 *       → Reset step_target_achieved to "0" (ready for next achievement)
 *
 * @param deviceId The device whose steps are being checked
 * @param currentSteps The current step count (from latest metric)
 */
export const checkStepTarget = async (deviceId: string): Promise<void> => {
  const deviceSetting = await db.DeviceSetting.findOne({
    where: { device_id: deviceId },
  });

  if (!deviceSetting) return;

  const targetSteps = deviceSetting.walk_time_step_target;

  // No target set — nothing to check
  if (targetSteps === null || targetSteps === undefined) return;

  // Calculate today's steps from cumulative pedometer readings.
  // The watch reports a cumulative step count that never resets; today's
  // actual steps = today's cumulative − the last cumulative reading before today.
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  const [todayRecord, previousRecord] = await Promise.all([
    db.HealthMetric.findOne({
      where: {
        device_id: deviceId,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.between]: [startOfDay, endOfDay] },
      },
      attributes: ["value_primary"],
      order: [["recorded_at", "DESC"]],
    }),
    db.HealthMetric.findOne({
      where: {
        device_id: deviceId,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.lt]: startOfDay },
      },
      attributes: ["value_primary"],
      order: [["recorded_at", "DESC"]],
    }),
  ]);

  const todayValue = todayRecord ? Number(todayRecord.value_primary) : null;
  const previousValue = previousRecord
    ? Number(previousRecord.value_primary)
    : null;

  let currentSteps = 0;
  if (todayValue !== null && Number.isFinite(todayValue)) {
    currentSteps =
      previousValue !== null && Number.isFinite(previousValue)
        ? Math.max(todayValue - previousValue, 0)
        : Math.max(todayValue, 0);
  }

  if (currentSteps >= targetSteps) {
    // Steps reached or exceeded target
    if (deviceSetting.step_target_achieved === "0") {
      // First time achieving target — send notification
      const device = await db.Device.findByPk(deviceId);
      const deviceName = device?.device_name || deviceId;

      // Every assigned watch member receives the step-target notification.
      const userIds = await getDeviceMemberUserIds(deviceId);

      await createNotification({
        device_id: deviceId,
        user_ids: userIds,
        type: "general",
        title: "Steps target achieved",
        body: `You've reached your step target of ${targetSteps} steps! Current: ${currentSteps} steps.`,
        metadata: {
          kind: "step_target",
          deviceId,
          deviceName,
          targetSteps,
          currentSteps,
        },
      });

      // Mark as achieved so notification is not sent again
      deviceSetting.step_target_achieved = "1";
      await deviceSetting.save();

      Logging.info(
        `Step target notification sent for device ${deviceId}: target=${targetSteps}, current=${currentSteps}`
      );
    }
  } else {
    // Steps below target — reset so next achievement triggers notification
    if (deviceSetting.step_target_achieved === "1") {
      deviceSetting.step_target_achieved = "0";
      await deviceSetting.save();

      Logging.info(
        `Step target reset for device ${deviceId}: steps=${currentSteps} below target=${targetSteps}`
      );
    }
  }
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

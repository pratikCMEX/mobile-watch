import db from "../models";
import Logging from "../library/Logging";
import { messaging } from "../config/firebase";
import { Op } from "sequelize";
import { sendAdminNotification } from "../helper/WebNotification";

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

/**
 * Alert notification types that are also pushed to connected admin-panel
 * clients in real time (via each admin's own socket room), in addition
 * to the FCM push sent to the watch owner.
 */
export const ADMIN_ALERT_TYPES: NotificationType[] = [
  "sos",
  "fall_detection",
  "low_battery",
];

/**
 * Every currently-active admin account. Admin-panel clients join their
 * own room (identified by admin id) via the `joinAdmin` socket event, so
 * alert notifications are fanned out to each connected admin individually.
 */
export const getActiveAdminIds = async (): Promise<string[]> => {
  const admins = await db.Admin.findAll({
    where: { status: "active" },
    attributes: ["id"],
    raw: true,
  });
  return admins.map((a: any) => a.id).filter(Boolean);
};

/**
 * Push an alert notification to every currently-active admin's own
 * socket room (identified by admin id). No-op when no admin is active.
 */
export const pushToAdmins = async (
  type: NotificationType,
  title: string,
  message: string,
  data: Record<string, any> = {}
): Promise<void> => {
  const adminIds = await getActiveAdminIds();
  if (adminIds.length === 0) return;

  await Promise.all(
    adminIds.map((admin_id) =>
      sendAdminNotification({
        admin_id,
        type,
        title,
        message,
        data,
      }).catch((err: any) =>
        Logging.warn(
          `Admin socket push failed for ${admin_id}: ${err?.message || err}`
        )
      )
    )
  );
};

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
    // Alert notifications also reach connected admin-panel clients.
    if (ADMIN_ALERT_TYPES.includes(type)) {
      pushToAdmins(type, title, body, {
        notification_id: notification.id,
        device_id,
        ...metadata,
      }).catch((err) =>
        Logging.warn(`Admin socket push failed: ${err?.message || err}`)
      );
    }
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

  // Alert notifications reach connected admin-panel clients exactly once
  // per event (not once per recipient), so admins see a single alert even
  // when the watch is shared across several members.
  if (ADMIN_ALERT_TYPES.includes(type) && lastNotification) {
    pushToAdmins(type, title, body, {
      notification_id: lastNotification.id,
      device_id,
      ...metadata,
    }).catch((err: any) =>
      Logging.warn(`Admin socket push failed: ${err?.message || err}`)
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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const STEP_METRIC_TYPES = ["steps", "steps_daily", "steps_cumulative"] as const;

/**
 * Return the device-local (IST, UTC+5:30) day boundaries as UTC Dates.
 * The watch timestamps are protocol UTC values, while step targets are daily
 * values in the device's local timezone.
 */
const getIstDayBounds = (date: Date = new Date()) => {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const startUtc = Date.UTC(
    istDate.getUTCFullYear(),
    istDate.getUTCMonth(),
    istDate.getUTCDate()
  );

  return {
    start: new Date(startUtc - IST_OFFSET_MS),
    end: new Date(startUtc + 24 * 60 * 60 * 1000 - 1),
  };
};

const getIstDateKey = (date: Date) =>
  new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Reset the achievement flag when a newly inserted step row is the first step
 * log for a newer device-local day. Late backfills for older dates do not
 * disturb the current day's achievement state.
 */
const resetAchievementForNewStepDay = async (
  deviceId: string,
  recordedAt: Date,
  healthMetricId?: string,
  isNewMetric = true
): Promise<void> => {
  if (!isNewMetric) return;

  const latestStep = await db.HealthMetric.findOne({
    where: {
      device_id: deviceId,
      metric_type: { [Op.in]: STEP_METRIC_TYPES },
      ...(healthMetricId ? { id: { [Op.ne]: healthMetricId } } : {}),
    },
    attributes: ["recorded_at"],
    order: [["recorded_at", "DESC"]],
  });

  const incomingDateKey = getIstDateKey(recordedAt);
  const latestDateKey = latestStep
    ? getIstDateKey(latestStep.recorded_at)
    : null;

  if (
    !latestStep ||
    (latestDateKey !== null && latestDateKey < incomingDateKey)
  ) {
    const [updated] = (await db.DeviceSetting.update(
      { step_target_achieved: "0" },
      {
        where: {
          device_id: deviceId,
          step_target_achieved: "1",
        },
      }
    )) as [number];

    if (updated) {
      Logging.info(
        `Step target achievement reset for device ${deviceId}: new step day=${incomingDateKey}`
      );
    }
  }
};

/**
 * Calculate the current daily step total from the cumulative pedometer stream.
 */
const getCurrentStepCount = async (
  deviceId: string,
  dayBounds = getIstDayBounds()
): Promise<number> => {
  const { start, end } = dayBounds;
  const [todayRecord, previousRecord] = await Promise.all([
    db.HealthMetric.findOne({
      where: {
        device_id: deviceId,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.between]: [start, end] },
      },
      attributes: ["value_primary"],
      order: [["recorded_at", "DESC"]],
    }),
    db.HealthMetric.findOne({
      where: {
        device_id: deviceId,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.lt]: start },
      },
      attributes: ["value_primary"],
      order: [["recorded_at", "DESC"]],
    }),
  ]);

  const todayValue = todayRecord ? Number(todayRecord.value_primary) : null;
  const previousValue = previousRecord
    ? Number(previousRecord.value_primary)
    : null;

  if (todayValue === null || !Number.isFinite(todayValue)) return 0;

  return previousValue !== null && Number.isFinite(previousValue)
    ? Math.max(todayValue - previousValue, 0)
    : Math.max(todayValue, 0);
};

/**
 * Check if a device's daily step count has reached its target and send one
 * notification to every DeviceMember. The achievement flag is claimed with a
 * conditional update so concurrent step uploads cannot send duplicates.
 *
 * `incomingSteps` is used for explicit daily step uploads. Cumulative uploads
 * continue to use the daily delta calculated from the pedometer stream.
 * `recordedAt` and `healthMetricId` identify the step log used for the daily
 * reset check.
 */
export const checkStepTarget = async (
  deviceId: string,
  incomingSteps?: number | null,
  metricType?: string,
  recordedAt: Date = new Date(),
  healthMetricId?: string,
  isNewMetric = true
): Promise<void> => {
  const deviceSetting = await db.DeviceSetting.findOne({
    where: { device_id: deviceId },
  });

  if (!deviceSetting) return;

  const targetSteps = Number(deviceSetting.walk_time_step_target);
  if (!Number.isFinite(targetSteps) || targetSteps <= 0) return;

  const dayBounds = getIstDayBounds(recordedAt);
  await resetAchievementForNewStepDay(
    deviceId,
    recordedAt,
    healthMetricId,
    isNewMetric
  );

  const isDailyStepUpload =
    metricType === "steps_daily" &&
    incomingSteps !== undefined &&
    incomingSteps !== null &&
    Number.isFinite(Number(incomingSteps));
  const currentSteps = isDailyStepUpload
    ? Math.max(Number(incomingSteps), 0)
    : await getCurrentStepCount(deviceId, dayBounds);

  if (currentSteps < targetSteps) {
    if (deviceSetting.step_target_achieved === "1") {
      await db.DeviceSetting.update(
        { step_target_achieved: "0" },
        {
          where: {
            device_id: deviceId,
            step_target_achieved: "1",
          },
        }
      );

      Logging.info(
        `Step target reset for device ${deviceId}: steps=${currentSteps} below target=${targetSteps}`
      );
    }
    return;
  }

  // Only one concurrent step upload may claim this achievement.
  const [claimed] = (await db.DeviceSetting.update(
    { step_target_achieved: "1" },
    {
      where: {
        device_id: deviceId,
        step_target_achieved: "0",
        walk_time_step_target: targetSteps,
      },
    }
  )) as [number];

  if (!claimed) return;

  const device = await db.Device.findByPk(deviceId);
  const deviceName = device?.device_name || deviceId;
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

  Logging.info(
    `Step target notification sent for device ${deviceId}: target=${targetSteps}, current=${currentSteps}`
  );
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

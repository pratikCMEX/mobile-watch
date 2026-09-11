import { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  customMessage,
} from "../../library/Response";
import Logging from "../../library/Logging";
import { tcpServer } from "../../app";

/**
 * Country code auto-prepended to 10-digit national numbers on the wire.
 * Override with the env var SOS_DEFAULT_COUNTRY_CODE.
 * (Same convention as the Emergency_contact controller.)
 */
const DEFAULT_COUNTRY_CODE = (
  process.env.SOS_DEFAULT_COUNTRY_CODE || ""
).replace(/[^0-9]/g, "");

/**
 * Convert a value that may be a boolean or a string "1"/"0" into a
 * proper boolean.  This keeps the API backward-compatible with clients
 * that still send the legacy string form while the model stores BOOLEAN.
 */
function toBoolean(value: any): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "1") return true;
    if (value === "0") return false;
  }
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

const updateDeviceSettings = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      device_id,
      device_type,
      sms_alert_enabled,
      take_off_device_alert,
      safe_mode,
      talking_clock,
      night_power_saving,
      volume,
      brightness,
      fall_down_alert_enabled,
      fall_down_reminder_call,
      fall_down_level,
      scene_mode,
      low_battery_alert,
    } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // ── Normalise fall-down fields to booleans ──────────────
    // The API may receive "1"/"0" strings (legacy) or true/false
    // booleans.  The DeviceSetting model stores BOOLEAN, so we
    // normalise here before persisting.
    const fallDownAlertEnabled = toBoolean(fall_down_alert_enabled);
    const fallDownReminderCall = toBoolean(fall_down_reminder_call);

    // ── Determine max sensitivity level from device_type ────
    // Android: 1–6, RT OS: 1–8.  Default to Android (6).
    const isRtOs =
      device_type === "rtos" || device_type === "rt_os" || device_type === "8";
    const maxLevel: 6 | 8 = isRtOs ? 8 : 6;

    // ── Validate fall_down_level against device type ────────
    if (fall_down_level !== undefined && fall_down_level !== null) {
      const levelNum = Number(fall_down_level);
      if (isNaN(levelNum) || levelNum < 1 || levelNum > maxLevel) {
        return errorMessage(
          res,
          `Invalid fall_down_level ${fall_down_level}. Must be 1–${maxLevel} (${
            isRtOs ? "RT OS" : "Android"
          } device).`
        );
      }
    }

    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id,
        sms_alert_enabled: sms_alert_enabled ?? "0",
        take_off_device_alert: take_off_device_alert ?? "0",
        safe_mode: safe_mode ?? "0",
        talking_clock: talking_clock ?? "0",
        night_power_saving: night_power_saving ?? "0",
        volume: volume ?? 50,
        brightness: brightness ?? 50,
        fall_down_alert_enabled:
          fallDownAlertEnabled === undefined
            ? "0"
            : fallDownAlertEnabled
            ? "1"
            : "0",
        fall_down_reminder_call:
          fallDownReminderCall === undefined
            ? "0"
            : fallDownReminderCall
            ? "1"
            : "0",
        fall_down_level: fall_down_level ?? 5,
        scene_mode: scene_mode ?? 1,
        reject_stranger_enabled: "0",
        upload_interval_seconds: null,
        walk_time_enabled: "0",
        walk_time_sections: [],
        walk_time_step_target: null,
        low_battery_alert: low_battery_alert ?? "0",
      });
    } else {
      if (sms_alert_enabled !== undefined)
        deviceSetting.sms_alert_enabled = sms_alert_enabled;
      if (take_off_device_alert !== undefined)
        deviceSetting.take_off_device_alert = take_off_device_alert;
      if (safe_mode !== undefined) deviceSetting.safe_mode = safe_mode;
      if (talking_clock !== undefined)
        deviceSetting.talking_clock = talking_clock;
      if (night_power_saving !== undefined)
        deviceSetting.night_power_saving = night_power_saving;
      if (volume !== undefined) deviceSetting.volume = volume;
      if (brightness !== undefined) deviceSetting.brightness = brightness;
      if (fallDownAlertEnabled !== undefined)
        deviceSetting.fall_down_alert_enabled = fallDownAlertEnabled
          ? "1"
          : "0";
      if (fallDownReminderCall !== undefined)
        deviceSetting.fall_down_reminder_call = fallDownReminderCall
          ? "1"
          : "0";
      if (fall_down_level !== undefined)
        deviceSetting.fall_down_level = Number(fall_down_level);
      if (scene_mode !== undefined) deviceSetting.scene_mode = scene_mode;
      if (low_battery_alert !== undefined)
        deviceSetting.low_battery_alert = low_battery_alert;

      await deviceSetting.save();
    }

    // ── Push settings to the device via TCP ──────────────────
    // Only attempt if the device has a serial_number and is
    // currently connected via TCP.
    const tcpCommands: string[] = [];

    if (device.serial_number) {
      const tcpClient = tcpServer.getDevice(device.serial_number);

      if (tcpClient) {
        // Send FALLDOWN command if alert or call-center switch changed
        if (
          fallDownAlertEnabled !== undefined ||
          fallDownReminderCall !== undefined
        ) {
          const alertVal =
            fallDownAlertEnabled !== undefined
              ? fallDownAlertEnabled
              : deviceSetting.fall_down_alert_enabled === "1";
          const callVal =
            fallDownReminderCall !== undefined
              ? fallDownReminderCall
              : deviceSetting.fall_down_reminder_call === "1";

          const sent = tcpServer.sendFallDownCommand(
            device.serial_number,
            alertVal,
            callVal
          );
          if (sent) {
            const x = alertVal ? "1" : "0";
            const y = callVal ? "1" : "0";
            tcpCommands.push(
              `[3G*${device.serial_number}*${Buffer.byteLength(
                `FALLDOWN,${x},${y}`,
                "utf8"
              )
                .toString(16)
                .padStart(4, "0")}*FALLDOWN,${x},${y}]`
            );
          }
        }

        // Send LSSET command if sensitivity level changed
        if (fall_down_level !== undefined && fall_down_level !== null) {
          const levelNum = Number(fall_down_level);
          const sent = tcpServer.sendLssetCommand(
            device.serial_number,
            levelNum,
            maxLevel
          );
          if (sent) {
            const content = `LSSET,${levelNum}+${maxLevel}`;
            tcpCommands.push(
              `[3G*${device.serial_number}*${Buffer.byteLength(content, "utf8")
                .toString(16)
                .padStart(4, "0")}*${content}]`
            );
          }
        }

        // Send LOWBAT command if low battery alert switch changed
        if (low_battery_alert !== undefined) {
          const lowBatEnabled = low_battery_alert === "1";
          const sent = tcpServer.sendLowBatteryCommand(
            device.serial_number,
            lowBatEnabled
          );
          if (sent) {
            const flag = lowBatEnabled ? "1" : "0";
            tcpCommands.push(
              `[CS*${device.serial_number}*0008*LOWBAT,${flag}]`
            );
          }
        }
      }
    }

    const response: any = {
      device_id: device.id,
      device_name: device.device_name,
      serial_number: device.serial_number,
      settings: {
        ...deviceSetting.toJSON(),
        fall_down_alert_enabled: deviceSetting.fall_down_alert_enabled === "1",
        fall_down_reminder_call: deviceSetting.fall_down_reminder_call === "1",
        low_battery_alert: deviceSetting.low_battery_alert === "1",
      },
    };

    if (tcpCommands.length > 0) {
      response.tcp_commands_sent = tcpCommands;
      response.command_message =
        "Settings pushed to device via TCP. Device will acknowledge.";
    } else if (device.serial_number) {
      response.command_message =
        "Device is not connected via TCP. Settings saved to database only. They will be applied when the device reconnects.";
    } else {
      response.command_message =
        "Device has no serial_number. Settings saved to database only.";
    }

    return successMessage(
      res,
      "Device settings updated successfully",
      response
    );
  } catch (err) {
    console.error("updateDeviceSettings error:", err);
    return errorMessage(res, "Error updating device settings");
  }
};

const aboutDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const deviceData = device.toJSON();

    return successMessage(res, "Device details fetched successfully", {
      // Device Info
      id: deviceData.id,
      device_name: deviceData.device_name,
      connection_status: deviceData.connection_status,
      country_code: deviceData.country_code,
      phone_number: deviceData.phone_number,
      network_type: deviceData.network_type,
      gps_strength: deviceData.gps_strength,
      imei: deviceData.imei,
      serial_number: deviceData.serial_number,

      // Firmware / software
      firmware_version: deviceData.firmware_version,

      // Network & connection
      signal_status: deviceData.signal_status,
      network_status: deviceData.network_status,
      gprs_enabled: deviceData.gprs_enabled,

      // WiFi
      wifi_enabled: deviceData.wifi_enabled,
      wifi_connected: deviceData.wifi_connected,

      // Battery
      battery_percentage: deviceData.battery_percentage,

      // Intervals
      location_interval_minutes: deviceData.location_interval_minutes,
      heartbeat_interval_seconds: deviceData.heartbeat_interval_seconds,

      // Locale
      language: deviceData.language,
      timezone: deviceData.timezone,

      // Device Settings
    });
  } catch (err) {
    console.error("aboutDevice error:", err);
    return errorMessage(res, "Error fetching device details");
  }
};

const getDeviceSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id },
    });

    // If no settings exist, create default settings
    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
        low_battery_alert: "0",
      });
    }

    // Scene mode descriptions
    const sceneModeDescriptions: Record<number, string> = {
      1: "Vibration and ringing",
      2: "Ringing only",
      3: "Vibration only",
      4: "Silence",
    };

    return successMessage(res, "Device settings fetched successfully", {
      device_id: device.id,
      device_name: device.device_name,
      serial_number: device.serial_number,
      settings: {
        sms_alert_enabled: deviceSetting.sms_alert_enabled,
        take_off_device_alert: deviceSetting.take_off_device_alert,
        safe_mode: deviceSetting.safe_mode,
        talking_clock: deviceSetting.talking_clock,
        night_power_saving: deviceSetting.night_power_saving,
        volume: deviceSetting.volume,
        brightness: deviceSetting.brightness,
        fall_down_alert_enabled: deviceSetting.fall_down_alert_enabled === "1",
        fall_down_reminder_call: deviceSetting.fall_down_reminder_call === "1",
        fall_down_level: deviceSetting.fall_down_level,
        scene_mode: deviceSetting.scene_mode,
        scene_mode_description:
          sceneModeDescriptions[deviceSetting.scene_mode] || "Unknown",
        // Dynamic-state upload time interval (UPLOAD command).
        // Stored in seconds to match the wire protocol exactly.
        upload_interval_seconds: deviceSetting.upload_interval_seconds ?? null,
        // Pedometer / walk-time (WALKTIME command). Devices ship
        // with this feature OFF.
        walk_time_enabled: deviceSetting.walk_time_enabled === "1",
        walk_time_sections: deviceSetting.walk_time_sections ?? [],
        walk_time_step_target: deviceSetting.walk_time_step_target ?? null,
        // Low battery alarm SMS alert (LOWBAT command)
        low_battery_alert: deviceSetting.low_battery_alert === "1",
        // Locale (last-known values sent to the device via LZ command)
        language: device.language,
        timezone: device.timezone,
      },
    });
  } catch (err) {
    console.error("getDeviceSettings error:", err);
    return errorMessage(res, "Error fetching device settings");
  }
};

const getDeviceStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const deviceData = device.toJSON();

    const serialNumber = deviceData.serial_number;

    let commandSent = false;
    let commandMessage = "Device is offline or not connected";

    if (serialNumber) {
      const tcpClient = tcpServer.getDevice(serialNumber);

      if (tcpClient) {
        commandSent = tcpServer.sendDeviceStatusCommand(serialNumber);

        if (commandSent) {
          commandMessage =
            "TS command sent to device. Response will update the database.";
        } else {
          commandMessage = "Failed to send TS command to device";
        }
      } else {
        commandMessage =
          "Device is not connected via TCP. Returning last known data.";
      }
    } else {
      commandMessage = "Device has no serial_number. Cannot send TS command.";
    }

    let sceneMode: number | null = null;
    let sceneModeDescription: string | null = null;

    const deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (deviceSetting) {
      sceneMode = deviceSetting.scene_mode;
      const sceneModeDescriptions: Record<number, string> = {
        1: "Vibration and ringing",
        2: "Ringing only",
        3: "Vibration only",
        4: "Silence",
      };
      sceneModeDescription =
        sceneModeDescriptions[deviceSetting.scene_mode] || "Unknown";
    }

    Logging.info(
      `Device status requested for device ${device.id} (serial: ${serialNumber}): ` +
        `command_sent=${commandSent}`
    );

    return successMessage(res, "Device status fetched successfully", {
      device_id: deviceData.id,

      device_name: deviceData.device_name,
      serial_number: deviceData.serial_number,
      imei: deviceData.imei,
      sim_card_number: deviceData.phone_number,
      firmware_version: deviceData.firmware_version,
      is_online: deviceData.is_online,
      connection_status: deviceData.connection_status,
      network_type: deviceData.network_type,
      network_carrier: deviceData.network_carrier,
      signal_status: deviceData.signal_status,
      network_status: deviceData.network_status,
      gprs_enabled: deviceData.gprs_enabled,
      gps_strength: deviceData.gps_strength,
      gps_status: deviceData.gps_status,
      wifi_enabled: deviceData.wifi_enabled,
      wifi_connected: deviceData.wifi_connected,
      battery_percentage: deviceData.battery_percentage,
      location_interval_minutes: deviceData.location_interval_minutes,
      heartbeat_interval_seconds: deviceData.heartbeat_interval_seconds,
      language: deviceData.language,
      timezone: deviceData.timezone,
      scene_mode: sceneMode,
      scene_mode_description: sceneModeDescription,
      last_updated_at: deviceData.last_updated_at,
      command_sent: commandSent,
      command_message: commandMessage,
    });
  } catch (err) {
    console.error("getDeviceStatus error:", err);
    return errorMessage(res, "Error fetching device status");
  }
};

const restartDevice = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendRestartCommand(serial_number);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send restart command. Device may be disconnected."
      );
    }

    Logging.info(
      `Restart command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(res, "Restart command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      command_sent: true,
      command_message:
        "RESET command sent to device. The device will restart and reconnect.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("restartDevice error:", err);
    return errorMessage(res, "Error sending restart command");
  }
};

/**
 * Command types:
 * 1 = restart (RESET)
 * 2 = shutdown (POWEROFF)
 * 3 = factory_reset (FACTORY)
 */
const COMMAND_TYPES = {
  RESTART: 1,
  SHUTDOWN: 2,
  FACTORY_RESET: 3,
} as const;

const COMMAND_NAMES: Record<number, string> = {
  [COMMAND_TYPES.RESTART]: "restart",
  [COMMAND_TYPES.SHUTDOWN]: "shutdown",
  [COMMAND_TYPES.FACTORY_RESET]: "factory_reset",
};

const sendDeviceCommand = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, command } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (command === undefined || command === null) {
      return errorMessage(res, "command is required");
    }

    // Validate command type
    const validCommands = [
      COMMAND_TYPES.RESTART,
      COMMAND_TYPES.SHUTDOWN,
      COMMAND_TYPES.FACTORY_RESET,
    ];
    if (!validCommands.includes(command)) {
      return errorMessage(
        res,
        "Invalid command. Must be 1 (restart), 2 (shutdown), or 3 (factory_reset)"
      );
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    let commandSent = false;
    let commandMessage = "";
    let commandProtocol = "";

    // Send appropriate command based on type
    switch (command) {
      case COMMAND_TYPES.RESTART:
        commandSent = tcpServer.sendRestartCommand(serial_number);
        commandMessage =
          "RESET command sent to device. The device will restart and reconnect.";
        commandProtocol = `[3G*${serial_number}*0005*RESET]`;
        break;

      case COMMAND_TYPES.SHUTDOWN:
        commandSent = tcpServer.sendShutdownCommand(serial_number);
        commandMessage =
          "POWEROFF command sent to device. The device will shut down.";
        commandProtocol = `[CS*${serial_number}*0008*POWEROFF]`;
        break;

      case COMMAND_TYPES.FACTORY_RESET:
        commandSent = tcpServer.sendFactoryCommand(serial_number);
        commandMessage =
          "FACTORY command sent to device. The device will perform a factory reset.";
        commandProtocol = `[CS*${serial_number}*0007*FACTORY]`;

        // ── Remove all device data from the database ──────────
        // A factory reset wipes the watch clean; mirror that on the
        // server so stale data does not linger.
        try {
          Logging.info(
            `Factory reset: removing all data for device ${serial_number} (device_id: ${device.id})`
          );

          await db.DeviceSetting.destroy({
            where: { device_id: device.id },
          });

          await db.DeviceMember.destroy({
            where: { device_id: device.id },
          });

          await db.Location.destroy({
            where: { device_id: device.id },
          });

          await db.Geofence.destroy({
            where: { device_id: device.id },
          });

          await db.EmergencyContact.destroy({
            where: { device_id: device.id },
          });

          await db.HealthMetric.destroy({
            where: { device_id: device.id },
          });

          await db.Snapshot.destroy({
            where: { device_id: device.id },
          });

          await db.Notification.destroy({
            where: { device_id: device.id },
          });

          await db.DeviceSilenceTime.destroy({
            where: { device_id: device.id },
          });

          await db.DevicePhonebook.destroy({
            where: { device_id: device.id },
          });

          await db.DeviceAutoAnswer.destroy({
            where: { device_id: device.id },
          });

          await db.Reminder.destroy({
            where: { device_id: device.id },
          });

          await db.FamilyMember.destroy({
            where: { device_id: device.id },
          });

          // Finally remove the device row itself.
          await db.Device.destroy({
            where: { id: device.id },
          });

          Logging.info(
            `Factory reset: all data removed for device ${serial_number}`
          );
        } catch (cleanupErr) {
          console.error(
            `Factory reset cleanup error for device ${serial_number}:`,
            cleanupErr
          );
          Logging.error(
            `Failed to cleanup device data for ${serial_number}: ${
              (cleanupErr as Error).message
            }`
          );
        }
        break;
    }

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send command. Device may be disconnected."
      );
    }

    Logging.info(
      `${COMMAND_NAMES[command]} command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(
      res,
      `${COMMAND_NAMES[command]} command sent successfully`,
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        command,
        command_name: COMMAND_NAMES[command],
        command_sent: true,
        command_message: commandMessage,
        command_protocol: commandProtocol,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err) {
    console.error("sendDeviceCommand error:", err);
    return errorMessage(res, "Error sending command to device");
  }
};

const findDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendFindCommand(serial_number);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send find device command. Device may be disconnected."
      );
    }

    const commandProtocol = `[3G*${serial_number}*0004*FIND]`;

    Logging.info(
      `Find device command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(res, "Find device command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      command_sent: true,
      command_message:
        "FIND command sent to device. The device will respond with its location or alert.",
      command_protocol: commandProtocol,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("findDevice error:", err);
    return errorMessage(res, "Error sending find device command");
  }
};

const setAlarm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serial_number, alarms } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (!alarms || !Array.isArray(alarms) || alarms.length === 0) {
      return errorMessage(res, "alarms array is required (1-3 alarms)");
    }

    if (alarms.length > 3) {
      return errorMessage(res, "Maximum 3 alarms allowed");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendAlarmCommand(serial_number, alarms);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send alarm command. Device may be disconnected."
      );
    }

    // Build the command protocol string for response (LEN is hex).
    const alarmPayload = alarms.join(",");
    const content = `REMIND,${alarmPayload}`;
    const length = content.length.toString(16).padStart(4, "0");
    const commandProtocol = `[CS*${serial_number}*${length}*${content}]`;

    Logging.info(
      `Alarm command sent to device ${serial_number} (device_id: ${
        device.id
      }): ${alarms.join(", ")}`
    );

    return successMessage(res, "Alarm set successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      alarms: alarms,
      alarm_count: alarms.length,
      command_sent: true,
      command_message:
        "REMIND command sent to device. The device will update its alarm settings.",
      command_protocol: commandProtocol,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setAlarm error:", err);
    return errorMessage(res, "Error sending alarm command");
  }
};

const captureSnapshot = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendCaptureCommand(serial_number);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send snapshot command. Device may be disconnected."
      );
    }

    const commandProtocol = `[3G*${serial_number}*0008*rcapture]`;

    Logging.info(
      `Remote snapshot command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(res, "Remote snapshot command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      command_sent: true,
      command_message:
        "rcapture command sent to device. The device will capture a photo and send it back.",
      command_protocol: commandProtocol,
      note: "The device will respond with image data in format: [3G*YYYYYYYYYY*len*img,x,y,z]. The image will be automatically saved when received.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("captureSnapshot error:", err);
    return errorMessage(res, "Error sending snapshot command");
  }
};

// ────────────────────────────────────────────────────────────
// Auto-Answer (ACALL) — turn the watch's auto-answer feature on
// or off, and (optionally) configure the up-to-3 phone numbers
// that are allowed to auto-answer when they call the watch.
// ────────────────────────────────────────────────────────────

/**
 * Toggle the watch's auto-answer feature.
 *
 * Wire protocol:
 *   OFF  → [3G*<id>*0007*ACALL,0]
 *   ON   → [3G*<id>*LEN*ACALL,<num1>,<num2>,<num3>]
 *
 *   - When `enabled` is false, `numbers` is ignored.
 *   - When `enabled` is true, you must provide at least one phone
 *     number (max 3). Unused slots are sent as empty so the
 *     firmware wipes any previously-stored numbers in those slots.
 *   - Phone numbers must be 5–20 ASCII digits (country code
 *     included, no '+' / '-' / spaces).
 *
 * Device reply is handled by TcpServer.handleAutoAnswerResponse().
 */
const setAutoAnswer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, enabled, numbers = [] } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Send the ACALL command. tcpServer does additional validation
    // (refuses empty numbers when enabled=true, etc.) and returns
    // false on rejection — surface that as a 422 to the caller.
    const commandSent = tcpServer.sendAutoAnswerCommand(
      serial_number,
      Boolean(enabled),
      Array.isArray(numbers) ? numbers : []
    );

    if (!commandSent) {
      const msg = enabled
        ? "Failed to send ACALL command. Ensure you provide 1–3 valid phone numbers (5–20 ASCII digits, no '+')."
        : "Failed to send ACALL command. Device may be disconnected.";
      return customMessage(res, 422, msg);
    }

    // ── Mirror to the server-side DeviceAutoAnswers table ──
    // Pad to exactly 3 slots so the table layout matches the wire
    // packet shape (ACALL,n1,n2,n3). Empty strings = "this slot is
    // unused — clear it on the watch".
    const cleaned = (Array.isArray(numbers) ? numbers : [])
      .map((n: any) => (n || "").toString().trim())
      .filter((n: string) => n.length > 0);
    while (cleaned.length < 3) cleaned.push("");

    const db_results: Array<{
      slot_index: number;
      name: string | null;
      phone_number: string;
      country_code: string | null;
      created: boolean;
      id: string;
    }> = [];

    if (enabled) {
      for (let i = 0; i < 3; i++) {
        const slot = i + 1;
        const raw = cleaned[i];
        if (!raw) {
          // Empty slot — wipe any previously-stored row at this slot.
          await db.DeviceAutoAnswer.destroy({
            where: { device_id: device.id, slot_index: slot },
          });
          continue;
        }
        // Split the digits-only phone into country_code + national_number
        // so analytics / display layers can format it back as +CC NNNNN NNNNN.
        let cc = "";
        let pn = raw;
        if (DEFAULT_COUNTRY_CODE && raw.startsWith(DEFAULT_COUNTRY_CODE)) {
          cc = DEFAULT_COUNTRY_CODE;
          pn = raw.substring(DEFAULT_COUNTRY_CODE.length);
        }

        const [row, created] = await db.DeviceAutoAnswer.findOrCreate({
          where: { device_id: device.id, slot_index: slot },
          defaults: {
            device_id: device.id,
            slot_index: slot,
            name: null,
            phone_number: pn,
            country_code: cc,
          },
        });
        if (!created) {
          row.phone_number = pn;
          row.country_code = cc;
          await row.save();
        }
        db_results.push({
          id: row.id,
          slot_index: slot,
          name: row.name,
          phone_number: row.phone_number,
          country_code: row.country_code,
          created,
        });
      }
    } else {
      // Auto-answer turned OFF — wipe the entire mirror table.
      // await db.DeviceAutoAnswer.destroy({ where: { device_id: device.id } });
    }

    // Build a representative command_protocol string for the
    // response (mirrors what the on-wire packet looks like).
    let commandProtocol: string;
    if (!enabled) {
      commandProtocol = `[3G*${serial_number}*0007*ACALL,0]`;
    } else {
      const content = `ACALL,${cleaned.join(",")}`;
      const lenHex = Buffer.byteLength(content, "utf8")
        .toString(16)
        .padStart(4, "0");
      commandProtocol = `[3G*${serial_number}*${lenHex}*${content}]`;
    }

    Logging.info(
      `Auto-answer (ACALL) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, enabled=${Boolean(enabled)}, ` +
        `numbers=${JSON.stringify(enabled ? cleaned.filter((s) => s) : [])})`
    );

    return successMessage(res, "Auto-answer command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: Boolean(enabled),
      numbers: enabled ? cleaned.filter((s) => s) : [],
      db_results,
      command_sent: true,
      command_message: enabled
        ? "ACALL ON command sent. Device will auto-answer calls from the listed numbers (1–3)."
        : "ACALL OFF command sent. Device will no longer auto-answer incoming calls.",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*0005*ACALL] (ack = success) or [3G*<id>*0007*ACALL,0] (failure).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setAutoAnswer error:", err);
    return errorMessage(res, "Error sending auto-answer command");
  }
};

// ────────────────────────────────────────────────────────────
// Outgoing Call (CALL) — instruct the watch to dial a phone number.
// ────────────────────────────────────────────────────────────

/**
 * POST /user/device/make_outgoing_call
 *
 * Instructs the watch to dial the given phone number.
 *
 * Wire protocol:
 *   Server send : [3G*<id>*<LEN>*CALL,<phoneNumber>]
 *   Device reply: [3G*<id>*0004*CALL]   (bare ack = device is dialing)
 *
 * Request body:
 *   {
 *     "serial_number": "8800000015",
 *     "phone_number":  "00000000000"
 *   }
 *
 * Phone numbers MUST be digits only — no '+', no spaces, no dashes.
 * Always include the country code (e.g. "919999999999" for an Indian
 * mobile). If the country code is missing, prefix it before calling
 * this method.
 */
const makeOutgoingCall = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, phone_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (!phone_number) {
      return errorMessage(res, "phone_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Send the CALL command. tcpServer does additional validation
    // (refuses empty/short/long numbers) and returns false on
    // rejection — surface that as a 422 to the caller.
    const commandSent = tcpServer.sendOutgoingCallCommand(
      serial_number,
      phone_number
    );

    if (!commandSent) {
      return customMessage(
        res,
        422,
        "Failed to send CALL command. Ensure phone_number is 5–20 ASCII digits (no '+')."
      );
    }

    // Build the command protocol string for response (LEN is hex).
    const digits = (phone_number || "").replace(/[^0-9]/g, "");
    const content = `CALL,${digits}`;
    const length = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[3G*${serial_number}*${length}*${content}]`;

    Logging.info(
      `Outgoing call (CALL) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, phone=${digits})`
    );

    return successMessage(res, "Outgoing call command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      phone_number: digits,
      command_sent: true,
      command_message:
        "CALL command sent to device. The device will dial the specified phone number.",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*0004*CALL] (ack = device is dialing).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("makeOutgoingCall error:", err);
    return errorMessage(res, "Error sending outgoing call command");
  }
};

// ────────────────────────────────────────────────────────────
// List all auto-answer (ACALL) numbers currently stored
// server-side for a device.
// ────────────────────────────────────────────────────────────
const listAutoAnswer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.body || {};

    // Look up the device
    let device = null as any;
    if (device_id) {
      device = await db.Device.findByPk(device_id);
    } else {
      return errorMessage(res, "serial_number or device_id is required");
    }

    if (!device) {
      return errorMessage(
        res,
        `Device with ${
          device_id
            ? `id '${device_id}'`
            : `serial_number '${device.serial_number}'`
        } not found`
      );
    }

    const rows = await db.DeviceAutoAnswer.findAll({
      where: { device_id: device.id },
      attributes: [
        "id",
        "slot_index",
        "name",
        "phone_number",
        "country_code",
        "createdAt",
        "updatedAt",
      ],
      order: [["slot_index", "ASC"]],
    });

    const numbers = rows.map((r: any) => {
      const cc = r.country_code || "";
      const pn = r.phone_number || "";
      return {
        id: r.id,
        slot_index: r.slot_index,
        name: r.name,
        phone_number: cc + pn, // digits-only, country code included
        country_code: cc,
        national_number: pn,
        e164: cc ? `+${cc}${pn}` : pn,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return successMessage(res, "Auto-answer numbers fetched successfully", {
      serial_number: device.serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: numbers.length > 0,
      count: numbers.length,
      numbers,
      command_message:
        numbers.length === 0
          ? "No auto-answer numbers stored. Use POST /user/device/auto_answer to enable."
          : `Stored ${numbers.length} auto-answer number(s) in DeviceAutoAnswers. The watch will auto-answer calls from these numbers.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("listAutoAnswer error:", err);
    return errorMessage(res, "Error fetching auto-answer numbers");
  }
};

// ────────────────────────────────────────────────────────────
// SOS-SMS (SOSSMS) — toggle the watch's "send SMS to SOS numbers
// after an SOS alarm" switch.
//
// Wire protocol:
//   OFF  → [3G*<id>*0008*SOSSMS,0]
//   ON   → [3G*<id>*0008*SOSSMS,1]
//
// Device reply:
//   [3G*<id>*0006*SOSSMS]            (bare ack = success)
//   [3G*<id>*0008*SOSSMS,0]          (failure, some firmwares)
// ────────────────────────────────────────────────────────────

const setSosSms = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serial_number, enabled } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendSosSmsCommand(
      serial_number,
      Boolean(enabled)
    );
    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send SOSSMS command. Device may be disconnected."
      );
    }

    const flag = enabled ? "1" : "0";
    const commandProtocol = `[3G*${serial_number}*0008*SOSSMS,${flag}]`;

    Logging.info(
      `SOS-SMS (SOSSMS) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, enabled=${Boolean(enabled)})`
    );

    return successMessage(res, "SOS-SMS command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: Boolean(enabled),
      command_sent: true,
      command_message: enabled
        ? "SOSSMS ON command sent. Device will send an SMS to each SOS number after an SOS alarm."
        : "SOSSMS OFF command sent. Device will NOT send an SMS after an SOS alarm (will still dial if configured).",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*0006*SOSSMS] (ack = success) or [3G*<id>*0008*SOSSMS,0] (failure).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setSosSms error:", err);
    return errorMessage(res, "Error sending SOS-SMS command");
  }
};

// ────────────────────────────────────────────────────────────
// Fall-Down Alarm Alert (FALLDOWN) — toggle the watch's
// fall-down alarm alert switch and the "call center number
// after fall" switch.
//
// Wire protocol:
//   Server send : [3G*<id>*<LEN>*FALLDOWN,X,Y]
//                 X = fall-down alarm alert switch (1=ON, 0=OFF)
//                 Y = call center number after fall  (1=ON, 0=OFF)
//   Device reply: [3G*<id>*<LEN>*FALLDOWN]  (bare ack = success)
//
// Server-side mirror: DeviceSetting.fall_down_alert_enabled
//                     DeviceSetting.fall_down_reminder_call
// ────────────────────────────────────────────────────────────

const setFallDownAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, alert_enabled, call_center } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const alertEnabled = Boolean(alert_enabled);
    const callCenter = Boolean(call_center);

    const commandSent = tcpServer.sendFallDownCommand(
      serial_number,
      alertEnabled,
      callCenter
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send FALLDOWN command. Device may be disconnected."
      );
    }

    // Mirror to the server-side DeviceSetting table.
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: alertEnabled ? "1" : "0",
        fall_down_reminder_call: callCenter ? "1" : "0",
        fall_down_level: 5,
        scene_mode: 1,
        low_battery_alert: "0",
      });
    } else {
      deviceSetting.fall_down_alert_enabled = alertEnabled ? "1" : "0";
      deviceSetting.fall_down_reminder_call = callCenter ? "1" : "0";
      await deviceSetting.save();
    }

    const x = alertEnabled ? "1" : "0";
    const y = callCenter ? "1" : "0";
    const content = `FALLDOWN,${x},${y}`;
    const lenHex = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[3G*${serial_number}*${lenHex}*${content}]`;

    Logging.info(
      `Fall-down alarm (FALLDOWN) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, alert_enabled=${alertEnabled}, call_center=${callCenter})`
    );

    return successMessage(res, "Fall-down alarm command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      alert_enabled: alertEnabled,
      call_center: callCenter,
      command_sent: true,
      command_message: alertEnabled
        ? "FALLDOWN ON command sent. Fall-down alarm alert is enabled."
        : "FALLDOWN OFF command sent. Fall-down alarm alert is disabled.",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*<LEN>*FALLDOWN] (bare ack = success).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setFallDownAlert error:", err);
    return errorMessage(res, "Error sending fall-down alarm command");
  }
};

// ────────────────────────────────────────────────────────────
// Take-Off Watch Alarm (REMOVE) — toggle the watch's take-off
// alarm switch.
//
// Wire protocol:
//   Server send : [CS*<id>*0008*REMOVE,0]  (off, do NOT send alarm on take-off)
//                 [CS*<id>*0008*REMOVE,1]  (on, send alarm on take-off)
//   Device reply: [CS*<id>*0006*REMOVE]    (bare ack = success)
//
// NOTE: This feature depends on the device firmware having a light
// sensor. If the watch does not have a light sensor, this command
// is unnecessary and may not be supported.
//
// Server-side mirror: DeviceSetting.take_off_device_alert
// ────────────────────────────────────────────────────────────

const setTakeOffAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, enabled } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendRemoveCommand(
      serial_number,
      Boolean(enabled)
    );
    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send REMOVE command. Device may be disconnected."
      );
    }

    // Mirror to the server-side DeviceSetting table.
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: enabled ? "1" : "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
      });
    } else {
      deviceSetting.take_off_device_alert = enabled ? "1" : "0";
      await deviceSetting.save();
    }

    const flag = enabled ? "1" : "0";
    const commandProtocol = `[CS*${serial_number}*0008*REMOVE,${flag}]`;

    Logging.info(
      `Take-off alarm (REMOVE) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, enabled=${Boolean(enabled)})`
    );

    return successMessage(res, "Take-off alarm command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: Boolean(enabled),
      command_sent: true,
      command_message: enabled
        ? "REMOVE ON command sent. Device will send an alarm when the watch is taken off."
        : "REMOVE OFF command sent. Device will NOT send an alarm when the watch is taken off.",
      command_protocol: commandProtocol,
      note: "Device will reply with [CS*<id>*0006*REMOVE] (bare ack = success).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setTakeOffAlert error:", err);
    return errorMessage(res, "Error sending take-off alarm command");
  }
};

// ────────────────────────────────────────────────────────────
// Center Number (CENTER) — set the watch's center phone number
// for SMS alarm alerts.
//
// Wire protocol:
//   Server send : [CS*<id>*<LEN>*CENTER,<phoneNumber>]
//   Device reply: [CS*<id>*<LEN>*CENTER]  (bare ack = success)
//
// Server-side mirror: Device.center_number
// ────────────────────────────────────────────────────────────

const setCenterNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, center_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (!center_number) {
      return errorMessage(res, "center_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const commandSent = tcpServer.sendCenterCommand(
      serial_number,
      center_number
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send CENTER command. Device may be disconnected or invalid center number."
      );
    }

    // Mirror to the server-side Device table.
    await device.update({
      center_number: center_number.replace(/[^0-9]/g, ""),
    });

    const digits = center_number.replace(/[^0-9]/g, "");
    const content = `CENTER,${digits}`;
    const lenHex = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[CS*${serial_number}*${lenHex}*${content}]`;

    Logging.info(
      `Center number (CENTER) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, center=${digits})`
    );

    return successMessage(res, "Center number command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      center_number: digits,
      command_sent: true,
      command_message:
        "CENTER command sent. Device will use this number for SMS alarm alerts.",
      command_protocol: commandProtocol,
      note: "Device will reply with [CS*<id>*<LEN>*CENTER] (bare ack = success).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setCenterNumber error:", err);
    return errorMessage(res, "Error sending center number command");
  }
};

// ────────────────────────────────────────────────────────────
// Low-Battery Alarm Alert (LOWBAT) — toggle the watch's
// low-battery alarm SMS alert switch.
//
// Wire protocol:
//   Server send : [CS*<id>*0008*LOWBAT,0]  (off, do NOT send SMS on low battery)
//                 [CS*<id>*0008*LOWBAT,1]  (on, send SMS on low battery)
//   Device reply: [CS*<id>*0006*LOWBAT]    (bare ack = success)
//
// Server-side mirror: DeviceSetting.low_battery_alert
// ────────────────────────────────────────────────────────────

const setLowBatteryAlert = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, enabled } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const alertEnabled = Boolean(enabled);

    const commandSent = tcpServer.sendLowBatteryCommand(
      serial_number,
      alertEnabled
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send LOWBAT command. Device may be disconnected."
      );
    }

    // Mirror to the server-side DeviceSetting table.
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
        low_battery_alert: alertEnabled ? "1" : "0",
      });
    } else {
      deviceSetting.low_battery_alert = alertEnabled ? "1" : "0";
      await deviceSetting.save();
    }

    const flag = alertEnabled ? "1" : "0";
    const content = `LOWBAT,${flag}`;
    const lenHex = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[CS*${serial_number}*${lenHex}*${content}]`;

    Logging.info(
      `Low-battery alarm (LOWBAT) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, enabled=${alertEnabled})`
    );

    return successMessage(res, "Low-battery alarm command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: alertEnabled,
      command_sent: true,
      command_message: alertEnabled
        ? "LOWBAT ON command sent. Device will send an SMS alert when battery is low."
        : "LOWBAT OFF command sent. Device will NOT send an SMS alert on low battery.",
      command_protocol: commandProtocol,
      note: "Device will reply with [CS*<id>*0006*LOWBAT] (bare ack = success).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setLowBatteryAlert error:", err);
    return errorMessage(res, "Error sending low-battery alarm command");
  }
};

// ────────────────────────────────────────────────────────────
// Fall-Down Sensitivity (LSSET) — set the watch's fall-down
// detection sensitivity level.
//
// Wire protocol:
//   Server send : [3G*<id>*<LEN>*LSSET,X+6]   (Android, 1–6 levels)
//                 [3G*<id>*<LEN>*LSSET,X+8]   (RT OS, 1–8 levels)
//                 X = current sensitivity level (1 = most sensitive)
//   Device reply: [3G*<id>*<LEN>*LSSET,X]   (X = current level)
//
// TIP:
//   Android device  — fall sensitive is 1–6, server default 4 or 5
//   RT OS device    — fall sensitive is 1–8, server default 5 or 6
//
// Server-side mirror: DeviceSetting.fall_down_level
// ────────────────────────────────────────────────────────────

const setFallDownSensitivity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, level, device_type } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (level === undefined || level === null) {
      return errorMessage(res, "level is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Determine the max sensitivity level based on device OS.
    // Android: 1–6, RT OS: 1–8. Default to Android (6) if not specified.
    const isRtOs =
      device_type === "rtos" || device_type === "rt_os" || device_type === "8";
    const maxLevel: 6 | 8 = isRtOs ? 8 : 6;

    const levelNum = Number(level);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > maxLevel) {
      return errorMessage(
        res,
        `Invalid fall-down sensitivity level ${levelNum}. Must be 1–${maxLevel} (${
          isRtOs ? "RT OS" : "Android"
        } device).`
      );
    }

    const commandSent = tcpServer.sendLssetCommand(
      serial_number,
      levelNum,
      maxLevel
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send LSSET command. Device may be disconnected."
      );
    }

    // Mirror to the server-side DeviceSetting table.
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: levelNum,
        scene_mode: 1,
        low_battery_alert: "0",
      });
    } else {
      deviceSetting.fall_down_level = levelNum;
      await deviceSetting.save();
    }

    const content = `LSSET,${levelNum}+${maxLevel}`;
    const lenHex = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[3G*${serial_number}*${lenHex}*${content}]`;

    Logging.info(
      `Fall-down sensitivity (LSSET) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, level=${levelNum}, max=${maxLevel})`
    );

    return successMessage(
      res,
      "Fall-down sensitivity command sent successfully",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        level: levelNum,
        max_level: maxLevel,
        device_type: isRtOs ? "rt_os" : "android",
        command_sent: true,
        command_message: `LSSET command sent. Fall-down sensitivity set to level ${levelNum} of ${maxLevel}.`,
        command_protocol: commandProtocol,
        note: "Device will reply with [3G*<id>*<LEN>*LSSET,X] (X = current level).",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err) {
    console.error("setFallDownSensitivity error:", err);
    return errorMessage(res, "Error sending fall-down sensitivity command");
  }
};

// ────────────────────────────────────────────────────────────
// Language / time zone (LZ) — set the watch's display language
// AND/OR its time zone.
//
// Wire protocol:
//   [3G*<id>*<LEN>*LZ,<language>,<timezone>]
//   e.g. [3G*8800000015*0006*LZ,1,8]   (Chinese, GMT+8)
//
// Device reply:
//   [3G*<id>*0002*LZ]                  (bare ack = success)
//
// Product requirement: send EITHER `language` OR `timezone` per
// request, never both. The Joi schema enforces that with .oxor().
// The empty side of the comma tells the firmware to leave that
// half of the setting alone.
// ────────────────────────────────────────────────────────────

const setLanguageTimezone = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, language, timezone } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (language === undefined && timezone === undefined) {
      return errorMessage(
        res,
        "Provide exactly one of: language OR timezone (not both, not neither)."
      );
    }
    if (language !== undefined && timezone !== undefined) {
      return errorMessage(
        res,
        "Provide exactly one of: language OR timezone (not both)."
      );
    }

    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    if (!tcpServer.getDevice(serial_number)) {
      return errorMessage(
        res,
        "Device is offline. LZ command NOT sent — try again once the watch is connected."
      );
    }

    const langArg: number | null =
      language === undefined ? null : Number(language);
    const tzArg: number | null =
      timezone === undefined ? null : Number(timezone);

    const result = tcpServer.sendLzCommand(serial_number, langArg, tzArg);
    if (!result.sent) {
      return errorMessage(
        res,
        "Failed to send LZ command. Device may be disconnected."
      );
    }

    // Persist the language and/or timezone to the Device model so
    // subsequent GET /settings and GET /about_device calls reflect
    // the last-known values sent to the watch.
    const updateData: any = {};
    if (langArg !== null) updateData.language = String(langArg);
    if (tzArg !== null) updateData.timezone = String(tzArg);

    if (Object.keys(updateData).length > 0) {
      await device.update(updateData);
    }

    Logging.info(
      `Language/timezone (LZ) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, language=${langArg}, timezone=${tzArg})`
    );

    return successMessage(
      res,
      langArg !== null
        ? "Language set successfully"
        : "Time zone set successfully",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        language: langArg,
        timezone: tzArg,
        command_sent: true,
        command_message:
          langArg !== null
            ? `Set watch language to code ${langArg} on device ${serial_number}. The other setting (time zone) was left unchanged.`
            : `Set watch time zone to GMT${
                tzArg! >= 0 ? "+" : ""
              }${tzArg} on device ${serial_number}. The other setting (language) was left unchanged.`,
        command_protocol: result.protocol,
        note: "Device will reply with [3G*<id>*0002*LZ] (ack = success) or [3G*<id>*0004*LZ,0] (failure).",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setLanguageTimezone error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error sending LZ command: " + msg);
  }
};

// ────────────────────────────────────────────────────────────
// Do-not-disturb / class mode (SILENCETIME / SILENCETIME2) —
// set up to 4 time periods during which the watch rejects all
// incoming calls and locks the screen (but SOS still works).
//
// Wire protocol (per the spec):
//
//   Classic (SILENCETIME) — daily, up to 4 slots:
//     [3G*<id>*<LEN>*SILENCETIME,s1,s2,s3,s4]
//     Each slot: "HH:MM-HH:MM"  (24h, e.g. "21:10-07:30")
//
//   Week-version (SILENCETIME2) — same + day-of-week mask:
//     [3G*<id>*<LEN>*SILENCETIME2,s1,s2,s3,s4]
//     Each slot: "HH:MM-HH:MM-DDDDDDD"
//                (DDDDDDD = Sun..Sat; 0=off, 1=on)
//     Example:   "21:10-07:30-0111110"  (Mon..Fri on)
//
//   Device reply (both): [3G*<id>*<LEN>*SILENCETIME]
//                        (bare ack = success)
// ────────────────────────────────────────────────────────────

const setSilenceTime = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, mode, slots, weekdays } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (mode !== "SILENCETIME" && mode !== "SILENCETIME2") {
      return errorMessage(
        res,
        "mode must be 'SILENCETIME' (daily) or 'SILENCETIME2' (per weekday)"
      );
    }
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 4) {
      return errorMessage(res, "slots must be an array of 1 to 4 entries");
    }
    if (mode === "SILENCETIME2" && !weekdays) {
      return errorMessage(
        res,
        "weekdays is required when mode is 'SILENCETIME2' (a 7-char '0'/'1' string, Sun..Sat)"
      );
    }
    if (mode === "SILENCETIME" && weekdays !== undefined) {
      return errorMessage(
        res,
        "weekdays is not allowed when mode is 'SILENCETIME' — the classic protocol has no day-of-week field"
      );
    }

    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    if (!tcpServer.getDevice(serial_number)) {
      return errorMessage(
        res,
        `Device is offline. ${mode} command NOT sent — try again once the watch is connected.`
      );
    }

    const result = tcpServer.sendSilenceTimeCommand(
      serial_number,
      mode,
      slots,
      weekdays
    );
    if (!result.sent) {
      return errorMessage(
        res,
        `Failed to send ${mode} command. Device may be disconnected or slots/weekdays are invalid.`
      );
    }

    // ── Persist to DB (server-side mirror) ────────────────
    // Strategy: only INSERT/UPDATE the (device_id, slot_index)
    // pairs that the caller explicitly filled in.  Existing rows
    // for other slot_indexes are left untouched — they remain
    // visible to /get_do_not_disturb until the user later modifies
    // or removes them via another request.
    //
    // Per-slot semantics:
    //   - slot_index with non-empty value in the request →
    //     upsert (insert/update) that single slot's row.
    //   - slot_index with empty value in the request → do nothing
    //     in the DB (we do NOT touch any existing row at that
    //     slot_index — the user's existing config for that slot
    //     stays in place; the on-wire command still sends "" to
    //     wipe that slot on the watch if needed, but the server's
    //     mirror stays intact).
    //
    // This way slot_index=1 keeps whatever mode/mask it had
    // before; only the slots the caller actually submits in this
    // request are modified.
    const padded = [...slots];
    while (padded.length < 4) padded.push("");

    const maskFor = (i: number): string | null => {
      if (mode !== "SILENCETIME2") return null;
      if (Array.isArray(weekdays)) return weekdays[i] || "0000000";
      if (typeof weekdays === "string") return weekdays;
      return "0000000";
    };

    let persistedRows: any[] = [];
    let filledCount = 0;
    let skippedCount = 0;
    try {
      for (let i = 0; i < 4; i++) {
        const raw = padded[i] || "";
        if (!raw) continue; // skip empty slot_indexes — don't touch DB

        filledCount++;

        // `time_section` stores just the time range; weekdays_mask
        // stores the 7-char '0'/'1' string for SILENCETIME2 (NULL
        // otherwise). For SILENCETIME2 the raw slot is
        // "HH:MM-HH:MM-DDDDDDD" — split on "-" and rebuild the
        // HH:MM-HH:MM part from indices 0..1.
        let time_section: string;
        if (mode === "SILENCETIME2") {
          const parts = raw.split("-");
          // parts[0] = HH:MM, parts[1] = HH:MM, parts[2] = DDDDDDD
          time_section = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : raw;
        } else {
          time_section = raw; // "HH:MM-HH:MM"
        }

        // INSERT-only semantics: only persist if no row exists yet
        // at (device_id, slot_index).  Existing rows (from a prior
        // request) are NEVER overwritten, even if the caller
        // submits a different time_section / mode for the same
        // slot_index — this matches the "add one-by-one" rule the
        // user wants.
        //
        // findOrCreate returns [instance, created].  When created
        // is false, we count it as a skip so the caller knows
        // their slot was preserved.
        const [row, created] = await db.DeviceSilenceTime.findOrCreate({
          where: {
            device_id: device.id,
            slot_index: i + 1,
          },
          defaults: {
            device_id: device.id,
            mode,
            slot_index: i + 1,
            time_section,
            weekdays_mask: maskFor(i),
            is_enabled: true,
            last_command_protocol: result.protocol,
            last_acked_at: null,
          },
        });

        if (created) {
          persistedRows.push(row?.toJSON?.() ?? row);
        } else {
          skippedCount++;
        }
      }
    } catch (dbErr: any) {
      // Don't fail the request — the TCP packet was sent — but log it.
      console.error("setSilenceTime DB persist error:", dbErr);
      Logging.error(
        `Failed to persist DeviceSilenceTime rows for device ${device.id}: ${
          dbErr?.message || dbErr
        }`
      );
    }

    const enabled = filledCount > 0;

    Logging.info(
      `${mode} command sent to device ${serial_number} ` +
        `(device_id=${device.id}, slots=${JSON.stringify(slots)}, ` +
        `weekdays=${JSON.stringify(weekdays)}, enabled_slots=${filledCount})`
    );

    return successMessage(res, "Do-not-disturb period set successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      mode,
      slots,
      weekdays: weekdays ?? null,
      enabled,
      enabled_slot_count: filledCount,
      inserted_count: persistedRows.length,
      skipped_count: skippedCount,
      command_sent: true,
      command_message:
        mode === "SILENCETIME"
          ? `Set ${filledCount} daily do-not-disturb period(s) on device ${serial_number}. During these times the watch will reject calls and lock the screen (SOS still works).`
          : `Set ${filledCount} weekday-specific do-not-disturb period(s) on device ${serial_number}. During these times the watch will reject calls and lock the screen (SOS still works).`,
      command_protocol: result.protocol,
      stored_in_db: persistedRows.length > 0,
      records: persistedRows,
      note: `Device will reply with [3G*<id>*<LEN>*${mode}] (bare ack = success). Existing rows at slot_indexes that were already configured are preserved — only empty slot_indexes are skipped, and existing non-empty ones are not overwritten.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("setSilenceTime error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error sending SILENCETIME command: " + msg);
  }
};

/**
 * GET /user/device/get_do_not_disturb  (POST {serial_number}|{device_id})
 *
 * Returns the server-side mirror of the device's Do-Not-Disturb
 * configuration — one row per (slot_index, 1..4).
 *
 * Response shape:
 *   {
 *     serial_number,
 *     device_id,
 *     mode:               "SILENCETIME" | "SILENCETIME2" | null
 *                        (null when no rows yet),
 *     enabled:            boolean   // at least one row has is_enabled=true
 *     enabled_slot_count: number
 *     slots: [
 *                { slot_index, is_enabled, time_section,
 *                  weekdays_mask, last_command_protocol, last_acked_at }
 *              ],
 *     timestamps: { last_command_protocol, last_acked_at, updated_at }
 *   }
 */
const getDoNotDisturb = async (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  try {
    const { serial_number, device_id } = req.body as {
      serial_number?: string;
      device_id?: string;
    };

    if (!serial_number && !device_id) {
      return errorMessage(
        res,
        "serial_number (or device_id) is required in the request body"
      );
    }

    const where: any = serial_number ? { serial_number } : { id: device_id };
    const device = await db.Device.findOne({ where });
    if (!device) {
      return errorMessage(
        res,
        `Device with ${
          serial_number
            ? `serial_number '${serial_number}'`
            : `id '${device_id}'`
        } not found`
      );
    }

    // Only return the slots that have actually been configured by
    // the user — no auto-insert, no phantom rows.  Empty /
    // never-touched slot_indexes are simply absent from the result.
    const rows = await db.DeviceSilenceTime.findAll({
      where: { device_id: device.id },
      order: [["slot_index", "ASC"]],
    });

    if (rows.length === 0) {
      return successMessage(res, "No Do-Not-Disturb configuration on file", {
        serial_number: device.serial_number,
        device_id: device.id,
        device_name: device.device_name,
        configured: false,
        mode: null,
        enabled: false,
        enabled_slot_count: 0,
        slots: [],
        timestamps: {},
      });
    }

    const slots = rows.map((r: any) => {
      const d = r.toJSON();
      return {
        slot_index: d.slot_index,
        is_enabled: d.is_enabled,
        time_section: d.time_section,
        weekdays_mask: d.weekdays_mask,
        last_command_protocol: d.last_command_protocol,
        last_acked_at: d.last_acked_at,
        updated_at: d.updatedAt,
        created_at: d.createdAt,
      };
    });

    const enabled_slot_count = slots.filter((s: any) => s.is_enabled).length;
    const last_acked_at = rows
      .map((r: any) => r.last_acked_at)
      .filter((v: any) => v)
      .sort()
      .pop() as string | undefined;
    const last_command_protocol = slots[0]?.last_command_protocol ?? null;
    const updated_at = slots
      .map((s: any) => s.updated_at)
      .sort()
      .pop() as string | undefined;

    return successMessage(
      res,
      "Do-Not-Disturb configuration fetched successfully",
      {
        configured: true,
        serial_number: device.serial_number,
        device_id: device.id,
        device_name: device.device_name,
        mode: rows[0].mode,
        enabled: enabled_slot_count > 0,
        enabled_slot_count,
        slots,
        timestamps: {
          last_command_protocol,
          last_acked_at: last_acked_at ?? null,
          updated_at: updated_at ?? null,
        },
      }
    );
  } catch (err: any) {
    console.error("getDoNotDisturb error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(
      res,
      "Error fetching Do-Not-Disturb configuration: " + msg
    );
  }
};

/**
 * POST /user/device/request_body_temperature
 *
 * Sends a bodytemp2 command to the device to request a real-time
 * body temperature measurement. The device will measure and reply
 * with the temperature data, which is then stored as a HealthMetric.
 *
 * Body: { device_id } or { serial_number }
 */
const requestBodyTemperature = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;

    let device = null;
    if (serial_number) {
      device = await db.Device.findOne({
        where: { serial_number },
      });
    }

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const serialNumber = device.serial_number;

    if (!serialNumber) {
      return errorMessage(
        res,
        "Device has no serial_number. Cannot send bodytemp2 command."
      );
    }

    // Verify the watch is currently connected via TCP.
    const tcpClient = tcpServer.getDevice(serialNumber);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot request body temperature."
      );
    }

    // Send the bodytemp2 command to request real-time temperature measurement
    const commandSent = tcpServer.requestBodyTemperature(serialNumber);

    if (!commandSent) {
      return errorMessage(res, "Failed to send bodytemp2 command to device");
    }

    return successMessage(
      res,
      "bodytemp2 command sent to device. The device will measure body temperature and respond with the reading.",
      {
        serial_number: serialNumber,
        device_id: device.id,
        device_name: device.device_name,
        command_sent: true,
        command_protocol: `[3G*${serialNumber}*0009*bodytemp2]`,
        note:
          "The device will reply with [3G*<id>*<LEN>*bodytemp2,type,temp]. " +
          "Temperature data will be stored as a HealthMetric automatically.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("requestBodyTemperature error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error requesting body temperature: " + msg);
  }
};

/**
 * POST /user/device/reject_stranger
 *
 * Set the reject stranger calling feature on the device.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*DEVREFUSEPHONESWITCH,1]
 *                 switch state: 0 = OFF, 1 = ON
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*DEVREFUSEPHONESWITCH]
 *                 (bare ack = success)
 *
 * Note: This is only valid once after you preset the SOS numbers and
 * contacts in phone book in the app or server.
 *
 * Body: { serial_number, enabled: true/false }
 */
const setRejectStranger = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, enabled } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (typeof enabled !== "boolean") {
      return errorMessage(res, "enabled must be true or false");
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send DEVREFUSEPHONESWITCH command."
      );
    }

    // ── Reject stranger is only valid after SOS numbers and phone
    //    book contacts have been preset.  Guard against enabling it
    //    on a fresh device that has no contacts at all.
    if (enabled) {
      const [emergencyCount, phonebookCount] = await Promise.all([
        db.EmergencyContact.count({ where: { device_id: device.id } }),
        db.DevicePhonebook.count({ where: { device_id: device.id } }),
      ]);

      if (emergencyCount === 0 && phonebookCount === 0) {
        return errorMessage(
          res,
          "Cannot enable reject stranger calling. Please preset SOS numbers and/or phone book contacts first."
        );
      }
    }

    // Send the DEVREFUSEPHONESWITCH command
    const commandSent = tcpServer.sendDevRefusePhoneSwitchCommand(
      serial_number,
      enabled
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send DEVREFUSEPHONESWITCH command to device"
      );
    }

    // Update the device settings in the database
    const deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (deviceSetting) {
      await deviceSetting.update({
        reject_stranger_enabled: enabled ? "1" : "0",
      });
    }

    return successMessage(
      res,
      enabled
        ? "Reject stranger calling enabled. Device will reject calls from numbers not in phone book or SOS contacts."
        : "Reject stranger calling disabled. Device will accept all incoming calls.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        enabled,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*LEN*DEVREFUSEPHONESWITCH,${
          enabled ? "1" : "0"
        }]`,
        note:
          "Device will reply with [3G*<id>*LEN*DEVREFUSEPHONESWITCH] (bare ack = success). " +
          "Note: This feature is only valid after setting SOS numbers and phone book contacts.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setRejectStranger error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error setting reject stranger: " + msg);
  }
};

/**
 * POST /user/device/night_power_saving
 *
 * Set the night power saving mode on the device.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*APPLOCK,YJ-1]
 *                 YJ-1 = Night power saving mode ON
 *                 YJ-0 = Night power saving mode OFF
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*APPLOCK]
 *                 (bare ack = success)
 *
 * Body: { serial_number, enabled: true/false }
 */
const setNightPowerSaving = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, enabled } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (typeof enabled !== "boolean") {
      return errorMessage(res, "enabled must be true or false");
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send APPLOCK command."
      );
    }

    // Send the APPLOCK command
    const commandSent = tcpServer.sendAppLockCommand(serial_number, enabled);

    if (!commandSent) {
      return errorMessage(res, "Failed to send APPLOCK command to device");
    }

    // Update the device settings in the database
    const deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (deviceSetting) {
      await deviceSetting.update({
        night_power_saving: enabled ? "1" : "0",
      });
    }

    return successMessage(
      res,
      enabled
        ? "Night power saving mode enabled."
        : "Night power saving mode disabled.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        enabled,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*LEN*APPLOCK,${
          enabled ? "YJ-1" : "YJ-0"
        }]`,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setNightPowerSaving error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error setting night power saving: " + msg);
  }
};

/**
 * POST /user/device/dial_lock
 *
 * Lock or unlock the watch dial plate.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*APPLOCK,PH-1]
 *                 PH-1 = Dial plate lock ON (user cannot dial any number)
 *                 PH-0 = Dial plate lock OFF (user can dial numbers)
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*APPLOCK]
 *                 (bare ack = success)
 *
 * Body: { serial_number, locked: true/false }
 */
const setDialLock = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, locked } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (typeof locked !== "boolean") {
      return errorMessage(res, "locked must be true or false");
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send APPLOCK (dial lock) command."
      );
    }

    // Send the APPLOCK command
    const commandSent = tcpServer.sendDialLockCommand(serial_number, locked);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send APPLOCK (dial lock) command to device"
      );
    }

    // Update the device settings in the database
    const deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (deviceSetting) {
      await deviceSetting.update({
        dial_lock_enabled: locked ? "1" : "0",
      });
    }

    return successMessage(
      res,
      locked
        ? "Dial plate locked. User cannot dial any number."
        : "Dial plate unlocked. User can dial numbers.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        locked,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*LEN*APPLOCK,${
          locked ? "PH-1" : "PH-0"
        }]`,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setDialLock error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error setting dial lock: " + msg);
  }
};

/**
 * POST /user/device/voice_monitor
 *
 * Send a MONITOR command to request the device to call a monitor number
 * for voice monitoring / listen-in functionality.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*MONITOR,phone number]
 *                 Example: [3G*8800000015*0013*MONITOR,13100010002]
 *                 - OK for any number
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*MONITOR]
 *                 (bare ack = device is calling the monitor number)
 *
 * Note: The device will auto-dial the monitor number.
 * The smartphone end can hear all surrounding voice.
 * The device end is unnoticeable.
 *
 * This feature is OPTIONAL. If this feature is illegal in your region,
 * it can be removed from the software.
 *
 * Body: { serial_number, phone_number }
 */
const voiceMonitor = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, phone_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (!phone_number) {
      return errorMessage(res, "phone_number is required");
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send MONITOR command."
      );
    }

    // Send the MONITOR command
    const commandSent = tcpServer.sendMonitorCommand(
      serial_number,
      phone_number
    );

    if (!commandSent) {
      return errorMessage(res, "Failed to send MONITOR command to device");
    }

    return successMessage(
      res,
      "Voice monitor command sent. The device will call the monitor number.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        phone_number,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*LEN*MONITOR,${phone_number}]`,
        note:
          "Device will reply with [3G*<id>*LEN*MONITOR] (bare ack = success). " +
          "The device will auto-dial the monitor number. You can hear surrounding sounds. " +
          "This feature is optional - remove from software if illegal in your region.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("voiceMonitor error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error sending voice monitor: " + msg);
  }
};

/**
 * POST /user/device/upload_interval
 *
 * Set the dynamic-state upload time interval (seconds) on the device.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*UPLOAD,time interval seconds]
 *                 Example: [3G*8800000015*000A*UPLOAD,600]
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*UPLOAD]
 *                 (bare ack = success)
 *
 * Note: This interval applies while the device is in dynamic state
 * only. After ~2 minutes of no motion the gravity sensor puts the
 * watch into sleep / power-save mode and position data is no longer
 * reported (only an LK link-keep is sent). Any movement wakes the
 * device and uploads resume at the configured interval.
 * Allowed range: 60..65535 seconds.
 *
 * The interval is also mirrored to Device.location_interval_minutes
 * (rounded down to whole minutes) so the dashboard always reflects
 * the last known setting, even when the device is offline.
 *
 * Body: { serial_number, interval_seconds }
 */
const setUploadInterval = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, interval_seconds } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (
      interval_seconds === undefined ||
      interval_seconds === null ||
      typeof interval_seconds !== "number" ||
      !Number.isFinite(interval_seconds) ||
      !Number.isInteger(interval_seconds) ||
      interval_seconds < 60 ||
      interval_seconds > 65535
    ) {
      return errorMessage(
        res,
        "interval_seconds must be an integer between 60 and 65535 seconds"
      );
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send UPLOAD command."
      );
    }

    // Send the UPLOAD command (tcpServer does additional validation)
    const commandSent = tcpServer.sendUploadIntervalCommand(
      serial_number,
      interval_seconds
    );

    if (!commandSent) {
      return errorMessage(res, "Failed to send UPLOAD command to device");
    }

    // Mirror the new interval to both the Device row and the
    // DeviceSetting row so dashboards reflect the last-known value
    // even when the watch is offline. We store seconds in the
    // settings table (matches the wire protocol exactly) and
    // whole minutes on the legacy Device.location_interval_minutes
    // column (used by older dashboards).
    const intervalMinutes = Math.floor(interval_seconds / 60);

    // Upsert DeviceSetting row (create default if missing).
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });
    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
        reject_stranger_enabled: "0",
        upload_interval_seconds: interval_seconds,
        walk_time_enabled: "0",
        walk_time_sections: [],
        walk_time_step_target: null,
        low_battery_alert: "0",
      });
    } else {
      deviceSetting.upload_interval_seconds = interval_seconds;
      await deviceSetting.save();
    }

    await device.update({ location_interval_minutes: intervalMinutes });

    return successMessage(
      res,
      "Upload interval command sent. The device will report at this interval while moving.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        interval_seconds,
        interval_minutes: intervalMinutes,
        upload_interval_seconds: interval_seconds,
        device_setting_id: deviceSetting.id,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*LEN*UPLOAD,${interval_seconds}]`,
        note:
          "This interval applies while the device is in dynamic (moving) state. " +
          "If the gravity sensor detects no motion for ~2 minutes the device " +
          "enters sleep / power-save mode and stops sending position data " +
          "(only LK link-keep is sent). Any movement wakes the device and " +
          "uploads resume at the configured interval.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setUploadInterval error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error setting upload interval: " + msg);
  }
};

/**
 * POST /user/device/walk_time
 *
 * Configure the pedometer's "walk time" (WALKTIME command) on the
 * device.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*LEN*WALKTIME,t1,t2,t3]
 *                 Example: [3G*5678901234*002A*WALKTIME,8:10-9:30,10:10-11:30,12:10-13:30]
 *
 *   Device reply: [3G*YYYYYYYYYY*LEN*WALKTIME]
 *                 (bare ack = device accepted the new schedule)
 *
 * Notes:
 *   - All devices ship with WALKTIME OFF. Pass 1–3 HH:MM-HH:MM
 *     windows to switch the pedometer ON; pass an empty array to
 *     switch it back OFF.
 *   - The device tracks BOTH a daily step count (resets at midnight)
 *     AND a cumulative total (never resets). The firmware only
 *     reports the cumulative total; the server derives the daily
 *     count from that stream. `step_target` is server-side only and
 *     lets the app display progress against the user's personal
 *     physical-activity goal.
 *
 * Body:
 *   {
 *     serial_number: "5678901234",
 *     sections:      ["08:10-09:30", "10:10-11:30", "12:10-13:30"],
 *     step_target:   8000          // optional, server-side only
 *   }
 */
const setWalkTime = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;
    const sections: string[] = Array.isArray(req.body.sections)
      ? req.body.sections
      : [];
    const stepTargetRaw = req.body.step_target;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (sections.length > 3) {
      return errorMessage(
        res,
        "sections must contain at most 3 entries (max 3 walk-time windows)"
      );
    }

    // Find the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });

    if (!device) {
      return errorMessage(res, "Device not found");
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send WALKTIME command."
      );
    }

    // Send the WALKTIME command. tcpServer does additional validation
    // (HH:MM-HH:MM format, start<end) and returns false on rejection.
    const commandSent = tcpServer.sendWalkTimeCommand(serial_number, sections);

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send WALKTIME command. Each section must be HH:MM-HH:MM (24h, start<end, max 3 sections)."
      );
    }

    // Mirror to the server-side DeviceSetting row so the app can
    // always show the current schedule + step target.
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
        reject_stranger_enabled: "0",
        upload_interval_seconds: null,
        walk_time_enabled: sections.length > 0 ? "1" : "0",
        walk_time_sections: sections,
        walk_time_step_target:
          stepTargetRaw === undefined || stepTargetRaw === null
            ? null
            : Math.max(0, Math.floor(Number(stepTargetRaw))),
      });
    } else {
      deviceSetting.walk_time_enabled = sections.length > 0 ? "1" : "0";
      deviceSetting.walk_time_sections = sections;
      if (stepTargetRaw !== undefined && stepTargetRaw !== null) {
        deviceSetting.walk_time_step_target = Math.max(
          0,
          Math.floor(Number(stepTargetRaw))
        );
      }
      await deviceSetting.save();
    }

    const commandProtocol =
      sections.length === 0
        ? `[3G*${serial_number}*0008*WALKTIME]`
        : `[3G*${serial_number}*LEN*WALKTIME,${sections.join(",")}]`;

    return successMessage(
      res,
      sections.length === 0
        ? "Walk-time disabled. Pedometer switched OFF."
        : "Walk-time updated. Pedometer enabled for the configured windows.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        walk_time_enabled: sections.length > 0,
        walk_time_sections: sections,
        walk_time_step_target: deviceSetting.walk_time_step_target ?? null,
        device_setting_id: deviceSetting.id,
        command_sent: true,
        command_protocol: commandProtocol,
        note:
          "The device tracks BOTH a daily step count (reset at midnight) " +
          "AND a cumulative total (never reset). The firmware reports the " +
          "cumulative total; the server derives the daily count from " +
          "that stream and can compare it against walk_time_step_target " +
          "for in-app progress.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("setWalkTime error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error setting walk-time: " + msg);
  }
};

/**
 * POST /user/device/get_walk_time
 *
 * Read back the persisted walk-time schedule + step target, AND
 * the latest cumulative / daily step counts as reported by the
 * device's HealthMetric stream.
 *
 * Body: { serial_number }
 */
const getWalkTime = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Pull the persisted schedule (creates a default OFF row if missing)
    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });
    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id: device.id,
        sms_alert_enabled: "0",
        take_off_device_alert: "0",
        safe_mode: "0",
        talking_clock: "0",
        night_power_saving: "0",
        volume: 50,
        brightness: 50,
        fall_down_alert_enabled: "0",
        fall_down_reminder_call: "0",
        fall_down_level: 5,
        scene_mode: 1,
        reject_stranger_enabled: "0",
        upload_interval_seconds: null,
        walk_time_enabled: "0",
        walk_time_sections: [],
        walk_time_step_target: null,
        low_battery_alert: "0",
      });
    }

    // ── Latest cumulative / daily step counts from HealthMetric ──
    // The device reports the CUMULATIVE total (metric_type =
    // 'steps_cumulative'); we ALSO compute the daily count from
    // any 'steps_daily' rows that have been uploaded.
    const latestCumulative: any = await db.HealthMetric.findOne({
      where: {
        device_id: device.id,
        metric_type: "steps_cumulative",
      },
      order: [["recorded_at", "DESC"]],
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaysDaily: any = await db.HealthMetric.findAll({
      where: {
        device_id: device.id,
        metric_type: "steps_daily",
        recorded_at: { [Op.gte]: todayStart },
      },
      order: [["recorded_at", "DESC"]],
    });

    // The simplest server-side "steps today" derivation: subtract
    // the earliest cumulative value today from the latest one today.
    // If the user is brand-new there may be no rows at all today; we
    // fall back to the latest daily value or 0.
    const earliestCumToday: any = await db.HealthMetric.findOne({
      where: {
        device_id: device.id,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.gte]: todayStart },
      },
      order: [["recorded_at", "ASC"]],
    });

    let stepsToday = 0;
    if (
      latestCumulative &&
      earliestCumToday &&
      Number(earliestCumToday.value_primary) > 0
    ) {
      stepsToday = Math.max(
        0,
        Number(latestCumulative.value_primary) -
          Number(earliestCumToday.value_primary)
      );
    } else if (todaysDaily.length > 0) {
      // Fallback: take the most recent daily row that the firmware
      // explicitly reported.
      stepsToday = Number(todaysDaily[0].value_primary);
    }

    const stepTarget = deviceSetting.walk_time_step_target ?? 0;
    const progressPercent =
      stepTarget > 0
        ? Math.min(100, Math.round((stepsToday / stepTarget) * 100))
        : null;

    return successMessage(
      res,
      "Walk-time settings and step stats fetched successfully",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        walk_time: {
          enabled: deviceSetting.walk_time_enabled === "1",
          sections: deviceSetting.walk_time_sections ?? [],
          step_target: stepTarget,
        },
        steps: {
          cumulative_total: latestCumulative
            ? Number(latestCumulative.value_primary)
            : null,
          cumulative_last_reported_at: latestCumulative
            ? latestCumulative.recorded_at
            : null,
          today: stepsToday,
          target: stepTarget,
          progress_percent: progressPercent,
          note:
            "The device only reports the cumulative total. `today` is " +
            "derived server-side as (latest_cumulative - earliest_cumulative " +
            "since 00:00 local). Compare against `target` to show " +
            "progress bars in your app.",
        },
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("getWalkTime error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error fetching walk-time: " + msg);
  }
};

/**
 * POST /user/device/locate
 *
 * Pressing the "Locate" pin in the app sends a CR command to the
 * device.
 *
 * Per the protocol spec:
 *   Server send : [3G*YYYYYYYYYY*0002*CR]
 *                 Example: [3G*5678901234*0002*CR]
 *   Device reply: [3G*YYYYYYYYYY*0002*CR]
 *                 (bare ack = device is now in active GPS mode)
 *
 * Semantics:
 *   The device wakes up its GPS system immediately, performs
 *   constant positioning for ~3 minutes and reports position data
 *   every ~20 seconds. It stops positioning automatically after
 *   ~3 minutes.
 *
 * Each fix the watch sends is stored in the Locations table AND
 * cached on the Device row's latest_lat / latest_lng /
 * latest_location_at / latest_location_is_valid columns so the
 * dashboard can show the pin as soon as the first fix arrives
 * without polling the full history.
 *
 * Body: { serial_number }
 */
const locateDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the watch is currently connected via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is not connected via TCP. Cannot send CR command."
      );
    }

    // Send the CR command. tcpServer will reject (return false) only
    // if the device is offline; here we already verified connectivity
    // above so this should always succeed.
    const commandSent = tcpServer.sendCrCommand(serial_number);

    if (!commandSent) {
      return errorMessage(res, "Failed to send CR command to device");
    }

    // Snapshot the device's current cached position so the API
    // caller can immediately render *something* on the map while
    // waiting for the first new fix from the device.
    const latestKnown = await db.Location.findOne({
      where: { device_id: device.id },
      order: [["recorded_at", "DESC"]],
    });

    return successMessage(
      res,
      "Locate command sent. Device will start real-time GPS positioning for ~3 minutes and report fixes every ~20 seconds.",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        command_sent: true,
        command_protocol: `[3G*${serial_number}*0002*CR]`,
        positioning: {
          duration_seconds: 180,
          report_interval_seconds: 20,
          note:
            "Each fix is stored as a Locations row AND cached on " +
            "Device.latest_lat / latest_lng / latest_location_at so the " +
            "dashboard can render the pin immediately. The watch stops " +
            "positioning automatically after ~3 minutes.",
        },
        // Surface the last known fix so the UI doesn't have to do a
        // second round-trip to render the initial pin.
        current_location: latestKnown
          ? {
              latitude: Number(latestKnown.latitude),
              longitude: Number(latestKnown.longitude),
              speed_kmh:
                latestKnown.speed_kmh != null
                  ? Number(latestKnown.speed_kmh)
                  : null,
              direction: latestKnown.direction,
              is_valid_fix: latestKnown.is_valid_fix,
              recorded_at: latestKnown.recorded_at,
              is_from_locate_session: false,
            }
          : null,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err: any) {
    console.error("locateDevice error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error sending locate command: " + msg);
  }
};

/**
 * POST /user/device/get_location
 *
 * Read back the device's current location and a small recent
 * history window. Combines the cached Device.latest_* columns
 * (instant render) with the most recent Location rows (path
 * playback / freshness check).
 *
 * Body: { serial_number, history_limit? }
 */
const getDeviceLocation = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;
    const historyLimit = Math.max(
      0,
      Math.min(100, Number(req.body.history_limit ?? 10))
    );

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Cached "current pin" straight off the Device row.
    const cached = {
      latitude: device.latest_lat != null ? Number(device.latest_lat) : null,
      longitude: device.latest_lng != null ? Number(device.latest_lng) : null,
      recorded_at: device.latest_location_at ?? null,
      is_valid_fix: device.latest_location_is_valid ?? null,
    };

    // Recent history window for path playback / freshness checks.
    let recentRows: any[] = [];
    if (historyLimit > 0) {
      recentRows = await db.Location.findAll({
        where: { device_id: device.id },
        order: [["recorded_at", "DESC"]],
        limit: historyLimit,
      });
    }

    const recent = recentRows.map((r) => ({
      id: r.id,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      speed_kmh: r.speed_kmh != null ? Number(r.speed_kmh) : null,
      direction: r.direction,
      address: r.address,
      total_distance_km:
        r.total_distance_km != null ? Number(r.total_distance_km) : null,
      is_valid_fix: r.is_valid_fix,
      recorded_at: r.recorded_at,
    }));

    return successMessage(res, "Device location fetched successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      // Fast-render pin (single Device row lookup, no scan)
      current: cached,
      // Recent history rows for path playback / freshness check
      recent,
      history_limit: historyLimit,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("getDeviceLocation error:", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error fetching device location: " + msg);
  }
};

// ── Register / update a device for the logged-in user ──────────
// The user_id is derived from the auth token (req.userinfo.payload.id),
// never from the request body, so a caller cannot register a device for
// someone else.
//
// Logic (serial_number is auto-derived from a 15-digit IMEI when only
// the IMEI is supplied):
//   1. A row already exists with this serial_number:
//        - if its imei is null → UPDATE in place (link owner + imei
//          + any provided fields), do NOT insert a duplicate.
//        - if its imei is set   → return the existing row as-is.
//   2. No row with this serial_number:
//        - if imei supplied and already registered to another user → 409
//        - otherwise INSERT a new device row.
const registerDeviceByImei = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = (req as any)?.userinfo?.payload?.id;
    if (!userId) {
      return errorMessage(res, "Invalid token payload", 401);
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      return errorMessage(res, "User not found", 404);
    }

    const {
      imei,
      serial_number,
      device_name,
      email,
      phone_number,
      country_code,
      network_carrier,
      network_type,
      location_interval_minutes,
      height_cm,
      gender,
      age,
      weight_kg,
    } = req.body;

    // ── Derive serial number from the IMEI ─────────────────────
    // IMEI layout used by this device family:
    //   TAC (4) | Serial Number (10) | Check Digit (1)  = 15 digits
    // e.g. 868017032159118  →  SN = "1703215911", CD = "8"
    // The SN is everything between the 4-digit TAC and the final
    // check digit. Fall back to the caller-supplied value when the
    // IMEI shape is unexpected.
    const derivedSerialNumber =
      imei && /^\d{15}$/.test(imei) ? imei.slice(4, -1) : serial_number ?? null;

    if (!imei && !serial_number) {
      return errorMessage(res, "imei or serial_number is required");
    }

    // ── 1) A device row already exists with this serial_number ──
    const existingBySerial = await db.Device.findOne({
      where: { serial_number: derivedSerialNumber },
    });
    if (existingBySerial) {
      if (!existingBySerial.imei) {
        // Serial exists but has no IMEI yet — update it in place
        // (link the owner + imei + any provided fields) instead of
        // inserting a duplicate row.
        existingBySerial.owner_id = userId;
        existingBySerial.imei = imei ?? null;
        if (device_name) existingBySerial.device_name = device_name;
        if (email !== undefined) existingBySerial.email = email;
        if (phone_number !== undefined)
          existingBySerial.phone_number = phone_number;
        if (country_code !== undefined)
          existingBySerial.country_code = country_code;
        if (network_carrier !== undefined)
          existingBySerial.network_carrier = network_carrier;
        if (network_type !== undefined)
          existingBySerial.network_type = network_type;
        if (location_interval_minutes !== undefined)
          existingBySerial.location_interval_minutes =
            location_interval_minutes;
        if (height_cm !== undefined) existingBySerial.height_cm = height_cm;
        if (gender !== undefined) existingBySerial.gender = gender;
        if (age !== undefined) existingBySerial.age = age;
        if (weight_kg !== undefined) existingBySerial.weight_kg = weight_kg;
        await existingBySerial.save();
        return successMessage(
          res,
          "Device updated successfully",
          existingBySerial
        );
      }
      // Serial is already bound to a device that has an IMEI —
      // do not insert a duplicate row.
      return successMessage(res, "Device already registered", existingBySerial);
    }

    // ── 2) No row with this serial_number. If an IMEI was supplied,
    //        make sure it isn't already registered under a different row.
    if (imei) {
      const existingByImei = await db.Device.findOne({ where: { imei } });
      if (existingByImei) {
        if (existingByImei.owner_id === userId) {
          return successMessage(
            res,
            "Device already registered",
            existingByImei
          );
        }
        // IMEI is owned by a different user — refuse to hijack it.
        return customMessage(
          res,
          409,
          "This IMEI is already registered to another account"
        );
      }
    }

    // ── 3) Neither serial nor imei exists — insert a new record ─
    /**
     * Guarded insert: serial_number is intentionally NOT unique and
     * imei is only unique when non-null, so a check-then-create race
     * (two concurrent requests for the same identity) could otherwise
     * insert two rows — or, for the imei path, throw a
     * SequelizeUniqueConstraintError that escapes as an unhandled
     * rejection. findOrCreate() keeps the create atomic; the catch
     * below re-fetches the winner if we lost the race.
     */
    const whereClause = imei
      ? { imei }
      : { serial_number: derivedSerialNumber, imei: null };

    let device: any;
    try {
      const [createdDevice, created] = await db.Device.findOrCreate({
        where: whereClause,
        defaults: {
          owner_id: userId,
          imei: imei ?? null,
          serial_number: derivedSerialNumber,
          device_name: device_name ?? "Device",
          email: email ?? null,
          phone_number: phone_number ?? null,
          country_code: country_code ?? null,
          network_carrier: network_carrier ?? null,
          network_type: network_type ?? null,
          location_interval_minutes: location_interval_minutes ?? 1,
          height_cm: height_cm ?? null,
          gender: gender ?? null,
          age: age ?? null,
          weight_kg: weight_kg ?? null,
          connection_status: "offline",
          signal_status: null,
          battery_percentage: null,
          is_online: false,
          last_updated_at: null,
        },
      });

      device = createdDevice;

      if (!created) {
        /**
         * A concurrent request inserted the row between our checks.
         * Link the owner if it isn't already linked to this user.
         */
        if (device.owner_id !== userId) {
          device.owner_id = userId;
          if (device_name) device.device_name = device_name;
          if (email !== undefined) device.email = email;
          if (phone_number !== undefined) device.phone_number = phone_number;
          if (country_code !== undefined) device.country_code = country_code;
          if (network_carrier !== undefined)
            device.network_carrier = network_carrier;
          if (network_type !== undefined) device.network_type = network_type;
          if (location_interval_minutes !== undefined)
            device.location_interval_minutes = location_interval_minutes;
          if (height_cm !== undefined) device.height_cm = height_cm;
          if (gender !== undefined) device.gender = gender;
          if (age !== undefined) device.age = age;
          if (weight_kg !== undefined) device.weight_kg = weight_kg;
          await device.save();
        }
        return successMessage(res, "Device already registered", device);
      }
    } catch (error: any) {
      const isUniqueViolation =
        error.name === "SequelizeUniqueConstraintError" ||
        error.parent?.code === "23505" ||
        error.original?.code === "23505";

      if (isUniqueViolation) {
        device =
          (await db.Device.findOne({ where: { imei } })) ||
          (await db.Device.findOne({
            where: { serial_number: derivedSerialNumber },
          }));
        if (!device) {
          return errorMessage(res, "Error registering device: race detected");
        }
        if (device.owner_id !== userId) {
          device.owner_id = userId;
          await device.save();
        }
        return successMessage(res, "Device already registered", device);
      }
      throw error;
    }

    return successMessage(res, "Device registered successfully", device);
  } catch (err: any) {
    console.error("registerDeviceByImei error :", err);
    const msg = (err && err.message) || String(err);
    return errorMessage(res, "Error registering device: " + msg);
  }
};

export default {
  updateDeviceSettings,
  aboutDevice,
  getDeviceSettings,
  getDeviceStatus,
  restartDevice,
  sendDeviceCommand,
  findDevice,
  setAlarm,
  captureSnapshot,
  setAutoAnswer,
  listAutoAnswer,
  makeOutgoingCall,
  setSosSms,
  setFallDownAlert,
  setLowBatteryAlert,
  setCenterNumber,
  setTakeOffAlert,
  setFallDownSensitivity,
  setLanguageTimezone,
  setSilenceTime,
  getDoNotDisturb,
  requestBodyTemperature,
  setRejectStranger,
  setNightPowerSaving,
  setDialLock,
  voiceMonitor,
  setUploadInterval,
  setWalkTime,
  getWalkTime,
  locateDevice,
  getDeviceLocation,
  registerDeviceByImei,
};

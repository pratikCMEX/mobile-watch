import { NextFunction, Request, Response } from "express";
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

      await deviceSetting.save();
    }

    // ── Push fall-down settings to the device via TCP ───────
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
      },
    };

    if (tcpCommands.length > 0) {
      response.tcp_commands_sent = tcpCommands;
      response.command_message =
        "Fall-down settings pushed to device via TCP. Device will acknowledge.";
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

    // Make sure this device has its 4 default slot rows (newly
    // created devices may not have any yet).  Idempotent.
    await db.DeviceSilenceTime.ensureDefaultRowsForDevice(device.id, mode);

    // ── Persist to DB (server-side mirror) ────────────────
    // One row per (device_id, slot_index) — 1..4 per device. Each
    // row carries its own `is_enabled` so the UI can toggle / query
    // individual slots.
    const padded = [...slots];
    while (padded.length < 4) padded.push("");

    const maskFor = (i: number): string | null => {
      if (mode !== "SILENCETIME2") return null;
      if (Array.isArray(weekdays)) return weekdays[i] || "0000000";
      if (typeof weekdays === "string") return weekdays;
      return "0000000";
    };

    let persistedRows: any[] = [];
    try {
      for (let i = 0; i < 4; i++) {
        const raw = padded[i] || "";
        // `time_section` stores just the time range; weekdays_mask
        // stores the 7-char '0'/'1' string for SILENCETIME2 (NULL
        // otherwise). For SILENCETIME2 the raw slot is
        // "HH:MM-HH:MM-DDDDDDD" — split on "-" and rebuild the
        // HH:MM-HH:MM part from indices 0..1.
        let time_section: string | null = null;
        if (raw) {
          if (mode === "SILENCETIME2") {
            const parts = raw.split("-");
            // parts[0] = HH:MM, parts[1] = HH:MM, parts[2] = DDDDDDD
            time_section = parts.length >= 2 ? `${parts[0]}-${parts[1]}` : raw;
          } else {
            time_section = raw; // "HH:MM-HH:MM"
          }
        }
        const slotRow = Boolean(raw && raw.length);
        const [row] = await db.DeviceSilenceTime.upsert({
          device_id: device.id,
          mode,
          slot_index: i + 1,
          time_section,
          weekdays_mask: slotRow ? maskFor(i) : null,
          is_enabled: slotRow,
          last_command_protocol: result.protocol,
          last_acked_at: null,
        });
        persistedRows.push(row?.toJSON?.() ?? row);
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

    const filledSlots = padded.filter((s) => s && s.length).length;
    const enabled = filledSlots > 0;

    Logging.info(
      `${mode} command sent to device ${serial_number} ` +
        `(device_id=${device.id}, slots=${JSON.stringify(slots)}, ` +
        `weekdays=${JSON.stringify(weekdays)}, enabled_slots=${filledSlots})`
    );

    return successMessage(res, "Do-not-disturb period set successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      mode,
      slots,
      weekdays: weekdays ?? null,
      enabled,
      enabled_slot_count: filledSlots,
      command_sent: true,
      command_message:
        mode === "SILENCETIME"
          ? `Set ${filledSlots} daily do-not-disturb period(s) on device ${serial_number}. During these times the watch will reject calls and lock the screen (SOS still works).`
          : `Set ${filledSlots} weekday-specific do-not-disturb period(s) on device ${serial_number}. During these times the watch will reject calls and lock the screen (SOS still works).`,
      command_protocol: result.protocol,
      stored_in_db: persistedRows.length > 0,
      records: persistedRows,
      note: `Device will reply with [3G*<id>*<LEN>*${mode}] (bare ack = success).`,
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

    // Idempotently make sure every device has 4 slot rows, even if
    // it was created after the seed migration ran.
    await db.DeviceSilenceTime.ensureDefaultRowsForDevice(device.id);

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

// SOS-number logic has moved to `controllers/user/Emergency_contact.ts`.
// The `/set_sos_numbers` route now points directly at the
// Emergency_contact controller there.

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
  setSosSms,
  setFallDownAlert,
  setFallDownSensitivity,
  setLanguageTimezone,
  setSilenceTime,
  getDoNotDisturb,
};

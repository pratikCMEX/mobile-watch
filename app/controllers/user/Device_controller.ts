import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  customMessage,
} from "../../library/Response";
import Logging from "../../library/Logging";
import { tcpServer } from "../../app";

const updateDeviceSettings = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      device_id,
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
        fall_down_alert_enabled: fall_down_alert_enabled ?? true,
        fall_down_reminder_call: fall_down_reminder_call ?? true,
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
      if (fall_down_alert_enabled !== undefined)
        deviceSetting.fall_down_alert_enabled = fall_down_alert_enabled;
      if (fall_down_reminder_call !== undefined)
        deviceSetting.fall_down_reminder_call = fall_down_reminder_call;
      if (fall_down_level !== undefined)
        deviceSetting.fall_down_level = fall_down_level;
      if (scene_mode !== undefined) deviceSetting.scene_mode = scene_mode;

      await deviceSetting.save();
    }

    return successMessage(
      res,
      "Device settings updated successfully",
      deviceSetting
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
        fall_down_alert_enabled: true,
        fall_down_reminder_call: true,
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
        fall_down_alert_enabled: deviceSetting.fall_down_alert_enabled,
        fall_down_reminder_call: deviceSetting.fall_down_reminder_call,
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

    // Build a representative command_protocol string for the
    // response (mirrors what the on-wire packet looks like).
    let commandProtocol: string;
    if (!enabled) {
      commandProtocol = `[3G*${serial_number}*0007*ACALL,0]`;
    } else {
      const cleaned = (numbers || [])
        .map((n: any) => (n || "").toString().trim())
        .filter((n: string) => n.length > 0);
      while (cleaned.length < 3) cleaned.push("");
      const content = `ACALL,${cleaned.join(",")}`;
      const lenHex = Buffer.byteLength(content, "utf8")
        .toString(16)
        .padStart(4, "0");
      commandProtocol = `[3G*${serial_number}*${lenHex}*${content}]`;
    }

    Logging.info(
      `Auto-answer (ACALL) command sent to device ${serial_number} ` +
        `(device_id=${device.id}, enabled=${Boolean(enabled)}, ` +
        `numbers=${JSON.stringify(enabled ? numbers : [])})`
    );

    return successMessage(res, "Auto-answer command sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      enabled: Boolean(enabled),
      numbers: enabled ? numbers : [],
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
  setSosSms,
};

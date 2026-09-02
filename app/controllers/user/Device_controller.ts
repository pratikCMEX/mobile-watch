import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import Logging from "../../library/Logging";
import { tcpServer } from "../../app";

/**
 * Normalize a phone number for the watch's SOS protocol.
 *
 * The watch's dialler/SMS module rejects anything that isn't a
 * digits-only string, and needs the country code (it cannot infer it).
 * This helper:
 *   1. Strips everything except digits.
 *   2. If the resulting digits look like a 10-digit national number
 *      (i.e. no leading country code), prepends DEFAULT_COUNTRY_CODE.
 *
 * Override with an env var SOS_DEFAULT_COUNTRY_CODE if you operate in
 * a different region.
 */
const DEFAULT_COUNTRY_CODE = (
  process.env.SOS_DEFAULT_COUNTRY_CODE || "91"
).replace(/[^0-9]/g, "");

const normalizeSosPhone = (raw: string): string => {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";

  // Heuristic: if it's exactly 10 digits, treat as national and prepend
  // the default country code. If it's already 11-15 digits, assume the
  // caller already included a country code.
  // if (digits.length === 10) {
  //   return DEFAULT_COUNTRY_CODE + digits;
  // }
  return digits;
};

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

const setSosNumbers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, sos_number, sos1, sos2, sos3 } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    // Build the list of (slot, rawPhone) pairs to push to the device.
    // - "sos_number" is treated as SOS1 (single-number shorthand)
    // - "sos1", "sos2", "sos3" target specific slots
    type SosSlot = "SOS1" | "SOS2" | "SOS3";
    const targets: Array<{ slot: SosSlot; raw: string }> = [];

    if (sos1) targets.push({ slot: "SOS1", raw: sos1 });
    if (sos2) targets.push({ slot: "SOS2", raw: sos2 });
    if (sos3) targets.push({ slot: "SOS3", raw: sos3 });

    if (sos_number && !sos1) {
      // "sos_number" is shorthand for SOS1; only use it if SOS1 wasn't
      // explicitly provided to avoid double-sending.
      targets.unshift({ slot: "SOS1", raw: sos_number });
    }

    if (targets.length === 0) {
      return errorMessage(
        res,
        "At least one of sos_number, sos1, sos2 or sos3 is required"
      );
    }

    // Look up the device
    const device = await db.Device.findOne({
      where: { serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Verify the device is online via TCP
    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Send each SOS command in turn
    const results: Array<{
      slot: SosSlot;
      raw: string;
      digits: string;
      sent: boolean;
      protocol: string;
    }> = [];

    let allSent = true;

    for (const { slot, raw } of targets) {
      const digits = normalizeSosPhone(raw);

      if (!digits) {
        results.push({
          slot,
          raw,
          digits: "",
          sent: false,
          protocol: "",
        });
        allSent = false;
        continue;
      }

      const sent = tcpServer.sendSosCommand(serial_number, slot, digits);
      if (!sent) allSent = false;

      // Build the on-wire packet string for the response (mirrors the
      // exact bytes written to the socket). LEN is hex.
      const content = `${slot},${digits}`;
      const length = content.length.toString(16).padStart(4, "0");
      const protocol = `[3G*${serial_number}*${length}*${content}]`;

      results.push({
        slot,
        raw,
        digits,
        sent,
        protocol,
      });

      Logging.info(
        `SOS ${slot} command sent to device ${serial_number} ` +
          `(device_id: ${device.id}): ${protocol}`
      );
    }

    if (!allSent) {
      return errorMessage(
        res,
        "One or more SOS commands failed to send. Device may be disconnected.",
        { results }
      );
    }

    return successMessage(res, "SOS numbers set successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      command_sent: true,
      results,
      command_message:
        "SOSx commands sent to device. The device will use these numbers when the SOS button is pressed.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("setSosNumbers error:", err);
    return errorMessage(res, "Error sending SOS numbers to device");
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
  setSosNumbers,
};

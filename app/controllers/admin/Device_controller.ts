import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import Logging from "../../library/Logging";
import { deleteFile, unlinkUploadedFiles } from "../../helper/Helper";
import { Op } from "sequelize";
import { tcpServer } from "../../app";

const createDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      owner_id,
      imei,
      serial_number,
      device_name,
      email,
      country_code,
      phone_number,
      network_carrier,
      network_type,
      location_interval_minutes,
      height_cm,
      gender,
      age,
      weight_kg,
    } = req.body;

    if (owner_id) {
      const owner = await db.User.findByPk(owner_id);
      if (!owner) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "owner_id does not match any existing user");
      }
    }

    if (imei) {
      const existing = await db.Device.findOne({ where: { imei } });
      if (existing) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "A device with this imei already exists");
      }
    }

    const files = (req as any).files as { [fieldname: string]: any[] };
    const image = files?.profile_image?.[0]?.filename ?? null;

    const device = await db.Device.create({
      owner_id,
      imei,
      serial_number: serial_number ?? null,
      device_name: device_name ?? "Device",
      email: email ?? null,
      country_code: country_code ?? null,
      phone_number: phone_number ?? null,
      profile_image: image ?? null,
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
    });

    return successMessage(res, "Device created successfully", device);
  } catch (err) {
    console.error("createDevice error:", err);
    unlinkUploadedFiles(req);
    return errorMessage(res, "Error creating device");
  }
};

const updateDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      id,
      owner_id,
      imei,
      serial_number,
      device_name,
      email,
      country_code,
      phone_number,
      network_carrier,
      network_type,
      location_interval_minutes,
      height_cm,
      gender,
      age,
      weight_kg,
    } = req.body;

    if (!id) {
      unlinkUploadedFiles(req);
      return errorMessage(res, "id is required");
    }

    const device = await db.Device.findByPk(id);
    if (!device) {
      unlinkUploadedFiles(req);
      return errorMessage(res, "Device not found");
    }

    // if (owner_id && owner_id !== device.owner_id) {
    //   const owner = await db.User.findByPk(owner_id); // conditional query #2
    //   if (!owner) {
    //     unlinkUploadedFiles(req);
    //     return errorMessage(res, "owner_id does not match any existing user");
    //   }
    //   device.owner_id = owner_id;
    // }

    if (imei && imei !== device.imei) {
      const existing = await db.Device.findOne({
        where: { imei, id: { [Op.ne]: id } },
      });
      if (existing) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "A device with this imei already exists");
      }
      device.imei = imei;
    }

    const files = (req as any).files as { [fieldname: string]: any[] };
    const image = files?.profile_image?.[0]?.filename ?? null;
    if (image) {
      deleteFile("profile", device.getDataValue("profile_image"));
      device.profile_image = image;
    }
    if (owner_id !== undefined) device.owner_id = owner_id;
    if (serial_number !== undefined) device.serial_number = serial_number;
    if (device_name !== undefined) device.device_name = device_name;
    if (email !== undefined) device.email = email;
    if (country_code !== undefined) device.country_code = country_code;
    if (phone_number !== undefined) device.phone_number = phone_number;
    if (network_carrier !== undefined) device.network_carrier = network_carrier;
    if (network_type !== undefined) device.network_type = network_type;
    if (location_interval_minutes !== undefined)
      device.location_interval_minutes = location_interval_minutes;
    if (height_cm !== undefined) device.height_cm = height_cm;
    if (gender !== undefined) device.gender = gender;
    if (age !== undefined) device.age = age;
    if (weight_kg !== undefined) device.weight_kg = weight_kg;

    await device.save();

    return successMessage(res, "Device updated successfully", device);
  } catch (err) {
    console.error("updateDevice error:", err);
    unlinkUploadedFiles(req);
    return errorMessage(res, "Error updating device");
  }
};

const deleteDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;
    const device = await db.Device.findOne({ where: { id } });
    if (!device) {
      return errorMessage(res, "Device not found");
    }
    deleteFile("profile", device.profile_image);
    await db.Device.destroy({ where: { id } });
    return successMessage(res, "Device deleted successfully");
  } catch (err) {
    console.error("deleteDevice error:", err);
    return errorMessage(res, "Error deleting device");
  }
};

const getDeviceSettings = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const settings = await db.DeviceSetting.findOne({
      where: { device_id: device_id as string },
    });

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }
    if (!settings) {
      return successMessage(
        res,
        "No settings found, returning default values",
        {
          sms_alert_enabled: "0",
          take_off_device_alert: "0",
          safe_mode: "0",
          talking_clock: "0",
          night_power_saving: "0",
          volume: 0,
          brightness: 0,
          fall_down_alert_enabled: "0",
          fall_down_reminder_call: "0",
          fall_down_level: 0,

          language: "0",
          timezone: "1",
        }
      );
    }

    return successMessage(res, "Device settings fetched successfully", {
      ...settings.toJSON(),
      language: device.language,
      timezone: device.timezone,
    });
  } catch (err) {
    console.error("getDeviceSettings error:", err);
    return errorMessage(res, "Error fetching device settings");
  }
};

const sendVoiceMessage = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number } = req.body;
    // uploadVoice.single("voice_file") stores the file in req.file (singular)
    const voiceFile = (req as any).file as
      | { path: string; originalname: string; size: number }
      | undefined;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    if (!voiceFile) {
      return errorMessage(res, "voice_file (AMR audio) is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number as string },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number as string);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Read the uploaded AMR file as a Buffer
    const amrBuffer = require("fs").readFileSync(voiceFile.path);

    const commandSent = tcpServer.sendVoiceMessageCommand(
      serial_number as string,
      amrBuffer
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send voice message. Device may be disconnected or AMR data is invalid."
      );
    }

    Logging.info(
      `Voice message (TK) sent to device ${serial_number} ` +
        `(file=${voiceFile.originalname}, size=${amrBuffer.length} bytes)`
    );

    return successMessage(res, "Voice message sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      file_name: voiceFile.originalname,
      file_size: amrBuffer.length,
      command_sent: true,
      command_message:
        "TK command sent to device. The device will play the voice message.",
      note: "Device will reply with [3G*<id>*<LEN>*TK,1] (success) or [3G*<id>*<LEN>*TK,0] (failure).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("sendVoiceMessage error:", err);
    return errorMessage(res, "Error sending voice message");
  }
};

const sendReminder = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, type, reminder_settings, number, reminder_text } =
      req.body;
    const voiceFile = (req as any).file as
      | { path: string; originalname: string; size: number }
      | undefined;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (!type) {
      return errorMessage(
        res,
        "type is required (pill, water, general, sedentary)"
      );
    }
    if (!reminder_settings) {
      return errorMessage(
        res,
        "reminder_settings is required (e.g. 11:25-1-2)"
      );
    }
    if (!number) {
      return errorMessage(res, "number is required (1-3)");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number as string },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number as string);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Convert reminder_text to hex if provided
    let hexText: string | null = null;
    if (reminder_text) {
      // Encode text as UTF-8, then convert to uppercase hex
      hexText = Buffer.from(reminder_text, "utf8")
        .toString("hex")
        .toUpperCase();
    }

    // Read voice file if provided
    let voiceBuffer: Buffer | null = null;
    if (voiceFile) {
      voiceBuffer = require("fs").readFileSync(voiceFile.path);
    }

    const commandSent = tcpServer.sendTakePillsCommand(
      serial_number as string,
      reminder_settings as string,
      Number(number),
      hexText,
      voiceBuffer
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "Failed to send TAKEPILLS command. Device may be disconnected."
      );
    }

    // Persist to database
    const reminder = await db.Reminder.create({
      device_id: device.id,
      type: type as string,
      reminder_settings: reminder_settings as string,
      number: Number(number),
      reminder_text: hexText,
      voice_data: voiceBuffer,
      is_active: true,
    });

    // Build command protocol string for response
    const num = Math.max(1, Math.min(3, Math.floor(Number(number) || 1)));
    let contentStr: string;
    if (hexText) {
      contentStr = `TAKEPILLS,${reminder_settings},${num},${hexText},`;
    } else {
      contentStr = `TAKEPILLS,${reminder_settings},${num},,`;
    }
    const length = Buffer.byteLength(contentStr, "utf8")
      .toString(16)
      .padStart(4, "0");
    const commandProtocol = `[3G*${serial_number}*${length}*${contentStr}]`;

    Logging.info(
      `TAKEPILLS (reminder) command sent to device ${serial_number} ` +
        `(type=${type}, settings=${reminder_settings}, number=${num})`
    );

    return successMessage(res, "Reminder sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      reminder_id: reminder.id,
      type,
      reminder_settings,
      number: num,
      reminder_text: reminder_text || null,
      voice_file: voiceFile ? voiceFile.originalname : null,
      command_sent: true,
      command_message:
        "TAKEPILLS command sent to device. The device will set the reminder.",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*<LEN>*TAKEPILLS,1] (success) or [3G*<id>*<LEN>*TAKEPILLS,0] (failure).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("sendReminder error:", err);
    return errorMessage(res, "Error sending reminder");
  }
};

const listUnlinkedDevices = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { search = "", page = 1, limit = 20 } = req.body;

    const offset = (page - 1) * limit;

    const where: any = {
      owner_id: null,
    };

    if (search) {
      where.serial_number = { [Op.like]: `%${search}%` };
    }

    const { rows, count } = await db.Device.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [["createdAt", "DESC"]],
    });

    return successMessage(res, "Unlinked devices fetched successfully", {
      devices: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error("listUnlinkedDevices error:", err);
    return errorMessage(res, "Error fetching unlinked devices");
  }
};

const assignOwner = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, owner_id } = req.body;

    if (!device_id || !owner_id) {
      return errorMessage(res, "device_id and owner_id are required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const owner = await db.User.findByPk(owner_id);
    if (!owner) {
      return errorMessage(res, "owner_id does not match any existing user");
    }

    await device.update({ owner_id });

    return successMessage(res, "Owner assigned successfully", device);
  } catch (err) {
    console.error("assignOwner error:", err);
    return errorMessage(res, "Error assigning owner");
  }
};

const updateDeviceIdentity = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, imei, serial_number } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const updates: any = {};

    if (imei !== undefined) {
      if (imei) {
        const existing = await db.Device.findOne({
          where: { imei, id: { [Op.ne]: device_id } },
        });
        if (existing) {
          return errorMessage(res, "A device with this imei already exists");
        }
      }
      updates.imei = imei;
    }

    if (serial_number !== undefined) {
      updates.serial_number = serial_number;
    }

    await device.update(updates);

    return successMessage(res, "Device identity updated successfully", device);
  } catch (err) {
    console.error("updateDeviceIdentity error:", err);
    return errorMessage(res, "Error updating device identity");
  }
};

// ─────────────────────────────────────────────────────────────
// List all reminders for a device
// ─────────────────────────────────────────────────────────────
const listReminders = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, type } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number as string },
    });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Build filter
    const whereClause: any = { device_id: device.id };
    if (type) {
      whereClause.type = type as string;
    }

    // Fetch reminders ordered by number (slot) then creation date
    const reminders = await db.Reminder.findAll({
      where: whereClause,
      order: [
        ["number", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    // Map to safe JSON (exclude voice_data binary from default response)
    const safeReminders = reminders.map((r: any) => {
      const plain: any = r.get({ plain: true });
      // Only include voice_data if explicitly requested or if it's small
      if (plain.voice_data && plain.voice_data.length > 0) {
        plain.voice_data = `[BINARY DATA: ${plain.voice_data.length} bytes]`;
      }
      return plain;
    });

    return successMessage(res, "Reminders fetched successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      filter_type: type || "all",
      total: safeReminders.length,
      reminders: safeReminders,
    });
  } catch (err) {
    console.error("listReminders error:", err);
    return errorMessage(res, "Error fetching reminders");
  }
};

export default {
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceSettings,
  sendVoiceMessage,
  sendReminder,
  listReminders,
  listUnlinkedDevices,
  assignOwner,
  updateDeviceIdentity,
};

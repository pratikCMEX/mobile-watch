import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import Logging from "../../library/Logging";
import { deleteFile, unlinkUploadedFiles } from "../../helper/Helper";
import { Op } from "sequelize";
import { tcpServer } from "../../app";
import { ensureAmrNarrowband } from "../../library/AudioConverter";
import {
  canAccessAllDevices,
  canAccessDevice,
  deviceIdScope,
} from "../../helper/WatchAccess";

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
      center_number: device.center_number,
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

    // Normalize to raw AMR-NB frames. iOS clients upload .m4a (AAC),
    // not .amr — the watch firmware can't play that, so anything that
    // isn't already narrowband AMR gets transcoded here.
    let amrBuffer: Buffer;
    try {
      amrBuffer = await ensureAmrNarrowband(voiceFile.path);
    } catch (conversionError: any) {
      Logging.error(
        `Voice message AMR conversion failed for device ${serial_number} ` +
          `(file=${voiceFile.originalname}): ${
            conversionError?.message || conversionError
          }`
      );
      return errorMessage(
        res,
        "Could not process the uploaded audio file (unsupported format or conversion failure)"
      );
    }

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
        `(uploaded_as=${voiceFile.originalname}, sent_as=AMR, sent_size=${amrBuffer.length} bytes)`
    );

    return successMessage(res, "Voice message sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      uploaded_file_name: voiceFile.originalname,
      sent_format: "amr (narrowband)",
      sent_file_size: amrBuffer.length,
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
    const {
      id,
      serial_number,
      type,
      reminder_settings,
      number,
      reminder_text,
    } = req.body;
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

    // Normalize voice file if provided. iOS clients upload .m4a (AAC),
    // not .amr — same fix as sendVoiceMessage: convert to AMR-NB
    // unless the upload is already narrowband AMR.
    let voiceBuffer: Buffer | null = null;
    if (voiceFile) {
      try {
        voiceBuffer = await ensureAmrNarrowband(voiceFile.path);
      } catch (conversionError: any) {
        Logging.error(
          `Reminder voice AMR conversion failed for device ${serial_number} ` +
            `(file=${voiceFile.originalname}): ${
              conversionError?.message || conversionError
            }`
        );
        return errorMessage(
          res,
          "Could not process the uploaded audio file (unsupported format or conversion failure)"
        );
      }
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

    // Build command protocol string (used both for the response and
    // for persisting the last command on the reminder row).
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

    // Persist to database — update the existing record when an `id` is
    // supplied, otherwise create a brand-new one.
    const reminderPayload = {
      device_id: device.id,
      type: type as string,
      reminder_settings: reminder_settings as string,
      number: num,
      reminder_text: hexText,
      voice_data: voiceBuffer,
      is_active: true,
      last_command_protocol: commandProtocol,
    };

    let reminder: any;
    let action: "updated" | "created";
    if (id) {
      const existing = await db.Reminder.findByPk(id);
      if (!existing) {
        return errorMessage(res, `Reminder with id '${id}' not found`);
      }
      // Safety: refuse to reassign a reminder to a different device.
      if (existing.device_id !== device.id) {
        return errorMessage(
          res,
          `Reminder '${id}' does not belong to device '${serial_number}'`
        );
      }
      await existing.update(reminderPayload);
      reminder = existing;
      action = "updated";
    } else {
      reminder = await db.Reminder.create(reminderPayload);
      action = "created";
    }

    Logging.info(
      `TAKEPILLS (reminder) command sent to device ${serial_number} ` +
        `(type=${type}, settings=${reminder_settings}, number=${num})`
    );

    return successMessage(res, "Reminder sent successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      reminder_id: reminder.id,
      action,
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

const listDevices = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      search = "",
      page = 1,
      limit = 20,
      connection_status,
      id,
    } = req.body;

    const offset = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where[Op.or] = [
        { serial_number: { [Op.like]: `%${search}%` } },
        { imei: { [Op.like]: `%${search}%` } },
        { device_name: { [Op.like]: `%${search}%` } },
        { "$DeviceOwner.name$": { [Op.like]: `%${search}%` } },
      ];
    }

    if (connection_status) {
      where.connection_status = connection_status;
    }

    if (id) {
      where.id = id;
    }

    // Staff: restrict to assigned watches (combined with any id filter)
    const scope = await deviceIdScope(req);
    if (scope) {
      where[Op.and] = [{ id: scope }];
    }

    const { rows, count } = await db.Device.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: db.User,
          as: "DeviceOwner",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    }); // order: [["createdAt", "DESC"]],

    // Ensure DeviceOwner is always present (even if null)
    const devicesWithOwner = rows.map((device: any) => ({
      ...device.toJSON(),
      DeviceOwner: device.DeviceOwner || null,
    }));

    return successMessage(res, "Devices fetched successfully", {
      devices: devicesWithOwner,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error("listDevices error:", err);
    return errorMessage(res, "Error fetching devices");
  }
};

const getAllDeviceImei = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const scope = await deviceIdScope(req);
    const devices = await db.Device.findAll({
      where: scope ? { id: scope } : {},
      attributes: ["id", "imei"],
      order: [["createdAt", "DESC"]],
    });

    return successMessage(res, "All device IMEIs fetched successfully", {
      devices,
      total: devices.length,
    });
  } catch (err) {
    console.error("getAllDeviceImei error:", err);
    return errorMessage(res, "Error fetching device IMEIs");
  }
};

// Delete multiple devices by IDs
const deleteMultipleDevices = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorMessage(res, "Device IDs array is required");
    }

    const devices = await db.Device.findAll({
      where: { id: { [Op.in]: ids } },
    });

    if (devices.length === 0) {
      return errorMessage(res, "No devices found with the provided IDs");
    }

    if (!(await canAccessAllDevices(req, ids))) {
      return errorMessage(
        res,
        "You do not have access to one or more of these devices"
      );
    }

    await db.Device.destroy({ where: { id: { [Op.in]: ids } } });

    return successMessage(
      res,
      `${devices.length} devices deleted successfully`
    );
  } catch (err) {
    console.error("deleteMultipleDevices error:", err);
    return errorMessage(res, "Error deleting devices");
  }
};

const assignDeviceToUser = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, user_id, device_name } = req.body;

    if (!device_id || !user_id || !device_name) {
      return errorMessage(
        res,
        "device_id, user_id and device_name are required"
      );
    }

    const device = await db.Device.findOne({ where: { id: device_id } });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "Device not found");
    }

    const user = await db.User.findOne({ where: { id: user_id } });
    if (!user) {
      return errorMessage(res, "User not found");
    }

    device.owner_id = user_id;
    device.device_name = device_name;
    await device.save();

    return successMessage(res, "Device assigned to user successfully", device);
  } catch (err) {
    console.error("assignDeviceToUser error:", err);
    return errorMessage(res, "Error assigning device to user");
  }
};

const changeServerPortal = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, host, port } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });

    if (!device) {
      return errorMessage(res, `Device with imei '${serial_number}' not found`);
    }

    /**
     * Store the pending server portal change on the device record.
     * This is used both when the device is currently offline (the
     * command is applied on next TCP connect) and when it is online
     * (command is sent immediately and the stored value is cleared
     * by the TCP server after a successful send).
     */
    await device.update({
      server_host: host as string,
      server_port: Number(port),
    });

    const tcpClient = tcpServer.getDevice(serial_number as string);
    let commandSent = false;

    if (tcpClient) {
      commandSent = tcpServer.sendServerPortalCommand(
        serial_number as string,
        host as string,
        Number(port)
      );
    }

    Logging.info(
      `Server portal change ${
        commandSent ? "command sent" : "stored as pending"
      } ` + `for device ${serial_number}: host=${host}, port=${port}`
    );

    return successMessage(
      res,
      "Server portal change request saved successfully",
      {
        serial_number,
        device_id: device.id,
        device_name: device.device_name,
        host: host as string,
        port: Number(port),
        command_sent: commandSent,
        command_protocol: `[3G*${serial_number}*IP,${host},${port}]`,
        note: commandSent
          ? "Device will disconnect and reconnect to the new server after 5-8 minutes. Restart the device to expedite the switch. Verify the connection on the new server portal."
          : "Device is currently offline. The server portal change will be applied when the device reconnects to the TCP server. Verify the connection on the new server portal after reconnection.",
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err) {
    console.error("changeServerPortal error:", err);
    return errorMessage(res, "Error changing server portal");
  }
};

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
    if (!device || !(await canAccessDevice(req, device.id))) {
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
    if (!device || !(await canAccessDevice(req, device.id))) {
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

    const deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id: device.id },
    });
    const currentSceneMode = Number(deviceSetting?.scene_mode ?? 1);
    let sceneModeChanged = false;

    // FIND must be audible. Switch vibration-only and silence modes to
    // vibration + ringing before sending the command.
    if (currentSceneMode === 3 || currentSceneMode === 4) {
      const sceneModeCommandSent = tcpServer.sendSceneModeCommand(
        serial_number,
        1
      );

      if (!sceneModeCommandSent) {
        return errorMessage(
          res,
          "Failed to set the device to vibration and ringing mode."
        );
      }

      sceneModeChanged = true;

      try {
        if (deviceSetting) {
          deviceSetting.scene_mode = 1;
          await deviceSetting.save();
        } else {
          await db.DeviceSetting.create({
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
            low_battery_alert: "0",
          });
        }
      } catch (settingErr) {
        Logging.error(
          `Failed to update DeviceSetting scene_mode for device ${device.id}: ${settingErr}`
        );
      }

      Logging.info(
        `Scene mode switched from ${currentSceneMode} to 1 before FIND for device ${serial_number}`
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
export default {
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceSettings,
  sendVoiceMessage,
  sendReminder,
  assignDeviceToUser,
  listUnlinkedDevices,
  assignOwner,
  updateDeviceIdentity,
  listDevices,
  getAllDeviceImei,
  deleteMultipleDevices,
  changeServerPortal,
  sendDeviceCommand,
  findDevice,
};

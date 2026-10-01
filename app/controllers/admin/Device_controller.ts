import { NextFunction, Request, Response } from "express";
import fs from "fs";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import Logging from "../../library/Logging";
import { deleteFile, unlinkUploadedFiles } from "../../helper/Helper";
import { Op } from "sequelize";
import { tcpServer } from "../../app";
import { ensureAmrNarrowband } from "../../library/AudioConverter";
import {
  canAccessAllDevices,
  canAccessDevice,
  deviceIdScope,
  ensureDeviceMember,
} from "../../helper/WatchAccess";
import { t } from "../../i18n/index";

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
      const owner = await db.User.findOne({
        where: { id: owner_id, deletedAt: null },
      });
      if (!owner) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "owner_id_does_not_match_any_existing_user");
      }
    }

    if (imei) {
      const existing = await db.Device.findOne({ where: { imei } });
      if (existing) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "a_device_with_this_imei_already_exists");
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

    // Register the owner as a member (admin) of the new watch.
    if (owner_id) {
      await ensureDeviceMember(device.id, owner_id, "admin");
    }

    return successMessage(res, "device_created_successfully", device);
  } catch (err) {
    console.error("createDevice error:", err);
    unlinkUploadedFiles(req);
    return errorMessage(res, "error_creating_device");
  }
};

/**
 * Derive the device serial number from its IMEI.
 *
 * An IMEI is 15 digits: a 5-digit type allocation code (TAC) followed by a
 * 10-digit serial number. The watch protocol uses that trailing 10 digits as
 * the device id (see linkDeviceIdentity()/findDevice() in tcpServer.ts), e.g.
 * IMEI 351266770150383 -> serial number 6677015038. Shorter input (a 14-digit
 * IMEI) is used as-is.
 */
const deriveSerialNumberFromImei = (imei: string): string => {
  const digits = String(imei ?? "").replace(/\D/g, "");

  return digits.length === 15 ? digits.slice(4, 14) : digits;
};

// Admin: add a watch using only its name and IMEI. The serial number is
// derived from the IMEI (trailing 10 digits) so the row is immediately
// reachable by the TCP layer, which keys devices on serial_number.
const addDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_name, imei } = req.body || {};

    if (!device_name || !String(device_name).trim()) {
      return errorMessage(res, "device_name_is_required");
    }

    const cleanImei = String(imei ?? "").trim();
    if (!/^\d{14,16}$/.test(cleanImei)) {
      return errorMessage(res, "imei_must_be_a_14_to_16_digit_number");
    }

    const name = String(device_name).trim();
    const serial_number = deriveSerialNumberFromImei(cleanImei);

    const existingByImei = await db.Device.findOne({
      where: { imei: cleanImei },
    });
    if (existingByImei) {
      return errorMessage(res, "a_device_with_this_imei_already_exists");
    }

    // The TCP layer auto-registers unknown watches as placeholders keyed by
    // serial_number (linkDeviceIdentity()/findDevice() in tcpServer.ts).
    // Reuse that placeholder instead of inserting a second row for the same
    // physical watch, otherwise the device ends up registered twice.
    //
    // The previous code did findOne() here and create() further below, which
    // is a find-then-insert race: a watch packet arriving between the two
    // would let both paths insert. findOrCreate() collapses the lookup+insert
    // into one statement, and the partial unique index on serial_number
    // (migration 20260929090000) is the database-level backstop - the loser of
    // any remaining race is rejected instead of producing a second row.
    const [existingBySerial, createdBySerial] = await db.Device.findOrCreate({
      where: { serial_number },
      defaults: {
        owner_id: null,
        imei: cleanImei,
        serial_number,
        device_name: name,
        connection_status: "offline",
        signal_status: null,
        battery_percentage: null,
        is_online: false,
        last_updated_at: null,
        location_interval_minutes: 1,
      },
    });

    if (!createdBySerial) {
      /**
       * The row already existed. A non-null imei means it is a different
       * physical watch that happens to share this serial number - never
       * silently overwrite it.
       */
      if (existingBySerial.imei && existingBySerial.imei !== cleanImei) {
        return errorMessage(
          res,
          t(req, "a_different_device_imei_is_already_registered_with_serial_number", [existingBySerial.imei, serial_number])
        );
      }

      existingBySerial.imei = cleanImei;
      existingBySerial.device_name = name;
      await existingBySerial.save();

      Logging.info(
        `Device ${existingBySerial.id} linked to imei=${cleanImei} ` +
          `serial_number=${serial_number} (existing placeholder reused)`
      );

      return successMessage(res, "device_added_successfully", {
        ...existingBySerial.toJSON(),
        created: false,
      });
    }

    const device = existingBySerial;

    Logging.info(
      `Device created: id=${device.id} imei=${cleanImei} ` +
        `serial_number=${serial_number} name=${name}`
    );

    // Send UPLOAD,60 to the watch and mirror it into DeviceSettings, so
    // the DB records the interval the device was actually given. Shared
    // with the TCP auto-registration path.
    await tcpServer.applyDefaultUploadInterval(device, serial_number);

    return successMessage(res, "device_added_successfully", {
      ...device.toJSON(),
      created: true,
    });
  } catch (err) {
    console.error("addDevice error:", err);
    return errorMessage(res, "error_adding_device");
  }
};

const updateDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, imei, device_name } = req.body;

    if (!id) {
      unlinkUploadedFiles(req);
      return errorMessage(res, "id_is_required");
    }

    const device = await db.Device.findByPk(id);
    if (!device) {
      unlinkUploadedFiles(req);
      return errorMessage(res, "device_not_found");
    }

    if (imei && imei !== device.imei) {
      const existing = await db.Device.findOne({
        where: { imei, id: { [Op.ne]: id } },
      });
      if (existing) {
        unlinkUploadedFiles(req);
        return errorMessage(res, "a_device_with_this_imei_already_exists");
      }
      device.imei = imei;
      device.serial_number = deriveSerialNumberFromImei(imei);
    }

    device.device_name = device_name ?? device.device_name;

    const files = (req as any).files as { [fieldname: string]: any[] };
    const image = files?.profile_image?.[0]?.filename ?? null;
    if (image) {
      deleteFile("profile", device.getDataValue("profile_image"));
      device.profile_image = image;
    }

    await device.save();

    return successMessage(res, "device_updated_successfully", device);
  } catch (err) {
    console.error("updateDevice error:", err);
    unlinkUploadedFiles(req);
    return errorMessage(res, "error_updating_device");
  }
};

const deleteDevice = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.body;
    const device = await db.Device.findOne({ where: { id } });
    if (!device) {
      return errorMessage(res, "device_not_found");
    }
    deleteFile("profile", device.profile_image);
    await db.Device.destroy({ where: { id } });
    return successMessage(res, "device_deleted_successfully");
  } catch (err) {
    console.error("deleteDevice error:", err);
    return errorMessage(res, "error_deleting_device");
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
      return errorMessage(res, "device_id_is_required");
    }

    const settings = await db.DeviceSetting.findOne({
      where: { device_id: device_id as string },
    });

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_not_found");
    }
    if (!settings) {
      return successMessage(
        res,
        "no_settings_found_returning_default_values",
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

    return successMessage(res, "device_settings_fetched_successfully", {
      ...settings.toJSON(),
      language: device.language,
      timezone: device.timezone,
      center_number: device.center_number,
    });
  } catch (err) {
    console.error("getDeviceSettings error:", err);
    return errorMessage(res, "error_fetching_device_settings");
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
      | { path: string; originalname: string; filename: string; size: number }
      | undefined;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }

    if (!voiceFile) {
      return errorMessage(res, "voice_file_amr_audio_is_required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number as string },
    });
    if (!device) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number as string);
    if (!tcpClient) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
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
        "could_not_process_the_uploaded_audio_file_unsupported_format_or_conversion_failure"
      );
    }

    const commandSent = tcpServer.sendVoiceMessageCommand(
      serial_number as string,
      amrBuffer
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
      );
    }

    // Store voice message record in DeviceVoiceMessages table
    try {
      const voiceBuffer = fs.readFileSync(voiceFile.path);
      await db.DeviceVoiceMessage.create({
        device_id: device.id,
        voice_data: voiceBuffer,
        voice_file_name: voiceFile.filename,
        is_send: 1,
        status: null,
      });
      Logging.info(
        `Voice message record stored in DeviceVoiceMessages for device ${serial_number}`
      );
    } catch (dbErr: any) {
      Logging.error(
        `Failed to store voice message record for device ${serial_number}: ${
          dbErr?.message || dbErr
        }`
      );
    }

    Logging.info(
      `Voice message (TK) sent to device ${serial_number} ` +
        `(uploaded_as=${voiceFile.originalname}, sent_as=AMR, sent_size=${amrBuffer.length} bytes)`
    );

    return successMessage(res, "voice_message_sent_successfully", {
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
    return errorMessage(res, "error_sending_voice_message");
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
      | { path: string; originalname: string; filename: string; size: number }
      | undefined;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }
    if (!type) {
      return errorMessage(
        res,
        "type_is_required_pill_water_general_sedentary"
      );
    }
    if (!reminder_settings) {
      return errorMessage(
        res,
        "reminder_settings_is_required_e_g_11_25_1_2"
      );
    }
    if (!number) {
      return errorMessage(res, "number_is_required_1_3");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number as string },
    });
    if (!device) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number as string);
    if (!tcpClient) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
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
          "could_not_process_the_uploaded_audio_file_unsupported_format_or_conversion_failure"
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
        "device_is_offline_please_ensure_the_device_is_connected"
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
        return errorMessage(res, t(req, "reminder_with_id_not_found", [id]));
      }
      // Safety: refuse to reassign a reminder to a different device.
      if (existing.device_id !== device.id) {
        return errorMessage(
          res,
          t(req, "reminder_does_not_belong_to_device", [id, serial_number])
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

    return successMessage(res, "reminder_sent_successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      reminder_id: reminder.id,
      action,
      type,
      reminder_settings,
      number: num,
      reminder_text: reminder_text || null,
      voice_file: voiceFile ? voiceFile.filename : null,
      command_sent: true,
      command_message:
        "TAKEPILLS command sent to device. The device will set the reminder.",
      command_protocol: commandProtocol,
      note: "Device will reply with [3G*<id>*<LEN>*TAKEPILLS,1] (success) or [3G*<id>*<LEN>*TAKEPILLS,0] (failure).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("sendReminder error:", err);
    return errorMessage(res, "error_sending_reminder");
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
      where.serial_number = { [Op.iLike]: `%${search}%` };
    }

    const { rows, count } = await db.Device.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [["createdAt", "DESC"]],
    });

    return successMessage(res, "unlinked_devices_fetched_successfully", {
      devices: rows,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error("listUnlinkedDevices error:", err);
    return errorMessage(res, "error_fetching_unlinked_devices");
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
      return errorMessage(res, "device_id_and_owner_id_are_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_not_found");
    }

    const owner = await db.User.findOne({
      where: { id: owner_id, deletedAt: null },
    });
    if (!owner) {
      return errorMessage(res, "owner_id_does_not_match_any_existing_user");
    }

    await device.update({ owner_id });

    // Keep DeviceMember in sync: the newly assigned owner is a member
    // (admin) of the watch. Existing members are preserved so a watch
    // can legitimately be shared across multiple users.
    await ensureDeviceMember(device.id, owner_id, "admin");

    return successMessage(res, "owner_assigned_successfully", device);
  } catch (err) {
    console.error("assignOwner error:", err);
    return errorMessage(res, "error_assigning_owner");
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
      return errorMessage(res, "device_id_is_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_not_found");
    }

    const updates: any = {};

    if (imei !== undefined) {
      if (imei) {
        const existing = await db.Device.findOne({
          where: { imei, id: { [Op.ne]: device_id } },
        });
        if (existing) {
          return errorMessage(res, "a_device_with_this_imei_already_exists");
        }
      }
      updates.imei = imei;
    }

    if (serial_number !== undefined) {
      updates.serial_number = serial_number;
    }

    await device.update(updates);

    return successMessage(res, "device_identity_updated_successfully", device);
  } catch (err) {
    console.error("updateDeviceIdentity error:", err);
    return errorMessage(res, "error_updating_device_identity");
  }
};

const listDevicesOld = async function (
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
        { serial_number: { [Op.iLike]: `%${search}%` } },
        { imei: { [Op.iLike]: `%${search}%` } },
        { device_name: { [Op.iLike]: `%${search}%` } },
        { "$DeviceOwner.name$": { [Op.iLike]: `%${search}%` } },
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

    // Pull every member (DeviceMembers) for the returned devices so
    // listings can show the full array of users assigned to each
    // watch — not just the single owner_id column.
    const deviceIds = rows.map((d: any) => d.id);
    const memberRows =
      deviceIds.length > 0
        ? await db.DeviceMember.findAll({
            where: { device_id: { [Op.in]: deviceIds } },
            include: [
              {
                model: db.User,
                as: "DeviceUser",
                attributes: ["id", "name", "email", "phone_number"],
                required: false,
              },
            ],
            raw: false,
          })
        : [];

    const membersByDevice = new Map<string, any[]>();
    for (const m of memberRows) {
      const arr = membersByDevice.get(m.device_id) || [];
      const json = m.toJSON ? m.toJSON() : m;
      const user = json.DeviceUser || {};
      arr.push({
        user_id: json.user_id,
        role: json.role,
        is_owner: false, // corrected below against owner_id
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
        },
      });
      membersByDevice.set(m.device_id, arr);
    }

    // Ensure DeviceOwner is always present (even if null) and tag the
    // owner in the members array.
    const devicesWithOwner = rows.map((device: any) => {
      const json = device.toJSON();
      const members = membersByDevice.get(device.id) || [];
      // The owner is always an admin member — surface them in the
      // array too so the UI never has to special-case owner_id.
      const ownerAlreadyListed = members.some(
        (mm: any) => mm.user_id === device.owner_id
      );
      if (device.owner_id && !ownerAlreadyListed) {
        const owner = device.DeviceOwner || null;
        members.unshift({
          user_id: device.owner_id,
          role: "admin",
          is_owner: true,
          user: owner
            ? {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                phone_number: null,
              }
            : null,
        });
      }
      // Tag is_owner on every member that matches owner_id.
      for (const mm of members) {
        mm.is_owner = mm.user_id === device.owner_id;
      }
      return {
        ...json,
        DeviceOwner: device.DeviceOwner || null,
        members,
      };
    });

    return successMessage(res, "devices_fetched_successfully", {
      devices: devicesWithOwner,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error("listDevices error:", err);
    return errorMessage(res, "error_fetching_devices");
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
        { serial_number: { [Op.iLike]: `%${search}%` } },
        { imei: { [Op.iLike]: `%${search}%` } },
        { device_name: { [Op.iLike]: `%${search}%` } },
        { connection_status: { [Op.iLike]: `%${search}%` } },
        { "$DeviceOwner.name$": { [Op.iLike]: `%${search}%` } },
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
    });

    // Pull every member (DeviceMembers) for the returned devices so
    // listings can show the full array of users assigned to each
    // watch — not just the single owner_id column.
    const deviceIds = rows.map((d: any) => d.id);
    const memberRows =
      deviceIds.length > 0
        ? await db.DeviceMember.findAll({
            where: { device_id: { [Op.in]: deviceIds } },
            include: [
              {
                model: db.User,
                as: "DeviceUser",
                attributes: ["id", "name", "email", "phone_number"],
                required: false,
              },
            ],
            raw: false,
          })
        : [];

    const membersByDevice = new Map<string, any[]>();
    for (const m of memberRows) {
      const arr = membersByDevice.get(m.device_id) || [];
      const json = m.toJSON ? m.toJSON() : m;
      const user = json.DeviceUser || {};
      arr.push({
        user_id: json.user_id,
        role: json.role,
        is_owner: false, // corrected below against owner_id
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
        },
      });
      membersByDevice.set(m.device_id, arr);
    }

    // Ensure DeviceOwner is always present (even if null) and tag the
    // owner in the members array.
    const devicesWithOwner = rows.map((device: any) => {
      const json = device.toJSON();
      const members = membersByDevice.get(device.id) || [];
      const ownerAlreadyListed = members.some(
        (mm: any) => mm.user_id === device.owner_id
      );
      if (device.owner_id && !ownerAlreadyListed) {
        const owner = device.DeviceOwner || null;
        members.unshift({
          user_id: device.owner_id,
          role: "admin",
          is_owner: true,
          user: owner
            ? {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                phone_number: null,
              }
            : null,
        });
      }
      for (const mm of members) {
        mm.is_owner = mm.user_id === device.owner_id;
      }
      return {
        ...json,
        DeviceOwner: device.DeviceOwner || null,
        members,
      };
    });

    // When a specific device id was requested, return that single
    // device object directly instead of a paginated list.
    if (id) {
      if (!devicesWithOwner.length) {
        return errorMessage(res, "device_not_found");
      }
      return successMessage(
        res,
        "device_fetched_successfully",
        devicesWithOwner[0]
      );
    }

    return successMessage(res, "devices_fetched_successfully", {
      devices: devicesWithOwner,
      total: count,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error("listDevices error:", err);
    return errorMessage(res, "error_fetching_devices");
  }
};

const getAllDevices = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Staff: restrict to assigned watches (combined with any id filter)
    const scope = await deviceIdScope(req);

    const rows = await db.Device.findAll({
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: db.User,
          as: "DeviceOwner",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    // Pull every member (DeviceMembers) for the returned devices so
    // listings can show the full array of users assigned to each
    // watch — not just the single owner_id column.
    const deviceIds = rows.map((d: any) => d.id);
    const memberRows =
      deviceIds.length > 0
        ? await db.DeviceMember.findAll({
            where: { device_id: { [Op.in]: deviceIds } },
            include: [
              {
                model: db.User,
                as: "DeviceUser",
                attributes: ["id", "name", "email", "phone_number"],
                required: false,
              },
            ],
            raw: false,
          })
        : [];

    const membersByDevice = new Map<string, any[]>();
    for (const m of memberRows) {
      const arr = membersByDevice.get(m.device_id) || [];
      const json = m.toJSON ? m.toJSON() : m;
      const user = json.DeviceUser || {};
      arr.push({
        user_id: json.user_id,
        role: json.role,
        is_owner: false, // corrected below against owner_id
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
        },
      });
      membersByDevice.set(m.device_id, arr);
    }

    // Ensure DeviceOwner is always present (even if null) and tag the
    // owner in the members array.
    const devicesWithOwner = rows.map((device: any) => {
      const json = device.toJSON();
      const members = membersByDevice.get(device.id) || [];
      const ownerAlreadyListed = members.some(
        (mm: any) => mm.user_id === device.owner_id
      );
      if (device.owner_id && !ownerAlreadyListed) {
        const owner = device.DeviceOwner || null;
        members.unshift({
          user_id: device.owner_id,
          role: "admin",
          is_owner: true,
          user: owner
            ? {
                id: owner.id,
                name: owner.name,
                email: owner.email,
                phone_number: null,
              }
            : null,
        });
      }
      for (const mm of members) {
        mm.is_owner = mm.user_id === device.owner_id;
      }
      return {
        ...json,
        DeviceOwner: device.DeviceOwner || null,
        members,
      };
    });

    // When a specific device id was requested, return that single
    // device object directly instead of a list.

    return successMessage(
      res,
      "devices_fetched_successfully",
      devicesWithOwner
    );
  } catch (err) {
    console.error("getAllDevices error:", err);
    return errorMessage(res, "error_fetching_devices");
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

    return successMessage(res, "all_device_imeis_fetched_successfully", {
      devices,
      total: devices.length,
    });
  } catch (err) {
    console.error("getAllDeviceImei error:", err);
    return errorMessage(res, "error_fetching_device_imeis");
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
      return errorMessage(res, "device_ids_array_is_required");
    }

    const devices = await db.Device.findAll({
      where: { id: { [Op.in]: ids } },
    });

    if (devices.length === 0) {
      return errorMessage(res, "no_devices_found_with_the_provided_ids");
    }

    if (!(await canAccessAllDevices(req, ids))) {
      return errorMessage(
        res,
        "you_do_not_have_access_to_one_or_more_of_these_devices"
      );
    }

    await db.Device.destroy({ where: { id: { [Op.in]: ids } } });

    return successMessage(
      res,
      t(req, "devices_deleted_successfully", [devices.length])
    );
  } catch (err) {
    console.error("deleteMultipleDevices error:", err);
    return errorMessage(res, "error_deleting_devices");
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
        "device_id_user_id_and_device_name_are_required"
      );
    }

    const device = await db.Device.findOne({ where: { id: device_id } });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found");
    }

    const user = await db.User.findOne({
      where: { id: user_id, deletedAt: null },
    });
    if (!user) {
      return errorMessage(res, "user_not_found");
    }

    device.owner_id = user_id;
    device.device_name = device_name;
    await device.save();

    // Keep DeviceMember in sync: the assigned user is now a member
    // (admin) of the watch. Existing members are preserved so a watch
    // can legitimately be shared across multiple users.
    await ensureDeviceMember(device.id, user_id, "admin");

    return successMessage(res, "device_assigned_to_user_successfully", device);
  } catch (err) {
    console.error("assignDeviceToUser error:", err);
    return errorMessage(res, "error_assigning_device_to_user");
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
      return errorMessage(res, "serial_number_is_required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });

    if (!device) {
      return errorMessage(res, t(req, "device_with_imei_not_found", [serial_number]));
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
      "server_portal_change_request_saved_successfully",
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
    return errorMessage(res, "error_changing_server_portal");
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
      return errorMessage(res, "serial_number_is_required");
    }

    if (command === undefined || command === null) {
      return errorMessage(res, "command_is_required");
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
        "invalid_command_must_be_1_restart_2_shutdown_or_3_factory_reset"
      );
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
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
        "device_is_offline_please_ensure_the_device_is_connected"
      );
    }

    Logging.info(
      `${COMMAND_NAMES[command]} command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(
      res,
      t(req, "command_sent_successfully", [COMMAND_NAMES[command]]),
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
    return errorMessage(res, "error_sending_command_to_device");
  }
};
const findDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { serial_number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);

    if (!tcpClient) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
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
          "failed_to_set_the_device_to_vibration_and_ringing_mode"
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
        "device_is_offline_please_ensure_the_device_is_connected"
      );
    }

    const commandProtocol = `[3G*${serial_number}*0004*FIND]`;

    Logging.info(
      `Find device command sent to device ${serial_number} (device_id: ${device.id})`
    );

    return successMessage(res, "find_device_command_sent_successfully", {
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
    return errorMessage(res, "error_sending_find_device_command");
  }
};

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
const STOP_THRESHOLD_KM = 0.03; // ~30 meters

const getTravelHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, start_time, end_time } = req.body;

    if (!serial_number || !start_time || !end_time) {
      return errorMessage(
        res,
        "serial_number_start_time_and_end_time_are_required"
      );
    }

    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(res, "device_not_found_for_given_serial_number");
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    const locations = await db.Location.findAll({
      where: {
        device_id: device.id,
        recorded_at: { [Op.between]: [start, end] },
        // is_valid_fix: true,
      },
      order: [["recorded_at", "ASC"]],
      attributes: ["latitude", "longitude", "total_distance_km", "recorded_at"],
    });

    if (!locations.length) {
      return successMessage(res, "travel_history_fetched_successfully", {
        serial_number,
        total_distance: "0 km",
        points: [],
      });
    }

    // Calculate total distance by summing haversine distances between
    // consecutive points — robust even when total_distance_km is null
    let totalDistanceKm = 0;
    for (let i = 1; i < locations.length; i++) {
      totalDistanceKm += haversineDistance(
        Number(locations[i - 1].latitude),
        Number(locations[i - 1].longitude),
        Number(locations[i].latitude),
        Number(locations[i].longitude)
      );
    }

    // Merge consecutive points that stayed within STOP_THRESHOLD_KM into one entry
    const points: { time: string; latitude: number; longitude: number }[] = [];

    let clusterStart: any = locations[0];
    let clusterEnd: any = locations[0];

    const formatTime = (d: any) => new Date(d).toISOString();

    const pushCluster = (clStart: any, clEnd: any) => {
      const startLabel = formatTime(clStart.recorded_at);
      const endLabel = formatTime(clEnd.recorded_at);
      points.push({
        time:
          new Date(clStart.recorded_at).getTime() ===
          new Date(clEnd.recorded_at).getTime()
            ? startLabel
            : `${startLabel} - ${endLabel}`,
        latitude: Number(clEnd.latitude),
        longitude: Number(clEnd.longitude),
      });
    };

    for (let i = 1; i < locations.length; i++) {
      const prev = clusterEnd;
      const curr = locations[i];

      const dist = haversineDistance(
        Number(prev.latitude),
        Number(prev.longitude),
        Number(curr.latitude),
        Number(curr.longitude)
      );

      if (dist <= STOP_THRESHOLD_KM) {
        clusterEnd = curr; // still at the same spot — extend the cluster
      } else {
        pushCluster(clusterStart, clusterEnd); // moved — close the cluster
        clusterStart = curr;
        clusterEnd = curr;
      }
    }
    pushCluster(clusterStart, clusterEnd);

    return successMessage(res, "travel_history_fetched_successfully", {
      serial_number,
      total_distance: `${totalDistanceKm.toFixed(2)} km`,
      points,
    });
  } catch (err) {
    console.error("getTravelHistory error:", err);
    return errorMessage(res, "error_fetching_travel_history");
  }
};

// ── Multi-user watch sharing (DeviceMembers) ────────────────────
// A watch can be shared with several users. Each member is either
// "admin" (full access + can manage members) or "member" (view +
// receive alerts). The owner is always recorded as admin.

const addMember = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, user_id, role = "member" } = req.body;

    if (!device_id || !user_id) {
      return errorMessage(res, "device_id_and_user_id_are_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found");
    }

    const user = await db.User.findOne({
      where: { id: user_id, deletedAt: null },
    });
    if (!user) {
      return errorMessage(res, "user_not_found");
    }

    // Refuse to demote the owner: the owner is always an admin.
    const isOwner = device.owner_id === user_id;
    const finalRole = isOwner ? "admin" : role;

    await ensureDeviceMember(device.id, user_id, finalRole as any);

    const member = await db.DeviceMember.findOne({
      where: { device_id: device.id, user_id },
      include: [
        {
          model: db.User,
          as: "DeviceUser",
          attributes: ["id", "name", "email", "phone_number"],
        },
      ],
    });

    return successMessage(res, "member_added_successfully", member);
  } catch (err) {
    console.error("addMember error:", err);
    return errorMessage(res, "error_adding_member");
  }
};

// const addMembers = async function (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) {
//   try {
//     const {
//       device_name,
//       device_id,
//       user_ids,
//       role = "member",
//     }: {
//       device_id: string;
//       user_ids: string[];
//       role?: string;
//       device_name?: string;
//     } = req.body;

//     if (!device_id || !Array.isArray(user_ids) || !user_ids.length) {
//       return errorMessage(res, "device_id_and_user_ids_array_are_required");
//     }

//     const device = await db.Device.findByPk(device_id);
//     if (!device || !(await canAccessDevice(req, device.id))) {
//       return errorMessage(res, "device_not_found");
//     }
//     if (device_name !== undefined) {
//       device.device_name = device_name;
//       await device.save();
//     }

//     // ── Full replace semantics ──────────────────────────────────
//     // The caller wants to set the watch's member list to EXACTLY the
//     // supplied user_ids. So we wipe EVERY existing member row first
//     // (owner, admin, member — all of them) and then re-add only the
//     // supplied users. This guarantees the member list never
//     // accumulates stale entries across repeated calls.
//     const ownerId = device.owner_id;
//     const removed = await db.DeviceMember.destroy({
//       where: { device_id: device.id },
//     });

//     const added: any[] = [];
//     const skipped: { user_id: string; reason: string }[] = [];

//     for (const user_id of user_ids) {
//       const user = await db.User.findByPk(user_id);
//       if (!user) {
//         skipped.push({ user_id, reason: "user not found" });
//         continue;
//       }
//       // The owner is always an admin — never demote them.
//       const isOwner = ownerId && ownerId === user_id;
//       const finalRole = isOwner ? "admin" : role;
//       await ensureDeviceMember(device.id, user_id, finalRole as any);
//       added.push({ user_id, role: finalRole });
//     }

//     return successMessage(res, "members_added_successfully", {
//       removed_count: removed,
//       added,
//       skipped,
//       total_added: added.length,
//       total_skipped: skipped.length,
//     });
//   } catch (err) {
//     console.error("addMembers error:", err);
//     return errorMessage(res, "error_adding_members");
//   }
// };

const addMembers = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      device_name,
      device_id,
      user_ids,
      role = "member",
    }: {
      device_id: string;
      user_ids: string[];
      role?: string;
      device_name?: string;
    } = req.body;

    if (!device_id || !Array.isArray(user_ids) || !user_ids.length) {
      return errorMessage(res, "device_id_and_user_ids_array_are_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found");
    }
    if (device_name !== undefined) {
      device.device_name = device_name;
      await device.save();
    }

    // ── Full replace semantics ──────────────────────────────────
    // The caller wants to set the watch's member list to EXACTLY the
    // supplied user_ids. So we wipe EVERY existing member row first
    // (owner, admin, member — all of them) and then re-add only the
    // supplied users. This guarantees the member list never
    // accumulates stale entries across repeated calls.
    const ownerId = device.owner_id;

    // Capture who was a member BEFORE the wipe, so we know who was
    // actually removed (existed before, not present in new user_ids).
    const existingMembers = await db.DeviceMember.findAll({
      where: { device_id: device.id },
      attributes: ["user_id"],
    });
    const existingUserIds = existingMembers.map((m: any) => m.user_id);

    const removed = await db.DeviceMember.destroy({
      where: { device_id: device.id },
    });

    const added: any[] = [];
    const skipped: { user_id: string; reason: string }[] = [];

    for (const user_id of user_ids) {
      const user = await db.User.findOne({
        where: { id: user_id, deletedAt: null },
      });
      if (!user) {
        skipped.push({ user_id, reason: "user not found" });
        continue;
      }
      // The owner is always an admin — never demote them.
      const isOwner = ownerId && ownerId === user_id;
      const finalRole = isOwner ? "admin" : role;
      await ensureDeviceMember(device.id, user_id, finalRole as any);
      added.push({ user_id, role: finalRole });
    }

    // Users who were members before but are not in the new list were
    // actually removed from this device — invalidate their session
    // token so their existing auth token stops working.
    const removedUserIds = existingUserIds.filter(
      (id: string) => !user_ids.includes(id)
    );
    if (removedUserIds.length) {
      await db.User.update(
        { session_token: "" },
        { where: { id: { [Op.in]: removedUserIds } } }
      );
    }

    return successMessage(res, "members_updated_successfully", {
      removed_count: removed,
      added,
      skipped,
      total_added: added.length,
      total_skipped: skipped.length,
    });
  } catch (err) {
    console.error("addMembers error:", err);
    return errorMessage(res, "error_adding_members");
  }
};
const listMembers = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, page = 1, limit = 20, search = "" } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id_is_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found");
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { device_id: device.id };
    if (search) {
      // Filter on the related User's name/email/phone.
      whereCondition[Op.or] = [
        db.sequelize.where(
          db.sequelize.col("DeviceUser.name"),
          "LIKE",
          `%${search}%`
        ),
        db.sequelize.where(
          db.sequelize.col("DeviceUser.email"),
          "LIKE",
          `%${search}%`
        ),
        db.sequelize.where(
          db.sequelize.col("DeviceUser.phone_number"),
          "LIKE",
          `%${search}%`
        ),
      ];
    }

    const { count, rows } = await db.DeviceMember.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: db.User,
          as: "DeviceUser",
          attributes: ["id", "name", "email", "phone_number"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      distinct: true,
    });

    // Tag each row with a boolean so the UI can tell who is the owner.
    const data = rows.map((m: any) => {
      const json = m.toJSON ? m.toJSON() : m;
      const user = json.DeviceUser || {};
      return {
        id: json.id,
        device_id: json.device_id,
        user_id: json.user_id,
        role: json.role,
        is_owner: device.owner_id === json.user_id,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone_number: user.phone_number,
        },
        createdAt: json.createdAt,
      };
    });

    return successPagination(res, "members_fetched_successfully", data, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("listMembers error:", err);
    return errorMessage(res, "error_fetching_members");
  }
};

const removeMember = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, user_id } = req.body;

    if (!device_id || !user_id) {
      return errorMessage(res, "device_id_and_user_id_are_required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found");
    }

    // Remove ANY member — admin or owner alike. The Devices.owner_id
    // column is intentionally left untouched here; it is a legacy
    // denormalized pointer and is NOT cleared by member management.
    // If the caller truly wants to unassign the owner they should
    // use assignOwner / assign_device_to_user to set a new owner.
    const member = await db.DeviceMember.findOne({
      where: { device_id: device.id, user_id },
    });

    if (!member) {
      return errorMessage(res, "user_is_not_a_member_of_this_watch");
    }

    const wasOwner = device.owner_id === user_id;

    await member.destroy();

    return successMessage(res, "member_removed_successfully", {
      device_id: device.id,
      user_id,
      was_owner: wasOwner,
      note: wasOwner
        ? "Owner's DeviceMember row removed. Devices.owner_id is left intact — use assignOwner to transfer ownership."
        : undefined,
    });
  } catch (err) {
    console.error("removeMember error:", err);
    return errorMessage(res, "error_removing_member");
  }
};

export default {
  createDevice,
  addDevice,
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
  getTravelHistory,
  getAllDevices,
  // Multi-user watch sharing
  addMember,
  addMembers,
  listMembers,
  removeMember,
};

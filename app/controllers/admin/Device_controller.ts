import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { deleteFile, unlinkUploadedFiles } from "../../helper/Helper";
import { Op } from "sequelize";

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
    const { device_id } = req.query;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const settings = await db.DeviceSetting.findOne({
      where: { device_id: device_id as string },
    });

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
          fall_down_alert_enabled: false,
          fall_down_reminder_call: false,
          fall_down_level: 0,
        }
      );
    }

    return successMessage(
      res,
      "Device settings fetched successfully",
      settings
    );
  } catch (err) {
    console.error("getDeviceSettings error:", err);
    return errorMessage(res, "Error fetching device settings");
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

export default {
  createDevice,
  updateDevice,
  deleteDevice,
  getDeviceSettings,
  listUnlinkedDevices,
  assignOwner,
  updateDeviceIdentity,
};

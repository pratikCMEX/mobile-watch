import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op } from "sequelize";
import {
  canAccessDevice,
  deviceIdScope,
} from "../../helper/WatchAccess";

// Get all emergency contacts with search and pagination
async function getAllEmergencyContacts(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const { device_id, imei, page = 1, limit = 20, search } = body;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};

    // If IMEI is provided, find device first and filter by device_id
    if (imei && imei !== "") {
      const device = await db.Device.findOne({
        where: { imei: imei as string },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      where.device_id = device.id;
    } else if (device_id) {
      // If device_id is provided directly
      if (!(await canAccessDevice(req, device_id))) {
        return errorMessage(res, "Device not found");
      }
      where.device_id = device_id;
    } else {
      // Apply device scope for staff
      const scope = await deviceIdScope(req);
      if (scope) where.device_id = scope;
    }

    // General search parameter - searches name, phone_number, country_code, imei, and device_name
    if (search && search !== "") {
      // Check if search matches an IMEI first
      try {
        const device = await db.Device.findOne({
          where: { imei: { [Op.like]: `%${search}%` } },
          attributes: ["id"],
        });

        const orConditions: any[] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { phone_number: { [Op.like]: `%${search}%` } },
          { country_code: { [Op.like]: `%${search}%` } },
        ];

        if (device) {
          const hasAccess = await canAccessDevice(req, device.id);
          if (hasAccess) {
            orConditions.push({ device_id: device.id });
          }
        }

        where[Op.or] = orConditions;
      } catch (err) {
        console.error("Error during IMEI search:", err);
        // If error occurs, just search by name, phone_number, country_code
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { phone_number: { [Op.like]: `%${search}%` } },
          { country_code: { [Op.like]: `%${search}%` } },
        ];
      }
    }

    const { count, rows } = await db.EmergencyContact.findAndCountAll({
      where,
      include: [
        {
          model: db.Device,
          as: "DeviceEmergencyContact",
          attributes: ["id", "imei", "device_name"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Emergency contacts fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("getAllEmergencyContacts error:", err);
    return errorMessage(res, "Error fetching emergency contacts");
  }
}

// Get all device phonebook entries with search and pagination
async function getAllDevicePhonebook(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const { device_id, imei, page = 1, limit = 20, search } = body;
    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};

    // If IMEI is provided, find device first and filter by device_id
    if (imei && imei !== "") {
      const device = await db.Device.findOne({
        where: { imei: imei as string },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      where.device_id = device.id;
    } else if (device_id) {
      // If device_id is provided directly
      if (!(await canAccessDevice(req, device_id))) {
        return errorMessage(res, "Device not found");
      }
      where.device_id = device_id;
    } else {
      // Apply device scope for staff
      const scope = await deviceIdScope(req);
      if (scope) where.device_id = scope;
    }

    // General search parameter - searches name, phone_number, country_code, imei, and device_name
    if (search && search !== "") {
      // Check if search matches an IMEI first
      try {
        const device = await db.Device.findOne({
          where: { imei: { [Op.like]: `%${search}%` } },
          attributes: ["id"],
        });

        const orConditions: any[] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { phone_number: { [Op.like]: `%${search}%` } },
          { country_code: { [Op.like]: `%${search}%` } },
        ];

        if (device) {
          const hasAccess = await canAccessDevice(req, device.id);
          if (hasAccess) {
            orConditions.push({ device_id: device.id });
          }
        }

        where[Op.or] = orConditions;
      } catch (err) {
        console.error("Error during IMEI search:", err);
        // If error occurs, just search by name, phone_number, country_code
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { phone_number: { [Op.like]: `%${search}%` } },
          { country_code: { [Op.like]: `%${search}%` } },
        ];
      }
    }

    const { count, rows } = await db.DevicePhonebook.findAndCountAll({
      where,
      include: [
        {
          model: db.Device,
          as: "DevicePhonebookDevice",
          attributes: ["id", "imei", "device_name"],
          required: false,
        },
      ],
      order: [["slot_index", "ASC"]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Device phonebook fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("getAllDevicePhonebook error:", err);
    return errorMessage(res, "Error fetching device phonebook");
  }
}

export default {
  getAllEmergencyContacts,
  getAllDevicePhonebook,
};

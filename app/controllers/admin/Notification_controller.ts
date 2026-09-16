import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op } from "sequelize";

// Get all notifications (admin view) - supports search by device_id, imei, type, is_read, and general search with pagination
async function getAllNotifications(req: Request, res: Response, next: NextFunction) {
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

      if (!device) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      where.device_id = device.id;
    } else if (device_id) {
      // If device_id is provided directly
      where.device_id = device_id;
    }

    // Optional filters
    // if (type) {
    //   where.type = type;
    // }

    // if (is_read !== undefined) {
    //   where.is_read = is_read;
    // }

    // General search parameter - searches device_id, imei (through device), type, and is_read
    if (search && search !== "") {
      where[Op.or] = [
        { device_id: { [Op.like]: `%${search}%` } },
        { "$DeviceNotification.imei$": { [Op.like]: `%${search}%` } },
        { type: { [Op.like]: `%${search}%` } },
        { is_read: search === "true" ? true : search === "false" ? false : undefined },
      ].filter((condition) => condition !== undefined);
    }

    const { count, rows } = await db.Notification.findAndCountAll({
      where,
      include: [
        {
          model: db.Device,
          as: "DeviceNotification",
          attributes: ["id", "imei", "device_name"],
          required: false,
        },
        {
          model: db.User,
          as: "UserNotification",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Notifications fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("getAllNotifications error:", err);
    return errorMessage(res, "Error fetching notifications");
  }
}

export default {
  getAllNotifications,
};

import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op } from "sequelize";
import { canAccessDevice, deviceIdScope } from "../../helper/WatchAccess";

// Get all notifications (admin view) - supports search by device_id, imei, device_name, title, createdAt, type[], is_read, and general search with pagination
async function getAllNotifications(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const { device_id, imei, page = 1, limit = 20, search, type } = body;
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
      const scope = await deviceIdScope(req);
      if (scope) where.device_id = scope;
    }

    // Filter by type[] - array of notification types
    // if (type && Array.isArray(type) && type.length > 0) {
    //   where.type = { [Op.in]: type };
    // }

    // Filter by type - single string or array of notification types
    if (type && (Array.isArray(type) ? type.length > 0 : type !== "")) {
      const types: string[] = Array.isArray(type) ? type : [type];
      where.type = { [Op.in]: types.map((t) => String(t).toLowerCase()) };
    }
    // General search parameter - searches device_id, imei (through device), device_name (through device), title, createdAt, type, and is_read
    if (search && search !== "") {
      // is_read is stored as the ENUM strings "0"/"1" — never compare it
      // to a boolean (Postgres rejects `enum = boolean`).
      const isReadCondition =
        search === "true"
          ? { is_read: "1" }
          : search === "false"
          ? { is_read: "0" }
          : undefined;

      // For createdAt search, try to parse as date
      let createdAtCondition = undefined;
      const searchDate = new Date(search);
      if (!isNaN(searchDate.getTime())) {
        // Search for notifications created on this date (full day range)
        const startOfDay = new Date(searchDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(searchDate);
        endOfDay.setHours(23, 59, 59, 999);
        createdAtCondition = {
          createdAt: {
            [Op.between]: [startOfDay, endOfDay],
          },
        };
      }

      where[Op.or] = [
        { device_id: { [Op.iLike]: `%${search}%` } },
        { "$DeviceNotification.imei$": { [Op.iLike]: `%${search}%` } },
        { "$DeviceNotification.device_name$": { [Op.iLike]: `%${search}%` } },
        { title: { [Op.iLike]: `%${search}%` } },
        { type: { [Op.iLike]: `%${type}%` } },
        isReadCondition,
        createdAtCondition,
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

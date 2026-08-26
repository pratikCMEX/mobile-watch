import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op } from "sequelize";

const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      device_id,
      user_id,
      type,
      is_read,
      page = 1,
      limit = 10,
      sorting = "DESC",
      start_date,
      end_date,
    } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { device_id };

    if (user_id) {
      whereCondition.user_id = user_id;
    }

    if (type) {
      whereCondition.type = type;
    }

    if (is_read) {
      whereCondition.is_read = is_read;
    }

    if (start_date && end_date) {
      whereCondition.createdAt = {
        [Op.between]: [new Date(start_date), new Date(end_date)],
      };
    } else if (start_date) {
      whereCondition.createdAt = { [Op.gte]: new Date(start_date) };
    } else if (end_date) {
      whereCondition.createdAt = { [Op.lte]: new Date(end_date) };
    }

    const { count, rows } = await db.Notification.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id",
        "device_id",
        "user_id",
        "type",
        "title",
        "body",
        "metadata",
        "is_read",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", sorting.toUpperCase() === "ASC" ? "ASC" : "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Notifications fetched successfully", rows, {
      page: Number(page),
      limit: Number(limit),
      total: count,
    });
  } catch (err) {
    console.error("listNotifications error:", err);
    return errorMessage(res, "Error fetching notifications");
  }
};

export default {
  listNotifications,
};

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
    // user_id comes from the logged-in user (JWT token)
    const user_id = (req as any)?.userinfo?.payload?.id;

    if (!user_id) {
      return errorMessage(res, "User not authenticated");
    }

    const {
      type,
      is_read,
      page = 1,
      limit = 10,
      sorting = "DESC",
      start_date,
      end_date,
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { user_id };

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

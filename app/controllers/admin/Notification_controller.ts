import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op } from "sequelize";
import { canAccessDevice, deviceIdScope } from "../../helper/WatchAccess";

/**
 * Fill in `UserNotification` for notification rows whose `user_id` is NULL.
 *
 * The include in the query is a LEFT JOIN on `Notifications.user_id`; rows
 * stored without a recipient (see createNotification in
 * notification.service.ts) therefore come back with `UserNotification: null`.
 * The recipient is resolved as the first DeviceMember assigned to the watch,
 * falling back to the device owner, so the admin list can always show who the
 * alert belongs to. Two batched queries are used, so the cost does not grow
 * with the page size.
 */
async function attachFallbackRecipients(rows: any[]): Promise<void> {
  const orphans = (rows || []).filter(
    (row: any) => !row?.user_id && row?.device_id && !row?.UserNotification
  );

  if (orphans.length === 0) return;

  const deviceIds = [
    ...new Set(orphans.map((row: any) => row.device_id as string)),
  ];

  const [members, devices] = await Promise.all([
    db.DeviceMember.findAll({
      where: { device_id: { [Op.in]: deviceIds } },
      attributes: ["device_id", "user_id"],
      order: [["createdAt", "ASC"]],
      raw: true,
    }),
    db.Device.findAll({
      where: { id: { [Op.in]: deviceIds } },
      attributes: ["id", "owner_id"],
      raw: true,
    }),
  ]);

  // First member assigned to the device wins as the representative recipient.
  const memberByDevice = new Map<string, string>();
  (members as any[]).forEach((member) => {
    if (member.user_id && !memberByDevice.has(member.device_id)) {
      memberByDevice.set(member.device_id, member.user_id);
    }
  });

  const ownerByDevice = new Map<string, string>();
  (devices as any[]).forEach((device) => {
    if (device.owner_id) ownerByDevice.set(device.id, device.owner_id);
  });

  const candidateIds = [
    ...new Set([...memberByDevice.values(), ...ownerByDevice.values()]),
  ];

  if (candidateIds.length === 0) return;

  const users = await db.User.findAll({
    where: { id: { [Op.in]: candidateIds } },
    attributes: ["id", "name", "email"],
    raw: true,
  });

  const userById = new Map(
    (users as any[]).map((user) => [user.id, user] as [string, any])
  );

  orphans.forEach((row: any) => {
    const resolvedId =
      memberByDevice.get(row.device_id) || ownerByDevice.get(row.device_id);
    const user = resolvedId ? userById.get(resolvedId) : undefined;

    if (!user) return;

    // Keep `user_id` untouched: it is the real recipient of the row and stays
    // NULL in the DB. The resolved user is exposed separately for the panel.
    const payload = { id: user.id, name: user.name, email: user.email };
    if (typeof row.setDataValue === "function") {
      row.setDataValue("UserNotification", payload);
    } else {
      row.UserNotification = payload;
    }
    row.resolved_recipient_id = user.id;
  });
}

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
        { type: { [Op.iLike]: `%${search}%` } },
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

    // `Notifications.user_id` is NULL whenever an alert was stored without a
    // resolved recipient (see createNotification in notification.service.ts),
    // so the `UserNotification` include returns null for those rows. Resolve a
    // fallback recipient — first DeviceMember of the watch, else the device
    // owner — in a single batched lookup so the admin list can always render
    // the "sent to" user.
    await attachFallbackRecipients(rows);

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

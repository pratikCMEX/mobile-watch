import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successPagination } from "../../library/Response";
import { Op, cast, col, where } from "sequelize";
import { canAccessDevice, deviceIdScope } from "../../helper/WatchAccess";

/**
 * Case-insensitive "contains" on a column that may not be text.
 *
 * `ILIKE` is only defined for text-ish types. In Postgres it does not
 * exist for `uuid` or for a user-defined `enum`, so searching those
 * columns directly fails with
 *   ERROR: operator does not exist: uuid ~~* unknown
 * and takes the whole request down with a 500 — which is why searching
 * by device id or type silently returned nothing at all.
 *
 * Casting to TEXT first makes the comparison valid for every column type
 * while keeping the pattern bound as a parameter, so this stays safe
 * against SQL injection.
 */
const iLikeAny = (column: string, value: string) =>
  where(cast(col(column), "TEXT"), { [Op.iLike]: `%${value}%` } as any);

/**
 * Fill in `UserNotification` for notification rows whose `user_id` is NULL.
 *
 * The include in the query is a LEFT JOIN on `Notifications.user_id`; rows
 * stored without a recipient (see createNotification in
 * notification.service.ts, which writes `user_id: null` when a watch has no
 * DeviceMembers) therefore come back with `UserNotification: null`.
 *
 * The recipient is resolved with the following chain, so the admin list can
 * always show who an alert belongs to:
 *   1. the DeviceMember with role "admin", else the oldest DeviceMember;
 *   2. the device owner (`Devices.owner_id`);
 *   3. the user registered with the account email stored on the device
 *      (`Devices.email`);
 *   4. the user registered with the account phone stored on the device
 *      (`Devices.phone_number`).
 *
 * Everything is fetched with three batched queries, so the cost does not grow
 * with the page size, and the block is skipped entirely when the page has no
 * orphan rows.
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
      attributes: ["device_id", "user_id", "role"],
      order: [["createdAt", "ASC"]],
      raw: true,
    }),
    db.Device.findAll({
      where: { id: { [Op.in]: deviceIds } },
      attributes: ["id", "owner_id", "email", "phone_number"],
      raw: true,
    }),
  ]);

  // A member with role "admin" is the representative recipient; otherwise the
  // oldest assignment (rows arrive ordered by createdAt ASC) wins.
  const adminByDevice = new Map<string, string>();
  const oldestByDevice = new Map<string, string>();
  (members as any[]).forEach((member) => {
    if (!member.user_id) return;
    if (member.role === "admin" && !adminByDevice.has(member.device_id)) {
      adminByDevice.set(member.device_id, member.user_id);
    }
    if (!oldestByDevice.has(member.device_id)) {
      oldestByDevice.set(member.device_id, member.user_id);
    }
  });
  const memberByDevice = new Map<string, string>();
  deviceIds.forEach((id) => {
    const resolved = adminByDevice.get(id) || oldestByDevice.get(id);
    if (resolved) memberByDevice.set(id, resolved);
  });

  const ownerByDevice = new Map<string, string>();
  const emailByDevice = new Map<string, string>();
  const phoneByDevice = new Map<string, string>();
  (devices as any[]).forEach((device) => {
    if (device.owner_id) ownerByDevice.set(device.id, device.owner_id);
    if (device.email)
      emailByDevice.set(device.id, String(device.email).trim().toLowerCase());
    if (device.phone_number)
      phoneByDevice.set(device.id, String(device.phone_number).trim());
  });

  const candidateIds = [
    ...new Set([...memberByDevice.values(), ...ownerByDevice.values()]),
  ];
  const candidateEmails = [...new Set(emailByDevice.values())];
  const candidatePhones = [...new Set(phoneByDevice.values())];

  const [usersById, usersByEmail, usersByPhone] = await Promise.all([
    candidateIds.length
      ? db.User.findAll({
          // paranoid: false so a soft-deleted account still resolves instead
          // of degrading to null.
          where: { id: { [Op.in]: candidateIds } },
          attributes: ["id", "name", "email"],
          paranoid: false,
          raw: true,
        })
      : Promise.resolve([]),
    candidateEmails.length
      ? db.User.findAll({
          where: { email: { [Op.iLike]: { [Op.any]: candidateEmails } } },
          attributes: ["id", "name", "email", "phone_number"],
          paranoid: false,
          raw: true,
        })
      : Promise.resolve([]),
    candidatePhones.length
      ? db.User.findAll({
          where: { phone_number: { [Op.in]: candidatePhones } },
          attributes: ["id", "name", "email", "phone_number"],
          paranoid: false,
          raw: true,
        })
      : Promise.resolve([]),
  ]);

  const userById = new Map(
    (usersById as any[]).map((user) => [user.id, user] as [string, any])
  );
  const userByEmail = new Map(
    (usersByEmail as any[]).map((user) => [
      String(user.email || "")
        .trim()
        .toLowerCase(),
      user,
    ]) as Array<[string, any]>
  );
  const userByPhone = new Map(
    (usersByPhone as any[]).map((user) => [
      String(user.phone_number || "").trim(),
      user,
    ]) as Array<[string, any]>
  );

  orphans.forEach((row: any) => {
    const memberId = memberByDevice.get(row.device_id);
    const ownerId = ownerByDevice.get(row.device_id);
    const deviceEmail = emailByDevice.get(row.device_id);
    const devicePhone = phoneByDevice.get(row.device_id);

    const user =
      (memberId && userById.get(memberId)) ||
      (ownerId && userById.get(ownerId)) ||
      (deviceEmail ? userByEmail.get(deviceEmail) : undefined) ||
      (devicePhone ? userByPhone.get(devicePhone) : undefined);

    if (!user) return;

    // Keep `user_id` untouched: it is the real recipient of the row and stays
    // NULL in the DB. The resolved user is exposed separately for the panel.
    const payload = { id: user.id, name: user.name, email: user.email };
    if (typeof row.setDataValue === "function") {
      row.setDataValue("UserNotification", payload);
      row.setDataValue("resolved_recipient_id", user.id);
    } else {
      row.UserNotification = payload;
      row.resolved_recipient_id = user.id;
    }
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
    // Only surface notifications that have a real recipient. Device-level
    // alerts stored without one (`user_id IS NULL`, see createNotification in
    // notification.service.ts) have no `UserNotification` to render, so they
    // are excluded from the list and from `count`.
    where.user_id = { [Op.ne]: null };

    // General search parameter - searches device_id, imei (through device),
    // device_name (through device), title, createdAt and type.
    if (search && search !== "") {
      // is_read is stored as the ENUM strings "0"/"1" - never compare it to a
      // boolean (Postgres rejects `enum = boolean`), and use `=` rather than
      // ILIKE because ILIKE does not exist for enum types.
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

      /**
       * iLikeAny() is used for every column so the behaviour is uniform
       * and stays correct if a column's type ever changes. Only `title`,
       * `imei` and `device_name` are natively text, but casting them is a
       * no-op.
       *
       * Columns are fully qualified (alias.column) because several of
       * these live on the joined `DeviceNotification` table, and the same
       * query shape is also used by the dashboard controller.
       */
      where[Op.or] = [
        iLikeAny("Notification.device_id", search),
        iLikeAny("DeviceNotification.imei", search),
        iLikeAny("DeviceNotification.device_name", search),
        iLikeAny("Notification.title", search),
        iLikeAny("Notification.body", search),
        iLikeAny("Notification.type", search),
        createdAtCondition,
        isReadCondition,
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

    // Defensive: the `where` above already excludes `user_id IS NULL`, so this
    // is a no-op for the current query. It still guards the response shape if
    // the filter is ever relaxed, resolving a recipient for rows that reach it
    // with a NULL `user_id`.
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

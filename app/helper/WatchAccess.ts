import { Request } from "express";
import { Op } from "sequelize";
import db from "../models";

// ─── Watch (device) access for admin panel accounts ────────────
// Admins, and staff with all_watches = true, can access every watch —
// including watches created in the future, since nothing is stored per
// device for them. Other staff can only access watches listed in
// StaffDevices.

// Returns null when the caller is unrestricted, otherwise the list of
// device ids the caller may access (possibly empty).
export const getAccessibleDeviceIds = async (
  req: Request
): Promise<string[] | null> => {
  const user = (req as any).user;
  if (!user || user.role !== "staff" || user.all_watches) return null;

  // Cache per request — several controllers check more than once.
  if ((req as any).accessibleDeviceIds) return (req as any).accessibleDeviceIds;

  const rows = await db.StaffDevice.findAll({
    where: { staff_id: user.id },
    attributes: ["device_id"],
    raw: true,
  });
  const ids = rows.map((r: any) => r.device_id);
  (req as any).accessibleDeviceIds = ids;
  return ids;
};

// Sequelize condition restricting a device id column to accessible
// watches, or undefined when unrestricted. Usage:
//   const scope = await deviceIdScope(req);
//   if (scope) where.device_id = scope;
export const deviceIdScope = async (req: Request) => {
  const ids = await getAccessibleDeviceIds(req);
  return ids === null ? undefined : { [Op.in]: ids };
};

export const canAccessDevice = async (
  req: Request,
  deviceId: string | null | undefined
): Promise<boolean> => {
  const ids = await getAccessibleDeviceIds(req);
  if (ids === null) return true;
  return !!deviceId && ids.includes(deviceId);
};

export const canAccessAllDevices = async (
  req: Request,
  deviceIds: (string | null | undefined)[]
): Promise<boolean> => {
  const ids = await getAccessibleDeviceIds(req);
  if (ids === null) return true;
  return deviceIds.every((id) => !!id && ids.includes(id));
};

// Ids of users owning at least one accessible watch, or null when
// unrestricted.
export const getAccessibleUserIds = async (
  req: Request
): Promise<string[] | null> => {
  const ids = await getAccessibleDeviceIds(req);
  if (ids === null) return null;
  if (ids.length === 0) return [];

  // A watch can be shared across multiple users, so the set of users
  // who "use" these watches is the union of their DeviceMembers rows —
  // not just the (possibly stale) owner_id column.
  const members = await db.DeviceMember.findAll({
    where: { device_id: { [Op.in]: ids } },
    attributes: ["user_id"],
    raw: true,
  });
  return [...new Set<string>(members.map((m: any) => m.user_id))];
};

// ─── Device ↔ User membership (many-to-many via DeviceMembers) ──
// A watch can be shared with multiple users. The DeviceMembers join
// table is the single source of truth for "which users may use this
// watch". `owner_id` on Devices is retained purely as a denormalized
// primary-owner pointer (used by a handful of legacy queries).

export type MemberRole = "admin" | "member";

/**
 * Return every device id the given user is a member of.
 * This is the canonical "devices this user can see" query.
 */
export const getUserDeviceIds = async (userId: string): Promise<string[]> => {
  const rows = await db.DeviceMember.findAll({
    where: { user_id: userId },
    attributes: ["device_id"],
    raw: true,
  });
  return rows.map((r: any) => r.device_id);
};

/**
 * Ensure a user is a member of a device. Idempotent — never throws,
 * never duplicates (the DB has a unique constraint as a backstop).
 * The owner is always recorded as role "admin".
 */
export const ensureDeviceMember = async (
  deviceId: string,
  userId: string,
  role: MemberRole = "admin"
): Promise<void> => {
  try {
    await db.DeviceMember.findOrCreate({
      where: { device_id: deviceId, user_id: userId },
      defaults: { device_id: deviceId, user_id: userId, role },
    });
  } catch (err: any) {
    // Unique-constraint race: another request inserted the row first.
    // That's fine — the membership exists either way.
    if (
      err.name === "SequelizeUniqueConstraintError" ||
      err.parent?.code === "23505" ||
      err.original?.code === "23505"
    ) {
      return;
    }
    throw err;
  }
};

/**
 * Return the set of user ids that are members of the given devices.
 * Used to scope admin panels to "users who actually own/use these
 * watches" instead of relying solely on owner_id.
 */
export const getMemberUserIdsForDevices = async (
  deviceIds: string[]
): Promise<string[]> => {
  if (!deviceIds.length) return [];
  const rows = await db.DeviceMember.findAll({
    where: { device_id: { [Op.in]: deviceIds } },
    attributes: ["user_id"],
    raw: true,
  });
  return [...new Set<string>(rows.map((r: any) => r.user_id))];
};

const normalizeIp = (ip: string) => ip.trim().replace(/^::ffff:/, "");

// Client IP for audit logs. X-Forwarded-For is only honoured when the
// connection comes from a local reverse proxy (nginx etc.) — otherwise any
// client could forge it. The proxy appends the real peer address, so the
// last entry is the trustworthy one.
export const getClientIp = (req: Request): string | null => {
  const socketIp = req.socket?.remoteAddress
    ? normalizeIp(req.socket.remoteAddress)
    : null;

  const isLocalProxy = socketIp === "127.0.0.1" || socketIp === "::1";
  const header = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(header) ? header.join(",") : header;

  if (isLocalProxy && forwarded) {
    const entries = forwarded
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (entries.length) return normalizeIp(entries[entries.length - 1]);
  }

  return socketIp;
};

export const NO_WATCH_ACCESS_MESSAGE = "You do not have access to this watch";

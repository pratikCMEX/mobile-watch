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

  const devices = await db.Device.findAll({
    where: { id: { [Op.in]: ids }, owner_id: { [Op.ne]: null } },
    attributes: ["owner_id"],
    raw: true,
  });
  return [...new Set<string>(devices.map((d: any) => d.owner_id))];
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
    const entries = forwarded.split(",").map((e) => e.trim()).filter(Boolean);
    if (entries.length) return normalizeIp(entries[entries.length - 1]);
  }

  return socketIp;
};

export const NO_WATCH_ACCESS_MESSAGE = "You do not have access to this watch";

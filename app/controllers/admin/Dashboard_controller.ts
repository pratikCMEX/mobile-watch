import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { Op } from "sequelize";
import { errorMessage, successMessage } from "../../library/Response";
import { deviceIdScope, getAccessibleUserIds } from "../../helper/WatchAccess";

// Notification types surfaced on the dashboard alert list.
const DASHBOARD_ALERT_TYPES = ["sos", "fall_detection", "low_battery"];

async function getDashboardStats(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Staff only see watches assigned to them (and those watches' owners)
    const deviceScope = await deviceIdScope(req);
    const deviceWhere: any = deviceScope ? { id: deviceScope } : {};
    const userIds = await getAccessibleUserIds(req);
    const userWhere: any = userIds
      ? { id: { [db.Sequelize.Op.in]: userIds } }
      : {};

    // Get total user count
    const totalUsers = await db.User.count({ where: userWhere });

    // Get active users (users with non-empty session_token - currently logged in)
    const activeUsers = await db.User.count({
      where: {
        ...userWhere,
        session_token: {
          [db.Sequelize.Op.ne]: "",
        },
      },
    });

    // Get inactive users
    const inactiveUsers = totalUsers - activeUsers;

    // Get total device count
    const totalDevices = await db.Device.count({ where: deviceWhere });

    // Scope notifications by the same device list, but Notifications use
    // `device_id` (not `id`), so build the scope separately.
    const notificationDeviceScope = deviceScope
      ? { device_id: deviceScope }
      : {};
    const totalSosAlerts = await db.Notification.count({
      where: {
        ...notificationDeviceScope,
        type: "sos",
      },
    });

    // Get online devices count
    const onlineDevices = await db.Device.count({
      where: {
        ...deviceWhere,
        is_online: true,
      },
    });

    // Get offline devices count
    const offlineDevices = totalDevices - onlineDevices;

    // Get all devices with latest location and other info
    const devices = await db.Device.findAll({
      attributes: [
        "id",
        "imei",
        "device_name",
        "latest_lat",
        "latest_lng",
        "latest_location_at",
        "latest_location_is_valid",
        "connection_status",
        "battery_percentage",
        "is_online",
        "signal_status",
        "gps_strength",
        "last_updated_at",
      ],
      where: {
        ...deviceWhere,
        latest_lat: {
          [db.Sequelize.Op.ne]: null,
        },
        latest_lng: {
          [db.Sequelize.Op.ne]: null,
        },
      },
    });

    const dashboardData = {
      stats: {
        total_users: totalUsers,
        total_devices: totalDevices,
        total_sos_alerts: totalSosAlerts,
        // active_users: activeUsers,
        // inactive_users: inactiveUsers,
        online_devices: onlineDevices,
        offline_devices: offlineDevices,
      },
      devices: devices,
    };

    return successMessage(
      res,
      "Dashboard stats fetched successfully",
      dashboardData
    );
  } catch (err) {
    console.error("getDashboardStats error:", err);
    return errorMessage(res, "Error fetching dashboard stats");
  }
}

/**
 * POST /admin/dashboard_alerts
 *
 * List every SOS, fall-detection and low-battery notification across the
 * watches the caller may access — no pagination, no limit. Staff are
 * restricted to the watches assigned to them (and those watches' owners);
 * admins/staff with all_watches see everything.
 *
 * Optional request body:
 *   { "type": "sos" }              -> only SOS notifications
 *   { "type": ["sos", "fall_detection"] } -> only those
 *   {}                             -> all dashboard alert types
 */
async function getDashboardAlerts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const { type } = body;

    // A caller may request a single alert type (e.g. "sos") or none at
    // all (defaults to every dashboard alert type).
    const requestedTypes: string[] = Array.isArray(type)
      ? type
      : type
      ? [type]
      : DASHBOARD_ALERT_TYPES;

    const deviceScope = await deviceIdScope(req);

    const where: any = {
      type: { [Op.in]: requestedTypes },
    };
    if (deviceScope) {
      where.device_id = deviceScope;
    }

    const alerts = await db.Notification.findAll({
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
    });

    return successMessage(res, "Dashboard alerts fetched successfully", {
      total: alerts.length,
      alerts,
    });
  } catch (err) {
    console.error("getDashboardAlerts error:", err);
    return errorMessage(res, "Error fetching dashboard alerts");
  }
}

export default {
  getDashboardStats,
  getDashboardAlerts,
};

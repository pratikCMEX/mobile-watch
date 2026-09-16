import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
} from "../../library/Response";
import {
  deviceIdScope,
  getAccessibleUserIds,
} from "../../helper/WatchAccess";

async function getDashboardStats(req: Request, res: Response, next: NextFunction) {
  try {
    // Staff only see watches assigned to them (and those watches' owners)
    const deviceScope = await deviceIdScope(req);
    const deviceWhere: any = deviceScope ? { id: deviceScope } : {};
    const userIds = await getAccessibleUserIds(req);
    const userWhere: any = userIds ? { id: { [db.Sequelize.Op.in]: userIds } } : {};

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
        // active_users: activeUsers,
        // inactive_users: inactiveUsers,
        online_devices: onlineDevices,
        offline_devices: offlineDevices,
      },
      devices: devices,
    };

    return successMessage(res, "Dashboard stats fetched successfully", dashboardData);
  } catch (err) {
    console.error("getDashboardStats error:", err);
    return errorMessage(res, "Error fetching dashboard stats");
  }
}

export default {
  getDashboardStats,
};

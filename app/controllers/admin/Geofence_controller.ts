import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";
import { canAccessDevice, deviceIdScope } from "../../helper/WatchAccess";

const listGeofences = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      is_active = "",
    } = req.body;

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = {};

    if (search) {
      // Check if search matches an IMEI or device_name first
      try {
        const devices = await db.Device.findAll({
          where: {
            [Op.or]: [
              { imei: { [Op.iLike]: `%${search}%` } },
              { device_name: { [Op.iLike]: `%${search}%` } },
            ],
          },
          attributes: ["id"],
        });

        const orConditions: any[] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { radius_meters: { [Op.iLike]: `%${search}%` } },
        ];

        for (const device of devices) {
          const hasAccess = await canAccessDevice(req, device.id);
          if (hasAccess) {
            orConditions.push({ device_id: device.id });
          }
        }

        if (orConditions.length > 0) {
          whereCondition[Op.or] = orConditions;
        }
      } catch (err) {
        console.error("Error during IMEI/device_name search:", err);
        // If error occurs, just search by name
        whereCondition.name = { [Op.iLike]: `%${search}%` };
        whereCondition.radius_meters = { [Op.iLike]: `%${search}%` };
      }
    }

    const scope = await deviceIdScope(req);
    if (scope) whereCondition.device_id = scope;

    if (is_active !== "") {
      whereCondition.is_active = is_active;
    }

    const { count, rows } = await db.Geofence.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id",
        "device_id",
        "name",
        "latitude",
        "longitude",
        "radius_meters",
        "is_active",
        "fence_type",
        "fence_alarm_type",
        "createdAt",
      ],
      include: [
        {
          model: db.Device,
          as: "DeviceGeofence",
          attributes: ["id", "imei", "device_name"],
        },
      ],
      order: [["createdAt", sorting]],
      limit: Number(limit),
      offset,
    });

    return successPagination(res, "Geofences fetched successfully", rows, {
      page,
      limit,
      total: count,
    });
  } catch (error) {
    console.error("listGeofences error:", error);
    return errorMessage(res, "Error fetching geofences");
  }
};

const deleteGeofence = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.body;

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence || !(await canAccessDevice(req, geofence.device_id))) {
      return errorMessage(res, "Geofence not found", 404);
    }

    await geofence.destroy(); // hard delete — no deletedAt column on this table

    return successMessage(res, "Geofence deleted successfully", null);
  } catch (err) {
    console.error("deleteGeofence error:", err);
    return errorMessage(res, "Error deleting geofence");
  }
};

const toggleGeofenceStatus = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { is_active, id } = req.body;

    if (is_active === undefined) {
      return errorMessage(res, "is_active is required");
    }

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence || !(await canAccessDevice(req, geofence.device_id))) {
      return errorMessage(res, "Geofence not found", 404);
    }

    geofence.is_active = is_active;
    await geofence.save();

    return successMessage(
      res,
      "Geofence status updated successfully",
      geofence
    );
  } catch (err) {
    console.error("toggleGeofenceStatus error:", err);
    return errorMessage(res, "Error updating geofence status");
  }
};

const createGeofence = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      imei,
      name,
      latitude,
      longitude,
      radius_meters,
      is_active = true,
      fence_type,
      fence_alarm_type = 0,
    } = req.body;

    if (!imei) {
      return errorMessage(res, "IMEI is required");
    }

    const device = await db.Device.findOne({ where: { imei } });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "Device not found with this IMEI");
    }

    if (!latitude || !longitude || !radius_meters) {
      return errorMessage(
        res,
        "latitude, longitude, and radius_meters are required"
      );
    }

    const geofence = await db.Geofence.create({
      device_id: device.id,
      name,
      latitude,
      longitude,
      radius_meters,
      is_active,
      fence_type,
      fence_alarm_type,
    });

    return successMessage(res, "Geofence created successfully", geofence);
  } catch (err) {
    console.error("createGeofence error:", err);
    return errorMessage(res, "Error creating geofence");
  }
};

const updateGeofence = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      id,
      name,
      latitude,
      longitude,
      radius_meters,
      is_active,
      fence_type,
      fence_alarm_type,
    } = req.body;

    if (!id) {
      return errorMessage(res, "Geofence ID is required");
    }

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence || !(await canAccessDevice(req, geofence.device_id))) {
      return errorMessage(res, "Geofence not found", 404);
    }

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (radius_meters !== undefined) updateData.radius_meters = radius_meters;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (fence_type !== undefined) updateData.fence_type = fence_type;
    if (fence_alarm_type !== undefined)
      updateData.fence_alarm_type = fence_alarm_type;

    await geofence.update(updateData);

    return successMessage(res, "Geofence updated successfully", geofence);
  } catch (err) {
    console.error("updateGeofence error:", err);
    return errorMessage(res, "Error updating geofence");
  }
};

export default {
  listGeofences,
  deleteGeofence,
  toggleGeofenceStatus,
  createGeofence,
  updateGeofence,
};

import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import { Op } from "sequelize";

const saveGeofence = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, device_id, name, latitude, longitude, radius_meters } =
      req.body;
    if (id || id !== "") {
      const geofence = await db.Geofence.findByPk(id);
      if (!geofence) {
        return errorMessage(res, "Geofence not found", 404);
      }

      if (device_id && device_id !== geofence.device_id) {
        const device = await db.Device.findByPk(device_id);
        if (!device) {
          return errorMessage(
            res,
            "device_id does not match any existing device"
          );
        }
        geofence.device_id = device_id;
      }

      if (name !== undefined) geofence.name = name;
      if (latitude !== undefined) geofence.latitude = latitude;
      if (longitude !== undefined) geofence.longitude = longitude;
      if (radius_meters !== undefined) geofence.radius_meters = radius_meters;

      await geofence.save();

      return successMessage(res, "Geofence updated successfully", geofence);
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_id does not match any existing device");
    }

    const geofence = await db.Geofence.create({
      device_id,
      name,
      latitude,
      longitude,
      radius_meters,
      is_active: true,
    });

    return successMessage(res, "Geofence created successfully", geofence);
  } catch (err) {
    console.error("saveGeofence error:", err);
    return errorMessage(res, "Error saving geofence");
  }
};

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
      device_id = "",
      // is_active = "",
    } = req.body;

    if (device_id === "") {
      return errorMessage(res, "device_id is required");
    }

    const offset = (Number(page) - 1) * Number(limit);

    const whereCondition: any = { device_id };

    if (search) {
      whereCondition.name = { [Op.iLike]: `%${search}%` };
    }

    // if (is_active !== "") {
    //   whereCondition.is_active = is_active;
    // }

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
        "createdAt",
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
    const { id } = req.params;

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence) {
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
    if (!geofence) {
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

export default {
  saveGeofence,
  listGeofences,
  deleteGeofence,
  toggleGeofenceStatus,
};

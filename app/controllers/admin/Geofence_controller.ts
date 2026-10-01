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
      // Check if search looks like a UUID (device_id) - exact match
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // Get accessible device IDs for access control
      const accessibleScope = await deviceIdScope(req);
      let accessibleDeviceIds: string[] | null = null;
      if (accessibleScope && accessibleScope[Op.in]) {
        accessibleDeviceIds = accessibleScope[Op.in];
      }

      // Build OR conditions for geofence fields (always searched)
      const orConditions: any[] = [
        { name: { [Op.iLike]: `%${search}%` } },
        db.sequelize.where(db.sequelize.literal(`"radius_meters"::text`), {
          [Op.iLike]: `%${search}%`,
        }),
      ];

      // Add device search as an OR condition via subquery on device_id
      if (accessibleDeviceIds === null) {
        // Admin/all_watches: search all devices
        orConditions.push({
          device_id: {
            [Op.in]: db.sequelize.literal(`
              (SELECT id FROM "Devices"
               WHERE (imei ILIKE '%${search}%' OR device_name ILIKE '%${search}%'${
              uuidRegex.test(search) ? ` OR id = '${search}'` : ""
            }))
            `),
          },
        });
      } else if (accessibleDeviceIds.length > 0) {
        // Regular staff: search only their accessible devices
        orConditions.push({
          device_id: {
            [Op.in]: db.sequelize.literal(`
              (SELECT id FROM "Devices"
               WHERE id IN ('${accessibleDeviceIds.join("','")}')
               AND (imei ILIKE '%${search}%' OR device_name ILIKE '%${search}%'${
              uuidRegex.test(search) ? ` OR id = '${search}'` : ""
            }))
            `),
          },
        });
      }
      // If accessibleDeviceIds is empty array, no device search added (staff has no devices)

      if (orConditions.length > 0) {
        whereCondition[Op.or] = orConditions;
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

    return successPagination(res, "geofences_fetched_successfully", rows, {
      page,
      limit,
      total: count,
    });
  } catch (error) {
    console.error("listGeofences error:", error);
    return errorMessage(res, "error_fetching_geofences");
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
      return errorMessage(res, "geofence_not_found", 404);
    }

    await geofence.destroy(); // hard delete — no deletedAt column on this table

    return successMessage(res, "geofence_deleted_successfully", null);
  } catch (err) {
    console.error("deleteGeofence error:", err);
    return errorMessage(res, "error_deleting_geofence");
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
      return errorMessage(res, "is_active_is_required");
    }

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence || !(await canAccessDevice(req, geofence.device_id))) {
      return errorMessage(res, "geofence_not_found", 404);
    }

    geofence.is_active = is_active;
    await geofence.save();

    return successMessage(
      res,
      "geofence_status_updated_successfully",
      geofence
    );
  } catch (err) {
    console.error("toggleGeofenceStatus error:", err);
    return errorMessage(res, "error_updating_geofence_status");
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
      return errorMessage(res, "imei_is_required");
    }

    const device = await db.Device.findOne({ where: { imei } });
    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found_with_this_imei");
    }

    if (!latitude || !longitude || !radius_meters) {
      return errorMessage(
        res,
        "latitude_longitude_and_radius_meters_are_required"
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

    return successMessage(res, "geofence_created_successfully", geofence);
  } catch (err) {
    console.error("createGeofence error:", err);
    return errorMessage(res, "error_creating_geofence");
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
      return errorMessage(res, "geofence_id_is_required");
    }

    const geofence = await db.Geofence.findByPk(id);
    if (!geofence || !(await canAccessDevice(req, geofence.device_id))) {
      return errorMessage(res, "geofence_not_found", 404);
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

    return successMessage(res, "geofence_updated_successfully", geofence);
  } catch (err) {
    console.error("updateGeofence error:", err);
    return errorMessage(res, "error_updating_geofence");
  }
};

export default {
  listGeofences,
  deleteGeofence,
  toggleGeofenceStatus,
  createGeofence,
  updateGeofence,
};

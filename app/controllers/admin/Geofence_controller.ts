import { NextFunction, Request, Response } from "express";
import db from "../../models";
import {
    errorMessage,
    successMessage,
    successPagination,
} from "../../library/Response";
import { Op } from "sequelize";



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
            // device_id = "",
            // is_active = "",
        } = req.body;



        const offset = (Number(page) - 1) * Number(limit);

        const whereCondition: any = {};

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
        if (!device) {
            return errorMessage(res, "Device not found with this IMEI");
        }

        if (!latitude || !longitude || !radius_meters) {
            return errorMessage(res, "latitude, longitude, and radius_meters are required");
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

export default {

    listGeofences,
    deleteGeofence,
    toggleGeofenceStatus,
    createGeofence,
};

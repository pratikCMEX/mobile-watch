import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { Op } from "sequelize";

// Get all health metrics (admin view) - also supports search by IMEI
async function getAllHealthMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body || {};
    const { page = 1, limit = 10, imei } = body;
    const offset = (Number(page) - 1) * Number(limit);

    // If IMEI is provided, search by device
    if (imei) {
      const device = await db.Device.findOne({
        where: { imei },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      const metrics = await db.HealthMetric.findAll({
        where: { device_id: device.id },
        include: [
          {
            model: db.Device,
            as: "DeviceHealthMetric",
            attributes: ["id", "imei", "device_name"],
          },
        ],
        order: [["recorded_at", "DESC"]],
      });

      return successMessage(res, "Health metrics retrieved successfully", {
        device: {
          id: device.id,
          imei: device.imei,
          device_name: device.device_name,
        },
        metrics,
      });
    }

    // Otherwise, return all health metrics with pagination
    const { count, rows } = await db.HealthMetric.findAndCountAll({
      include: [
        {
          model: db.Device,
          as: "DeviceHealthMetric",
          attributes: ["id", "imei", "device_name"],
          required: false,
        },
      ],
      order: [["recorded_at", "DESC"]],
      limit: Number(limit),
      offset,
    });

    return successMessage(res, "Health metrics retrieved successfully", {
      metrics: rows,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (err) {
    console.error("getAllHealthMetrics error:", err);
    return errorMessage(res, "Error retrieving health metrics");
  }
}

// Delete health metric by ID
async function deleteHealthMetric(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    if (!id) {
      return errorMessage(res, "Health metric ID is required");
    }

    const healthMetric = await db.HealthMetric.findOne({ where: { id } });
    if (!healthMetric) {
      return errorMessage(res, "Health metric not found");
    }

    await db.HealthMetric.destroy({ where: { id } });

    return successMessage(res, "Health metric deleted successfully");
  } catch (err) {
    console.error("deleteHealthMetric error:", err);
    return errorMessage(res, "Error deleting health metric");
  }
}

// Delete multiple health metrics by IDs
async function deleteMultipleHealthMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorMessage(res, "Health metric IDs array is required");
    }

    const healthMetrics = await db.HealthMetric.findAll({
      where: { id: { [Op.in]: ids } },
    });

    if (healthMetrics.length === 0) {
      return errorMessage(res, "No health metrics found with the provided IDs");
    }

    await db.HealthMetric.destroy({ where: { id: { [Op.in]: ids } } });

    return successMessage(res, `${healthMetrics.length} health metrics deleted successfully`);
  } catch (err) {
    console.error("deleteMultipleHealthMetrics error:", err);
    return errorMessage(res, "Error deleting health metrics");
  }
}

export default {
  getAllHealthMetrics,
  deleteHealthMetric,
  deleteMultipleHealthMetrics,
};

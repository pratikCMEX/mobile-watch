import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { Op, QueryTypes } from "sequelize";
import {
  canAccessAllDevices,
  canAccessDevice,
  deviceIdScope,
} from "../../helper/WatchAccess";

// Metric types whose latest stored value is a cumulative counter that
// must be read directly (the "last record") rather than differenced.
const LATEST_METRIC_TYPES = ["steps_cumulative", "sleep"];

// Get all health metrics (admin view) - also supports search by IMEI and ID
async function getAllHealthMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const { page = 1, limit = 10, imei, id, device_id, search } = body;
    const offset = (Number(page) - 1) * Number(limit);

    // If ID is provided, search by ID
    if (id) {
      const metric = await db.HealthMetric.findOne({
        where: { id: id as string },
        attributes: [
          "id",
          "device_id",
          "metric_type",
          "value_primary",
          "value_secondary",
          "unit",
          "recorded_at",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            model: db.Device,
            as: "DeviceHealthMetric",
            attributes: ["id", "imei", "device_name"],
          },
        ],
      });

      if (!metric || !(await canAccessDevice(req, metric.device_id))) {
        return errorMessage(res, "Health metric not found");
      }

      return successMessage(
        res,
        "Health metric retrieved successfully",
        metric
      );
    }

    // If IMEI is provided, search by device
    if (imei && imei !== "") {
      const device = await db.Device.findOne({
        where: { imei: imei as string },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      const metrics = await db.HealthMetric.findAll({
        where: { device_id: device.id },
        attributes: [
          "id",
          "device_id",
          "metric_type",
          "value_primary",
          "value_secondary",
          "unit",
          "recorded_at",
          "createdAt",
          "updatedAt",
        ],
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
    // If search parameter is provided, search by imei, device_id, and metric_type
    const listWhere: any = {};
    const scope = await deviceIdScope(req);
    if (scope) listWhere.device_id = scope;

    // If device_id is provided, add to filter with access control
    if (device_id && device_id !== "") {
      const device = await db.Device.findOne({
        where: { id: device_id as string },
        attributes: ["id"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this device_id");
      }

      listWhere.device_id = device.id;
    }

    if (body.search && body.search !== "") {
      const search = body.search;
      // Check if search matches an IMEI, device_name, or device_id first
      try {
        const deviceWhere: any = {
          [Op.or]: [
            { imei: { [Op.like]: `%${search}%` } },
            { device_name: { [Op.like]: `%${search}%` } },
          ],
        };

        // Check if search looks like a UUID (device_id) - exact match
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(search)) {
          deviceWhere[Op.or].push({ id: search });
        }

        const devices = await db.Device.findAll({
          where: deviceWhere,
          attributes: ["id"],
        });

        const orConditions: any[] = [];

        for (const device of devices) {
          const hasAccess = await canAccessDevice(req, device.id);
          if (hasAccess) {
            orConditions.push({ device_id: device.id });
          }
        }

        if (orConditions.length > 0) {
          listWhere[Op.or] = orConditions;
        }
      } catch (err) {
        console.error("Error during IMEI/device_name/device_id search:", err);
      }
    }

    const { count, rows } = await db.HealthMetric.findAndCountAll({
      where: listWhere,
      attributes: [
        "id",
        "device_id",
        "metric_type",
        "value_primary",
        "value_secondary",
        "unit",
        "recorded_at",
        "createdAt",
        "updatedAt",
      ],
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

// Get health metrics graph data with time period filter or specific date
async function getHealthMetricsGraph(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const { imei, period = "daily", date, metric_type } = body;

    const where: any = {};

    // If metric_type is provided and not empty/null, filter by metric_type.
    // If metric_type is null or empty string, return all metric types.
    if (metric_type && metric_type !== "" && metric_type !== null) {
      where.metric_type = metric_type;
    }

    // Apply date filter if provided (specific date)
    if (date && date !== "") {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      where.recorded_at = { [Op.between]: [startOfDay, endOfDay] };
    } else if (period && period !== "") {
      // Otherwise, apply time period filter if period is provided
      const now = new Date();
      if (period === "daily") {
        where.recorded_at = { [Op.gte]: new Date(now.setHours(0, 0, 0, 0)) };
      } else if (period === "weekly") {
        const weekAgo = new Date(now.setDate(now.getDate() - 7));
        where.recorded_at = { [Op.gte]: weekAgo };
      } else if (period === "monthly") {
        const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
        where.recorded_at = { [Op.gte]: monthAgo };
      }
    }
    // If no date or period is provided, show all data (no time filter) by device
    if (imei && imei !== "") {
      const device = await db.Device.findOne({
        where: { imei: imei as string },
        attributes: ["id", "imei", "device_name"],
      });

      if (!device || !(await canAccessDevice(req, device.id))) {
        return errorMessage(res, "Device not found with this IMEI");
      }

      where.device_id = device.id;

      const metrics = await db.HealthMetric.findAll({
        where,
        include: [
          {
            model: db.Device,
            as: "DeviceHealthMetric",
            attributes: ["id", "imei", "device_name"],
          },
        ],
        order: [["recorded_at", "ASC"]],
      });

      const graphData = metrics.map((m: any) => ({
        id: m.id,
        device_id: m.device_id,
        metric_type: m.metric_type,
        value_primary: m.value_primary,
        value_secondary: m.value_secondary,
        unit: m.unit,
        recorded_at: m.recorded_at,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      return successMessage(
        res,
        "Health metrics graph data retrieved successfully",
        {
          device: {
            id: device.id,
            imei: device.imei,
            device_name: device.device_name,
          },
          graph_data: graphData,
          period,
        }
      );
    }

    // Otherwise, get all devices' graph data for the period
    const scope = await deviceIdScope(req);
    if (scope) where.device_id = scope;

    const metrics = await db.HealthMetric.findAll({
      where,
      include: [
        {
          model: db.Device,
          as: "DeviceHealthMetric",
          attributes: ["id", "imei", "device_name"],
          required: false,
        },
      ],
      order: [["recorded_at", "ASC"]],
    });

    const graphData = metrics.map((m: any) => ({
      id: m.id,
      device_id: m.device_id,
      imei: m.DeviceHealthMetric?.imei,
      device_name: m.DeviceHealthMetric?.device_name,
      metric_type: m.metric_type,
      value_primary: m.value_primary,
      value_secondary: m.value_secondary,
      unit: m.unit,
      recorded_at: m.recorded_at,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));

    return successMessage(
      res,
      "Health metrics graph data retrieved successfully",
      {
        graph_data: graphData,
        period,
      }
    );
  } catch (err) {
    console.error("getHealthMetricsGraph error:", err);
    return errorMessage(res, "Error retrieving health metrics graph data");
  }
}

// Delete health metric by ID
async function deleteHealthMetric(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.body;

    if (!id) {
      return errorMessage(res, "Health metric ID is required");
    }

    const healthMetric = await db.HealthMetric.findOne({ where: { id } });
    if (
      !healthMetric ||
      !(await canAccessDevice(req, healthMetric.device_id))
    ) {
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
async function deleteMultipleHealthMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
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

    if (
      !(await canAccessAllDevices(
        req,
        healthMetrics.map((m: any) => m.device_id)
      ))
    ) {
      return errorMessage(
        res,
        "You do not have access to one or more of these health metrics"
      );
    }

    await db.HealthMetric.destroy({ where: { id: { [Op.in]: ids } } });

    return successMessage(
      res,
      `${healthMetrics.length} health metrics deleted successfully`
    );
  } catch (err) {
    console.error("deleteMultipleHealthMetrics error:", err);
    return errorMessage(res, "Error deleting health metrics");
  }
}

/**
 * POST /admin/get_latest_health_metrics
 *
 * Return the single most recent HealthMetric row per device for the
 * cumulative metrics (steps_cumulative / sleep). Reading the "last
 * record" directly is what gives the true current value — differencing
 * it against the previous day would only produce a daily delta.
 *
 * Staff are restricted to the watches assigned to them (and those
 * watches' owners); admins/staff with all_watches see everything.
 */
async function getLatestHealthMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const { metric_type } = body;

    const types: string[] = Array.isArray(metric_type)
      ? metric_type
      : metric_type
      ? [metric_type]
      : LATEST_METRIC_TYPES;

    const deviceScope = await deviceIdScope(req);

    const where: any = {
      metric_type: { [Op.in]: types },
    };
    if (deviceScope) {
      where.device_id = deviceScope;
    }

    // One row per device = the latest recorded_at for that device.
    const latest: any[] = await db.sequelize.query(
      `
      SELECT l.*
      FROM "HealthMetrics" l
      INNER JOIN (
        SELECT device_id, MAX(recorded_at) AS max_recorded
        FROM "HealthMetrics"
        WHERE metric_type IN (:types)
          ${deviceScope ? "AND device_id IN (:deviceScope)" : ""}
        GROUP BY device_id
      ) m
        ON l.device_id = m.device_id AND l.recorded_at = m.max_recorded
      ORDER BY l.device_id ASC
      `,
      {
        replacements: { types, deviceScope },
        type: QueryTypes.SELECT,
      }
    );

    const deviceIds = latest.map((r: any) => r.device_id).filter(Boolean);
    const devices = deviceIds.length
      ? await db.Device.findAll({
          where: { id: { [Op.in]: deviceIds } },
          attributes: [
            "id",
            "imei",
            "device_name",
            "connection_status",
            "is_online",
            "battery_percentage",
          ],
        })
      : [];
    const deviceMap = new Map<string, any>(devices.map((d: any) => [d.id, d]));

    const rows = latest.map((r: any) => {
      const device: any = deviceMap.get(r.device_id) ?? null;
      return {
        id: r.id,
        device_id: r.device_id,
        imei: device?.imei ?? null,
        device_name: device?.device_name ?? null,
        connection_status: device?.connection_status ?? null,
        is_online: device?.is_online ?? null,
        battery_percentage: device?.battery_percentage ?? null,
        metric_type: r.metric_type,
        value_primary: r.value_primary,
        value_secondary: r.value_secondary,
        unit: r.unit,
        recorded_at: r.recorded_at,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    return successMessage(res, "Latest health metrics fetched successfully", {
      total: rows.length,
      metrics: rows,
    });
  } catch (err) {
    console.error("getLatestHealthMetrics error:", err);
    return errorMessage(res, "Error fetching latest health metrics");
  }
}

export default {
  getAllHealthMetrics,
  getHealthMetricsGraph,
  getLatestHealthMetrics,
  deleteHealthMetric,
  deleteMultipleHealthMetrics,
};

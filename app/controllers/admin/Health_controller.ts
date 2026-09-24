import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { Op } from "sequelize";
import {
  canAccessAllDevices,
  canAccessDevice,
  deviceIdScope,
} from "../../helper/WatchAccess";

// Cumulative metric types whose stored value is a running counter. For
// these, the listing applies the same baseline + daily-delta logic that
// getAnalytics uses, so each row shows the latest computed value rather
// than the raw cumulative counter.
const CUMULATIVE_METRIC_TYPES = ["steps_cumulative", "sleep"];

/**
 * Apply the same baseline + daily-delta differencing that getAnalytics
 * uses for cumulative metrics (steps_cumulative / sleep). The stored
 * value_primary is a running counter; each row is rewritten so that:
 *   - value_primary = today's counter - previous day's counter
 *                     (first row shows its value as-is, baseline 0,
 *                      clamped to >= 0)
 *   - total          = the running counter total for that row
 *
 * Rows are grouped by (device_id, metric_type) and ordered by
 * recorded_at ASC so the delta is computed against the immediately
 * preceding reading.
 */
async function applyCumulativeDeltas(rows: any[]): Promise<any[]> {
  const grouped = new Map<string, any[]>();
  for (const r of rows) {
    // Convert Sequelize instance -> plain object first, to avoid
    // spreading internal Sequelize properties (options/include/parent
    // refs) that create circular structures when JSON.stringify'd.
    const plain = typeof r.get === "function" ? r.get({ plain: true }) : r;
    const key = `${plain.device_id}::${plain.metric_type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(plain);
  }

  const result: any[] = [];
  for (const [, group] of grouped) {
    group.sort(
      (a: any, b: any) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    );

    let prevTotal: number | null = null;
    for (const r of group) {
      const cumulative = Number(r.value_primary);
      const delta = prevTotal !== null ? cumulative - prevTotal : cumulative;
      prevTotal = cumulative;
      result.push({
        ...r,
        value_primary: delta < 0 ? 0 : delta,
        total: cumulative,
      });
    }
  }

  // Preserve the original DESC order returned by the query.
  const order = new Map(rows.map((r: any, i: number) => [r.id, i]));
  result.sort(
    (a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
  return result;
}
// Get all health metrics (admin view) - also supports search by IMEI and ID
async function getAllHealthMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = req.body || {};
    const {
      page = 1,
      limit = 10,
      imei,
      id,
      device_id,
      search,
      metric_type,
    } = body;
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

      // Plain object — Sequelize instances carry the DeviceHealthMetric
      // association (parent/include refs) which break JSON.stringify.
      const plainMetric =
        typeof metric.get === "function" ? metric.get({ plain: true }) : metric;

      return successMessage(
        res,
        "Health metric retrieved successfully",
        plainMetric
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

      // Plain objects — Sequelize instances carry the DeviceHealthMetric
      // association (parent/include refs) which break JSON.stringify.
      const plainMetrics = metrics.map((r: any) =>
        typeof r.get === "function" ? r.get({ plain: true }) : r
      );

      return successMessage(res, "Health metrics retrieved successfully", {
        device: {
          id: device.id,
          imei: device.imei,
          device_name: device.device_name,
        },
        metrics: plainMetrics,
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

    // Filter by metric_type (single value or array). The stored enum
    // values are e.g. "heart_rate", "sleep", "steps_cumulative".
    if (metric_type) {
      const types: string[] = Array.isArray(metric_type)
        ? metric_type
        : [metric_type];
      listWhere.metric_type = { [Op.in]: types };
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

    // Cumulative metrics (steps_cumulative / sleep) store a running
    // counter. Apply the same baseline + daily-delta logic that
    // getAnalytics uses so each listed row shows the computed value
    // (today - yesterday) and a running total, instead of the raw
    // cumulative counter.
    const requestedTypes: string[] = Array.isArray(metric_type)
      ? metric_type
      : metric_type
      ? [metric_type]
      : [];
    const isCumulative =
      requestedTypes.length === 0 ||
      requestedTypes.some((t) => CUMULATIVE_METRIC_TYPES.includes(t));

    let metrics: any[];
    if (isCumulative && rows.length) {
      metrics = await applyCumulativeDeltas(rows);
    } else {
      // Plain objects only — Sequelize instances carry the
      // DeviceHealthMetric association (parent/include refs) which
      // would throw "Converting circular structure to JSON".
      metrics = rows.map((r: any) =>
        typeof r.get === "function" ? r.get({ plain: true }) : r
      );
    }

    return successMessage(res, "Health metrics retrieved successfully", {
      metrics,
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

export default {
  getAllHealthMetrics,
  getHealthMetricsGraph,
  deleteHealthMetric,
  deleteMultipleHealthMetrics,
};

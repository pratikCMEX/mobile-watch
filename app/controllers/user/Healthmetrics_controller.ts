import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { QueryTypes, Op } from "sequelize";
import HealthMetricService from "../../services/HealthMetricService";

const AddMetrics = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { device_id, metric_type, value_primary, value_secondary, unit } =
      req.body;
    if (
      !device_id ||
      !metric_type ||
      !value_primary ||
      !value_secondary ||
      !unit
    ) {
      return errorMessage(
        res,
        "device_id,metric_type,value_primary,value_secondary and unit are required"
      );
    }

    // Use service layer for heart_rate, fallback to direct create for others
    if (metric_type === "heart_rate") {
      const result = await HealthMetricService.saveHeartRate({
        device_id,
        bpm: Number(value_primary),
        unit,
      });

      if (!result.success) {
        return errorMessage(res, result.error || "Failed to save heart rate");
      }

      return successMessage(
        res,
        "Healthmetric added successfully",
        result.data
      );
    }

    const healthmetric = await db.HealthMetric.create({
      device_id: device_id,
      metric_type: metric_type,
      value_primary: value_primary,
      value_secondary: value_secondary,
      unit: unit,
      recorded_at: new Date(),
    });
    return successMessage(res, "Healthmetric added successfully", healthmetric);
  } catch (err) {
    return errorMessage(res, "Error adding healthmetric");
  }
};

const METRIC_TYPES = [
  "heart_rate",
  "blood_pressure",
  "sleep",
  "spo2",
  "calories",
  "temperature",
  "distance",
  "steps_daily",
  "steps_cumulative",
];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday, matches the S M T W T F S strip
  x.setDate(x.getDate() - day);
  return x;
}
function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  return endOfDay(x);
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// POST /health/analytics
// body: { device_id, metric_type, range: "daily"|"weekly"|"monthly", date? }
const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id, metric_type, range = "daily", date } = req.body;

    if (!device_id || !metric_type) {
      return errorMessage(res, "device_id and metric_type are required");
    }
    if (!METRIC_TYPES.includes(metric_type)) {
      return errorMessage(
        res,
        `metric_type must be one of: ${METRIC_TYPES.join(", ")}`
      );
    }
    if (!["daily", "weekly", "monthly"].includes(range)) {
      return errorMessage(res, "range must be one of: daily, weekly, monthly");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "device_id does not match any existing device");
    }

    const targetDate = date ? new Date(date) : new Date();

    let start: Date;
    let end: Date;
    let truncUnit: "hour" | "day" | "week";

    if (range === "daily") {
      start = startOfDay(targetDate);
      end = endOfDay(targetDate);
      truncUnit = "hour"; // 9AM, 10AM, 11AM... buckets, matching the Daily chart
    } else if (range === "weekly") {
      start = startOfWeek(targetDate);
      end = endOfWeek(targetDate);
      truncUnit = "day"; // one point per day, matching the S M T W T F S strip
    } else {
      start = startOfMonth(targetDate);
      end = endOfMonth(targetDate);
      truncUnit = "week"; // one point per week across the month
    }

    // Bucketed chart points (avg per bucket)
    const chartRows: any[] = await db.sequelize.query(
      `
      SELECT date_trunc(:truncUnit, recorded_at) AS bucket,
             AVG(value_primary) AS avg_primary,
             AVG(value_secondary) AS avg_secondary
      FROM "HealthMetrics"
      WHERE device_id = :device_id
        AND metric_type = :metric_type
        AND recorded_at BETWEEN :start AND :end
      GROUP BY bucket
      ORDER BY bucket ASC
      `,
      {
        replacements: { truncUnit, device_id, metric_type, start, end },
        type: QueryTypes.SELECT,
      }
    );

    console.log(
      "device_id:",
      device_id,
      "metric_type:",
      metric_type,
      "start:",
      start,
      "end:",
      end
    );

    // Raw readings in-window, for low/normal/max summary cards
    const readings = await db.HealthMetric.findAll({
      where: {
        device_id,
        metric_type,
        createdAt: { [Op.between]: [start, end] },
      },
      attributes: ["value_primary", "value_secondary", "unit", "recorded_at"],
      order: [["value_primary", "ASC"]],
    });

    let summary = {
      low: null as any,
      normal: null as any,
      max: null as any,
      unit: null as string | null,
    };

    if (readings.length) {
      const lowest = readings[0];
      const highest = readings[readings.length - 1];
      const avgPrimary =
        readings.reduce(
          (sum: number, r: any) => sum + Number(r.value_primary),
          0
        ) / readings.length;
      const secondaryReadings = readings.filter(
        (r: any) => r.value_secondary !== null
      );
      const avgSecondary = secondaryReadings.length
        ? secondaryReadings.reduce(
            (sum: number, r: any) => sum + Number(r.value_secondary),
            0
          ) / secondaryReadings.length
        : null;

      summary = {
        low: {
          primary: Number(lowest.value_primary),
          secondary:
            lowest.value_secondary !== null
              ? Number(lowest.value_secondary)
              : null,
        },
        normal: {
          primary: Math.round(avgPrimary * 100) / 100,
          secondary:
            avgSecondary !== null ? Math.round(avgSecondary * 100) / 100 : null,
        },
        max: {
          primary: Number(highest.value_primary),
          secondary:
            highest.value_secondary !== null
              ? Number(highest.value_secondary)
              : null,
        },
        unit: readings[0].unit,
      };
    }

    // Last synced — most recent reading ever recorded, not limited to the window
    const latest = await db.HealthMetric.findOne({
      where: { device_id, metric_type },
      order: [["recorded_at", "DESC"]],
    });

    return successMessage(res, "Analytics fetched successfully", {
      range,
      chart: chartRows.map((r) => ({
        bucket: r.bucket,
        value_primary:
          r.avg_primary !== null
            ? Math.round(Number(r.avg_primary) * 100) / 100
            : null,
        value_secondary:
          r.avg_secondary !== null
            ? Math.round(Number(r.avg_secondary) * 100) / 100
            : null,
      })),
      summary,
      last_synced: latest?.recorded_at ?? null,
    });
  } catch (err) {
    console.error("getAnalytics error:", err);
    return errorMessage(res, "Error fetching analytics");
  }
};

export default { AddMetrics, getAnalytics };

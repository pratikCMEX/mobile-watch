import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { QueryTypes, Op } from "sequelize";
import HealthMetricService from "../../services/HealthMetricService";
import { checkStepTarget } from "../../services/notification.service";
import {
  sendProcessing,
  sendFetching,
  sendCompleted,
  sendError,
} from "../../library/Stream";

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

    // Use service layer for spo2 (includes rating + status)
    if (metric_type === "spo2") {
      const result = await HealthMetricService.saveSpO2({
        device_id,
        spo2: Number(value_primary),
        measurement_type:
          value_secondary !== undefined && value_secondary !== null
            ? Number(value_secondary)
            : undefined,
        unit,
      });

      if (!result.success) {
        return errorMessage(res, result.error || "Failed to save SpO2");
      }

      return successMessage(res, "Healthmetric added successfully", {
        data: result.data,
        rating: result.rating,
        status: result.status,
      });
    }

    const healthmetric = await db.HealthMetric.create({
      device_id: device_id,
      metric_type: metric_type,
      value_primary: value_primary,
      value_secondary: value_secondary,
      unit: unit,
      recorded_at: new Date(),
    });

    // Check the configured daily target immediately after a step metric is persisted.
    const stepMetricTypes = ["steps", "steps_daily", "steps_cumulative"];
    if (stepMetricTypes.includes(metric_type)) {
      await checkStepTarget(
        device_id,
        Number(value_primary),
        metric_type,
        healthmetric.recorded_at,
        healthmetric.id,
        true
      ).catch((err) => console.error("checkStepTarget error:", err));
    }

    return successMessage(res, "Healthmetric added successfully", healthmetric);
  } catch (err) {
    return errorMessage(res, "Error adding healthmetric");
  }
};

const saveSpO2 = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { device_id, spo2, measurement_type, unit, recorded_at } = req.body;

    if (!device_id || spo2 === undefined || spo2 === null) {
      return errorMessage(res, "device_id and spo2 are required");
    }

    const result = await HealthMetricService.saveSpO2({
      device_id,
      spo2: Number(spo2),
      measurement_type:
        measurement_type !== undefined ? Number(measurement_type) : undefined,
      unit,
      recorded_at: recorded_at ? new Date(recorded_at) : undefined,
    });

    if (!result.success) {
      return errorMessage(res, result.error || "Failed to save SpO2");
    }

    return successMessage(res, "SpO2 saved successfully", {
      data: result.data,
      rating: result.rating,
      status: result.status,
    });
  } catch (err) {
    console.error("saveSpO2 error:", err);
    return errorMessage(res, "Error saving SpO2");
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
  "battery",
  "steps",
  "turnovers",
];

const AVERAGE_METRIC_TYPES = [
  "heart_rate",
  "blood_pressure",
  "spo2",
  "temperature",
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
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

const getAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id, metric_type, range = "daily", date = null } = req.body;

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

    const dbMetricType =
      metric_type === "steps" ? "steps_cumulative" : metric_type;

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
      truncUnit = "hour"; // hourly buckets within the day
    } else if (range === "weekly") {
      // Sent `date` is used as-is as the start of the 7-day window
      start = startOfDay(targetDate);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      end = endOfDay(end);
      truncUnit = "day"; // one point per day
    } else {
      // monthly = full calendar month containing the sent date.
      start = startOfMonth(targetDate);
      end = endOfMonth(targetDate);

      // Bucket per day for:
      //  - average-based metrics when a specific date is provided
      //  - cumulative step counts, so each chart point is that day's total
      //    steps (same granularity as the daily range). Everything else
      //    buckets per week.
      const bucketPerDay =
        (range === "monthly" &&
          date &&
          AVERAGE_METRIC_TYPES.includes(dbMetricType)) ||
        dbMetricType === "steps_cumulative";

      truncUnit = bucketPerDay ? "day" : "week";
    }

    console.log(
      "device_id:",
      device_id,
      "metric_type:",
      dbMetricType,
      "range:",
      range,
      "start:",
      start,
      "end:",
      end
    );

    // Raw readings in-window, for low/normal/max summary cards
    const readings = await db.HealthMetric.findAll({
      where: {
        device_id,
        metric_type: dbMetricType,
        recorded_at: { [Op.between]: [start, end] },
        value_primary: { [Op.ne]: 0 },
      },
      attributes: ["value_primary", "value_secondary", "unit", "recorded_at"],
      order: [["recorded_at", "DESC"]],
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

      // value_secondary is only a real numeric quantity to average for
      // blood_pressure (diastolic). For temperature it's a measurement-type
      // flag (0=forehead, 1=wrist), not something to average.
      const secondaryIsAveragable = dbMetricType !== "temperature";

      const secondaryReadings = readings.filter(
        (r: any) => r.value_secondary !== null
      );
      const avgSecondary =
        secondaryIsAveragable && secondaryReadings.length
          ? secondaryReadings.reduce(
              (sum: number, r: any) => sum + Number(r.value_secondary),
              0
            ) / secondaryReadings.length
          : null;

      summary = {
        low: {
          primary: Number(lowest.value_primary),
          secondary:
            secondaryIsAveragable && lowest.value_secondary !== null
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
            secondaryIsAveragable && highest.value_secondary !== null
              ? Number(highest.value_secondary)
              : null,
        },
        unit: readings[0].unit,
      };
    }

    let chart;

    if (dbMetricType === "steps_cumulative") {
      // Baseline: last cumulative reading before this window started
      const baseline = await db.HealthMetric.findOne({
        where: {
          device_id,
          metric_type: dbMetricType,
          recorded_at: { [Op.lt]: start },
        },
        order: [["recorded_at", "DESC"]],
        attributes: ["value_primary"],
      });

      let prevCumulative: number | null = baseline
        ? Number(baseline.value_primary)
        : null;

      // Last cumulative reading per bucket
      const stepBuckets: any[] = await db.sequelize.query(
        `
        SELECT bucket, value_primary, unit
        FROM (
          SELECT date_trunc(:truncUnit, recorded_at) AS bucket,
                 value_primary,
                 unit,
                 ROW_NUMBER() OVER (
                   PARTITION BY date_trunc(:truncUnit, recorded_at)
                   ORDER BY recorded_at DESC
                 ) AS rn
          FROM "HealthMetrics"
          WHERE device_id = :device_id
            AND metric_type = :dbMetricType
            AND recorded_at BETWEEN :start AND :end
        ) t
        WHERE rn = 1
        ORDER BY bucket ASC
        `,
        {
          replacements: { truncUnit, device_id, dbMetricType, start, end },
          type: QueryTypes.SELECT,
        }
      );

      chart = stepBuckets.map((r: any) => {
        const current = Number(r.value_primary);
        const steps =
          prevCumulative !== null ? current - prevCumulative : current;
        prevCumulative = current;
        return {
          value_primary: steps < 0 ? 0 : steps,
          value_secondary: null,
          unit: r.unit,
          bucket: r.bucket,
        };
      });
    } else if (
      range !== "daily" &&
      AVERAGE_METRIC_TYPES.includes(dbMetricType)
    ) {
      const secondaryIsAveragable = dbMetricType !== "temperature";

      // Exclude abnormal-flag rows (unit contains "abnormal") from the
      // numeric average — they store 0/1 as a flag, not a real reading.
      const excludeAbnormal =
        dbMetricType === "temperature" ? `AND unit NOT LIKE '%abnormal%'` : "";

      const avgBuckets: any[] = await db.sequelize.query(
        `
        SELECT date_trunc(:truncUnit, recorded_at) AS bucket,
               AVG(value_primary) AS value_primary,
               ${
                 secondaryIsAveragable ? "AVG(value_secondary)" : "NULL"
               } AS value_secondary,
               MAX(unit) AS unit,
               COUNT(*) AS reading_count
        FROM "HealthMetrics"
        WHERE device_id = :device_id
          AND metric_type = :dbMetricType
          AND recorded_at BETWEEN :start AND :end
          ${excludeAbnormal}
        GROUP BY bucket
        ORDER BY bucket ASC
        `,
        {
          replacements: { truncUnit, device_id, dbMetricType, start, end },
          type: QueryTypes.SELECT,
        }
      );

      chart = avgBuckets.map((r: any) => ({
        value_primary:
          r.value_primary !== null
            ? Math.round(Number(r.value_primary) * 100) / 100
            : null,
        value_secondary:
          r.value_secondary !== null
            ? Math.round(Number(r.value_secondary) * 100) / 100
            : null,
        unit: r.unit,
        bucket: r.bucket,
      }));
    } else {
      // daily range, or any metric type not in AVERAGE_METRIC_TYPES:
      // return every raw reading as-is.
      chart = readings.map((r: any) => ({
        value_primary: Number(r.value_primary),
        value_secondary:
          r.value_secondary !== null ? Number(r.value_secondary) : null,
        unit: r.unit,
        bucket: r.recorded_at,
      }));
    }

    // Last synced — most recent reading ever recorded, not limited to the window
    const latest = await db.HealthMetric.findOne({
      where: { device_id, metric_type: dbMetricType },
      order: [["recorded_at", "DESC"]],
    });

    return successMessage(res, "Analytics fetched successfully", {
      range,
      chart,
      summary,
      last_synced: latest?.recorded_at ?? null,
    });
  } catch (err) {
    console.error("getAnalytics error:", err);
    return errorMessage(res, "Error fetching analytics");
  }
};

const getHealthOverview = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id as string);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const metricTypes = [
      "heart_rate",
      "blood_pressure",
      "steps_cumulative",
      "sleep",
      "spo2",
      "temperature",
    ];

    const overview: any = {};
    const now = new Date();
    const todayStart = startOfDay(now);

    for (const metricType of metricTypes) {
      // Get latest reading
      const latest = await db.HealthMetric.findOne({
        where: { device_id: device_id, metric_type: metricType },
        order: [["recorded_at", "DESC"]],
      });

      // Most recent reading strictly before today (not a fixed 24-48h window)
      const previousDayMetric = await db.HealthMetric.findOne({
        where: {
          device_id: device_id,
          metric_type: metricType,
          recorded_at: { [Op.lt]: todayStart },
        },
        order: [["recorded_at", "DESC"]],
      });

      const latestValue = latest ? Number(latest.value_primary) : null;
      const previousValue = previousDayMetric
        ? Number(previousDayMetric.value_primary)
        : null;
      const delta =
        latestValue !== null && previousValue !== null
          ? latestValue - previousValue
          : null;
      const direction =
        delta !== null
          ? delta > 0
            ? "up"
            : delta < 0
            ? "down"
            : "stable"
          : null;

      // Map steps_cumulative to steps in response
      const responseKey =
        metricType === "steps_cumulative" ? "steps" : metricType;

      overview[responseKey] = {
        latest: latestValue,
        latest_secondary: latest
          ? Number(latest.value_secondary) || null
          : null,
        unit: latest?.unit || null,
        recorded_at: latest?.recorded_at || null,
        previous_day_value: previousValue,
        delta: delta,
        direction: direction,
      };
    }

    // Steps actually taken TODAY = today's cumulative - last cumulative before today
    // (falls back to the raw latest value if there's no earlier reading to diff against)
    if (overview["steps"]) {
      const stepsLatest = overview["steps"].latest;
      const stepsPrevious = overview["steps"].previous_day_value;
      const stepsToday =
        stepsLatest !== null && stepsPrevious !== null
          ? Math.max(stepsLatest - stepsPrevious, 0)
          : stepsLatest || 0;

      overview["steps"].latest = stepsToday;
    }

    const stepsToday = overview["steps"]?.latest || 0;

    const totalDistanceKm = Number((stepsToday * 0.000762).toFixed(2));
    const totalCalories = Number((stepsToday * 0.04).toFixed(2));

    overview["distance"] = {
      latest: totalDistanceKm,
      unit: "km",
    };

    overview["calories"] = {
      latest: totalCalories,
      unit: "kcal",
    };

    return successMessage(
      res,
      "Health overview fetched successfully",
      overview
    );
  } catch (err) {
    console.error("getHealthOverview error:", err);
    return errorMessage(res, "Error fetching health overview");
  }
};

const getTodaySteps = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id as string);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(now);

    // With the upsert logic in the TCP server, there is at most one
    // steps_cumulative row per device per calendar date. Fetch today's
    // row (if any) and the most recent row from before today so we can
    // compute the delta (total steps walked today).
    const todayRecord = await db.HealthMetric.findOne({
      where: {
        device_id,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.between]: [start, end] },
      },
      attributes: ["value_primary", "recorded_at"],
      order: [["recorded_at", "DESC"]],
    });

    // Latest cumulative reading from before today (yesterday's tail).
    const previousRecord = await db.HealthMetric.findOne({
      where: {
        device_id,
        metric_type: "steps_cumulative",
        recorded_at: { [Op.lt]: start },
      },
      attributes: ["value_primary", "recorded_at"],
      order: [["recorded_at", "DESC"]],
    });

    let totalSteps = 0;
    let lastRecordedAt: Date | null = null;

    if (todayRecord) {
      const todayValue = Number(todayRecord.value_primary);
      lastRecordedAt = todayRecord.recorded_at;

      if (previousRecord) {
        const prevValue = Number(previousRecord.value_primary);
        // If the pedometer reset (today < previous), the total for
        // today is just today's value. Otherwise it's the delta.
        totalSteps =
          todayValue < prevValue ? todayValue : todayValue - prevValue;
      } else {
        // No previous record — assume the watch reset at midnight,
        // so today's cumulative value IS the daily total.
        totalSteps = todayValue;
      }
    }

    return successMessage(res, "Today's step count fetched successfully", {
      device_id,
      total_steps: totalSteps,
      date: now.toISOString().split("T")[0],
      last_recorded_at: lastRecordedAt,
    });
  } catch (err) {
    console.error("getTodaySteps error:", err);
    return errorMessage(res, "Error fetching today's step count");
  }
};

const getHealthOverviewStreamed = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return sendError(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id as string);
    if (!device) {
      return sendError(res, "Device not found");
    }

    // Step 0: Immediate "processing" signal
    sendProcessing(res, "Starting health overview fetch...");

    const metricTypes = [
      "heart_rate",
      "blood_pressure",
      "steps_cumulative",
      "sleep",
      "spo2",
      "temperature",
    ];

    const overview: any = {};
    const now = new Date();
    const todayStart = startOfDay(now);
    const totalMetrics = metricTypes.length;

    for (let i = 0; i < metricTypes.length; i++) {
      const metricType = metricTypes[i];

      // Fetch latest reading for this metric type
      const latest = await db.HealthMetric.findOne({
        where: { device_id, metric_type: metricType },
        order: [["recorded_at", "DESC"]],
      });

      // Fetch most recent reading strictly before today
      const previousDayMetric = await db.HealthMetric.findOne({
        where: {
          device_id,
          metric_type: metricType,
          recorded_at: { [Op.lt]: todayStart },
        },
        order: [["recorded_at", "DESC"]],
      });

      const latestValue = latest ? Number(latest.value_primary) : null;
      const previousValue = previousDayMetric
        ? Number(previousDayMetric.value_primary)
        : null;
      const delta =
        latestValue !== null && previousValue !== null
          ? latestValue - previousValue
          : null;
      const direction =
        delta !== null
          ? delta > 0
            ? "up"
            : delta < 0
            ? "down"
            : "stable"
          : null;

      const responseKey =
        metricType === "steps_cumulative" ? "steps" : metricType;

      overview[responseKey] = {
        latest: latestValue,
        latest_secondary: latest
          ? Number(latest.value_secondary) || null
          : null,
        unit: latest?.unit || null,
        recorded_at: latest?.recorded_at || null,
        previous_day_value: previousValue,
        delta: delta,
        direction: direction,
      };

      // Send progress chunk for this metric
      const progress = Math.round(((i + 1) / totalMetrics) * 100);
      sendFetching(
        res,
        `Fetched ${responseKey} data`,
        overview[responseKey],
        progress
      );
    }

    // Steps actually taken TODAY
    if (overview["steps"]) {
      const stepsLatest = overview["steps"].latest;
      const stepsPrevious = overview["steps"].previous_day_value;
      const stepsToday =
        stepsLatest !== null && stepsPrevious !== null
          ? Math.max(stepsLatest - stepsPrevious, 0)
          : stepsLatest || 0;

      overview["steps"].latest = stepsToday;
    }

    const stepsToday = overview["steps"]?.latest || 0;
    const totalDistanceKm = Number((stepsToday * 0.000762).toFixed(2));
    const totalCalories = Number((stepsToday * 0.04).toFixed(2));

    overview["distance"] = {
      latest: totalDistanceKm,
      unit: "km",
    };

    overview["calories"] = {
      latest: totalCalories,
      unit: "kcal",
    };

    // Final: completed
    sendCompleted(res, "Health overview fetched successfully", overview);
  } catch (err) {
    console.error("getHealthOverviewStreamed error:", err);
    return sendError(res, "Error fetching health overview");
  }
};

export default {
  AddMetrics,
  getAnalytics,
  getHealthOverview,
  getHealthOverviewStreamed,
  getTodaySteps,
  saveSpO2,
};

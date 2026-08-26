"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const models_1 = __importDefault(require("../../models"));
const Response_1 = require("../../library/Response");
const sequelize_1 = require("sequelize");
const HealthMetricService_1 = __importDefault(require("../../services/HealthMetricService"));
const AddMetrics = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { device_id, metric_type, value_primary, value_secondary, unit } = req.body;
            if (!device_id ||
                !metric_type ||
                !value_primary ||
                !value_secondary ||
                !unit) {
                return (0, Response_1.errorMessage)(res, "device_id,metric_type,value_primary,value_secondary and unit are required");
            }
            // Use service layer for heart_rate, fallback to direct create for others
            if (metric_type === "heart_rate") {
                const result = yield HealthMetricService_1.default.saveHeartRate({
                    device_id,
                    bpm: Number(value_primary),
                    unit,
                });
                if (!result.success) {
                    return (0, Response_1.errorMessage)(res, result.error || "Failed to save heart rate");
                }
                return (0, Response_1.successMessage)(res, "Healthmetric added successfully", result.data);
            }
            const healthmetric = yield models_1.default.HealthMetric.create({
                device_id: device_id,
                metric_type: metric_type,
                value_primary: value_primary,
                value_secondary: value_secondary,
                unit: unit,
                recorded_at: new Date(),
            });
            return (0, Response_1.successMessage)(res, "Healthmetric added successfully", healthmetric);
        }
        catch (err) {
            return (0, Response_1.errorMessage)(res, "Error adding healthmetric");
        }
    });
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
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
function startOfWeek(d) {
    const x = startOfDay(d);
    const day = x.getDay(); // 0 = Sunday, matches the S M T W T F S strip
    x.setDate(x.getDate() - day);
    return x;
}
function endOfWeek(d) {
    const x = startOfWeek(d);
    x.setDate(x.getDate() + 6);
    return endOfDay(x);
}
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
// POST /health/analytics
// body: { device_id, metric_type, range: "daily"|"weekly"|"monthly", date? }
const getAnalytics = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { device_id, metric_type, range = "daily", date } = req.body;
        if (!device_id || !metric_type) {
            return (0, Response_1.errorMessage)(res, "device_id and metric_type are required");
        }
        if (!METRIC_TYPES.includes(metric_type)) {
            return (0, Response_1.errorMessage)(res, `metric_type must be one of: ${METRIC_TYPES.join(", ")}`);
        }
        if (!["daily", "weekly", "monthly"].includes(range)) {
            return (0, Response_1.errorMessage)(res, "range must be one of: daily, weekly, monthly");
        }
        const device = yield models_1.default.Device.findByPk(device_id);
        if (!device) {
            return (0, Response_1.errorMessage)(res, "device_id does not match any existing device");
        }
        const targetDate = date ? new Date(date) : new Date();
        let start;
        let end;
        let truncUnit;
        if (range === "daily") {
            start = startOfDay(targetDate);
            end = endOfDay(targetDate);
            truncUnit = "hour"; // 9AM, 10AM, 11AM... buckets, matching the Daily chart
        }
        else if (range === "weekly") {
            start = startOfWeek(targetDate);
            end = endOfWeek(targetDate);
            truncUnit = "day"; // one point per day, matching the S M T W T F S strip
        }
        else {
            start = startOfMonth(targetDate);
            end = endOfMonth(targetDate);
            truncUnit = "week"; // one point per week across the month
        }
        // Bucketed chart points (avg per bucket)
        const chartRows = yield models_1.default.sequelize.query(`
      SELECT date_trunc(:truncUnit, recorded_at) AS bucket,
             AVG(value_primary) AS avg_primary,
             AVG(value_secondary) AS avg_secondary
      FROM "HealthMetrics"
      WHERE device_id = :device_id
        AND metric_type = :metric_type
        AND recorded_at BETWEEN :start AND :end
      GROUP BY bucket
      ORDER BY bucket ASC
      `, {
            replacements: { truncUnit, device_id, metric_type, start, end },
            type: sequelize_1.QueryTypes.SELECT,
        });
        console.log("device_id:", device_id, "metric_type:", metric_type, "start:", start, "end:", end);
        // Raw readings in-window, for low/normal/max summary cards
        const readings = yield models_1.default.HealthMetric.findAll({
            where: {
                device_id,
                metric_type,
                createdAt: { [sequelize_1.Op.between]: [start, end] },
            },
            attributes: ["value_primary", "value_secondary", "unit", "recorded_at"],
            order: [["value_primary", "ASC"]],
        });
        let summary = {
            low: null,
            normal: null,
            max: null,
            unit: null,
        };
        if (readings.length) {
            const lowest = readings[0];
            const highest = readings[readings.length - 1];
            const avgPrimary = readings.reduce((sum, r) => sum + Number(r.value_primary), 0) / readings.length;
            const secondaryReadings = readings.filter((r) => r.value_secondary !== null);
            const avgSecondary = secondaryReadings.length
                ? secondaryReadings.reduce((sum, r) => sum + Number(r.value_secondary), 0) / secondaryReadings.length
                : null;
            summary = {
                low: {
                    primary: Number(lowest.value_primary),
                    secondary: lowest.value_secondary !== null
                        ? Number(lowest.value_secondary)
                        : null,
                },
                normal: {
                    primary: Math.round(avgPrimary * 100) / 100,
                    secondary: avgSecondary !== null ? Math.round(avgSecondary * 100) / 100 : null,
                },
                max: {
                    primary: Number(highest.value_primary),
                    secondary: highest.value_secondary !== null
                        ? Number(highest.value_secondary)
                        : null,
                },
                unit: readings[0].unit,
            };
        }
        // Last synced — most recent reading ever recorded, not limited to the window
        const latest = yield models_1.default.HealthMetric.findOne({
            where: { device_id, metric_type },
            order: [["recorded_at", "DESC"]],
        });
        return (0, Response_1.successMessage)(res, "Analytics fetched successfully", {
            range,
            chart: chartRows.map((r) => ({
                bucket: r.bucket,
                value_primary: r.avg_primary !== null
                    ? Math.round(Number(r.avg_primary) * 100) / 100
                    : null,
                value_secondary: r.avg_secondary !== null
                    ? Math.round(Number(r.avg_secondary) * 100) / 100
                    : null,
            })),
            summary,
            last_synced: (_a = latest === null || latest === void 0 ? void 0 : latest.recorded_at) !== null && _a !== void 0 ? _a : null,
        });
    }
    catch (err) {
        console.error("getAnalytics error:", err);
        return (0, Response_1.errorMessage)(res, "Error fetching analytics");
    }
});
exports.default = { AddMetrics, getAnalytics };

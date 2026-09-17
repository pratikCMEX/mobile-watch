import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { Op } from "sequelize";

const formatDevice = (device: any) => {
  const d = device.toJSON ? device.toJSON() : device;
  return {
    id: d.id,
    device_name: d.device_name,
    serialNumber: d.serial_number,
    profile_image: d.profile_image,
    connection_status: d.connection_status,
    is_online: d.is_online,
    battery_percentage: d.battery_percentage,
    gps_strength: d.gps_strength,
    network_carrier: d.network_carrier,
    network_type: d.network_type,
    last_updated_at: d.last_updated_at,
  };
};

const formatLocation = (location: any) => {
  if (!location) return null;
  const l = location.toJSON ? location.toJSON() : location;
  return {
    latitude: l.latitude,
    longitude: l.longitude,
    address: l.address,
    recorded_at: l.recorded_at,
  };
};

const getHealthOverview = async (deviceId: string) => {
  const metricTypes = [
    "heart_rate",
    "blood_pressure",
    "sleep",
    "steps_cumulative",
  ];
  const overview: any = {};

  for (const metricType of metricTypes) {
    // Get latest reading
    const latest = await db.HealthMetric.findOne({
      where: { device_id: deviceId, metric_type: metricType },
      order: [["recorded_at", "DESC"]],
    });

    // Get previous day's reading (from 24-48 hours ago)
    const now = new Date();
    const previousDayStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const previousDayEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const previousDayMetric = await db.HealthMetric.findOne({
      where: {
        device_id: deviceId,
        metric_type: metricType,
        recorded_at: {
          [Op.between]: [previousDayStart, previousDayEnd],
        },
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
      latest_secondary: latest ? Number(latest.value_secondary) || null : null,
      unit: latest?.unit || null,
      recorded_at: latest?.recorded_at || null,
      previous_day_value: previousValue,
      delta: delta,
      direction: direction,
    };
  }

  // Distance (km) and calories, derived from today's step count
  const stepsToday = overview["steps"]?.latest || 0;

  const totalDistanceKm = Number((stepsToday * 0.000762).toFixed(2));
  const totalCalories = Number((stepsToday * 0.04).toFixed(2));

  overview["distance"] = {
    value: totalDistanceKm,
    unit: "km",
  };

  overview["calories"] = {
    value: totalCalories,
    unit: "kcal",
  };

  return overview;
};

const getHome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceId = (req.params.device_id as string) || null;

    if (!deviceId) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(deviceId);
    if (!device) {
      return successMessage(res, "Device not found", {
        device: null,
        last_location: null,
      });
    }

    const lastLocation = await db.Location.findOne({
      where: { device_id: device.id },
      order: [["recorded_at", "DESC"]],
    });

    const healthOverview = await getHealthOverview(device.id);
    const firstDevice = await db.Device.findAll({
      attributes: [
        "id",
        "serial_number",
        "device_name",
        "profile_image",
        "connection_status",
        "last_updated_at",
      ],
      where: { owner_id: device.owner_id },
      order: [["createdAt", "ASC"]],
    });

    return successMessage(res, "Home data fetched successfully", {
      device: formatDevice(device),
      last_location: formatLocation(lastLocation),
      health_overview: healthOverview,
      all_devices: firstDevice,
    });
  } catch (err) {
    console.error("getHome error:", err);
    return errorMessage(res, "Error fetching home data");
  }
};

// Haversine distance in km
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Consecutive points within this distance are treated as the same stop
// and merged into a single "time1 - time2" entry
const STOP_THRESHOLD_KM = 0.03; // ~30 meters

const getTravelHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, start_time, end_time } = req.body;

    if (!serial_number || !start_time || !end_time) {
      return errorMessage(
        res,
        "serial_number, start_time and end_time are required"
      );
    }

    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(res, "Device not found for given serial_number");
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    const locations = await db.Location.findAll({
      where: {
        device_id: device.id,
        recorded_at: { [Op.between]: [start, end] },
        // is_valid_fix: true,
      },
      order: [["recorded_at", "ASC"]],
      attributes: ["latitude", "longitude", "total_distance_km", "recorded_at"],
    });

    if (!locations.length) {
      return successMessage(res, "Travel history fetched successfully", {
        serial_number,
        total_distance: "0 km",
        points: [],
      });
    }

    // Calculate total distance by summing haversine distances between
    // consecutive points — robust even when total_distance_km is null
    let totalDistanceKm = 0;
    for (let i = 1; i < locations.length; i++) {
      totalDistanceKm += haversineDistance(
        Number(locations[i - 1].latitude),
        Number(locations[i - 1].longitude),
        Number(locations[i].latitude),
        Number(locations[i].longitude)
      );
    }

    // Merge consecutive points that stayed within STOP_THRESHOLD_KM into one entry
    const points: { time: string; latitude: number; longitude: number }[] = [];

    let clusterStart: any = locations[0];
    let clusterEnd: any = locations[0];

    const formatTime = (d: any) => new Date(d).toISOString();

    const pushCluster = (clStart: any, clEnd: any) => {
      const startLabel = formatTime(clStart.recorded_at);
      const endLabel = formatTime(clEnd.recorded_at);
      points.push({
        time:
          new Date(clStart.recorded_at).getTime() ===
          new Date(clEnd.recorded_at).getTime()
            ? startLabel
            : `${startLabel} - ${endLabel}`,
        latitude: Number(clEnd.latitude),
        longitude: Number(clEnd.longitude),
      });
    };

    for (let i = 1; i < locations.length; i++) {
      const prev = clusterEnd;
      const curr = locations[i];

      const dist = haversineDistance(
        Number(prev.latitude),
        Number(prev.longitude),
        Number(curr.latitude),
        Number(curr.longitude)
      );

      if (dist <= STOP_THRESHOLD_KM) {
        clusterEnd = curr; // still at the same spot — extend the cluster
      } else {
        pushCluster(clusterStart, clusterEnd); // moved — close the cluster
        clusterStart = curr;
        clusterEnd = curr;
      }
    }
    pushCluster(clusterStart, clusterEnd);

    return successMessage(res, "Travel history fetched successfully", {
      serial_number,
      total_distance: `${totalDistanceKm.toFixed(2)} km`,
      points,
    });
  } catch (err) {
    console.error("getTravelHistory error:", err);
    return errorMessage(res, "Error fetching travel history");
  }
};

export default {
  getHome,
  getTravelHistory,
};

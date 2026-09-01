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
  const metricTypes = ["heart_rate", "blood_pressure", "sleep", "steps_daily"];
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

    // Map steps_daily to steps in response
    const responseKey = metricType === "steps_daily" ? "steps" : metricType;

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

export default {
  getHome,
};

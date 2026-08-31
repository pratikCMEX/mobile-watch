import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";

const formatDevice = (device: any) => {
  const d = device.toJSON ? device.toJSON() : device;
  return {
    id: d.id,
    device_name: d.device_name,
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

const getHome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceId = (req.query.device_id as string) || null;

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

    return successMessage(res, "Home data fetched successfully", {
      device: formatDevice(device),
      last_location: formatLocation(lastLocation),
    });
  } catch (err) {
    console.error("getHome error:", err);
    return errorMessage(res, "Error fetching home data");
  }
};

export default {
  getHome,
};

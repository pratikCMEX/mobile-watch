import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import { canAccessDevice } from "../../helper/WatchAccess";

// Search device by IMEI and get location data
async function getDeviceLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { imei } = req.body;

    if (!imei) {
      return errorMessage(res, "imei_is_required");
    }

    const device = await db.Device.findOne({
      where: { imei },
      attributes: [
        "id",
        "imei",
        "device_name",
        "latest_lat",
        "latest_lng",
        "latest_location_at",
        "latest_location_is_valid",
        "battery_percentage",
        "gps_strength",
        "is_online",
        "last_updated_at",
        "connection_status",
        "signal_status",
      ],
    });

    if (!device || !(await canAccessDevice(req, device.id))) {
      return errorMessage(res, "device_not_found_with_this_imei");
    }

    return successMessage(res, "device_location_retrieved_successfully", device);
  } catch (err) {
    console.error("getDeviceLocation error:", err);
    return errorMessage(res, "error_retrieving_device_location");
  }
}

export default {
  getDeviceLocation,
};

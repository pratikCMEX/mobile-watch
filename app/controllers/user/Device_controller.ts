import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";

const updateDeviceSettings = async function (
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      device_id,
      sms_alert_enabled,
      take_off_device_alert,
      safe_mode,
      talking_clock,
      night_power_saving,
      volume,
      brightness,
      fall_down_alert_enabled,
      fall_down_reminder_call,
      fall_down_level,
    } = req.body;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    let deviceSetting = await db.DeviceSetting.findOne({
      where: { device_id },
    });

    if (!deviceSetting) {
      deviceSetting = await db.DeviceSetting.create({
        device_id,
        sms_alert_enabled: sms_alert_enabled ?? "0",
        take_off_device_alert: take_off_device_alert ?? "0",
        safe_mode: safe_mode ?? "0",
        talking_clock: talking_clock ?? "0",
        night_power_saving: night_power_saving ?? "0",
        volume: volume ?? 50,
        brightness: brightness ?? 50,
        fall_down_alert_enabled: fall_down_alert_enabled ?? true,
        fall_down_reminder_call: fall_down_reminder_call ?? true,
        fall_down_level: fall_down_level ?? 5,
      });
    } else {
      if (sms_alert_enabled !== undefined)
        deviceSetting.sms_alert_enabled = sms_alert_enabled;
      if (take_off_device_alert !== undefined)
        deviceSetting.take_off_device_alert = take_off_device_alert;
      if (safe_mode !== undefined) deviceSetting.safe_mode = safe_mode;
      if (talking_clock !== undefined)
        deviceSetting.talking_clock = talking_clock;
      if (night_power_saving !== undefined)
        deviceSetting.night_power_saving = night_power_saving;
      if (volume !== undefined) deviceSetting.volume = volume;
      if (brightness !== undefined) deviceSetting.brightness = brightness;
      if (fall_down_alert_enabled !== undefined)
        deviceSetting.fall_down_alert_enabled = fall_down_alert_enabled;
      if (fall_down_reminder_call !== undefined)
        deviceSetting.fall_down_reminder_call = fall_down_reminder_call;
      if (fall_down_level !== undefined)
        deviceSetting.fall_down_level = fall_down_level;

      await deviceSetting.save();
    }

    return successMessage(
      res,
      "Device settings updated successfully",
      deviceSetting
    );
  } catch (err) {
    console.error("updateDeviceSettings error:", err);
    return errorMessage(res, "Error updating device settings");
  }
};

const aboutDevice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { device_id } = req.params;

    if (!device_id) {
      return errorMessage(res, "device_id is required");
    }

    const device = await db.Device.findByPk(device_id);
    if (!device) {
      return errorMessage(res, "Device not found");
    }

    const deviceData = device.toJSON();

    return successMessage(res, "Device details fetched successfully", {
      // Device Info
      id: deviceData.id,
      device_name: deviceData.device_name,
      connection_status: deviceData.connection_status,
      country_code: deviceData.country_code,
      phone_number: deviceData.phone_number,
      network_carrier: deviceData.network_carrier,
      network_type: deviceData.network_type,
      signal_status: deviceData.signal_status,
      gps_strength: deviceData.gps_strength,
      imei: deviceData.imei,
      serial_number: deviceData.serial_number,

      // Device Settings
    });
  } catch (err) {
    console.error("aboutDevice error:", err);
    return errorMessage(res, "Error fetching device details");
  }
};

export default {
  updateDeviceSettings,
  aboutDevice,
};

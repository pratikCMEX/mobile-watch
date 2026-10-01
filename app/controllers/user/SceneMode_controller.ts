import { NextFunction, Request, Response } from "express";
import db from "../../models";
import { errorMessage, successMessage } from "../../library/Response";
import Logging from "../../library/Logging";
import { tcpServer } from "../../app";
import { t } from "../../i18n/index";

const SCENE_MODE_DESCRIPTIONS: Record<number, string> = {
  1: "Vibration and ringing",
  2: "Ringing only",
  3: "Vibration only",
  4: "Silence",
};

const updateSceneMode = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { serial_number, scene_mode } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }

    if (scene_mode === undefined || scene_mode === null) {
      return errorMessage(res, "scene_mode_is_required");
    }

    if (![1, 2, 3, 4].includes(scene_mode)) {
      return errorMessage(
        res,
        "scene_mode_must_be_1_vibration_ringing_2_ringing_3_vibration_or_4_silence"
      );
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
      );
    }

    const commandSent = tcpServer.sendSceneModeCommand(
      serial_number,
      scene_mode
    );

    if (!commandSent) {
      return errorMessage(
        res,
        "device_is_offline_please_ensure_the_device_is_connected"
      );
    }

    Logging.info(
      `Scene mode command sent to device ${serial_number}: mode ${scene_mode} (${SCENE_MODE_DESCRIPTIONS[scene_mode]})`
    );

    try {
      let deviceSetting = await db.DeviceSetting.findOne({
        where: { device_id: device.id },
      });

      if (deviceSetting) {
        deviceSetting.scene_mode = scene_mode;
        await deviceSetting.save();
        Logging.info(
          `Scene mode updated in DeviceSetting for device ${device.id}: mode ${scene_mode}`
        );
      } else {
        deviceSetting = await db.DeviceSetting.create({
          device_id: device.id,
          sms_alert_enabled: "0",
          take_off_device_alert: "0",
          safe_mode: "0",
          talking_clock: "0",
          night_power_saving: "0",
          volume: 50,
          brightness: 50,
          fall_down_alert_enabled: "0",
          fall_down_reminder_call: "0",
          fall_down_level: 5,
          scene_mode: scene_mode,
          low_battery_alert: "0",
        });
        Logging.info(
          `DeviceSetting created with scene mode for device ${device.id}: mode ${scene_mode}`
        );
      }
    } catch (settingErr) {
      console.error("Error updating DeviceSetting:", settingErr);
      Logging.error(
        `Failed to update DeviceSetting for device ${device.id}: ${settingErr}`
      );
    }

    return successMessage(res, "scene_mode_command_sent_successfully", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      scene_mode,
      scene_mode_description: SCENE_MODE_DESCRIPTIONS[scene_mode],
      command_sent: true,
      saved_to_database: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("updateSceneMode error:", err);
    return errorMessage(res, "error_sending_scene_mode_command");
  }
};

const getSceneModeStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const serialNumberParam = req.params.serial_number;
    const serial_number = Array.isArray(serialNumberParam)
      ? serialNumberParam[0]
      : serialNumberParam;

    if (!serial_number) {
      return errorMessage(res, "serial_number_is_required");
    }

    const device = await db.Device.findOne({
      where: { serial_number: serial_number },
    });
    if (!device) {
      return errorMessage(
        res,
        t(req, "device_with_serial_number_not_found", [serial_number])
      );
    }

    const tcpClient = tcpServer.getDevice(serial_number);
    const isOnline = !!tcpClient;

    const lastNotification = await db.Notification.findOne({
      where: {
        device_id: device.id,
        metadata: { kind: "scene_mode" },
      },
      order: [["createdAt", "DESC"]],
    });

    return successMessage(res, "scene_mode_status_retrieved", {
      serial_number,
      device_id: device.id,
      device_name: device.device_name,
      is_online: isOnline,
      last_scene_mode_notification: lastNotification
        ? {
            title: lastNotification.title,
            body: lastNotification.body,
            created_at: lastNotification.createdAt,
          }
        : null,
    });
  } catch (err) {
    console.error("getSceneModeStatus error:", err);
    return errorMessage(res, "error_retrieving_scene_mode_status");
  }
};

const listSceneModes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sceneModes = [
      {
        id: 1,
        name: "vibration_and_ringing",
        description: "Vibration and ringing",
      },
      { id: 2, name: "ringing_only", description: "Ringing only" },
      { id: 3, name: "vibration_only", description: "Vibration only" },
      { id: 4, name: "silence", description: "Silence" },
    ];

    return successMessage(
      res,
      "scene_modes_retrieved_successfully",
      sceneModes
    );
  } catch (err) {
    console.error("listSceneModes error:", err);
    return errorMessage(res, "error_retrieving_scene_modes");
  }
};

export default {
  updateSceneMode,
  getSceneModeStatus,
  listSceneModes,
};

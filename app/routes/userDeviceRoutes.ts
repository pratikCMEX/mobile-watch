import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import Device_controller from "../controllers/user/Device_controller";
import Family_controller from "../controllers/user/Family_controller";
import Notification_controller from "../controllers/user/Notification_controller";
import AppUpdate_controller from "../controllers/admin/AppUpdate_controller";

const router = express.Router();

router.post(
  "/check_app_update",
  ValidateJoi(Schemas.appUpdate.check),
  AppUpdate_controller.checkAppUpdate
);

router.post(
  "/update_device_settings",
  checkToken,
  ValidateJoi(Schemas.deviceSetting.update),
  Device_controller.updateDeviceSettings
);

router.get(
  "/about_device/:device_id",
  checkToken,
  Device_controller.aboutDevice
);

router.get(
  "/settings/:device_id",
  checkToken,
  Device_controller.getDeviceSettings
);

router.get(
  "/get_device_status/:device_id",
  checkToken,
  Device_controller.getDeviceStatus
);

router.post(
  "/restart_device",
  checkToken,
  ValidateJoi(Schemas.deviceRestart.restart),
  Device_controller.restartDevice
);

router.post(
  "/device_command",
  checkToken,
  ValidateJoi(Schemas.deviceCommand.send),
  Device_controller.sendDeviceCommand
);

router.post(
  "/find_device",
  checkToken,
  ValidateJoi(Schemas.findDevice.send),
  Device_controller.findDevice
);

router.post(
  "/set_alarm",
  checkToken,
  ValidateJoi(Schemas.alarm.set),
  Device_controller.setAlarm
);

router.post(
  "/capture_snapshot",
  checkToken,
  ValidateJoi(Schemas.capture.snapshot),
  Device_controller.captureSnapshot
);

router.post(
  "/auto_answer",
  checkToken,
  ValidateJoi(Schemas.autoAnswer.set),
  Device_controller.setAutoAnswer
);

router.post("/edit_device_name", checkToken, Device_controller.editDeviceName);
router.post(
  "/update_device_number",
  checkToken,
  Device_controller.updateDeviceNumber
);

router.post(
  "/list_auto_answer",
  checkToken,
  ValidateJoi(Schemas.autoAnswer.list),
  Device_controller.listAutoAnswer
);

router.post(
  "/request_heart_rate",
  checkToken,
  // ValidateJoi(Schemas.autoAnswer.list),
  Device_controller.requestHeartRate
);

router.post(
  "/request_all_health_data",
  checkToken,
  ValidateJoi(Schemas.bodyTemperature.request),
  Device_controller.requestHeartRateAndBodyTemperature
);

// router.get("/health-result", checkToken, Device_controller.getHealthResult);

router.post(
  "/list_voice_messages",
  checkToken,
  Device_controller.listVoiceMessages
);

router.post(
  "/make_outgoing_call",
  checkToken,
  ValidateJoi(Schemas.outgoingCall.set),
  Device_controller.makeOutgoingCall
);

router.post(
  "/sos_sms_alert",
  checkToken,
  ValidateJoi(Schemas.sosSms.set),
  Device_controller.setSosSms
);

router.post(
  "/fall_down_alert",
  checkToken,
  ValidateJoi(Schemas.fallDownAlert.set),
  Device_controller.setFallDownAlert
);

router.post(
  "/low_battery_alert",
  checkToken,
  ValidateJoi(Schemas.lowBatteryAlert.set),
  Device_controller.setLowBatteryAlert
);

router.post(
  "/center_number",
  checkToken,
  ValidateJoi(Schemas.centerNumber.set),
  Device_controller.setCenterNumber
);

router.post(
  "/send_message",
  checkToken,
  ValidateJoi(Schemas.phrasesDisplay.set),
  Device_controller.setPhrasesDisplay
);

router.post(
  "/fall_down_sensitivity",
  checkToken,
  ValidateJoi(Schemas.fallDownSensitivity.set),
  Device_controller.setFallDownSensitivity
);

router.post(
  "/language_timezone",
  checkToken,
  ValidateJoi(Schemas.lz.set),
  Device_controller.setLanguageTimezone
);

router.post(
  "/do_not_disturb",
  checkToken,
  ValidateJoi(Schemas.silenceTime.set),
  Device_controller.setSilenceTime
);

router.post(
  "/get_do_not_disturb",
  checkToken,
  ValidateJoi(Schemas.silenceTime.get),
  Device_controller.getDoNotDisturb
);

router.post(
  "/request_body_temperature",
  checkToken,
  ValidateJoi(Schemas.bodyTemperature.request),
  Device_controller.requestBodyTemperature
);

router.post(
  "/reject_unknown_call",
  checkToken,
  ValidateJoi(Schemas.rejectStranger.set),
  Device_controller.setRejectStranger
);

router.post(
  "/night_power_saving",
  checkToken,
  ValidateJoi(Schemas.nightPowerSaving.set),
  Device_controller.setNightPowerSaving
);

router.post(
  "/dial_lock",
  checkToken,
  ValidateJoi(Schemas.dialLock.set),
  Device_controller.setDialLock
);

router.post(
  "/take_off_alert",
  checkToken,
  ValidateJoi(Schemas.takeOffAlert.set),
  Device_controller.setTakeOffAlert
);

router.post(
  "/remove_sms_alert",
  checkToken,
  ValidateJoi(Schemas.removeSmsAlert.set),
  Device_controller.setRemoveSmsAlert
);

router.post(
  "/sound_guardian",
  checkToken,
  ValidateJoi(Schemas.monitor.send),
  Device_controller.voiceMonitor
);

router.post(
  "/upload_interval",
  checkToken,
  ValidateJoi(Schemas.uploadInterval.set),
  Device_controller.setUploadInterval
);

router.post(
  "/walk_time",
  checkToken,
  ValidateJoi(Schemas.walkTime.set),
  Device_controller.setWalkTime
);

router.post(
  "/get_walk_time",
  checkToken,
  ValidateJoi(Schemas.walkTime.get),
  Device_controller.getWalkTime
);

router.post("/get_target_step", checkToken, Device_controller.getDeviceStep);

router.post(
  "/set_sleep_time",
  checkToken,
  ValidateJoi(Schemas.sleepTime.set),
  Device_controller.setSleepTime
);

router.post(
  "/get_sleep_time",
  checkToken,
  ValidateJoi(Schemas.sleepTime.get),
  Device_controller.getSleepTime
);

router.post(
  "/locate",
  checkToken,
  ValidateJoi(Schemas.locate.send),
  Device_controller.locateDevice
);

router.post(
  "/get_location",
  checkToken,
  ValidateJoi(Schemas.locate.get),
  Device_controller.getDeviceLocation
);

router.post(
  "/add_family_member",
  checkToken,
  ValidateJoi(Schemas.familyMember.create),
  Family_controller.addFamilyMember
);

router.post(
  "/list_family_members",
  checkToken,
  ValidateJoi(Schemas.familyMember.list),
  Family_controller.listFamilyMembers
);

router.delete(
  "/delete_family_member/:id",
  checkToken,
  ValidateJoi(Schemas.familyMember.delete, "params"),
  Family_controller.deleteFamilyMember
);

router.post(
  "/list_notifications",
  checkToken,
  ValidateJoi(Schemas.notification.list),
  Notification_controller.listNotifications
);

router.post(
  "/register_device",
  checkToken,
  ValidateJoi(Schemas.deviceRegister.byImei),
  Device_controller.registerDeviceByImei
);

module.exports = router;

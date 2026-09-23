import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import checkDeviceMember from "../middleware/DeviceMember";
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
  checkDeviceMember,
  ValidateJoi(Schemas.deviceSetting.update),
  Device_controller.updateDeviceSettings
);

router.get(
  "/about_device/:device_id",
  checkToken,
  checkDeviceMember,
  Device_controller.aboutDevice
);

router.get(
  "/settings/:device_id",
  checkToken,
  checkDeviceMember,
  Device_controller.getDeviceSettings
);

router.get(
  "/get_device_status/:device_id",
  checkToken,
  checkDeviceMember,
  Device_controller.getDeviceStatus
);

router.post(
  "/restart_device",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.deviceRestart.restart),
  Device_controller.restartDevice
);

router.post(
  "/device_command",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.deviceCommand.send),
  Device_controller.sendDeviceCommand
);

router.post(
  "/find_device",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.findDevice.send),
  Device_controller.findDevice
);

router.post(
  "/set_alarm",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.alarm.set),
  Device_controller.setAlarm
);

router.post(
  "/capture_snapshot",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.capture.snapshot),
  Device_controller.captureSnapshot
);

router.post(
  "/auto_answer",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.autoAnswer.set),
  Device_controller.setAutoAnswer
);

router.post(
  "/edit_device_name",
  checkToken,
  checkDeviceMember,
  Device_controller.editDeviceName
);
router.post(
  "/update_device_number",
  checkToken,
  checkDeviceMember,
  Device_controller.updateDeviceNumber
);

router.post(
  "/list_auto_answer",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.autoAnswer.list),
  Device_controller.listAutoAnswer
);

router.post(
  "/request_heart_rate",
  checkToken,
  checkDeviceMember,
  // ValidateJoi(Schemas.autoAnswer.list),
  Device_controller.requestHeartRate
);

router.post(
  "/request_all_health_data",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.bodyTemperature.request),
  Device_controller.requestHeartRateAndBodyTemperature
);

// router.get("/health-result", checkToken, Device_controller.getHealthResult);

router.post(
  "/list_voice_messages",
  checkToken,
  checkDeviceMember,
  Device_controller.listVoiceMessages
);

router.post(
  "/make_outgoing_call",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.outgoingCall.set),
  Device_controller.makeOutgoingCall
);

router.post(
  "/sos_sms_alert",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.sosSms.set),
  Device_controller.setSosSms
);

router.post(
  "/fall_down_alert",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.fallDownAlert.set),
  Device_controller.setFallDownAlert
);

router.post(
  "/low_battery_alert",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.lowBatteryAlert.set),
  Device_controller.setLowBatteryAlert
);

router.post(
  "/center_number",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.centerNumber.set),
  Device_controller.setCenterNumber
);

router.post(
  "/send_message",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.phrasesDisplay.set),
  Device_controller.setPhrasesDisplay
);

router.post(
  "/fall_down_sensitivity",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.fallDownSensitivity.set),
  Device_controller.setFallDownSensitivity
);

router.post(
  "/language_timezone",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.lz.set),
  Device_controller.setLanguageTimezone
);

router.post(
  "/do_not_disturb",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.silenceTime.set),
  Device_controller.setSilenceTime
);

router.post(
  "/get_do_not_disturb",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.silenceTime.get),
  Device_controller.getDoNotDisturb
);

router.post(
  "/request_body_temperature",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.bodyTemperature.request),
  Device_controller.requestBodyTemperature
);

router.post(
  "/reject_unknown_call",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.rejectStranger.set),
  Device_controller.setRejectStranger
);

router.post(
  "/night_power_saving",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.nightPowerSaving.set),
  Device_controller.setNightPowerSaving
);

router.post(
  "/dial_lock",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.dialLock.set),
  Device_controller.setDialLock
);

router.post(
  "/take_off_alert",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.takeOffAlert.set),
  Device_controller.setTakeOffAlert
);

router.post(
  "/remove_sms_alert",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.removeSmsAlert.set),
  Device_controller.setRemoveSmsAlert
);

router.post(
  "/sound_guardian",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.monitor.send),
  Device_controller.voiceMonitor
);

router.post(
  "/upload_interval",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.uploadInterval.set),
  Device_controller.setUploadInterval
);

router.post(
  "/walk_time",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.walkTime.set),
  Device_controller.setWalkTime
);

router.post(
  "/get_walk_time",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.walkTime.get),
  Device_controller.getWalkTime
);

router.post(
  "/get_target_step",
  checkToken,
  checkDeviceMember,
  Device_controller.getDeviceStep
);

router.post(
  "/set_sleep_time",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.sleepTime.set),
  Device_controller.setSleepTime
);

router.post(
  "/get_sleep_time",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.sleepTime.get),
  Device_controller.getSleepTime
);

router.post(
  "/locate",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.locate.send),
  Device_controller.locateDevice
);

router.post(
  "/get_location",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.locate.get),
  Device_controller.getDeviceLocation
);

router.post(
  "/add_family_member",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.familyMember.create),
  Family_controller.addFamilyMember
);

router.post(
  "/list_family_members",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.familyMember.list),
  Family_controller.listFamilyMembers
);

router.delete(
  "/delete_family_member/:id",
  checkToken,
  checkDeviceMember,
  ValidateJoi(Schemas.familyMember.delete, "params"),
  Family_controller.deleteFamilyMember
);

router.post(
  "/list_notifications",
  checkToken,
  checkDeviceMember,
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

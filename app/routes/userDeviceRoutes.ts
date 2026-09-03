import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import Device_controller from "../controllers/user/Device_controller";
import Family_controller from "../controllers/user/Family_controller";
import Notification_controller from "../controllers/user/Notification_controller";

const router = express.Router();

router.post(
  "/update_device_settings",
  checkToken,
  ValidateJoi(Schemas.deviceSetting.update),
  Device_controller.updateDeviceSettings
);

// Get device details (about device)
router.get(
  "/about_device/:device_id",
  checkToken,
  Device_controller.aboutDevice
);

// Get all device settings including scene_mode
router.get(
  "/settings/:device_id",
  checkToken,
  Device_controller.getDeviceSettings
);

// Get device information and status (sends TS command to device)
router.get(
  "/get_device_status/:device_id",
  checkToken,
  Device_controller.getDeviceStatus
);

// Restart device (sends RESET command to device via TCP)
router.post(
  "/restart_device",
  checkToken,
  ValidateJoi(Schemas.deviceRestart.restart),
  Device_controller.restartDevice
);

// Unified device command API
// command: 1 = restart, 2 = shutdown, 3 = factory_reset
router.post(
  "/device_command",
  checkToken,
  ValidateJoi(Schemas.deviceCommand.send),
  Device_controller.sendDeviceCommand
);

// Find my device API (sends FIND command to device via TCP)
router.post(
  "/find_device",
  checkToken,
  ValidateJoi(Schemas.findDevice.send),
  Device_controller.findDevice
);

// SOS numbers are now managed via the Emergency_contact controller.
// See: POST /emergency_contact/save_contact   (single contact with priority)
//      DELETE /emergency_contact/delete/:id   (remove one, auto re-syncs)
//
// (The legacy /set_sos_numbers route was removed.)

// Set alarm clock API (sends REMIND command to device via TCP)
router.post(
  "/set_alarm",
  checkToken,
  ValidateJoi(Schemas.alarm.set),
  Device_controller.setAlarm
);

// Remote snapshot API (sends rcapture command to device via TCP)
router.post(
  "/capture_snapshot",
  checkToken,
  ValidateJoi(Schemas.capture.snapshot),
  Device_controller.captureSnapshot
);

// Auto-answer (ACALL) API — turn the watch's auto-answer feature
// on/off and (optionally) configure up to 3 whitelisted numbers.
router.post(
  "/auto_answer",
  checkToken,
  ValidateJoi(Schemas.autoAnswer.set),
  Device_controller.setAutoAnswer
);

// SOS-SMS (SOSSMS) API — turn the watch's "send SMS to SOS numbers
// after an SOS alarm" switch on/off.
router.post(
  "/sos_sms_alert",
  checkToken,
  ValidateJoi(Schemas.sosSms.set),
  Device_controller.setSosSms
);

// Language / time zone (LZ) API — set the watch's display language
// OR its time zone (mutually exclusive per request, per the spec).
router.post(
  "/language_timezone",
  checkToken,
  ValidateJoi(Schemas.lz.set),
  Device_controller.setLanguageTimezone
);

// Do-not-disturb / class mode (SILENCETIME / SILENCETIME2) — set
// up to 4 time periods during which the watch rejects all incoming
// calls and locks the screen (but SOS still works).
router.post(
  "/do_not_disturb",
  checkToken,
  ValidateJoi(Schemas.silenceTime.set),
  Device_controller.setSilenceTime
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

module.exports = router;

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

// List the auto-answer numbers currently stored server-side for a
// device (server-side mirror of the ACALL whitelist on the watch).
router.post(
  "/list_auto_answer",
  checkToken,
  ValidateJoi(Schemas.autoAnswer.list),
  Device_controller.listAutoAnswer
);

// Outgoing Call (CALL) API — instruct the watch to dial a phone number.
//
// Wire protocol:
//   Server send : [3G*<id>*<LEN>*CALL,<phoneNumber>]
//   Device reply: [3G*<id>*0004*CALL]   (bare ack = device is dialing)
router.post(
  "/make_outgoing_call",
  checkToken,
  ValidateJoi(Schemas.outgoingCall.set),
  Device_controller.makeOutgoingCall
);

// SOS-SMS (SOSSMS) API — turn the watch's "send SMS to SOS numbers
// after an SOS alarm" switch on/off.
router.post(
  "/sos_sms_alert",
  checkToken,
  ValidateJoi(Schemas.sosSms.set),
  Device_controller.setSosSms
);

// Fall-Down Alarm Alert (FALLDOWN) API — toggle the watch's fall-down
// alarm alert switch and the "call center number after fall" switch.
//
// Wire protocol:
//   Server send : [3G*<id>*<LEN>*FALLDOWN,X,Y]
//                 X = fall-down alarm alert switch (1=ON, 0=OFF)
//                 Y = call center number after fall  (1=ON, 0=OFF)
//   Device reply: [3G*<id>*<LEN>*FALLDOWN]  (bare ack = success)
router.post(
  "/fall_down_alert",
  checkToken,
  ValidateJoi(Schemas.fallDownAlert.set),
  Device_controller.setFallDownAlert
);

// Low-Battery Alarm Alert (LOWBAT) API — toggle the watch's
// low-battery alarm SMS alert switch.
//
// Wire protocol:
//   Server send : [CS*<id>*0008*LOWBAT,0]  (off, do NOT send SMS on low battery)
//                 [CS*<id>*0008*LOWBAT,1]  (on, send SMS on low battery)
//   Device reply: [CS*<id>*0006*LOWBAT]    (bare ack = success)
router.post(
  "/low_battery_alert",
  checkToken,
  ValidateJoi(Schemas.lowBatteryAlert.set),
  Device_controller.setLowBatteryAlert
);

// Center Number (CENTER) API — set the watch's center phone number
// for SMS alarm alerts.
//
// Wire protocol:
//   Server send : [CS*<id>*<LEN>*CENTER,<phoneNumber>]
//   Device reply: [CS*<id>*<LEN>*CENTER]  (bare ack = success)
router.post(
  "/center_number",
  checkToken,
  ValidateJoi(Schemas.centerNumber.set),
  Device_controller.setCenterNumber
);

// Fall-Down Sensitivity (LSSET) API — set the watch's fall-down
// detection sensitivity level.
//
// Wire protocol:
//   Server send : [3G*<id>*<LEN>*LSSET,X+6]   (Android, 1–6 levels)
//                 [3G*<id>*<LEN>*LSSET,X+8]   (RT OS, 1–8 levels)
//   Device reply: [3G*<id>*<LEN>*LSSET,X]   (X = current level)
router.post(
  "/fall_down_sensitivity",
  checkToken,
  ValidateJoi(Schemas.fallDownSensitivity.set),
  Device_controller.setFallDownSensitivity
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

// Fetch the server-side mirror of the device's Do-Not-Disturb
// configuration (what was last sent to the watch).
router.post(
  "/get_do_not_disturb",
  checkToken,
  ValidateJoi(Schemas.silenceTime.get),
  Device_controller.getDoNotDisturb
);

// Request real-time body temperature from device (sends bodytemp2 command)
// The device will measure and reply with temperature data stored as HealthMetric
router.post(
  "/request_body_temperature",
  checkToken,
  ValidateJoi(Schemas.bodyTemperature.request),
  Device_controller.requestBodyTemperature
);

// Set reject stranger calling feature (DEVREFUSEPHONESWITCH command)
// When enabled, device will reject calls from numbers not in phone book or SOS contacts
router.post(
  "/reject_unknown_call",
  checkToken,
  ValidateJoi(Schemas.rejectStranger.set),
  Device_controller.setRejectStranger
);

// Set night power saving mode (APPLOCK command)
router.post(
  "/night_power_saving",
  checkToken,
  ValidateJoi(Schemas.nightPowerSaving.set),
  Device_controller.setNightPowerSaving
);

// Lock/unlock watch dial plate (APPLOCK command)
router.post(
  "/dial_lock",
  checkToken,
  ValidateJoi(Schemas.dialLock.set),
  Device_controller.setDialLock
);

// Take-Off Watch Alarm (REMOVE) API — toggle the watch's take-off
// alarm switch.
//
// Wire protocol:
//   Server send : [CS*<id>*0008*REMOVE,0]  (off, do NOT send alarm on take-off)
//                 [CS*<id>*0008*REMOVE,1]  (on, send alarm on take-off)
//   Device reply: [CS*<id>*0006*REMOVE]    (bare ack = success)
//
// NOTE: This feature depends on the device firmware having a light
// sensor. If the watch does not have a light sensor, this command
// is unnecessary and may not be supported.
router.post(
  "/take_off_alert",
  checkToken,
  ValidateJoi(Schemas.takeOffAlert.set),
  Device_controller.setTakeOffAlert
);

// Voice Monitor / Listen In (MONITOR command) - OPTIONAL FEATURE
// The device will auto-dial a monitor number for voice monitoring
// Note: Remove this feature if it is illegal in your region
router.post(
  "/sound_guardian",
  checkToken,
  ValidateJoi(Schemas.monitor.send),
  Device_controller.voiceMonitor
);

// Set dynamic-state upload time interval in seconds (UPLOAD command).
// The device will report position data every `interval_seconds` while
// in dynamic (moving) state. After ~2 minutes of no motion the watch
// goes to sleep / power-save mode and stops sending position data
// (only LK link-keep is sent). Any movement wakes it and uploads
// resume at the configured interval. Allowed range: 60..65535 seconds.
router.post(
  "/upload_interval",
  checkToken,
  ValidateJoi(Schemas.uploadInterval.set),
  Device_controller.setUploadInterval
);

// Configure the pedometer's walk-time (WALKTIME command).
// Pass 1–3 HH:MM-HH:MM windows to switch the pedometer ON;
// pass an empty array to switch it OFF. Devices ship with WALKTIME
// OFF, so sending at least one window turns the feature on.
router.post(
  "/walk_time",
  checkToken,
  ValidateJoi(Schemas.walkTime.set),
  Device_controller.setWalkTime
);

// Read back the persisted walk-time schedule + step target, plus
// the latest cumulative / daily step counts as reported by the watch.
router.post(
  "/get_walk_time",
  checkToken,
  ValidateJoi(Schemas.walkTime.get),
  Device_controller.getWalkTime
);

// Press the "Locate" pin in the app (sends CR command).
// Wakes up the device GPS system, performs constant positioning
// for ~3 minutes and reports fixes every ~20 seconds. Each fix is
// stored in the Locations table AND cached on the Device row so
// the dashboard can render the current pin immediately.
router.post(
  "/locate",
  checkToken,
  ValidateJoi(Schemas.locate.send),
  Device_controller.locateDevice
);

// Read back the device's cached current location plus a small
// recent Locations history window (for map playback / freshness
// checks).
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

module.exports = router;

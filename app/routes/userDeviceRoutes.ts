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

import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Device_controller from "../controllers/admin/Device_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post(
  "/create_device",
  uploadProfile.fields([{ name: "profile_image", maxCount: 1 }]),
  checkToken,
  ValidateJoi(Schemas.device.create),
  Device_controller.createDevice
);

router.post(
  "/update_device",
  uploadProfile.fields([{ name: "profile_image", maxCount: 1 }]),
  checkToken,
  ValidateJoi(Schemas.device.update),
  Device_controller.updateDevice
);

router.delete(
  "/delete_device/:id",
  checkToken,
  ValidateJoi(Schemas.device.delete, "params"),
  Device_controller.deleteDevice
);

router.get(
  "/get_device_settings/:device_id",
  checkToken,
  ValidateJoi(Schemas.device.getSettings, "params"),
  Device_controller.getDeviceSettings
);

router.post(
  "/list_unlinked_devices",
  checkToken,
  ValidateJoi(Schemas.device.listUnlinked),
  Device_controller.listUnlinkedDevices
);

router.post(
  "/assign_owner",
  checkToken,
  ValidateJoi(Schemas.device.assignOwner),
  Device_controller.assignOwner
);

router.post(
  "/update_device_identity",
  checkToken,
  ValidateJoi(Schemas.device.updateIdentity),
  Device_controller.updateDeviceIdentity
);

module.exports = router;

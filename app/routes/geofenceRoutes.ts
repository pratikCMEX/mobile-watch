import express from "express";
import { checkToken } from "../config/jwt";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Geofence_controller from "../controllers/user/Geofence_controller";

const router = express.Router();

router.post(
  "/save_geofence",
  checkToken,
  ValidateJoi(Schemas.geofence.save),
  Geofence_controller.saveGeofence
);

router.post(
  "/list_geofence",
  checkToken,
  ValidateJoi(Schemas.geofence.list),
  Geofence_controller.listGeofences
);

router.post(
  "/toggle_geofence_status",
  checkToken,
  ValidateJoi(Schemas.geofence.toggleStatus),
  Geofence_controller.toggleGeofenceStatus
);

router.delete(
  "/delete_geofence/:id",
  checkToken,
  ValidateJoi(Schemas.geofence.delete, "params"),
  Geofence_controller.deleteGeofence
);

module.exports = router;

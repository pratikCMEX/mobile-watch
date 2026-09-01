import express from "express";
import { checkToken } from "../config/jwt";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Geofence_controller from "../controllers/user/Geofence_controller";

const router = express.Router();

// Create or update geofence (if id provided -> update, else -> create)
router.post(
  "/save_geofence",
  checkToken,
  ValidateJoi(Schemas.geofence.save),
  Geofence_controller.saveGeofence
);

// List geofences with pagination/filter
router.post(
  "/list_geofence",
  checkToken,
  ValidateJoi(Schemas.geofence.list),
  Geofence_controller.listGeofences
);

// Toggle geofence active status
router.post(
  "/toggle-status",
  checkToken,
  ValidateJoi(Schemas.geofence.toggleStatus),
  Geofence_controller.toggleGeofenceStatus
);

// Delete geofence by ID
router.delete(
  "/delete/:id",
  checkToken,
  ValidateJoi(Schemas.geofence.delete, "params"),
  Geofence_controller.deleteGeofence
);

module.exports = router;

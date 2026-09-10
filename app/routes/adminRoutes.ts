import express from "express";
import { checkToken, checkAdmin } from "../config/jwt";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Device_controller from "../controllers/admin/Device_controller";
import Geofence_controller from "../controllers/admin/Geofence_controller";

const router = express.Router();



// List geofences with pagination/filter
router.post(
    "/list_geofence",
    checkAdmin,

    Geofence_controller.listGeofences
);

// Toggle geofence active status
router.post(
    "/toggle_geofence_status",
    checkAdmin,
    ValidateJoi(Schemas.geofence.toggleStatus),
    Geofence_controller.toggleGeofenceStatus
);

// Delete geofence by ID
router.delete(
    "/delete_geofence/:id",
    checkAdmin,
    ValidateJoi(Schemas.geofence.delete, "params"),
    Geofence_controller.deleteGeofence
);
router.post("/deviceList", checkAdmin, Device_controller.listDevices);
module.exports = router;

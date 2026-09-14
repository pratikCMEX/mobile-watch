import express from "express";
import { checkToken, checkAdmin } from "../config/jwt";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Device_controller from "../controllers/admin/Device_controller";
import Geofence_controller from "../controllers/admin/Geofence_controller";
import Snapshot_controller from "../controllers/admin/Snapshot_controller";
import Monitor_controller from "../controllers/admin/Monitor_controller";
import Health_controller from "../controllers/admin/Health_controller";
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
router.post("/deviceList", checkAdmin, ValidateJoi(Schemas.listDevices), Device_controller.listDevices);
router.post("/get_all_snapshots", checkAdmin, ValidateJoi(Schemas.getAllSnapshots), Snapshot_controller.getAllSnapshots);
router.post("/get_device_location", checkAdmin, ValidateJoi(Schemas.getDeviceLocation), Monitor_controller.getDeviceLocation);
router.get("/get_all_imei", checkAdmin, Device_controller.getAllDeviceImei);
router.delete("/delete_snapshot/:id", checkAdmin, Snapshot_controller.deleteSnapshot);
router.post("/get_all_health", checkAdmin, ValidateJoi(Schemas.getAllHealthMetrics), Health_controller.getAllHealthMetrics);
router.delete("/delete_health_metric/:id", checkAdmin, ValidateJoi(Schemas.deleteHealthMetric, "params"), Health_controller.deleteHealthMetric);
module.exports = router;

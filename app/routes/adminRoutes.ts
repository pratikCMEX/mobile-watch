import express from "express";
import { checkToken, checkAdmin } from "../config/jwt";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Device_controller from "../controllers/admin/Device_controller";
import Geofence_controller from "../controllers/admin/Geofence_controller";
import Snapshot_controller from "../controllers/admin/Snapshot_controller";
import Monitor_controller from "../controllers/admin/Monitor_controller";
import Health_controller from "../controllers/admin/Health_controller";
import User_controller from "../controllers/admin/User_controller";
import Dashboard_controller from "../controllers/admin/Dashboard_controller";
import Admin_Auth_controller from "../controllers/admin/Auth_controller";
import AppUpdate_controller from "../controllers/admin/AppUpdate_controller";
const router = express.Router();

// Dashboard stats
router.get("/dashboard_stats", checkAdmin, Dashboard_controller.getDashboardStats);

router.post(
  "/login",
  ValidateJoi(Schemas.adminLogin),
  Admin_Auth_controller.adminLogin
);

router.post(
  "/update_password",
  checkAdmin,
  ValidateJoi(Schemas.adminUpdatePassword),
  Admin_Auth_controller.updatePassword
);

router.post("/logout", checkAdmin, Admin_Auth_controller.logout);

// Create geofence
router.post(
  "/create_geofence",
  checkAdmin,
  ValidateJoi(Schemas.geofence.create),
  Geofence_controller.createGeofence
);

// List geofences with pagination/filter
router.post(
  "/list_geofence",
  checkAdmin,
  ValidateJoi(Schemas.geofence.list),
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
  "/delete_geofence",
  checkAdmin,
  ValidateJoi(Schemas.geofence.delete, "params"),
  Geofence_controller.deleteGeofence
);

router.post(
  "/deviceList",
  checkAdmin,
  ValidateJoi(Schemas.listDevices),
  Device_controller.listDevices
);
router.post(
  "/get_all_snapshots",
  checkAdmin,
  ValidateJoi(Schemas.getAllSnapshots),
  Snapshot_controller.getAllSnapshots
);
router.post(
  "/get_device_location",
  checkAdmin,
  ValidateJoi(Schemas.getDeviceLocation),
  Monitor_controller.getDeviceLocation
);
router.get("/get_all_imei", checkAdmin, Device_controller.getAllDeviceImei);
router.delete(
  "/delete_snapshot",
  checkAdmin,
  Snapshot_controller.deleteSnapshot
);
router.post(
  "/delete_multiple_snapshots",
  checkAdmin,
  ValidateJoi(Schemas.deleteMultipleSnapshots),
  Snapshot_controller.deleteMultipleSnapshots
);
router.post(
  "/get_all_health",
  checkAdmin,
  ValidateJoi(Schemas.getAllHealthMetrics),
  Health_controller.getAllHealthMetrics
);
router.delete(
  "/delete_health_metric/:id",
  checkAdmin,
  ValidateJoi(Schemas.deleteHealthMetric, "params"),
  Health_controller.deleteHealthMetric
);
router.post(
  "/delete_multiple_health_metrics",
  checkAdmin,
  ValidateJoi(Schemas.deleteMultipleHealthMetrics),
  Health_controller.deleteMultipleHealthMetrics
);
router.post(
  "/delete_multiple_devices",
  checkAdmin,
  ValidateJoi(Schemas.deleteMultipleDevices),
  Device_controller.deleteMultipleDevices
);
router.post(
  "/assign_device_to_user",
  checkAdmin,
  ValidateJoi(Schemas.assignDeviceToUser),
  Device_controller.assignDeviceToUser
);
// router.post("/delete_multiple", checkAdmin, ValidateJoi(Schemas.deleteMultipleItems), Delete_controller.deleteMultipleItems);

// User management routes
router.post(
  "/create_user",
  checkAdmin,
  ValidateJoi(Schemas.admin.createUser),
  User_controller.createUser
);
router.post(
  "/update_user",
  checkAdmin,
  ValidateJoi(Schemas.admin.updateUser),
  User_controller.updateUser
);
router.post(
  "/all_users",
  checkAdmin,
  ValidateJoi(Schemas.admin.allUsers),
  User_controller.allUsers
);
router.post(
  "/get_user_detail",
  checkAdmin,
  ValidateJoi(Schemas.admin.getUserDetail),
  User_controller.getUserDetail
);
router.delete(
  "/delete_user",
  checkAdmin,
  ValidateJoi(Schemas.admin.deleteUser),
  User_controller.deleteUser
);
router.get("/get_current_admin", checkAdmin, User_controller.getCurrentAdmin);

router.post(
  "/create_app_update",
  checkAdmin,
  ValidateJoi(Schemas.appUpdate.create),
  AppUpdate_controller.createAppUpdate
);
router.post(
  "/list_app_updates",
  checkAdmin,
  ValidateJoi(Schemas.appUpdate.list),
  AppUpdate_controller.listAppUpdates
);
router.post(
  "/update_app_update",
  checkAdmin,
  ValidateJoi(Schemas.appUpdate.update),
  AppUpdate_controller.updateAppUpdate
);
router.post(
  "/get_app_update",
  checkAdmin,
  ValidateJoi(Schemas.appUpdate.delete),
  AppUpdate_controller.getAppUpdate
);
router.delete(
  "/delete_app_update",
  checkAdmin,
  ValidateJoi(Schemas.appUpdate.delete),
  AppUpdate_controller.deleteAppUpdate
);

module.exports = router;

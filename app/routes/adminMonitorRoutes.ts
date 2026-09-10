import express from "express";
import { checkAdmin } from "../config/jwt";
import Monitor_controller from "../controllers/admin/Monitor_controller";

const router = express.Router();

// Get device location by IMEI
router.post("/get_device_location", checkAdmin, Monitor_controller.getDeviceLocation);

module.exports = router;

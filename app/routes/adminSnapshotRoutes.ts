import express from "express";
import { checkAdmin } from "../config/jwt";
import Snapshot_controller from "../controllers/admin/Snapshot_controller";

const router = express.Router();

// Get all snapshots with pagination (also supports search by id or imei in body)
router.post("/get_all_snapshots", checkAdmin, Snapshot_controller.getAllSnapshots);

module.exports = router;

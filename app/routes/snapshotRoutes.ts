import express from "express";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import Snapshot_controller from "../controllers/user/Snapshot_controller";
import { checkToken } from "../config/jwt";
import { uploadSnapshot } from "../middleware/Multer";

const router = express.Router();

router.post(
  "/add_snapshot",
  uploadSnapshot.fields([{ name: "image", maxCount: 1 }]),
  checkToken,
  ValidateJoi(Schemas.snapshot.add),
  Snapshot_controller.AddSnapshot
);

router.post(
  "/list_snapshots",
  checkToken,
  ValidateJoi(Schemas.snapshot.list),
  Snapshot_controller.ListSnapshots
);

router.post(
  "/get_snapshots_by_serial",
  checkToken,
  Snapshot_controller.GetSnapshotsBySerialNumber
);

router.delete(
  "/delete_snapshot/:id",
  checkToken,
  Snapshot_controller.deleteSnapshot
);
module.exports = router;

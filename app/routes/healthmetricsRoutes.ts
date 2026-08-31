import express from "express";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import Healthmetrics_controller from "../controllers/user/Healthmetrics_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post(
  "/add_metrics",
  ValidateJoi(Schemas.healthMetric.add),
  Healthmetrics_controller.AddMetrics
);

router.post(
  "/get_analytics",
  ValidateJoi(Schemas.healthMetric.analytics),
  Healthmetrics_controller.getAnalytics
);

router.get(
  "/health_overview/:device_id",
  checkToken,
  Healthmetrics_controller.getHealthOverview
);

module.exports = router;

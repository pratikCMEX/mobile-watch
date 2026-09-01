import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import SceneMode_controller from "../controllers/user/SceneMode_controller";

const router = express.Router();

/**
 * Scene Mode Routes
 *
 * Base URL: /api/scene_mode
 */

// Update scene mode - Send command to device
router.post(
  "/update",
  checkToken,
  ValidateJoi(Schemas.sceneMode.update),
  SceneMode_controller.updateSceneMode
);

// Get scene mode status for a device
router.get(
  "/status/:device_id",
  checkToken,
  SceneMode_controller.getSceneModeStatus
);

// Get available scene modes
router.get("/list", checkToken, SceneMode_controller.listSceneModes);

module.exports = router;

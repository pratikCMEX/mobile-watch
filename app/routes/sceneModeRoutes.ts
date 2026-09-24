import express from "express";
import { checkToken } from "../config/jwt";
import { ValidateJoi, Schemas } from "../middleware/Joi";
import SceneMode_controller from "../controllers/user/SceneMode_controller";

const router = express.Router();

router.post(
  "/scene_mode_update",
  checkToken,
  ValidateJoi(Schemas.sceneMode.update),
  SceneMode_controller.updateSceneMode
);

router.get(
  "/status/:serial_number",
  checkToken,
  SceneMode_controller.getSceneModeStatus
);

router.get("/list", checkToken, SceneMode_controller.listSceneModes);

module.exports = router;

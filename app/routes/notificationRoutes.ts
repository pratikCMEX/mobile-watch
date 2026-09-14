import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Notification_controller from "../controllers/user/Notification_controller";
import { checkToken } from "../config/jwt";

const router = express.Router();

router.post(
  "/list_notifications",
  checkToken,
  ValidateJoi(Schemas.notification.list),
  Notification_controller.listNotifications
);

module.exports = router;

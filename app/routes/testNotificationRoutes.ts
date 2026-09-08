import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import TestNotification_controller from "../controllers/user/TestNotification_controller";

const router = express.Router();

router.post(
  "/send_test_notification",
  ValidateJoi(Schemas.testNotification.send),
  TestNotification_controller.sendTestNotification
);

module.exports = router;

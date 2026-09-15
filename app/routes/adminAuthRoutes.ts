import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Admin_Auth_controller from "../controllers/admin/Auth_controller";
import { checkAdmin } from "../config/jwt";

const router = express.Router();

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

module.exports = router;
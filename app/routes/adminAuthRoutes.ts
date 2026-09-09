import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Admin_Auth_controller from "../controllers/admin/Auth_controller";

const router = express.Router();

router.post(
  "/login",
  ValidateJoi(Schemas.adminLogin),
  Admin_Auth_controller.adminLogin
);

module.exports = router;

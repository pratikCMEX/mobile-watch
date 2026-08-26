import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Auth_controller from "../controllers/user/Auth_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post("/user_login", ValidateJoi(Schemas.login), Auth_controller.login);

module.exports = router;

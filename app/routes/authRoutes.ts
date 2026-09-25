import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Auth_controller from "../controllers/user/Auth_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post("/user_login", ValidateJoi(Schemas.login), Auth_controller.login);

router.post(
  "/user_register",
  ValidateJoi(Schemas.auth.createUser),
  Auth_controller.createUser
);

router.delete("/delete_account", checkToken, Auth_controller.deleteAccount);

router.post("/logout", checkToken, Auth_controller.logout);

router.post(
  "/forgotPassword",
  ValidateJoi(Schemas.forgotPassword),
  Auth_controller.forgotPassword
);
router.post(
  "/verifyResetToken",
  ValidateJoi(Schemas.verifyResetToken),
  Auth_controller.verifyResetToken
);
router.post(
  "/updatePassword",
  ValidateJoi(Schemas.updatePassword),
  Auth_controller.updatePassword
);
router.post(
  "/update_profile",
  uploadProfile.single("profile_image"),
  checkToken,
  ValidateJoi(Schemas.auth.updateProfile),
  Auth_controller.updateProfile
);

router.get("/get_profile", checkToken, Auth_controller.getProfile);

module.exports = router;

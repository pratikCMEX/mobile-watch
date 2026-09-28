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

/* ── Forgot password (OTP flow) ──
   1. /forgotPassword  — emails a 6 digit OTP
   2. /verifyOtp       — verifies the OTP, returns a short lived reset token
   3. /changePassword  — consumes the reset token, sets the new password
*/
router.post(
  "/forgotPassword",
  ValidateJoi(Schemas.forgotPassword),
  Auth_controller.forgotPassword
);
router.post(
  "/verifyOtp",
  ValidateJoi(Schemas.verifyOtp),
  Auth_controller.verifyOtp
);
router.post(
  "/changePassword",
  ValidateJoi(Schemas.changePassword),
  Auth_controller.changePassword
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

import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Auth_controller from "../controllers/user/Auth_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post("/user_login", ValidateJoi(Schemas.login), Auth_controller.login);

// Logout — invalidates the current session by clearing the stored token
router.post("/logout", checkToken, Auth_controller.logout);

// Update authenticated user's profile (name, email, phone, password, profile image)
// Uses multipart/form-data when uploading a profile image; the "profile_image"
// field carries the file and text fields (name, email, etc.) travel as form fields.
router.post(
  "/update_profile",
  uploadProfile.single("profile_image"),
  checkToken,
  ValidateJoi(Schemas.auth.updateProfile),
  Auth_controller.updateProfile
);

module.exports = router;

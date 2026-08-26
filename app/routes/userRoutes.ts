import express from "express";
import { Schemas, ValidateJoi } from "../middleware/Joi";
import Admin_User_controller from "../controllers/admin/User_controller";
import { checkToken } from "../config/jwt";
import { uploadProfile } from "../middleware/Multer";

const router = express.Router();

router.post(
  "/create_user",
  ValidateJoi(Schemas.user.create),
  Admin_User_controller.createUser
);
router.post(
  "/all_users",
  ValidateJoi(Schemas.admin.allUsers),
  Admin_User_controller.allUsers
);
router.post(
  "/update_user",
  ValidateJoi(Schemas.user.update),
  Admin_User_controller.updateUser
);

router.delete(
  "/delete_user/:id",
  ValidateJoi(Schemas.admin.deleteUser, "params"),
  Admin_User_controller.deleteUser
);
router.get(
  "/get_user_detail/:id",
  ValidateJoi(Schemas.admin.getUserDetail, "params"),
  Admin_User_controller.getUserDetail
);
module.exports = router;

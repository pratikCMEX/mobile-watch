"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Joi_1 = require("../middleware/Joi");
const User_controller_1 = __importDefault(require("../controllers/admin/User_controller"));
const router = express_1.default.Router();
router.post("/create_user", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.user.create), User_controller_1.default.createUser);
router.post("/all_users", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.admin.allUsers), User_controller_1.default.allUsers);
router.post("/update_user", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.user.update), User_controller_1.default.updateUser);
router.delete("/delete_user/:id", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.admin.deleteUser, "params"), User_controller_1.default.deleteUser);
router.get("/get_user_detail/:id", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.admin.getUserDetail, "params"), User_controller_1.default.getUserDetail);
module.exports = router;

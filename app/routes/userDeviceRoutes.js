"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jwt_1 = require("../config/jwt");
const Joi_1 = require("../middleware/Joi");
const Device_controller_1 = __importDefault(require("../controllers/user/Device_controller"));
const Family_controller_1 = __importDefault(require("../controllers/user/Family_controller"));
const Notification_controller_1 = __importDefault(require("../controllers/user/Notification_controller"));
const router = express_1.default.Router();
router.post("/update_device_settings", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.deviceSetting.update), Device_controller_1.default.updateDeviceSettings);
router.post("/add_family_member", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.familyMember.create), Family_controller_1.default.addFamilyMember);
router.post("/list_family_members", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.familyMember.list), Family_controller_1.default.listFamilyMembers);
router.delete("/delete_family_member/:id", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.familyMember.delete, "params"), Family_controller_1.default.deleteFamilyMember);
router.post("/list_notifications", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.notification.list), Notification_controller_1.default.listNotifications);
module.exports = router;

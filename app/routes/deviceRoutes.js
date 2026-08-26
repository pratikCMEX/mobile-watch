"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Joi_1 = require("../middleware/Joi");
const Device_controller_1 = __importDefault(require("../controllers/admin/Device_controller"));
const jwt_1 = require("../config/jwt");
const Multer_1 = require("../middleware/Multer");
const router = express_1.default.Router();
router.post("/create_device", Multer_1.uploadProfile.fields([{ name: "profile_image", maxCount: 1 }]), jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.device.create), Device_controller_1.default.createDevice);
router.post("/update_device", Multer_1.uploadProfile.fields([{ name: "profile_image", maxCount: 1 }]), jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.device.update), Device_controller_1.default.updateDevice);
router.delete("/delete_device/:id", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.device.delete, "params"), Device_controller_1.default.deleteDevice);
router.get("/get_device_settings", jwt_1.checkToken, (0, Joi_1.ValidateJoi)(Joi_1.Schemas.device.getSettings, "query"), Device_controller_1.default.getDeviceSettings);
module.exports = router;

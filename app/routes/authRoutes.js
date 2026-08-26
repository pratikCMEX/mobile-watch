"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Joi_1 = require("../middleware/Joi");
const Auth_controller_1 = __importDefault(require("../controllers/user/Auth_controller"));
const router = express_1.default.Router();
router.post("/user_login", (0, Joi_1.ValidateJoi)(Joi_1.Schemas.login), Auth_controller_1.default.login);
module.exports = router;

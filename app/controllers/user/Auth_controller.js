"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const models_1 = __importDefault(require("../../models"));
const Response_1 = require("../../library/Response");
const bcrypt_1 = __importDefault(require("bcrypt"));
const Helper_1 = require("../../helper/Helper");
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return (0, Response_1.errorMessage)(res, "Email and password are required", 400);
        }
        const user = yield models_1.default.User.findOne({ where: { email } });
        if (!user) {
            return (0, Response_1.errorMessage)(res, "Invalid email or password", 401);
        }
        const isMatch = yield bcrypt_1.default.compare(password, user.password);
        if (!isMatch) {
            return (0, Response_1.errorMessage)(res, "Invalid email or password", 401);
        }
        // if (user.status && user.status !== "active") {
        //   return errorMessage(res, `Account is ${user.status}`, 403);
        // }
        const token = yield (0, Helper_1.generateAuthToken)(user);
        user.session_token = token;
        yield user.save();
        const userData = user.toJSON();
        delete userData.password;
        return (0, Response_1.successMessage)(res, "Login successful", {
            token,
            user: userData,
        });
    }
    catch (error) {
        console.error("login error:", error);
        return (0, Response_1.errorMessage)(res, "Error logging in");
    }
});
exports.default = {
    login,
};

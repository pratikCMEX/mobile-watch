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
exports.checkOptionalToken = exports.checkAdmin = exports.checkToken = void 0;
const Response_1 = require("../library/Response");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const models_1 = __importDefault(require("../models"));
dotenv_1.default.config();
const JWT_SECRET = process.env.JWT_ENCRYPTION || "";
// ─── Reusable token extractor ──────────────────────────────────
const extractToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return null;
    if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
        return authHeader.slice(7);
    }
    return authHeader;
};
// ─── Reusable token verifier ───────────────────────────────────
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
};
// ─── Check User (any logged in user) ──────────────────────────
const checkToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const token = extractToken(req);
        if (!token)
            return (0, Response_1.errorMessage)(res, "Auth token is not supplied");
        const decoded = verifyToken(token);
        const userId = (_a = decoded === null || decoded === void 0 ? void 0 : decoded.payload) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            return (0, Response_1.errorMessage)(res, "Invalid token payload");
        }
        console.log("userId-sasasasasasas", userId);
        const user = yield models_1.default.User.findOne({
            where: { id: userId },
            attributes: ["id", "session_token"],
        });
        if (!user) {
            return (0, Response_1.errorMessage)(res, "User not found");
        }
        // if (user.status !== "1") {
        //   return errorMessage(res, "Account is inactive or blocked");
        // }
        // console.log(token);
        // console.log(user.session_token);
        if (user.session_token !== token) {
            return res.status(401).json({
                success: false,
                message: "Session expired. Please login again.",
            });
        }
        req.userinfo = decoded;
        next();
    }
    catch (error) {
        return (0, Response_1.errorMessage)(res, "Invalid or expired token");
    }
});
exports.checkToken = checkToken;
// ─── Check Admin ───────────────────────────────────────────────
const checkAdmin = (req, res, next) => {
    var _a;
    try {
        const token = extractToken(req);
        if (!token)
            return (0, Response_1.errorMessage)(res, "Auth token is not supplied");
        const decoded = verifyToken(token);
        const role = (_a = decoded === null || decoded === void 0 ? void 0 : decoded.payload) === null || _a === void 0 ? void 0 : _a.role;
        console.log("role   ", role);
        if (!role) {
            return res
                .status(403)
                .json({ success: false, message: "No role found in token" });
        }
        if (role !== "admin") {
            return res
                .status(403)
                .json({ success: false, message: "Access denied. Admins only" });
        }
        req.userinfo = decoded;
        next();
    }
    catch (error) {
        return (0, Response_1.errorMessage)(res, "Invalid or expired token");
    }
};
exports.checkAdmin = checkAdmin;
// ─── Optional Token (no error if missing) ─────────────────────
const checkOptionalToken = (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token)
            return next();
        const decoded = verifyToken(token);
        req.userinfo = decoded;
        next();
    }
    catch (error) {
        next();
    }
};
exports.checkOptionalToken = checkOptionalToken;

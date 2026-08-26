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
const sequelize_1 = require("sequelize");
const bcrypt_1 = __importDefault(require("bcrypt"));
function createUser(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, email, password, phone_number, country_code } = req.body;
            if (!name || !email || !password) {
                return (0, Response_1.errorMessage)(res, "Name, email and password are required");
            }
            const existing = yield models_1.default.User.findOne({ where: { email } });
            if (existing) {
                return (0, Response_1.errorMessage)(res, "A user with this email already exists");
            }
            const password_hash = yield bcrypt_1.default.hash(password, 10);
            const user = yield models_1.default.User.create({
                name,
                email,
                password: password_hash,
                phone_number,
                country_code,
            });
            return (0, Response_1.successMessage)(res, "User created successfully", user);
        }
        catch (err) {
            console.error("createUser error:", err);
            return (0, Response_1.errorMessage)(res, "Error creating user");
        }
    });
}
const allUsers = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search = "", page = 1, sorting = "DESC", limit = 20,
        // status = "",
         } = req.body;
        const offset = (Number(page) - 1) * Number(limit);
        const whereCondition = {};
        if (search) {
            whereCondition[sequelize_1.Op.or] = [
                { name: { [sequelize_1.Op.iLike]: `%${search}%` } },
                { email: { [sequelize_1.Op.iLike]: `%${search}%` } },
            ];
        }
        // if (status != "") {
        //   whereCondition.status = status;
        // }
        const { count, rows } = yield models_1.default.User.findAndCountAll({
            where: whereCondition,
            attributes: [
                "id",
                "name",
                "email",
                "country_code",
                "phone_number",
                "createdAt",
            ],
            order: [["createdAt", sorting]],
            limit: Number(limit),
            offset,
        });
        return (0, Response_1.successPagination)(res, "Users fetched successfully", rows, {
            page,
            limit,
            total: count,
        });
    }
    catch (error) {
        // console.error("SQL Error:", error);
        return (0, Response_1.errorMessage)(res, "Error fetching users");
    }
});
function updateUser(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id, name, email, password, phone_number, country_code } = req.body;
            if (!name || !email || !password) {
                return (0, Response_1.errorMessage)(res, "Name, email and password are required");
            }
            const existing = yield models_1.default.User.findOne({
                where: { email, id: { [sequelize_1.Op.ne]: id } },
            });
            if (existing) {
                return (0, Response_1.errorMessage)(res, "A user with this email already exists");
            }
            const password_hash = yield bcrypt_1.default.hash(password, 10);
            const user = yield models_1.default.User.update({
                name,
                email,
                password: password_hash,
                phone_number,
                country_code,
            }, { where: { id } });
            if (!user) {
                return (0, Response_1.errorMessage)(res, "User not found");
            }
            const updatedUser = yield models_1.default.User.findOne({ where: { id } });
            return (0, Response_1.successMessage)(res, "User updated successfully", updatedUser);
        }
        catch (err) {
            console.error("updateUser error:", err);
            return (0, Response_1.errorMessage)(res, "Error updating user");
        }
    });
}
function deleteUser(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const user = yield models_1.default.User.findOne({ where: { id } });
            if (!user) {
                return (0, Response_1.errorMessage)(res, "User not found");
            }
            yield models_1.default.User.destroy({ where: { id } });
            return (0, Response_1.successMessage)(res, "User deleted successfully");
        }
        catch (err) {
            console.error("deleteUser error:", err);
            return (0, Response_1.errorMessage)(res, "Error deleting user");
        }
    });
}
function getUserDetail(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const user = yield models_1.default.User.findOne({ where: { id } });
            if (!user) {
                return (0, Response_1.errorMessage)(res, "User not found");
            }
            return (0, Response_1.successMessage)(res, "User fetched successfully", user);
        }
        catch (err) {
            console.error("getUserDetail error:", err);
            return (0, Response_1.errorMessage)(res, "Error fetching user");
        }
    });
}
exports.default = {
    createUser,
    updateUser,
    deleteUser,
    allUsers,
    getUserDetail,
};

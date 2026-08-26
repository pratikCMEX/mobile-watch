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
function addFamilyMember(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, mobile_no, device_id } = req.body;
            if (!name || !mobile_no || !device_id) {
                return (0, Response_1.errorMessage)(res, "name, mobile_no and device_id are required");
            }
            const familyMember = yield models_1.default.FamilyMember.create({
                name,
                mobile_no,
                device_id,
            });
            return (0, Response_1.successMessage)(res, "Family member added successfully", familyMember);
        }
        catch (err) {
            console.error("addFamilyMember error:", err);
            return (0, Response_1.errorMessage)(res, "Error adding family member");
        }
    });
}
function listFamilyMembers(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { search = "", page = 1, sorting = "DESC", limit = 10, device_id = "", } = req.body;
            const offset = (Number(page) - 1) * Number(limit);
            const whereCondition = {};
            if (search) {
                whereCondition[sequelize_1.Op.or] = [
                    { name: { [sequelize_1.Op.iLike]: `%${search}%` } },
                    { mobile_no: { [sequelize_1.Op.iLike]: `%${search}%` } },
                ];
            }
            if (device_id != "") {
                whereCondition.device_id = device_id;
            }
            const { count, rows } = yield models_1.default.FamilyMember.findAndCountAll({
                where: whereCondition,
                attributes: ["id", "name", "mobile_no", "device_id", "createdAt"],
                order: [["createdAt", sorting]],
                limit: Number(limit),
                offset,
            });
            return (0, Response_1.successPagination)(res, "Family members fetched successfully", rows, {
                page,
                limit,
                total: count,
            });
        }
        catch (error) {
            console.error("listFamilyMembers error:", error);
            return (0, Response_1.errorMessage)(res, "Error fetching family members");
        }
    });
}
function deleteFamilyMember(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const familyMember = yield models_1.default.FamilyMember.findOne({
                where: { id },
            });
            if (!familyMember) {
                return (0, Response_1.errorMessage)(res, "Family member not found");
            }
            yield models_1.default.FamilyMember.destroy({
                where: { id },
            });
            return (0, Response_1.successMessage)(res, "Family member deleted successfully");
        }
        catch (err) {
            console.error("deleteFamilyMember error:", err);
            return (0, Response_1.errorMessage)(res, "Error deleting family member");
        }
    });
}
exports.default = {
    addFamilyMember,
    listFamilyMembers,
    deleteFamilyMember,
};

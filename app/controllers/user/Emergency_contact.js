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
exports.getEmergencyContact = exports.allEmergencyContact = void 0;
exports.createEmergencyContact = createEmergencyContact;
exports.updateEmergencyContact = updateEmergencyContact;
exports.deleteEmergencyContact = deleteEmergencyContact;
const models_1 = __importDefault(require("../../models"));
const Response_1 = require("../../library/Response");
const sequelize_1 = require("sequelize");
function createEmergencyContact(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, country_code, phone_number, device_id } = req.body;
            const emergency_contact = yield models_1.default.EmergencyContact.create({
                name,
                country_code,
                phone_number,
                device_id,
            });
            return (0, Response_1.successMessage)(res, "Emergency contact created successfully", emergency_contact);
        }
        catch (err) {
            console.error("createEmergencyContact error:", err);
            return (0, Response_1.errorMessage)(res, "Error creating emergency contact");
        }
    });
}
function updateEmergencyContact(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id, name, country_code, phone_number, device_id } = req.body;
            const emergency_contact = yield models_1.default.EmergencyContact.update({
                name,
                country_code,
                phone_number,
                device_id,
            }, { where: { id } });
            return (0, Response_1.successMessage)(res, "Emergency contact updated successfully", emergency_contact);
        }
        catch (err) {
            console.error("updateEmergencyContact error:", err);
            return (0, Response_1.errorMessage)(res, "Error updating emergency contact");
        }
    });
}
function deleteEmergencyContact(req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const emergency_contact = yield models_1.default.EmergencyContact.destroy({
                where: { id },
            });
            return (0, Response_1.successMessage)(res, "Emergency contact deleted successfully", emergency_contact);
        }
        catch (err) {
            console.error("deleteEmergencyContact error:", err);
            return (0, Response_1.errorMessage)(res, "Error deleting emergency contact");
        }
    });
}
const allEmergencyContact = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search = "", page = 1, sorting = "DESC", limit = 10, device_id = "",
        // status = "",
         } = req.body;
        const offset = (Number(page) - 1) * Number(limit);
        const whereCondition = {};
        if (search) {
            whereCondition[sequelize_1.Op.or] = [
                { name: { [sequelize_1.Op.iLike]: `%${search}%` } },
                { phone_number: { [sequelize_1.Op.iLike]: `%${search}%` } },
            ];
        }
        if (device_id != "") {
            whereCondition.device_id = device_id;
        }
        const { count, rows } = yield models_1.default.EmergencyContact.findAndCountAll({
            where: whereCondition,
            attributes: ["id", "name", "country_code", "phone_number", "createdAt"],
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
exports.allEmergencyContact = allEmergencyContact;
const getEmergencyContact = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const emergency_contact = yield models_1.default.EmergencyContact.findOne({
            where: { id },
        });
        if (!emergency_contact) {
            return (0, Response_1.errorMessage)(res, "Emergency contact not found");
        }
        return (0, Response_1.successMessage)(res, "Emergency contact fetched successfully", emergency_contact);
    }
    catch (err) {
        console.error("getEmergencyContact error:", err);
        return (0, Response_1.errorMessage)(res, "Error fetching emergency contact");
    }
});
exports.getEmergencyContact = getEmergencyContact;

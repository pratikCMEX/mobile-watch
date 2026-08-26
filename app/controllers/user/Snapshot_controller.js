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
const AddSnapshot = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { device_id } = req.body;
            if (!device_id) {
                return (0, Response_1.errorMessage)(res, "device_id is required");
            }
            const device = yield models_1.default.Device.findByPk(device_id);
            if (!device) {
                return (0, Response_1.errorMessage)(res, "Device not found");
            }
            const files = req.files;
            const image = (_c = (_b = (_a = files === null || files === void 0 ? void 0 : files.image) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.filename) !== null && _c !== void 0 ? _c : null;
            const snapshot = yield models_1.default.Snapshot.create({
                device_id: device_id,
                image_url: image !== null && image !== void 0 ? image : null,
            });
            return (0, Response_1.successMessage)(res, "Snapshot added successfully", snapshot);
        }
        catch (err) {
            console.error("AddSnapshot error:", err);
            return (0, Response_1.errorMessage)(res, "Error adding snapshot");
        }
    });
};
const ListSnapshots = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { device_id, page = 1, limit = 10, sorting = "DESC", start_date, end_date, } = req.body;
        if (!device_id) {
            return (0, Response_1.errorMessage)(res, "device_id is required");
        }
        const device = yield models_1.default.Device.findByPk(device_id);
        if (!device) {
            return (0, Response_1.errorMessage)(res, "Device not found");
        }
        const offset = (Number(page) - 1) * Number(limit);
        const whereCondition = { device_id };
        if (start_date && end_date) {
            whereCondition.createdAt = {
                [sequelize_1.Op.between]: [new Date(start_date), new Date(end_date)],
            };
        }
        else if (start_date) {
            whereCondition.createdAt = { [sequelize_1.Op.gte]: new Date(start_date) };
        }
        else if (end_date) {
            whereCondition.createdAt = { [sequelize_1.Op.lte]: new Date(end_date) };
        }
        const { count, rows } = yield models_1.default.Snapshot.findAndCountAll({
            where: whereCondition,
            attributes: ["id", "device_id", "image_url", "createdAt", "updatedAt"],
            order: [["createdAt", sorting.toUpperCase() === "ASC" ? "ASC" : "DESC"]],
            limit: Number(limit),
            offset,
        });
        return (0, Response_1.successPagination)(res, "Snapshots fetched successfully", rows, {
            page: Number(page),
            limit: Number(limit),
            total: count,
        });
    }
    catch (err) {
        console.error("ListSnapshots error:", err);
        return (0, Response_1.errorMessage)(res, "Error fetching snapshots");
    }
});
exports.default = {
    AddSnapshot,
    ListSnapshots,
};

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
const saveGeofence = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id, device_id, name, latitude, longitude, radius_meters } = req.body;
            if (id) {
                const geofence = yield models_1.default.Geofence.findByPk(id);
                if (!geofence) {
                    return (0, Response_1.errorMessage)(res, "Geofence not found", 404);
                }
                if (device_id && device_id !== geofence.device_id) {
                    const device = yield models_1.default.Device.findByPk(device_id);
                    if (!device) {
                        return (0, Response_1.errorMessage)(res, "device_id does not match any existing device");
                    }
                    geofence.device_id = device_id;
                }
                if (name !== undefined)
                    geofence.name = name;
                if (latitude !== undefined)
                    geofence.latitude = latitude;
                if (longitude !== undefined)
                    geofence.longitude = longitude;
                if (radius_meters !== undefined)
                    geofence.radius_meters = radius_meters;
                yield geofence.save();
                return (0, Response_1.successMessage)(res, "Geofence updated successfully", geofence);
            }
            if (!device_id ||
                !name ||
                latitude === undefined ||
                longitude === undefined ||
                !radius_meters) {
                return (0, Response_1.errorMessage)(res, "device_id, name, latitude, longitude, and radius_meters are required");
            }
            const device = yield models_1.default.Device.findByPk(device_id);
            if (!device) {
                return (0, Response_1.errorMessage)(res, "device_id does not match any existing device");
            }
            const geofence = yield models_1.default.Geofence.create({
                device_id,
                name,
                latitude,
                longitude,
                radius_meters,
                is_active: true,
            });
            return (0, Response_1.successMessage)(res, "Geofence created successfully", geofence);
        }
        catch (err) {
            console.error("saveGeofence error:", err);
            return (0, Response_1.errorMessage)(res, "Error saving geofence");
        }
    });
};
const listGeofences = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search = "", page = 1, sorting = "DESC", limit = 10, device_id = "",
        // is_active = "",
         } = req.body;
        if (device_id === "") {
            return (0, Response_1.errorMessage)(res, "device_id is required");
        }
        const offset = (Number(page) - 1) * Number(limit);
        const whereCondition = { device_id };
        if (search) {
            whereCondition.name = { [sequelize_1.Op.iLike]: `%${search}%` };
        }
        // if (is_active !== "") {
        //   whereCondition.is_active = is_active;
        // }
        const { count, rows } = yield models_1.default.Geofence.findAndCountAll({
            where: whereCondition,
            attributes: [
                "id",
                "device_id",
                "name",
                "latitude",
                "longitude",
                "radius_meters",
                "is_active",
                "createdAt",
            ],
            order: [["createdAt", sorting]],
            limit: Number(limit),
            offset,
        });
        return (0, Response_1.successPagination)(res, "Geofences fetched successfully", rows, {
            page,
            limit,
            total: count,
        });
    }
    catch (error) {
        console.error("listGeofences error:", error);
        return (0, Response_1.errorMessage)(res, "Error fetching geofences");
    }
});
const deleteGeofence = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const geofence = yield models_1.default.Geofence.findByPk(id);
            if (!geofence) {
                return (0, Response_1.errorMessage)(res, "Geofence not found", 404);
            }
            yield geofence.destroy(); // hard delete — no deletedAt column on this table
            return (0, Response_1.successMessage)(res, "Geofence deleted successfully", null);
        }
        catch (err) {
            console.error("deleteGeofence error:", err);
            return (0, Response_1.errorMessage)(res, "Error deleting geofence");
        }
    });
};
const toggleGeofenceStatus = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { is_active, id } = req.body;
            if (is_active === undefined) {
                return (0, Response_1.errorMessage)(res, "is_active is required");
            }
            const geofence = yield models_1.default.Geofence.findByPk(id);
            if (!geofence) {
                return (0, Response_1.errorMessage)(res, "Geofence not found", 404);
            }
            geofence.is_active = is_active;
            yield geofence.save();
            return (0, Response_1.successMessage)(res, "Geofence status updated successfully", geofence);
        }
        catch (err) {
            console.error("toggleGeofenceStatus error:", err);
            return (0, Response_1.errorMessage)(res, "Error updating geofence status");
        }
    });
};
exports.default = {
    saveGeofence,
    listGeofences,
    deleteGeofence,
    toggleGeofenceStatus,
};

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
const Helper_1 = require("../../helper/Helper");
const sequelize_1 = require("sequelize");
const createDevice = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { owner_id, imei, serial_number, device_name, email, country_code, phone_number, network_carrier, network_type, location_interval_minutes, height_cm, gender, age, weight_kg, } = req.body;
            if (!owner_id || !imei) {
                (0, Helper_1.unlinkUploadedFiles)(req);
                return (0, Response_1.errorMessage)(res, "owner_id and imei are required");
            }
            const owner = yield models_1.default.User.findByPk(owner_id);
            if (!owner) {
                (0, Helper_1.unlinkUploadedFiles)(req);
                return (0, Response_1.errorMessage)(res, "owner_id does not match any existing user");
            }
            const existing = yield models_1.default.Device.findOne({ where: { imei } });
            if (existing) {
                (0, Helper_1.unlinkUploadedFiles)(req);
                return (0, Response_1.errorMessage)(res, "A device with this imei already exists");
            }
            const files = req.files;
            const image = (_c = (_b = (_a = files === null || files === void 0 ? void 0 : files.profile_image) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.filename) !== null && _c !== void 0 ? _c : null;
            const device = yield models_1.default.Device.create({
                owner_id,
                imei,
                serial_number: serial_number !== null && serial_number !== void 0 ? serial_number : null,
                device_name: device_name !== null && device_name !== void 0 ? device_name : "Device",
                email: email !== null && email !== void 0 ? email : null,
                country_code: country_code !== null && country_code !== void 0 ? country_code : null,
                phone_number: phone_number !== null && phone_number !== void 0 ? phone_number : null,
                profile_image: image !== null && image !== void 0 ? image : null,
                network_carrier: network_carrier !== null && network_carrier !== void 0 ? network_carrier : null,
                network_type: network_type !== null && network_type !== void 0 ? network_type : null,
                location_interval_minutes: location_interval_minutes !== null && location_interval_minutes !== void 0 ? location_interval_minutes : 1,
                height_cm: height_cm !== null && height_cm !== void 0 ? height_cm : null,
                gender: gender !== null && gender !== void 0 ? gender : null,
                age: age !== null && age !== void 0 ? age : null,
                weight_kg: weight_kg !== null && weight_kg !== void 0 ? weight_kg : null,
                connection_status: "offline",
                signal_status: null,
                battery_percentage: null,
                is_online: false,
                last_updated_at: null,
            });
            return (0, Response_1.successMessage)(res, "Device created successfully", device);
        }
        catch (err) {
            console.error("createDevice error:", err);
            (0, Helper_1.unlinkUploadedFiles)(req);
            return (0, Response_1.errorMessage)(res, "Error creating device");
        }
    });
};
const updateDevice = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { id, owner_id, imei, serial_number, device_name, email, country_code, phone_number, network_carrier, network_type, location_interval_minutes, height_cm, gender, age, weight_kg, } = req.body;
            if (!id) {
                (0, Helper_1.unlinkUploadedFiles)(req);
                return (0, Response_1.errorMessage)(res, "id is required");
            }
            const device = yield models_1.default.Device.findByPk(id);
            if (!device) {
                (0, Helper_1.unlinkUploadedFiles)(req);
                return (0, Response_1.errorMessage)(res, "Device not found");
            }
            // if (owner_id && owner_id !== device.owner_id) {
            //   const owner = await db.User.findByPk(owner_id); // conditional query #2
            //   if (!owner) {
            //     unlinkUploadedFiles(req);
            //     return errorMessage(res, "owner_id does not match any existing user");
            //   }
            //   device.owner_id = owner_id;
            // }
            if (imei && imei !== device.imei) {
                const existing = yield models_1.default.Device.findOne({
                    where: { imei, id: { [sequelize_1.Op.ne]: id } },
                });
                if (existing) {
                    (0, Helper_1.unlinkUploadedFiles)(req);
                    return (0, Response_1.errorMessage)(res, "A device with this imei already exists");
                }
                device.imei = imei;
            }
            const files = req.files;
            const image = (_c = (_b = (_a = files === null || files === void 0 ? void 0 : files.profile_image) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.filename) !== null && _c !== void 0 ? _c : null;
            if (image) {
                (0, Helper_1.deleteFile)("profile", device.getDataValue("profile_image"));
                device.profile_image = image;
            }
            if (owner_id !== undefined)
                device.owner_id = owner_id;
            if (serial_number !== undefined)
                device.serial_number = serial_number;
            if (device_name !== undefined)
                device.device_name = device_name;
            if (email !== undefined)
                device.email = email;
            if (country_code !== undefined)
                device.country_code = country_code;
            if (phone_number !== undefined)
                device.phone_number = phone_number;
            if (network_carrier !== undefined)
                device.network_carrier = network_carrier;
            if (network_type !== undefined)
                device.network_type = network_type;
            if (location_interval_minutes !== undefined)
                device.location_interval_minutes = location_interval_minutes;
            if (height_cm !== undefined)
                device.height_cm = height_cm;
            if (gender !== undefined)
                device.gender = gender;
            if (age !== undefined)
                device.age = age;
            if (weight_kg !== undefined)
                device.weight_kg = weight_kg;
            yield device.save();
            return (0, Response_1.successMessage)(res, "Device updated successfully", device);
        }
        catch (err) {
            console.error("updateDevice error:", err);
            (0, Helper_1.unlinkUploadedFiles)(req);
            return (0, Response_1.errorMessage)(res, "Error updating device");
        }
    });
};
const deleteDevice = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const device = yield models_1.default.Device.findOne({ where: { id } });
            if (!device) {
                return (0, Response_1.errorMessage)(res, "Device not found");
            }
            (0, Helper_1.deleteFile)("profile", device.profile_image);
            yield models_1.default.Device.destroy({ where: { id } });
            return (0, Response_1.successMessage)(res, "Device deleted successfully");
        }
        catch (err) {
            console.error("deleteDevice error:", err);
            return (0, Response_1.errorMessage)(res, "Error deleting device");
        }
    });
};
const getDeviceSettings = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { device_id } = req.query;
            if (!device_id) {
                return (0, Response_1.errorMessage)(res, "device_id is required");
            }
            const settings = yield models_1.default.DeviceSetting.findOne({
                where: { device_id: device_id },
            });
            if (!settings) {
                return (0, Response_1.successMessage)(res, "No settings found, returning default values", {
                    sms_alert_enabled: "0",
                    take_off_device_alert: "0",
                    safe_mode: "0",
                    talking_clock: "0",
                    night_power_saving: "0",
                    volume: 0,
                    brightness: 0,
                    fall_down_alert_enabled: false,
                    fall_down_reminder_call: false,
                    fall_down_level: 0,
                });
            }
            return (0, Response_1.successMessage)(res, "Device settings fetched successfully", settings);
        }
        catch (err) {
            console.error("getDeviceSettings error:", err);
            return (0, Response_1.errorMessage)(res, "Error fetching device settings");
        }
    });
};
exports.default = {
    createDevice,
    updateDevice,
    deleteDevice,
    getDeviceSettings,
};

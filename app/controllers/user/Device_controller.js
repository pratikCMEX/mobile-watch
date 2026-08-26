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
const updateDeviceSettings = function (req, res, next) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { device_id, sms_alert_enabled, take_off_device_alert, safe_mode, talking_clock, night_power_saving, volume, brightness, fall_down_alert_enabled, fall_down_reminder_call, fall_down_level, } = req.body;
            if (!device_id) {
                return (0, Response_1.errorMessage)(res, "device_id is required");
            }
            const device = yield models_1.default.Device.findByPk(device_id);
            if (!device) {
                return (0, Response_1.errorMessage)(res, "Device not found");
            }
            let deviceSetting = yield models_1.default.DeviceSetting.findOne({
                where: { device_id },
            });
            if (!deviceSetting) {
                deviceSetting = yield models_1.default.DeviceSetting.create({
                    device_id,
                    sms_alert_enabled: sms_alert_enabled !== null && sms_alert_enabled !== void 0 ? sms_alert_enabled : "0",
                    take_off_device_alert: take_off_device_alert !== null && take_off_device_alert !== void 0 ? take_off_device_alert : "0",
                    safe_mode: safe_mode !== null && safe_mode !== void 0 ? safe_mode : "0",
                    talking_clock: talking_clock !== null && talking_clock !== void 0 ? talking_clock : "0",
                    night_power_saving: night_power_saving !== null && night_power_saving !== void 0 ? night_power_saving : "0",
                    volume: volume !== null && volume !== void 0 ? volume : 50,
                    brightness: brightness !== null && brightness !== void 0 ? brightness : 50,
                    fall_down_alert_enabled: fall_down_alert_enabled !== null && fall_down_alert_enabled !== void 0 ? fall_down_alert_enabled : true,
                    fall_down_reminder_call: fall_down_reminder_call !== null && fall_down_reminder_call !== void 0 ? fall_down_reminder_call : true,
                    fall_down_level: fall_down_level !== null && fall_down_level !== void 0 ? fall_down_level : 5,
                });
            }
            else {
                if (sms_alert_enabled !== undefined)
                    deviceSetting.sms_alert_enabled = sms_alert_enabled;
                if (take_off_device_alert !== undefined)
                    deviceSetting.take_off_device_alert = take_off_device_alert;
                if (safe_mode !== undefined)
                    deviceSetting.safe_mode = safe_mode;
                if (talking_clock !== undefined)
                    deviceSetting.talking_clock = talking_clock;
                if (night_power_saving !== undefined)
                    deviceSetting.night_power_saving = night_power_saving;
                if (volume !== undefined)
                    deviceSetting.volume = volume;
                if (brightness !== undefined)
                    deviceSetting.brightness = brightness;
                if (fall_down_alert_enabled !== undefined)
                    deviceSetting.fall_down_alert_enabled = fall_down_alert_enabled;
                if (fall_down_reminder_call !== undefined)
                    deviceSetting.fall_down_reminder_call = fall_down_reminder_call;
                if (fall_down_level !== undefined)
                    deviceSetting.fall_down_level = fall_down_level;
                yield deviceSetting.save();
            }
            return (0, Response_1.successMessage)(res, "Device settings updated successfully", deviceSetting);
        }
        catch (err) {
            console.error("updateDeviceSettings error:", err);
            return (0, Response_1.errorMessage)(res, "Error updating device settings");
        }
    });
};
exports.default = {
    updateDeviceSettings,
};

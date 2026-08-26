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
exports.Schemas = exports.ValidateJoi = void 0;
const joi_1 = __importDefault(require("joi"));
const Logging_1 = __importDefault(require("../library/Logging"));
const ValidateJoi = (schema, source = "body") => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const data = source === "body"
                ? req.body
                : source === "query"
                    ? req.query
                    : req.params;
            yield schema.validateAsync(data);
            next();
        }
        catch (error) {
            Logging_1.default.error(error);
            return res.status(422).json({ error });
        }
    });
};
exports.ValidateJoi = ValidateJoi;
exports.Schemas = {
    sendOtpSchema: joi_1.default.object({
        mobile_no: joi_1.default.string()
            .pattern(/^[0-9]{7,15}$/)
            .optional()
            .allow(""),
        country_code: joi_1.default.string().optional().allow(""),
        email: joi_1.default.string().email().optional().allow(""),
    }).or("mobile_no", "email"),
    adminLogin: joi_1.default.object({
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().required(),
    }),
    login: joi_1.default.object({
        email: joi_1.default.string().email().required(),
        password: joi_1.default.string().required(),
    }),
    user: {
        create: joi_1.default.object({
            name: joi_1.default.string().required(),
            email: joi_1.default.string().email().required(),
            password: joi_1.default.string().required(),
            country_code: joi_1.default.string().optional().allow(""),
            phone_number: joi_1.default.string().optional().allow(""),
        }),
        update: joi_1.default.object({
            id: joi_1.default.string().required(),
            name: joi_1.default.string().optional().allow(""),
            email: joi_1.default.string().email().optional().allow(""),
            password: joi_1.default.string().optional().allow(""),
            country_code: joi_1.default.string().optional().allow(""),
            phone_number: joi_1.default.string().optional().allow(""),
        }),
    },
    admin: {
        allUsers: joi_1.default.object({
            search: joi_1.default.string().optional().allow(""),
            page: joi_1.default.number().integer().min(1).optional().default(1),
            sorting: joi_1.default.string().valid("ASC", "DESC").optional().default("DESC"),
            limit: joi_1.default.number().integer().min(1).optional().default(20),
        }),
        deleteUser: joi_1.default.object({
            id: joi_1.default.string().required(),
        }),
        getUserDetail: joi_1.default.object({
            id: joi_1.default.string().required(),
        }),
    },
    device: {
        create: joi_1.default.object({
            owner_id: joi_1.default.string().required(),
            imei: joi_1.default.string().required(),
            serial_number: joi_1.default.string().optional().allow(null),
            device_name: joi_1.default.string().optional().allow(null),
            email: joi_1.default.string().email().optional().allow(null),
            country_code: joi_1.default.string().optional().allow(null),
            phone_number: joi_1.default.string().optional().allow(null),
            network_carrier: joi_1.default.string().optional().allow(null),
            network_type: joi_1.default.string().optional().allow(null),
            location_interval_minutes: joi_1.default.number()
                .integer()
                .min(1)
                .optional()
                .default(1),
            height_cm: joi_1.default.number().integer().optional().allow(null),
            gender: joi_1.default.string().optional().allow(null),
            age: joi_1.default.number().integer().optional().allow(null),
            weight_kg: joi_1.default.number().integer().optional().allow(null),
        }),
        update: joi_1.default.object({
            id: joi_1.default.string().required(),
            owner_id: joi_1.default.string().optional().allow(null),
            imei: joi_1.default.string().optional().allow(null),
            serial_number: joi_1.default.string().optional().allow(null),
            device_name: joi_1.default.string().optional().allow(null),
            email: joi_1.default.string().email().optional().allow(null),
            country_code: joi_1.default.string().optional().allow(null),
            phone_number: joi_1.default.string().optional().allow(null),
            network_carrier: joi_1.default.string().optional().allow(null),
            network_type: joi_1.default.string().optional().allow(null),
            location_interval_minutes: joi_1.default.number()
                .integer()
                .min(1)
                .optional()
                .allow(null),
            height_cm: joi_1.default.number().integer().optional().allow(null),
            gender: joi_1.default.string().optional().allow(null),
            age: joi_1.default.number().integer().optional().allow(null),
            weight_kg: joi_1.default.number().integer().optional().allow(null),
        }),
        delete: joi_1.default.object({
            id: joi_1.default.string().required(),
        }),
        getSettings: joi_1.default.object({
            device_id: joi_1.default.string().required(),
        }),
    },
    deviceSetting: {
        update: joi_1.default.object({
            device_id: joi_1.default.string().required(),
            sms_alert_enabled: joi_1.default.string().valid("1", "0").optional(),
            take_off_device_alert: joi_1.default.string().valid("1", "0").optional(),
            safe_mode: joi_1.default.string().valid("1", "0").optional(),
            talking_clock: joi_1.default.string().valid("1", "0").optional(),
            night_power_saving: joi_1.default.string().valid("1", "0").optional(),
            volume: joi_1.default.number().integer().min(0).max(100).optional(),
            brightness: joi_1.default.number().integer().min(0).max(100).optional(),
            fall_down_alert_enabled: joi_1.default.string().valid("1", "0").optional(),
            fall_down_reminder_call: joi_1.default.string().valid("1", "0").optional(),
            fall_down_level: joi_1.default.number().integer().min(1).max(10).optional(),
        }),
    },
    familyMember: {
        create: joi_1.default.object({
            name: joi_1.default.string().required(),
            mobile_no: joi_1.default.string().required(),
            device_id: joi_1.default.string().required(),
        }),
        list: joi_1.default.object({
            search: joi_1.default.string().optional().default(""),
            page: joi_1.default.number().integer().min(1).optional().default(1),
            sorting: joi_1.default.string().valid("ASC", "DESC").optional().default("DESC"),
            limit: joi_1.default.number().integer().min(1).optional().default(10),
            device_id: joi_1.default.string().optional().default(""),
        }),
        delete: joi_1.default.object({
            id: joi_1.default.string().required(),
        }),
    },
    healthMetric: {
        add: joi_1.default.object({
            device_id: joi_1.default.string().required(),
            metric_type: joi_1.default.string()
                .valid("heart_rate", "blood_pressure", "sleep", "spo2", "calories", "temperature", "distance", "steps_daily", "steps_cumulative")
                .required(),
            value_primary: joi_1.default.alternatives()
                .try(joi_1.default.number(), joi_1.default.string())
                .required(),
            value_secondary: joi_1.default.alternatives()
                .try(joi_1.default.number(), joi_1.default.string())
                .required(),
            unit: joi_1.default.string().required(),
        }),
        analytics: joi_1.default.object({
            device_id: joi_1.default.string().required(),
            metric_type: joi_1.default.string()
                .valid("heart_rate", "blood_pressure", "sleep", "spo2", "calories", "temperature", "distance", "steps_daily", "steps_cumulative")
                .required(),
            range: joi_1.default.string()
                .valid("daily", "weekly", "monthly")
                .optional()
                .default("daily"),
            date: joi_1.default.string().optional().allow(null),
        }),
    },
    snapshot: {
        add: joi_1.default.object({
            device_id: joi_1.default.string().required(),
        }),
        list: joi_1.default.object({
            device_id: joi_1.default.string().required(),
            page: joi_1.default.number().integer().min(1).optional().default(1),
            limit: joi_1.default.number().integer().min(1).optional().default(10),
            sorting: joi_1.default.string().valid("ASC", "DESC").optional().default("DESC"),
            start_date: joi_1.default.string().optional().allow(null),
            end_date: joi_1.default.string().optional().allow(null),
        }),
    },
    notification: {
        list: joi_1.default.object({
            device_id: joi_1.default.string().required(),
            user_id: joi_1.default.string().optional().allow(null),
            type: joi_1.default.string()
                .valid("sos", "geo_fence_out", "geo_fence_in", "low_battery", "sim_remove", "network", "fall_detection", "device_offline", "general")
                .optional()
                .allow(null),
            is_read: joi_1.default.string().valid("1", "0").optional().allow(null),
            page: joi_1.default.number().integer().min(1).optional().default(1),
            limit: joi_1.default.number().integer().min(1).optional().default(10),
            sorting: joi_1.default.string().valid("ASC", "DESC").optional().default("DESC"),
            start_date: joi_1.default.string().optional().allow(null),
            end_date: joi_1.default.string().optional().allow(null),
        }),
    },
};

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
const models_1 = __importDefault(require("../models"));
class HealthMetricService {
    /**
     * Save heart rate reading to the database.
     *
     * This is the single source of truth for heart rate DB writes.
     * Both the HTTP controller and TCP server should use this.
     */
    saveHeartRate(data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Validate device exists
                const device = yield models_1.default.Device.findByPk(data.device_id);
                if (!device) {
                    return {
                        success: false,
                        error: `Device ${data.device_id} not found`,
                    };
                }
                // Validate BPM range
                if (data.bpm < 30 || data.bpm > 220) {
                    return {
                        success: false,
                        error: `Invalid heart rate: ${data.bpm} bpm (expected 30-220)`,
                    };
                }
                const healthmetric = yield models_1.default.HealthMetric.create({
                    device_id: data.device_id,
                    metric_type: "heart_rate",
                    value_primary: data.bpm,
                    value_secondary: null,
                    unit: data.unit || "bpm",
                    recorded_at: data.recorded_at || new Date(),
                });
                return {
                    success: true,
                    data: healthmetric,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "Unknown error",
                };
            }
        });
    }
}
exports.default = new HealthMetricService();

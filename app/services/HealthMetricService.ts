import db from "../models";

export interface HeartRateData {
  device_id: string;
  bpm: number;
  unit?: string;
  recorded_at?: Date;
}

export interface SaveHeartRateResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface TemperatureData {
  device_id: string;
  temperature: number;
  measurement_type?: number; // 0=forehead, 1=wrist
  unit?: string;
  recorded_at?: Date;
}

export interface SaveTemperatureResult {
  success: boolean;
  data?: any;
  error?: string;
}

class HealthMetricService {
  /**
   * Save heart rate reading to the database.
   *
   * This is the single source of truth for heart rate DB writes.
   * Both the HTTP controller and TCP server should use this.
   */
  async saveHeartRate(data: HeartRateData): Promise<SaveHeartRateResult> {
    try {
      // Validate device exists
      const device = await db.Device.findByPk(data.device_id);

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

      const healthmetric = await db.HealthMetric.create({
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Save temperature reading to the database.
   *
   * This is the single source of truth for temperature DB writes.
   * Both the HTTP controller and TCP server should use this.
   *
   * @param data - Temperature data including device_id, temperature value,
   *               optional measurement_type (0=forehead, 1=wrist), and unit
   * @returns Result object with success status and data or error
   */
  async saveTemperature(data: TemperatureData): Promise<SaveTemperatureResult> {
    try {
      // Validate device exists
      const device = await db.Device.findByPk(data.device_id);

      if (!device) {
        return {
          success: false,
          error: `Device ${data.device_id} not found`,
        };
      }

      // Validate temperature range (reasonable human body temperature range)
      // -50°C to 100°C covers all possible scenarios including abnormal flags
      if (data.temperature < -50 || data.temperature > 100) {
        return {
          success: false,
          error: `Invalid temperature: ${data.temperature} (expected -50 to 100)`,
        };
      }

      const healthmetric = await db.HealthMetric.create({
        device_id: data.device_id,
        metric_type: "temperature",
        value_primary: data.temperature,
        value_secondary: data.measurement_type ?? null,
        unit: data.unit || "C",
        recorded_at: data.recorded_at || new Date(),
      });

      return {
        success: true,
        data: healthmetric,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export default new HealthMetricService();

import Joi, { ObjectSchema } from "joi";
import { NextFunction, Request, Response } from "express";
import Logging from "../library/Logging";

export const ValidateJoi = (
  schema: ObjectSchema,
  source: "body" | "query" | "params" = "body"
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data =
        source === "body"
          ? req.body
          : source === "query"
          ? req.query
          : req.params;
      await schema.validateAsync(data);
      next();
    } catch (error) {
      Logging.error(error);
      return res.status(422).json({ error });
    }
  };
};

export const Schemas = {
  sendOtpSchema: Joi.object({
    mobile_no: Joi.string()
      .pattern(/^[0-9]{7,15}$/)
      .optional()
      .allow(""),
    country_code: Joi.string().optional().allow(""),
    email: Joi.string().email().optional().allow(""),
  }).or("mobile_no", "email"),
  adminLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
  user: {
    create: Joi.object({
      name: Joi.string().required(),
      email: Joi.string().email().required(),
      password: Joi.string().required(),
      country_code: Joi.string().optional().allow(""),
      phone_number: Joi.string().optional().allow(""),
    }),
    update: Joi.object({
      id: Joi.string().required(),
      name: Joi.string().optional().allow(""),
      email: Joi.string().email().optional().allow(""),
      password: Joi.string().optional().allow(""),
      country_code: Joi.string().optional().allow(""),
      phone_number: Joi.string().optional().allow(""),
    }),
  },
  admin: {
    allUsers: Joi.object({
      search: Joi.string().optional().allow(""),
      page: Joi.number().integer().min(1).optional().default(1),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("DESC"),
      limit: Joi.number().integer().min(1).optional().default(20),
    }),
    deleteUser: Joi.object({
      id: Joi.string().required(),
    }),
    getUserDetail: Joi.object({
      id: Joi.string().required(),
    }),
  },
  device: {
    create: Joi.object({
      owner_id: Joi.string().required(),
      imei: Joi.string().required(),
      serial_number: Joi.string().optional().allow(null),
      device_name: Joi.string().optional().allow(null),
      email: Joi.string().email().optional().allow(null),
      country_code: Joi.string().optional().allow(null),
      phone_number: Joi.string().optional().allow(null),
      network_carrier: Joi.string().optional().allow(null),
      network_type: Joi.string().optional().allow(null),
      location_interval_minutes: Joi.number()
        .integer()
        .min(1)
        .optional()
        .default(1),
      height_cm: Joi.number().integer().optional().allow(null),
      gender: Joi.string().optional().allow(null),
      age: Joi.number().integer().optional().allow(null),
      weight_kg: Joi.number().integer().optional().allow(null),
    }),
    update: Joi.object({
      id: Joi.string().required(),
      owner_id: Joi.string().optional().allow(null),
      imei: Joi.string().optional().allow(null),
      serial_number: Joi.string().optional().allow(null),
      device_name: Joi.string().optional().allow(null),
      email: Joi.string().email().optional().allow(null),
      country_code: Joi.string().optional().allow(null),
      phone_number: Joi.string().optional().allow(null),
      network_carrier: Joi.string().optional().allow(null),
      network_type: Joi.string().optional().allow(null),
      location_interval_minutes: Joi.number()
        .integer()
        .min(1)
        .optional()
        .allow(null),
      height_cm: Joi.number().integer().optional().allow(null),
      gender: Joi.string().optional().allow(null),
      age: Joi.number().integer().optional().allow(null),
      weight_kg: Joi.number().integer().optional().allow(null),
    }),
    delete: Joi.object({
      id: Joi.string().required(),
    }),
    getSettings: Joi.object({
      device_id: Joi.string().required(),
    }),
  },
  deviceSetting: {
    update: Joi.object({
      device_id: Joi.string().required(),
      sms_alert_enabled: Joi.string().valid("1", "0").optional(),
      take_off_device_alert: Joi.string().valid("1", "0").optional(),
      safe_mode: Joi.string().valid("1", "0").optional(),
      talking_clock: Joi.string().valid("1", "0").optional(),
      night_power_saving: Joi.string().valid("1", "0").optional(),
      volume: Joi.number().integer().min(0).max(100).optional(),
      brightness: Joi.number().integer().min(0).max(100).optional(),
      fall_down_alert_enabled: Joi.string().valid("1", "0").optional(),
      fall_down_reminder_call: Joi.string().valid("1", "0").optional(),
      fall_down_level: Joi.number().integer().min(1).max(10).optional(),
    }),
  },
  familyMember: {
    create: Joi.object({
      name: Joi.string().required(),
      mobile_no: Joi.string().required(),
      device_id: Joi.string().required(),
    }),
    list: Joi.object({
      search: Joi.string().optional().default(""),
      page: Joi.number().integer().min(1).optional().default(1),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("DESC"),
      limit: Joi.number().integer().min(1).optional().default(10),
      device_id: Joi.string().optional().default(""),
    }),
    delete: Joi.object({
      id: Joi.string().required(),
    }),
  },
  healthMetric: {
    add: Joi.object({
      device_id: Joi.string().required(),
      metric_type: Joi.string()
        .valid(
          "heart_rate",
          "blood_pressure",
          "sleep",
          "spo2",
          "calories",
          "temperature",
          "distance",
          "steps_daily",
          "steps_cumulative"
        )
        .required(),
      value_primary: Joi.alternatives()
        .try(Joi.number(), Joi.string())
        .required(),
      value_secondary: Joi.alternatives()
        .try(Joi.number(), Joi.string())
        .required(),
      unit: Joi.string().required(),
    }),
    analytics: Joi.object({
      device_id: Joi.string().required(),
      metric_type: Joi.string()
        .valid(
          "heart_rate",
          "blood_pressure",
          "sleep",
          "spo2",
          "calories",
          "temperature",
          "distance",
          "steps_daily",
          "steps_cumulative"
        )
        .required(),
      range: Joi.string()
        .valid("daily", "weekly", "monthly")
        .optional()
        .default("daily"),
      date: Joi.string().optional().allow(null),
    }),
  },
  snapshot: {
    add: Joi.object({
      device_id: Joi.string().required(),
    }),
    list: Joi.object({
      device_id: Joi.string().required(),
      page: Joi.number().integer().min(1).optional().default(1),
      limit: Joi.number().integer().min(1).optional().default(10),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("DESC"),
      start_date: Joi.string().optional().allow(null),
      end_date: Joi.string().optional().allow(null),
    }),
  },
  notification: {
    list: Joi.object({
      device_id: Joi.string().required(),
      user_id: Joi.string().optional().allow(null),
      type: Joi.string()
        .valid(
          "sos",
          "geo_fence_out",
          "geo_fence_in",
          "low_battery",
          "sim_remove",
          "network",
          "fall_detection",
          "device_offline",
          "general"
        )
        .optional()
        .allow(null),
      is_read: Joi.string().valid("1", "0").optional().allow(null),
      page: Joi.number().integer().min(1).optional().default(1),
      limit: Joi.number().integer().min(1).optional().default(10),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("DESC"),
      start_date: Joi.string().optional().allow(null),
      end_date: Joi.string().optional().allow(null),
    }),
  },
};

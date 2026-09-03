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
    listUnlinked: Joi.object({
      page: Joi.number().integer().min(1).optional().default(1),
      limit: Joi.number().integer().min(1).optional().default(20),
      search: Joi.string().optional().allow(""),
    }),
    assignOwner: Joi.object({
      device_id: Joi.string().required(),
      owner_id: Joi.string().required(),
    }),
    updateIdentity: Joi.object({
      device_id: Joi.string().required(),
      imei: Joi.string().optional().allow(null),
      serial_number: Joi.string().optional().allow(null),
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
      scene_mode: Joi.number().integer().min(1).max(4).optional(),
    }),
  },

  sceneMode: {
    update: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      scene_mode: Joi.number().integer().valid(1, 2, 3, 4).required().messages({
        "number.base": "scene_mode must be a number",
        "number.integer": "scene_mode must be an integer",
        "any.only":
          "scene_mode must be 1 (vibration+ringing), 2 (ringing), 3 (vibration), or 4 (silence)",
        "any.required": "scene_mode is required",
      }),
    }),
  },

  deviceRestart: {
    restart: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
    }),
  },
  deviceCommand: {
    send: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      command: Joi.number().integer().valid(1, 2, 3).required().messages({
        "number.base": "command is required and must be a number",
        "number.integer": "command must be an integer",
        "any.only":
          "command must be 1 (restart), 2 (shutdown), or 3 (factory_reset)",
        "any.required": "command is required",
      }),
    }),
  },
  findDevice: {
    send: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
    }),
  },
  sos: {
    /**
     * Set the SOS numbers on a device.
     *
     * Preferred shape (per the spec):
     *   {
     *     "serial_number": "8800000015",
     *     "contacts": [
     *       { "name": "Mom",   "number": "9691905903", "priority": 1 },
     *       { "name": "Dad",   "number": "9510589322", "priority": 2 }
     *     ]
     *   }
     *
     * - 1..3 contacts, priorities must be unique and in [1,3].
     * - Contacts are stored in the DB one row each (with priority).
     * - Contacts are pushed to the device as SOS1/SOS2/SOS3 ordered by
     *   priority; empty slots are NOT sent.
     *
     * Legacy shape still accepted:
     *   - sos_number        -> treated as SOS1
     *   - sos1 / sos2 / sos3-> per-slot numbers
     */
    set: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      contacts: Joi.array()
        .items(
          Joi.object({
            name: Joi.string().required().messages({
              "string.empty": "name is required",
              "any.required": "name is required",
            }),
            number: Joi.string()
              .pattern(/^[0-9+\-\s()]{5,20}$/)
              .required()
              .messages({
                "string.empty": "number is required",
                "any.required": "number is required",
                "string.pattern.base":
                  "number must be a valid phone (5-20 chars, digits/+/-/space/parentheses)",
              }),
            priority: Joi.number().integer().min(1).max(3).required().messages({
              "number.base": "priority must be a number (1, 2 or 3)",
              "number.min": "priority must be 1, 2 or 3",
              "number.max": "priority must be 1, 2 or 3",
              "any.required": "priority is required",
            }),
          })
        )
        .min(1)
        .max(3)
        .unique("priority")
        .optional()
        .messages({
          "array.min": "At least one contact is required",
          "array.max": "Maximum 3 contacts allowed",
          "array.unique": "priority values must be unique (1, 2 and/or 3)",
        }),
      // Legacy fields (still accepted for backward compatibility)
      sos_number: Joi.string()
        .pattern(/^[0-9+\-\s()]{5,20}$/)
        .optional()
        .allow(null, "")
        .messages({
          "string.pattern.base": "sos_number must be a valid phone number",
        }),
      sos1: Joi.string()
        .pattern(/^[0-9+\-\s()]{5,20}$/)
        .optional()
        .allow(null, "")
        .messages({ "string.pattern.base": "sos1 invalid" }),
      sos2: Joi.string()
        .pattern(/^[0-9+\-\s()]{5,20}$/)
        .optional()
        .allow(null, "")
        .messages({ "string.pattern.base": "sos2 invalid" }),
      sos3: Joi.string()
        .pattern(/^[0-9+\-\s()]{5,20}$/)
        .optional()
        .allow(null, "")
        .messages({ "string.pattern.base": "sos3 invalid" }),
    })
      .or("contacts", "sos_number", "sos1", "sos2", "sos3")
      .messages({
        "object.missing":
          "Provide `contacts[]` (preferred) or legacy `sos_number`/`sos1`/`sos2`/`sos3`",
      }),
  },
  phonebook: {
    /**
     * Push the device's phonebook (PHBX) — up to 30 contacts.
     *
     * Request body:
     *   {
     *     "serial_number": "7893267563",
     *     "contacts": [
     *       { "index": 1, "name": "Mom",    "number": "9691905903" },
     *       { "index": 2, "name": "Dad",    "number": "9510589322" },
     *       { "index": 3, "name": "Sister", "number": "9587374638", "photo": "" }
     *     ]
     *   }
     *
     * The `index` field is the watch's phonebook slot (1..30). Photo is
     * optional and currently not used (empty string OK).
     */
    set: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      contacts: Joi.array()
        .items(
          Joi.object({
            index: Joi.number().integer().min(1).max(30).required().messages({
              "number.base": "index must be a number (1..30)",
              "number.min": "index must be between 1 and 30",
              "number.max": "index must be between 1 and 30",
              "any.required": "index is required",
            }),
            name: Joi.string().required().messages({
              "string.empty": "name is required",
              "any.required": "name is required",
            }),
            number: Joi.string()
              .pattern(/^[0-9+\-\s()]{5,20}$/)
              .required()
              .messages({
                "string.empty": "number is required",
                "any.required": "number is required",
                "string.pattern.base":
                  "number must be a valid phone (5-20 chars, digits/+/-/space/parentheses)",
              }),
            photo: Joi.string().optional().allow(null, "").default(""),
          })
        )
        .min(1)
        .max(30)
        .unique("index")
        .required()
        .messages({
          "array.min": "At least one contact is required",
          "array.max": "Maximum 30 contacts allowed",
          "array.unique": "index values must be unique (1..30)",
          "any.required": "contacts array is required",
        }),
    }),

    /**
     * Clear a single phonebook slot on the watch.
     *
     * Request body:
     *   {
     *     "serial_number": "7893267563",
     *     "index":         1,                     // required, 1..30
     *     "number":        "919691905903"         // optional
     *   }
     *
     * Per the latest spec, this firmware clears a slot by sending PHBX
     * again at the same slot index with an EMPTY name field. There is
     * no separate DPHBX command word. Matching is by SLOT INDEX (1..30),
     * not by phone number. The number, if provided, is sent on the wire
     * so the firmware can confirm which entry to delete.
     *
     * Wire packet: [3G*<id>*LEN*PHBX,<index>,,<number>,]
     * Device reply: [3G*<id>*0004*PHBX] (ack = success) or
     *               [3G*<id>*0006*PHBX,0] (failure)
     */
    delete: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      index: Joi.number().integer().min(1).max(30).required().messages({
        "number.base": "index must be a number (1..30)",
        "number.min": "index must be between 1 and 30",
        "number.max": "index must be between 1 and 30",
        "any.required": "index is required (the slot number to clear)",
      }),
      number: Joi.string()
        .pattern(/^[0-9+\-\s()]{5,20}$/)
        .optional()
        .allow(null, "")
        .messages({
          "string.pattern.base":
            "number must be a valid phone (5-20 chars, digits/+/-/space/parentheses)",
        }),
    }),

    /**
     * List all phonebook entries currently stored on the server for a
     * device. Paginated; the response shape mirrors the DevicePhonebook
     * table with a few derived fields (`digits`, `display_number`,
     * `has_photo`).
     *
     * Request body:
     *   {
     *     "serial_number": "7893267563",
     *     "search":        "Mom",     // optional, LIKE on name/number
     *     "page":          1,         // 1-based
     *     "limit":         30,        // default 30 (the watch's max)
     *     "sorting":       "ASC"      // "ASC" | "DESC" by slot_index
     *   }
     */
    list: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      search: Joi.string().optional().allow(null, "").default(""),
      page: Joi.number().integer().min(1).optional().default(1),
      limit: Joi.number().integer().min(1).max(30).optional().default(30),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("ASC"),
    }),
  },
  alarm: {
    set: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      alarms: Joi.array()
        .items(
          Joi.string()
            .pattern(
              /^([01]?[0-9]|2[0-3]):[0-5][0-9]-[1-3]-[0-9](-[01]{7})?$/,
              "alarm format"
            )
            .messages({
              "string.pattern.base":
                "Invalid alarm format. Expected: HH:MM-type-repeat or HH:MM-type-repeat-days (e.g., 08:10-1-1 or 08:10-1-3-0111110)",
            })
        )
        .min(1)
        .max(3)
        .required()
        .messages({
          "array.min": "At least one alarm is required",
          "array.max": "Maximum 3 alarms allowed",
          "any.required": "alarms array is required",
        }),
    }),
  },
  capture: {
    snapshot: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
    }),
  },

  /**
   * Toggle the watch's auto-answer feature and (optionally) configure
   * the up-to-3 phone numbers that are allowed to auto-answer.
   *
   * Request body:
   *   {
   *     "serial_number": "8800000015",
   *     "enabled":       true,
   *     "numbers":       ["13412345678", "075512345678"]   // optional
   *   }
   *
   * Wire packet:
   *   enabled=false  →  [3G*<id>*0007*ACALL,0]
   *   enabled=true   →  [3G*<id>*LEN*ACALL,<n1>,<n2>,<n3>]
   *
   * Numbers MUST be 5–20 ASCII digits (country code included, no '+').
   */
  autoAnswer: {
    set: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      enabled: Joi.boolean().required().messages({
        "boolean.base": "enabled must be a boolean (true or false)",
        "any.required":
          "enabled is required (true to turn auto-answer on, false to turn it off)",
      }),
      numbers: Joi.array()
        .items(
          Joi.string()
            .pattern(/^[0-9]{5,20}$/)
            .messages({
              "string.pattern.base":
                "Each number must be 5–20 ASCII digits (no '+', '-', or spaces)",
            })
        )
        .min(0)
        .max(3)
        .optional()
        .default([])
        .messages({
          "array.max": "At most 3 phone numbers are allowed",
        }),
    }),
  },

  /**
   * Toggle the watch's "send SMS to SOS numbers on SOS alarm" switch.
   *
   * Per the protocol spec:
   *   Server send : [3G*<id>*0008*SOSSMS,0]  (off)
   *                 [3G*<id>*0008*SOSSMS,1]  (on)
   *   Device reply: [3G*<id>*0006*SOSSMS]    (ack = success)
   *
   * When ON, the watch sends an SMS to each configured SOS number
   * immediately after a long-press SOS event. When OFF, no SMS is
   * sent (the watch still dials if configured).
   *
   * Request body:
   *   {
   *     "serial_number": "8800000015",
   *     "enabled":       true
   *   }
   */
  sosSms: {
    set: Joi.object({
      serial_number: Joi.string().required().messages({
        "string.empty": "serial_number is required",
        "any.required": "serial_number is required",
      }),
      enabled: Joi.boolean().required().messages({
        "boolean.base": "enabled must be a boolean (true or false)",
        "any.required":
          "enabled is required (true = send SMS to SOS numbers on SOS alarm, false = do not send SMS)",
      }),
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
          "steps_cumulative",
          "battery",
          "steps",
          "turnovers"
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
          "steps_cumulative",
          "battery",
          "steps",
          "turnovers"
        )
        .required(),
      range: Joi.string()
        .valid("daily", "weekly", "monthly")
        .optional()
        .default("daily"),
      date: Joi.string().optional().allow(null, ""),
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
      // start_date: Joi.string().optional().allow(null),
      // end_date: Joi.string().optional().allow(null),
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
  auth: {
    updateProfile: Joi.object({
      name: Joi.string().optional().allow(""),
      email: Joi.string().email().optional().allow(""),
      phone_number: Joi.string().optional().allow(""),
      country_code: Joi.string().optional().allow(""),
      password: Joi.string().min(6).optional().allow(""),
    }),
  },
  geofence: {
    save: Joi.object({
      id: Joi.string().optional().allow(null, ""),
      device_id: Joi.string().optional().allow(null, ""),
      name: Joi.string().optional().allow(null, ""),
      latitude: Joi.number().optional(),
      longitude: Joi.number().optional(),
      radius_meters: Joi.number().optional(),
    }),
    list: Joi.object({
      search: Joi.string().optional().allow(""),
      page: Joi.number().integer().min(1).optional().default(1),
      sorting: Joi.string().valid("ASC", "DESC").optional().default("DESC"),
      limit: Joi.number().integer().min(1).optional().default(10),
      device_id: Joi.string().required(),
    }),
    delete: Joi.object({
      id: Joi.string().required(),
    }),
    toggleStatus: Joi.object({
      id: Joi.string().required(),
      is_active: Joi.boolean().required(),
    }),
  },
};

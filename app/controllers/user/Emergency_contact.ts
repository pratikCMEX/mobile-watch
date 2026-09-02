import { NextFunction, Request, Response } from "express";
import { Op } from "sequelize";
import db from "../../models";
import {
  errorMessage,
  successMessage,
  successPagination,
} from "../../library/Response";
import Logging from "../../library/Logging";
import { tcpServer } from "../../app";

// ─────────────────────────────────────────────────────────────
// Phone-number normalization + SOS protocol helpers
// ─────────────────────────────────────────────────────────────

/**
 * Country code auto-prepended to 10-digit national numbers on the wire.
 * Override with the env var SOS_DEFAULT_COUNTRY_CODE.
 */
const DEFAULT_COUNTRY_CODE = (
  process.env.SOS_DEFAULT_COUNTRY_CODE || ""
).replace(/[^0-9]/g, "");

/**
 * Convert a user-supplied phone number into the digits-only string the
 * watch expects on the wire.
 *
 *   - Strips spaces, +, dashes, parentheses.
 *   - If the result is exactly 10 digits, prepends DEFAULT_COUNTRY_CODE
 *     (so a 10-digit Indian mobile becomes "91XXXXXXXXXX").
 *   - 11-15 digit input is assumed to already include a country code
 *     and is returned as-is.
 */
const normalizeSosPhone = (raw: string): string => {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (DEFAULT_COUNTRY_CODE && digits.length === 10) {
    return DEFAULT_COUNTRY_CODE + digits;
  }
  return digits;
};

/**
 * Build the on-wire hex-LEN packet string for a SOS slot.
 * Mirrors exactly what `tcpServer.sendSosCommand()` writes to the socket.
 */
const buildSosProtocolString = (
  serialNumber: string,
  slot: "SOS1" | "SOS2" | "SOS3",
  digits: string
): string => {
  const content = `${slot},${digits}`;
  const length = content.length.toString(16).padStart(4, "0");
  return `[3G*${serialNumber}*${length}*${content}]`;
};

/**
 * Push ALL stored emergency contacts for a device to the watch, ordered
 * by priority (1 → SOS1, 2 → SOS2, 3 → SOS3). If there are only 1 or 2
 * contacts, only SOS1 (and optionally SOS2) are sent — SOS3 is left
 * unset so the watch doesn't try to dial a non-existent number.
 *
 * Returns a per-slot result object so the caller can include it in the
 * HTTP response.
 */
async function syncSosNumbersToDevice(
  deviceId: string,
  serialNumber: string
): Promise<{
  online: boolean;
  wire_results: Array<{
    slot: "SOS1" | "SOS2" | "SOS3";
    priority: number;
    name: string;
    digits: string;
    sent: boolean;
    protocol: string;
  }>;
}> {
  const tcpClient = tcpServer.getDevice(serialNumber);
  if (!tcpClient) {
    return { online: false, wire_results: [] };
  }

  const contacts = await db.EmergencyContact.findAll({
    where: { device_id: deviceId, priority: { [Op.not]: null } },
    order: [["priority", "ASC"]],
  });

  const wireResults: Array<{
    slot: "SOS1" | "SOS2" | "SOS3";
    priority: number;
    name: string;
    digits: string;
    sent: boolean;
    protocol: string;
  }> = [];

  for (const c of contacts) {
    const slot: "SOS1" | "SOS2" | "SOS3" =
      c.priority === 1 ? "SOS1" : c.priority === 2 ? "SOS2" : "SOS3";

    const digits = (c.country_code || "") + (c.phone_number || "");
    if (!digits) continue;

    const sent = tcpServer.sendSosCommand(serialNumber, slot, digits);
    const protocol = buildSosProtocolString(serialNumber, slot, digits);

    wireResults.push({
      slot,
      priority: c.priority,
      name: c.name,
      digits,
      sent,
      protocol,
    });

    Logging.info(
      `SOS ${slot} -> device ${serialNumber} (device_id: ${deviceId}): ${protocol}` +
        (sent ? "" : " [SEND FAILED]")
    );
  }

  return { online: true, wire_results: wireResults };
}

// ─────────────────────────────────────────────────────────────
// Create / update single emergency contact
// ─────────────────────────────────────────────────────────────

/**
 * Add or update a SINGLE emergency contact, then re-sync ALL stored
 * contacts to the device in priority order.
 *
 * Request body:
 *   {
 *     "serial_number": "8800000015",
 *     "name":          "Mom",
 *     "number":        "+91 9691905903"  // digits; +/spaces ok
 *     "priority":      1                  // 1, 2 or 3
 *   }
 *
 * Behaviour:
 *   - One DB row per (device_id, priority). Upsert semantics.
 *   - After save, the device receives the FULL list of contacts in
 *     priority order (e.g. 1 contact -> only SOS1; 3 contacts -> SOS1,
 *     SOS2, SOS3). Empty slots are NOT sent.
 */
async function createOrUpdateEmergencyContact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id, name, country_code, phone_number, device_id } = req.body;

    // We need either an id (update), a device_id, or a serial_number to
    // figure out which device this contact belongs to.
    let device = null as any | null;
    if (id) {
      const existing = await db.EmergencyContact.findByPk(id);
      if (!existing) {
        return errorMessage(res, "Emergency contact not found", 404);
      }
      device = await db.Device.findByPk(existing.device_id);
    } else if (device_id) {
      device = await db.Device.findByPk(device_id);
    }
    // else if (serial_number) {
    //   device = await db.Device.findOne({ where: { serial_number } });
    // }

    if (!device) {
      return errorMessage(
        res,
        "Device not found (provide id, device_id or serial_number)"
      );
    }

    // SOS-number sync requires serial_number
    if (!device.serial_number) {
      return errorMessage(
        res,
        `Device ${device.id} has no serial_number, cannot push SOS to the watch`
      );
    }

    // ── Upsert the single contact ──
    let contact: any;
    let created = false;

    if (id) {
      const [affectedCount] = await db.EmergencyContact.update(
        { name, phone_number, country_code },
        { where: { id } }
      );
      if (affectedCount === 0) {
        return errorMessage(res, "Emergency contact not found", 404);
      }
      contact = await db.EmergencyContact.findByPk(id);
    } else if (
      typeof req.body.priority === "number" &&
      req.body.priority >= 1 &&
      req.body.priority <= 3
    ) {
      // Upsert by (device_id, priority)
      const priority = req.body.priority;
      const digits = normalizeSosPhone(phone_number);
      let cc = (country_code || "").replace(/[^0-9]/g, "");
      let pn = digits;
      if (DEFAULT_COUNTRY_CODE && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
        cc = DEFAULT_COUNTRY_CODE;
        pn = digits.substring(DEFAULT_COUNTRY_CODE.length);
      } else if (digits && !cc) {
        pn = digits;
        cc = "";
      }
      [contact, created] = await db.EmergencyContact.findOrCreate({
        where: { device_id: device.id, priority },
        defaults: {
          device_id: device.id,
          priority,
          name: name || `SOS ${priority}`,
          phone_number: pn,
          country_code: cc,
        },
      });
      if (!created) {
        contact.name = name || `SOS ${priority}`;
        contact.phone_number = pn;
        contact.country_code = cc;
        await contact.save();
      }
    } else {
      // Generic create (no priority specified)
      contact = await db.EmergencyContact.create({
        name,
        country_code,
        phone_number,
        device_id: device.id,
      });
    }

    // ── Re-sync ALL stored contacts to the device ──
    const sync = await syncSosNumbersToDevice(device.id, device.serial_number);

    return successMessage(
      res,
      created
        ? "Emergency contact created successfully"
        : "Emergency contact updated successfully",
      {
        contact,
        device: {
          id: device.id,
          serial_number: device.serial_number,
          device_name: device.device_name,
        },
        sync,
        command_message: sync.online
          ? `Pushed ${sync.wire_results.length} SOS slot(s) to the device in priority order`
          : "Device is offline — contact saved in DB but not pushed to the watch. It will sync on next reconnect.",
      }
    );
  } catch (err) {
    console.error("createOrUpdateEmergencyContact error:", err);
    return errorMessage(res, "Error saving emergency contact");
  }
}

// ─────────────────────────────────────────────────────────────
// Delete one contact -> re-sync remaining contacts to device
// ─────────────────────────────────────────────────────────────

async function deleteEmergencyContact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = req.params;

    // Load the contact first so we know which device to re-sync
    const existing = await db.EmergencyContact.findByPk(id);
    if (!existing) {
      return errorMessage(res, "Emergency contact not found", 404);
    }

    const deletedCount = await db.EmergencyContact.destroy({
      where: { id },
    });

    // Re-sync whatever's left to the watch
    const device = await db.Device.findByPk(existing.device_id);
    let sync: {
      online: boolean;
      wire_results: Array<any>;
    } = { online: false, wire_results: [] };

    if (device?.serial_number) {
      sync = await syncSosNumbersToDevice(device.id, device.serial_number);
    }

    return successMessage(res, "Emergency contact deleted successfully", {
      deleted: deletedCount,
      contact: existing.toJSON(),
      device: device
        ? {
            id: device.id,
            serial_number: device.serial_number,
            device_name: device.device_name,
          }
        : null,
      sync,
      command_message: device?.serial_number
        ? sync.online
          ? `Removed contact from DB. Pushed ${sync.wire_results.length} remaining SOS slot(s) to the device.`
          : "Removed contact from DB. Device is offline, remaining slots will sync when it reconnects."
        : "Removed contact from DB. Device has no serial_number, no push attempted.",
    });
  } catch (err) {
    console.error("deleteEmergencyContact error:", err);
    return errorMessage(res, "Error deleting emergency contact");
  }
}

// ─────────────────────────────────────────────────────────────
// List / read (unchanged from original, but exposed with priority)
// ─────────────────────────────────────────────────────────────

const allEmergencyContact = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      search = "",
      page = 1,
      sorting = "DESC",
      limit = 10,
      device_id = "",
    } = req.body;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    const sortDir = String(sorting).toUpperCase() === "ASC" ? "ASC" : "DESC";

    const whereCondition: any = {};
    const searchTerm = String(search || "").trim();

    if (searchTerm) {
      // iLike / LIKE on NULL columns blows up in some DBs; only match
      // non-null fields, and cast the search term to a string.
      const like = `%${searchTerm}%`;
      const dialect = db.sequelize.getDialect();
      const likeOp = dialect === "postgres" ? Op.iLike : Op.like;
      whereCondition[Op.and] = [
        {
          [Op.or]: [
            { name: { [likeOp]: like } },
            { phone_number: { [likeOp]: like } },
          ],
        },
      ];
    }

    if (device_id && device_id !== "") {
      whereCondition.device_id = device_id;
    }

    const { count, rows } = await db.EmergencyContact.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id",
        "name",
        "device_id",
        "country_code",
        "phone_number",
        "priority",
        "createdAt",
      ],
      order: [
        // NULLs last so SOS1/2/3 (always populated) come first regardless
        // of DB (Postgres puts NULLs last by default with ASC; SQLite
        // puts them first — normalize explicitly).
        [db.sequelize.literal('"priority" IS NULL'), "ASC"],
        ["priority", "ASC"],
        ["createdAt", sortDir],
      ],
      limit: limitNum,
      offset,
    });

    return successPagination(
      res,
      "Emergency contacts fetched successfully",
      rows,
      {
        page: pageNum,
        limit: limitNum,
        total: count,
      }
    );
  } catch (error) {
    console.error("allEmergencyContact error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const hint =
      msg.toLowerCase().includes("priority") &&
      (msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("no such column"))
        ? " (Did you run the migration? `npx sequelize-cli db:migrate`)"
        : "";
    return errorMessage(
      res,
      "Error fetching emergency contacts: " + msg + hint
    );
  }
};

const getEmergencyContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const emergency_contact = await db.EmergencyContact.findOne({
      where: { id },
    });
    if (!emergency_contact) {
      return errorMessage(res, "Emergency contact not found");
    }
    return successMessage(
      res,
      "Emergency contact fetched successfully",
      emergency_contact
    );
  } catch (err) {
    console.error("getEmergencyContact error:", err);
    return errorMessage(res, "Error fetching emergency contact");
  }
};

// ─────────────────────────────────────────────────────────────
// Thin legacy wrapper so the existing /set_sos_numbers route still
// works — it now just delegates to createOrUpdateEmergencyContact
// using `sos_number` as priority=1.
// ─────────────────────────────────────────────────────────────

/**
 * @deprecated Prefer `POST /create_emergency_contact` with priority.
 * Kept so the legacy `/set_sos_numbers` route still works.
 */
async function setSosNumbers(req: Request, res: Response, next: NextFunction) {
  // Adapt the legacy body shape to the new contact shape.
  if (req.body.contacts) {
    // Already in the new shape — handle each contact one by one then
    // re-sync once at the end.
    try {
      const { serial_number, contacts } = req.body;
      const device = await db.Device.findOne({ where: { serial_number } });
      if (!device) {
        return errorMessage(res, `Device not found`);
      }

      for (const c of contacts) {
        const digits = normalizeSosPhone(c.number);
        let cc = "";
        let pn = digits;
        if (DEFAULT_COUNTRY_CODE && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
          cc = DEFAULT_COUNTRY_CODE;
          pn = digits.substring(DEFAULT_COUNTRY_CODE.length);
        }
        await db.EmergencyContact.upsert({
          device_id: device.id,
          priority: c.priority,
          name: c.name || `SOS ${c.priority}`,
          phone_number: pn,
          country_code: cc,
        });
      }

      const sync = await syncSosNumbersToDevice(device.id, serial_number);

      return successMessage(res, "SOS numbers set successfully", {
        device: {
          id: device.id,
          serial_number: device.serial_number,
          device_name: device.device_name,
        },
        sync,
        command_message: sync.online
          ? `Pushed ${sync.wire_results.length} SOS slot(s) to the device in priority order`
          : "Saved to DB; device offline — will sync on reconnect.",
      });
    } catch (err) {
      console.error("setSosNumbers error:", err);
      return errorMessage(res, "Error setting SOS numbers");
    }
  }

  // Legacy single-number shape -> forward to createOrUpdateEmergencyContact
  // with priority=1.
  const { serial_number, sos_number, sos1, sos2, sos3 } = req.body;
  const number = sos1 || sos_number;
  const priority = 1;
  if (!serial_number) {
    return errorMessage(res, "serial_number is required");
  }
  if (!number) {
    return errorMessage(res, "sos_number / sos1 is required");
  }

  req.body = {
    serial_number,
    number,
    name: `SOS ${priority}`,
    priority,
  };
  // sos2 / sos3 were just informational in the legacy shape; ignore
  void sos2;
  void sos3;

  return createOrUpdateEmergencyContact(req, res, next);
}

// ─────────────────────────────────────────────────────────────
// Bulk save: receive a contacts[] array, upsert each by priority,
// then re-sync ALL stored contacts to the device in priority order.
// ─────────────────────────────────────────────────────────────

/**
 * Bulk save (upsert) a list of emergency contacts for a device, then
 * push them all to the watch in priority order.
 *
 * Request body:
 *   {
 *     "serial_number": "8800000015",
 *     "contacts": [
 *       { "id": "",          "name": "Mom",    "phone_number": "9691905903", "priority": 1 },
 *       { "id": "<uuid>",    "name": "Dad",    "phone_number": "9510589322", "priority": 2 },
 *       { "id": "",          "name": "Sister", "phone_number": "9587374638", "priority": 3 }
 *     ]
 *   }
 *
 * Semantics:
 *   - Up to 3 contacts.
 *   - For each contact:
 *       * if `id` is empty / missing  -> CREATE a new row keyed by (device, priority)
 *       * if `id` is a real UUID       -> UPDATE that row's name/number
 *   - After all contacts are saved, the server reads back the full list
 *     of stored contacts for this device and pushes them to the watch
 *     in priority order (1 -> SOS1, 2 -> SOS2, 3 -> SOS3). Only the
 *     slots that actually have data are sent.
 */
async function saveEmergencyContacts(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, contacts } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return errorMessage(res, "contacts[] array is required (1-3 entries)");
    }
    if (contacts.length > 3) {
      return errorMessage(res, "Maximum 3 contacts allowed");
    }

    // Validate priorities: must be 1/2/3 and unique across the batch.
    const priorities = contacts.map((c: any) => Number(c.priority));
    if (priorities.some((p) => ![1, 2, 3].includes(p))) {
      return errorMessage(res, "priority must be 1, 2 or 3 for each contact");
    }
    if (new Set(priorities).size !== priorities.length) {
      return errorMessage(
        res,
        "priority values must be unique (1, 2 and/or 3)"
      );
    }

    // Validate each contact has a phone_number
    for (const [i, c] of contacts.entries()) {
      if (!c.phone_number) {
        return errorMessage(res, `contacts[${i}].phone_number is required`);
      }
    }

    // Look up the device
    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }

    // Upsert each contact. Order doesn't matter because we re-read
    // everything from DB at the end before pushing to the watch.
    const dbResults: Array<{
      id: string;
      created: boolean;
      priority: number;
      name: string;
      phone_number: string;
      country_code: string;
    }> = [];

    for (const c of contacts) {
      const priority = Number(c.priority) as 1 | 2 | 3;
      const name = String(c.name || `SOS ${priority}`).trim();
      const digits = normalizeSosPhone(c.phone_number);

      let cc = "";
      let pn = digits;
      if (DEFAULT_COUNTRY_CODE && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
        cc = DEFAULT_COUNTRY_CODE;
        pn = digits.substring(DEFAULT_COUNTRY_CODE.length);
      }

      // If the caller passed an id, UPDATE that row.
      if (c.id && typeof c.id === "string" && c.id.length > 0) {
        const [affected] = await db.EmergencyContact.update(
          { name, phone_number: pn, country_code: cc, priority },
          { where: { id: c.id, device_id: device.id } }
        );
        if (affected === 0) {
          return errorMessage(
            res,
            `Contact id ${c.id} not found for this device`
          );
        }
        const updated = await db.EmergencyContact.findByPk(c.id);
        dbResults.push({
          id: updated!.id,
          created: false,
          priority: updated!.priority!,
          name: updated!.name,
          phone_number: updated!.phone_number,
          country_code: updated!.country_code,
        });
        continue;
      }

      // No id -> upsert by (device_id, priority).
      const [row, created] = await db.EmergencyContact.findOrCreate({
        where: { device_id: device.id, priority },
        defaults: {
          device_id: device.id,
          priority,
          name,
          phone_number: pn,
          country_code: cc,
        },
      });
      if (!created) {
        row.name = name;
        row.phone_number = pn;
        row.country_code = cc;
        await row.save();
      }
      dbResults.push({
        id: row.id,
        created,
        priority: row.priority!,
        name: row.name,
        phone_number: row.phone_number,
        country_code: row.country_code,
      });
    }

    // Re-sync ALL stored contacts to the watch (in priority order).
    const sync = await syncSosNumbersToDevice(device.id, device.serial_number);

    return successMessage(res, "Emergency contacts saved successfully", {
      device: {
        id: device.id,
        serial_number: device.serial_number,
        device_name: device.device_name,
      },
      db_results: dbResults,
      sync,
      command_message: sync.online
        ? `Stored ${dbResults.length} contact(s) in DB and pushed ${sync.wire_results.length} SOS slot(s) (SOS1..SOS${sync.wire_results.length}) to the device, ordered by priority.`
        : "Contacts saved in DB. Device is offline — slots will sync on next reconnect.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("saveEmergencyContacts error:", err);
    return errorMessage(res, "Error saving emergency contacts");
  }
}

// ─────────────────────────────────────────────────────────────
// Phonebook (PHBX) — up to 30 contacts on the watch
//
// Per spec, the PHBX name field uses "Unicode coding". Different
// firmware builds interpret that differently:
//
//   1. "hex"  — each Unicode codepoint as 4 hex digits BE
//               ("Mom" -> "4d006f006d00"). This is the original
//               behaviour and works on most firmwares (as long as the
//               LEN below is computed from the encoded content).
//   2. "utf8" — raw UTF-8 bytes. Some firmwares decode the payload
//               directly as UTF-8.
//
// The encoding mode is read from PHBX_NAME_ENCODING (default "hex").
// The same helper is used by tcpServer.sendPhonebookCommand() so the
// protocol string returned here matches what actually went on the wire.
//
// LEN is the UTF-8 byte length of the content (not the JS character
// count) so that multi-byte names like "अмм" don't silently get LEN
// wrong.
// ─────────────────────────────────────────────────────────────

const PHBX_NAME_ENCODING = (
  process.env.PHBX_NAME_ENCODING || "hex"
).toLowerCase();

const encodePhonebookNameForPreview = (str: string): string => {
  if (PHBX_NAME_ENCODING === "utf8") return str;
  let hex = "";
  for (const ch of str) {
    hex += ch.charCodeAt(0).toString(16).padStart(4, "0");
  }
  return hex;
};

const buildPhonebookProtocolString = (
  serialNumber: string,
  index: number,
  name: string,
  number: string,
  photo: string
): string => {
  const cleanName = (name || "").replace(/[,\[\]\r\n]/g, " ").trim();
  const encodedName = encodePhonebookNameForPreview(cleanName);
  const content = `PHBX,${index},${encodedName},${number},${photo}`;
  // UTF-8 byte length (not JS char count) — critical for non-ASCII names.
  const length = Buffer.byteLength(content, "utf8")
    .toString(16)
    .padStart(4, "0");
  return `[3G*${serialNumber}*${length}*${content}]`;
};

/**
 * Push the watch's phonebook (PHBX command).
 *
 * Request body:
 *   {
 *     "serial_number": "7893267563",
 *     "contacts": [
 *       { "index": 1, "name": "Mom",    "number": "9691905903" },
 *       { "index": 2, "name": "Dad",    "number": "9510589322" },
 *       { "index": 3, "name": "Sister", "number": "9587374638" }
 *     ]
 *   }
 *
 * Per spec:
 *   - Up to 30 contacts, slot indices 1..30.
 *   - Each is sent as one PHBX packet:
 *       [3G*<id>*LEN*PHBX,<index>,<name>,<number>,<photo>]
 *   - Photo data is optional (empty string for now).
 *   - Device replies with [3G*<id>*0002*PHBX,<status>] (1=ok, 0=fail).
 *
 * Numbers are auto-prefixed with the default country code (91 for
 * India) if they're 10 digits and a country code isn't already present.
 */
async function setPhonebook(req: Request, res: Response, next: NextFunction) {
  try {
    const { serial_number, contacts } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return errorMessage(res, "contacts[] is required (1-30 entries)");
    }
    if (contacts.length > 30) {
      return errorMessage(res, "Maximum 30 phonebook contacts allowed");
    }

    // Indices must be 1..30 and unique across the batch.
    const indices = contacts.map((c: any) => Number(c.index));
    if (indices.some((i: number) => !Number.isInteger(i) || i < 1 || i > 30)) {
      return errorMessage(res, "Each contact.index must be an integer 1..30");
    }
    if (new Set(indices).size !== indices.length) {
      return errorMessage(res, "index values must be unique (1..30)");
    }

    // Look up the device
    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }
    if (!device.serial_number) {
      return errorMessage(
        res,
        `Device ${device.id} has no serial_number, cannot push phonebook`
      );
    }

    // Verify the device is online
    const tcpClient = tcpServer.getDevice(device.serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    // Sort by index ASC so we always push slot 1 first, 2 second, etc.
    const sorted = [...contacts].sort(
      (a, b) => Number(a.index) - Number(b.index)
    );

    const wireResults: Array<{
      index: number;
      name: string;
      number: string;
      digits: string;
      sent: boolean;
      protocol: string;
    }> = [];

    let allSent = true;

    for (const c of sorted) {
      const index = Number(c.index);
      const name = String(c.name || `Contact ${index}`).trim();
      const digits = normalizeSosPhone(c.number);
      const photo = c.photo || "";

      if (!digits) {
        allSent = false;
        wireResults.push({
          index,
          name,
          number: c.number,
          digits: "",
          sent: false,
          protocol: "",
        });
        continue;
      }

      const sent = tcpServer.sendPhonebookCommand(
        device.serial_number,
        index,
        name,
        digits,
        photo
      );
      if (!sent) allSent = false;

      const protocol = buildPhonebookProtocolString(
        device.serial_number,
        index,
        name,
        digits,
        photo
      );

      wireResults.push({
        index,
        name,
        number: digits,
        digits,
        sent,
        protocol,
      });

      Logging.info(
        `PHBX slot ${index} -> device ${device.serial_number}: ${protocol}`
      );
    }

    if (!allSent) {
      return errorMessage(
        res,
        "One or more PHBX entries failed to send. Device may be disconnected.",
        { wire_results: wireResults }
      );
    }

    return successMessage(
      res,
      `Phonebook pushed successfully (${wireResults.length} entries)`,
      {
        serial_number: device.serial_number,
        device_id: device.id,
        device_name: device.device_name,
        command_sent: true,
        count: wireResults.length,
        wire_results: wireResults,
        command_message: `Sent ${wireResults.length} phonebook entry(ies) to the device via PHBX. The watch will reply with [3G*<id>*0002*PHBX,<status>] for each (1=success, 0=failure).`,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (err) {
    console.error("setPhonebook error:", err);
    return errorMessage(res, "Error pushing phonebook to device");
  }
}

// ─────────────────────────────────────────────────────────────
// Clear a single phonebook slot on the watch
//
// Per the latest protocol spec, this firmware clears a slot by sending
// PHBX again at the same slot index with EMPTY name AND EMPTY number
// fields. There is no separate DPHBX command word on this firmware.
// The matching is by SLOT INDEX (1..30), not by phone number.
//
//   Server → Watch : [3G*<id>*LEN*PHBX,<index>,,,]
//                     ^     ^    ^
//                     |     |    three commas in a row after the index
//                     |     slot 1..30
//                     PHBX command word
//
//   Layout: PHBX command word, slot index, EMPTY name, EMPTY number,
//           EMPTY photo. All three fields after the index are blank.
//
//   Watch → Server : [3G*<id>*0004*PHBX]               (ack = success)
//                    [3G*<id>*0006*PHBX,0]             (failure)
//                    [3G*<id>*0006*PHBX,1]             (explicit success)
//
// IMPORTANT: We confirmed by testing that this firmware DOES NOT clear
// the number unless the number field is also empty. Sending the old
// number along (PHBX,<index>,,<oldnumber>,) wipes the name but leaves
// the old number in the slot. So we always send a completely empty
// contact record.
//
// Request body:
//   {
//     "serial_number": "7893267563",
//     "index":         1,                        // required, 1..30
//     "number":        "919691905903"            // optional, but accepted
//   }
//
// We don't persist phonebook rows in DB — it lives only on the watch.
// If you later add a `DevicePhonebook` table, delete the matching row
// here too.
// ─────────────────────────────────────────────────────────────

async function deletePhonebookContact(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { serial_number, index, number } = req.body;

    if (!serial_number) {
      return errorMessage(res, "serial_number is required");
    }
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > 30
    ) {
      return errorMessage(res, "index is required (integer 1..30)");
    }

    // We accept `number` for caller convenience but do NOT put it on
    // the wire (this firmware keeps the previous number when number is
    // non-empty — see file header). Normalize for the response only.
    const digits = number ? normalizeSosPhone(String(number)) : "";

    const device = await db.Device.findOne({ where: { serial_number } });
    if (!device) {
      return errorMessage(
        res,
        `Device with serial_number '${serial_number}' not found`
      );
    }
    if (!device.serial_number) {
      return errorMessage(
        res,
        `Device ${device.id} has no serial_number, cannot clear phonebook slot`
      );
    }

    const tcpClient = tcpServer.getDevice(device.serial_number);
    if (!tcpClient) {
      return errorMessage(
        res,
        "Device is offline. Please ensure the device is connected."
      );
    }

    const sent = tcpServer.sendDeletePhonebookCommand(
      device.serial_number,
      index,
      digits
    );

    if (!sent) {
      return errorMessage(
        res,
        "Failed to clear PHBX slot. Device may be disconnected."
      );
    }

    // Build the protocol string for the response (same as what was sent).
    // PHBX,<index>,,, — all three fields after index are empty.
    const content = `PHBX,${index},,,`;
    const length = Buffer.byteLength(content, "utf8")
      .toString(16)
      .padStart(4, "0");
    const protocol = `[3G*${device.serial_number}*${length}*${content}]`;

    Logging.info(
      `PHBX clear slot #${index} (was number=${digits || "<empty>"}) ` +
        `-> device ${device.serial_number}: ${protocol}`
    );

    return successMessage(res, "Phonebook slot cleared successfully", {
      serial_number: device.serial_number,
      device_id: device.id,
      device_name: device.device_name,
      index,
      number: digits,
      command_sent: true,
      protocol,
      command_message:
        `Sent PHBX clear-slot command for index #${index} ` +
        `(${digits ? "was: " + digits : "no number"}) ` +
        `on device ${device.serial_number}. The wire packet is ` +
        `[3G*<id>*LEN*PHBX,<index>,,,] — BOTH name AND number fields are empty, ` +
        `so the firmware wipes the whole contact record. Watch will reply with ` +
        `[3G*<id>*0004*PHBX] (bare ack = success) or ` +
        `[3G*<id>*0006*PHBX,0] (failure).`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("deletePhonebookContact error:", err);
    return errorMessage(res, "Error clearing phonebook slot");
  }
}

export {
  createOrUpdateEmergencyContact,
  saveEmergencyContacts,
  deleteEmergencyContact,
  allEmergencyContact,
  getEmergencyContact,
  setPhonebook,
  deletePhonebookContact,
  setSosNumbers, // legacy wrapper, delegates to createOrUpdateEmergencyContact
  // Internal helpers exported only for tests / advanced callers:
  syncSosNumbersToDevice,
  normalizeSosPhone,
  buildSosProtocolString,
  buildPhonebookProtocolString,
};

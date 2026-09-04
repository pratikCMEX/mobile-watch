"use strict";

/**
 * Migration: create the `DeviceSilenceTimes` table, add the
 * indexes used by every query in the codebase, and auto-seed
 * 4 default rows (slot_index 1..4, all disabled) for every
 * existing device.
 *
 * One single migration so apply / rollback is atomic.
 *
 *   ── Table design ──────────────────────────────────────────
 *   One row per (device_id, slot_index) — 1..4 slots per device.
 *   Each row carries its own `is_enabled` flag so the UI can
 *   toggle / query individual slots.
 *
 *   Wire spec the table mirrors:
 *     Server send : [3G*<id>*<LEN>*SILENCETIME2,s1,s2,s3,s4]
 *     Device reply: [3G*<id>*<LEN>*<MODE>]   (bare ack = success)
 *
 *   ── Indexes ───────────────────────────────────────────────
 *   1. UNIQUE (device_id, slot_index) — upsert / existence check
 *   2. (device_id, is_enabled)        — enabled-slot counts
 *   3. (device_id)                   — findAll({where:{device_id}}),
 *                                      bulk UPDATE by device_id,
 *                                      ensureDefaultRowsForDevice check
 *
 *   ── Auto-seed ─────────────────────────────────────────────
 *   After the table is created, walks every row in `Devices` and
 *   inserts 4 default slot rows per device, all `is_enabled=false`.
 *   Uses dialect-safe "skip duplicates" so re-running this migration
 *   on a database that already has rows is a no-op.
 *
 *   ── Idempotency / self-healing ────────────────────────────
 *   Every step (createTable, addIndex, bulkInsert) checks whether
 *   the target object already exists and skips if so.  This makes
 *   the migration safe to re-run after a previous failure that
 *   left the table / indexes partially in place.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    // Generate UUIDs in JS so the column-level `defaultValue:
    // Sequelize.UUIDV4` (which the pg driver does NOT translate into
    // a SQL DEFAULT clause) is never relied on.  Node ≥14.17
    // provides `crypto.randomUUID()` natively.
    const crypto = require("crypto");
    const newUuid = () => crypto.randomUUID();

    // Helper: does a table already exist in the current schema?
    const tableExists = async (tableName) => {
      try {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT to_regclass('${tableName}') AS regclass;`
        );
        if (rows && rows[0] && rows[0].regclass) return true;
      } catch (_) {
        // to_regclass is pg-specific; fall through to the
        // INFORMATION_SCHEMA check below.
      }
      try {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT 1 FROM information_schema.tables ` +
            `WHERE table_schema = current_schema() ` +
            `  AND table_name = '${tableName}' LIMIT 1;`
        );
        return Array.isArray(rows) && rows.length > 0;
      } catch (_) {
        return false;
      }
    };

    // Helper: does an index on a given table already exist?
    const indexExists = async (tableName, indexName) => {
      try {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT 1 FROM pg_indexes ` +
            `WHERE schemaname = current_schema() ` +
            `  AND tablename = '${tableName}' ` +
            `  AND indexname = '${indexName}' LIMIT 1;`
        );
        if (Array.isArray(rows) && rows.length > 0) return true;
      } catch (_) {
        // pg_indexes is pg-specific; fall through to the
        // generic check below.
      }
      try {
        const [rows] = await queryInterface.sequelize.query(
          `SELECT 1 FROM information_schema.statistics ` +
            `WHERE table_schema = current_schema() ` +
            `  AND table_name = '${tableName}' ` +
            `  AND index_name = '${indexName}' LIMIT 1;`
        );
        return Array.isArray(rows) && rows.length > 0;
      } catch (_) {
        return false;
      }
    };

    // ───────────────────────────────────────────────────────
    // 1. CREATE TABLE  (skip if it already exists)
    // ───────────────────────────────────────────────────────
    if (!(await tableExists("DeviceSilenceTimes"))) {
      await queryInterface.createTable("DeviceSilenceTimes", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          allowNull: false,
          primaryKey: true,
        },

        device_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: "Devices", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },

        // "SILENCETIME" (daily) or "SILENCETIME2" (per weekday).
        mode: {
          type: Sequelize.ENUM("SILENCETIME", "SILENCETIME2"),
          allowNull: false,
          defaultValue: "SILENCETIME",
        },

        // 1..4 — the on-wire slot position.
        slot_index: {
          type: Sequelize.INTEGER,
          allowNull: false,
          validate: { min: 1, max: 4 },
        },

        // "HH:MM-HH:MM" (24h, dash between start and end). NULL when
        // the slot is empty / disabled.
        time_section: {
          type: Sequelize.STRING(11), // e.g. "21:10-07:30" = 11 chars
          allowNull: true,
          defaultValue: null,
        },

        // 7-char '0'/'1' day mask (Sun..Sat). NULL for classic SILENCETIME.
        weekdays_mask: {
          type: Sequelize.STRING(7),
          allowNull: true,
          defaultValue: null,
        },

        // Whether this slot is part of the active schedule.
        is_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },

        // Last wire-protocol packet that was sent to the watch for
        // this slot. Useful for diagnostics / resend operations.
        last_command_protocol: {
          type: Sequelize.TEXT,
          allowNull: true,
          defaultValue: null,
        },

        // Last time the device ACKed a SILENCETIME(/2) reply that
        // affected this slot.
        last_acked_at: {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },

        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });
    }

    // ───────────────────────────────────────────────────────
    // 2. ADD INDEXES  (skip each one that already exists)
    // ───────────────────────────────────────────────────────
    // 1. UNIQUE composite — used by upsert / existence checks.
    if (
      !(await indexExists("DeviceSilenceTimes", "idx_dnd_device_slot_unique"))
    ) {
      await queryInterface.addIndex(
        "DeviceSilenceTimes",
        ["device_id", "slot_index"],
        {
          name: "idx_dnd_device_slot_unique",
          unique: true,
        }
      );
    }

    // 2. (device_id, is_enabled) — used by enabled-slot counting
    //    and "list enabled slots for this device".
    if (!(await indexExists("DeviceSilenceTimes", "idx_dnd_device_enabled"))) {
      await queryInterface.addIndex(
        "DeviceSilenceTimes",
        ["device_id", "is_enabled"],
        { name: "idx_dnd_device_enabled" }
      );
    }

    // 3. (device_id) — explicit prefix index for the
    //    ensureDefaultRowsForDevice existence check, the TCP ACK
    //    handler's bulk UPDATE by device_id, and the GET handler's
    //    findAll({ where:{device_id} }).
    if (!(await indexExists("DeviceSilenceTimes", "idx_dnd_device"))) {
      await queryInterface.addIndex("DeviceSilenceTimes", ["device_id"], {
        name: "idx_dnd_device",
      });
    }

    // ───────────────────────────────────────────────────────
    // 3. AUTO-SEED 4 DEFAULT ROWS PER EXISTING DEVICE
    //    (idempotent — ON CONFLICT / INSERT IGNORE / pre-check
    //     so re-running this migration is a no-op)
    // ───────────────────────────────────────────────────────
    const [devices] = await queryInterface.sequelize.query(
      `SELECT id FROM "Devices";`
    );

    if (Array.isArray(devices) && devices.length > 0) {
      const now = new Date();
      const rows = [];
      for (const d of devices) {
        for (let slot = 1; slot <= 4; slot++) {
          // Always set `id` explicitly via crypto.randomUUID().
          // The column-level `defaultValue: Sequelize.UUIDV4` is
          // declared in the createTable step, but Sequelize's pg
          // dialect does NOT translate that into a SQL DEFAULT
          // clause, so leaving `id` undefined leads to a NOT NULL
          // constraint violation on bulk insert.  Generating the
          // UUIDs in JS avoids that and is consistent with the
          // rest of the codebase (which already uses `uuid` v4 in
          // `app/models/index.ts`).
          rows.push({
            id: newUuid(),
            device_id: d.id,
            mode: "SILENCETIME",
            slot_index: slot,
            time_section: null,
            weekdays_mask: null,
            is_enabled: false,
            last_command_protocol: null,
            last_acked_at: null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (dialect === "postgres") {
        await queryInterface.bulkInsert("DeviceSilenceTimes", rows, {
          ignoreDuplicates: true, // ON CONFLICT DO NOTHING
        });
      } else if (dialect === "mysql" || dialect === "mariadb") {
        await queryInterface.bulkInsert("DeviceSilenceTimes", rows, {
          ignore: true, // INSERT IGNORE
        });
      } else {
        // SQLite / unknown: pre-check each (device_id, slot_index)
        // pair to avoid UNIQUE constraint errors.
        for (const row of rows) {
          const [existing] = await queryInterface.sequelize.query(
            `SELECT id FROM "DeviceSilenceTimes" ` +
              `WHERE device_id = :device_id AND slot_index = :slot_index LIMIT 1;`,
            {
              replacements: {
                device_id: row.device_id,
                slot_index: row.slot_index,
              },
            }
          );
          if (!existing || existing.length === 0) {
            await queryInterface.bulkInsert("DeviceSilenceTimes", [row]);
          }
        }
      }
    }
  },

  async down(queryInterface /*, Sequelize */) {
    // Atomic rollback — drops the whole table.  This also removes
    // every seeded row in one step.
    await queryInterface.dropTable("DeviceSilenceTimes");
  },
};

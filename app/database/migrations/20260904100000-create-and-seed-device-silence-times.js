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
 *   Examples:
 *     [3G*5678901234*0037*SILENCETIME,21:10-7:30,21:10-7:30,
 *                                21:10-7:30,21:10-7:30]
 *     [3G*5678901234*0037*SILENCETIME2,21:10-7:30-0111110,
 *                                 21:10-7:30-0111110,
 *                                 21:10-7:30-0111110,
 *                                 21:10-7:30-0111110]
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
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();

    // ───────────────────────────────────────────────────────
    // 1. CREATE TABLE
    // ───────────────────────────────────────────────────────
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

    // ───────────────────────────────────────────────────────
    // 2. ADD INDEXES
    // ───────────────────────────────────────────────────────

    // 1. UNIQUE composite — used by upsert / existence checks.
    await queryInterface.addIndex(
      "DeviceSilenceTimes",
      ["device_id", "slot_index"],
      {
        name: "idx_dnd_device_slot_unique",
        unique: true,
      }
    );

    // 2. (device_id, is_enabled) — used by enabled-slot counting
    //    and "list enabled slots for this device".
    await queryInterface.addIndex(
      "DeviceSilenceTimes",
      ["device_id", "is_enabled"],
      { name: "idx_dnd_device_enabled" }
    );

    // 3. (device_id) — explicit prefix index for the
    //    ensureDefaultRowsForDevice existence check, the TCP ACK
    //    handler's bulk UPDATE by device_id, and the GET handler's
    //    findAll({ where:{device_id} }).
    await queryInterface.addIndex("DeviceSilenceTimes", ["device_id"], {
      name: "idx_dnd_device",
    });

    // ───────────────────────────────────────────────────────
    // 3. AUTO-SEED 4 DEFAULT ROWS PER EXISTING DEVICE
    // ───────────────────────────────────────────────────────
    const [devices] = await queryInterface.sequelize.query(
      `SELECT id FROM "Devices";`
    );

    if (Array.isArray(devices) && devices.length > 0) {
      const now = new Date();
      const rows = [];
      for (const d of devices) {
        for (let slot = 1; slot <= 4; slot++) {
          // No `id` here — let the DB column default (Sequelize.UUIDV4
          // declared in the createTable step) fill it in.  Passing
          // Sequelize.UUIDV4 as a value (or invoking it without a
          // UUID library) raises "Invalid value UUIDV4 {}".
          rows.push({
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

"use strict";

/**
 * Creates the `DeviceSilenceTimes` table — server-side mirror of the
 * watch's Do-Not-Disturb / class-mode configuration (SILENCETIME /
 * SILENCETIME2 wire command).
 *
 *   - One row per device.  Unique constraint on `device_id` so the
 *     server can safely upsert on every `/do_not_disturb` call.
 *   - `mode` records which protocol variant was used:
 *       * "SILENCETIME"  → daily, slots 1..4 carry "HH:MM-HH:MM"
 *       * "SILENCETIME2" → per-weekday, slots 1..4 carry
 *                          "HH:MM-HH:MM-DDDDDDD"
 *   - Up to four time slots, each stored as the full on-wire string.
 *     Empty string means "no period / wipe the slot on the device".
 *     Stored as TEXT so PostgreSQL/SQLite/MySQL all behave identically
 *     and so we can hold the longest possible slot string
 *     (e.g. "21:10-07:30-0111110" = 19 chars).
 *   - `weekdays` is an ARRAY of up to four 7-char '0'/'1' masks
 *     (Sun..Sat, 0=off, 1=on).  NULL for classic SILENCETIME mode.
 *     Stored as `Sequelize.ARRAY(Sequelize.STRING(7))` — works on
 *     PostgreSQL, on SQLite the array serialises to JSON (still
 *     readable from the API).
 *
 * Mirrors the wire spec:
 *   Server send : [3G*<id>*<LEN>*SILENCETIME2,s1,s2,s3,s4]
 *   Device reply: [3G*<id>*<LEN>*<MODE>]   (bare ack = success)
 *
 *   Example:
 *     [3G*5678901234*0037*SILENCETIME,21:10-7:30,21:10-7:30,
 *                              21:10-7:30,21:10-7:30]
 *     [3G*5678901234*0037*SILENCETIME2,21:10-7:30-0111110,
 *                               21:10-7:30-0111110,
 *                               21:10-7:30-0111110,
 *                               21:10-7:30-0111110]
 */
module.exports = {
  async up(queryInterface, Sequelize) {
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

      // "SILENCETIME" (daily) or "SILENCETIME2" (per weekday)
      mode: {
        type: Sequelize.ENUM("SILENCETIME", "SILENCETIME2"),
        allowNull: false,
        defaultValue: "SILENCETIME",
      },

      slot_1: {
        type: Sequelize.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_2: {
        type: Sequelize.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_3: {
        type: Sequelize.STRING(32),
        allowNull: true,
        defaultValue: null,
      },
      slot_4: {
        type: Sequelize.STRING(32),
        allowNull: true,
        defaultValue: null,
      },

      // 7-char "0/1" day masks (Sun..Sat), one per slot.
      // NULL for classic SILENCETIME mode.
      weekdays: {
        type: Sequelize.ARRAY(Sequelize.STRING(7)),
        allowNull: true,
        defaultValue: null,
      },

      // Last wire-protocol packet that was sent to the watch, useful
      // for diagnostics & resend operations.
      last_command_protocol: {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      },

      // Last time the device ACKed a SILENCETIME / SILENCETIME2 reply.
      last_acked_at: {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      },

      // Whether the device currently has DND active at all (either
      // mode, with at least one slot filled).
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    // One Do-Not-Disturb config per device.
    await queryInterface.addIndex("DeviceSilenceTimes", ["device_id"], {
      name: "devicesilencetimes_device_id_unique",
      unique: true,
    });

    // Helpful for "list every DND config" / admin queries.
    await queryInterface.addIndex("DeviceSilenceTimes", ["device_id"], {
      name: "devicesilencetimes_device_id_idx",
    });
  },

  async down(queryInterface /*, Sequelize */) {
    await queryInterface.dropTable("DeviceSilenceTimes");
  },
};

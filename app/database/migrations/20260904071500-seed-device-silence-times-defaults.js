"use strict";

/**
 * Creates the `DeviceSilenceTimes` table — server-side mirror of the
 * watch's Do-Not-Disturb / class-mode configuration (SILENCETIME /
 * SILENCETIME2 wire command).
 *
 * Design: one row per (device_id, slot_index), where slot_index is
 * 1..4 (the four on-wire positions in the protocol).  Each row carries
 * its own `is_enabled` flag so the UI can toggle / query individual
 * slots.
 *
 * Wire spec:
 *   Server send : [3G*<id>*<LEN>*SILENCETIME2,s1,s2,s3,s4]
 *   Device reply: [3G*<id>*<LEN>*<MODE>]   (bare ack = success)
 *
 *   Examples:
 *     [3G*5678901234*0037*SILENCETIME,21:10-7:30,21:10-7:30,
 *                              21:10-7:30,21:10-7:30]
 *     [3G*5678901234*0037*SILENCETIME2,21:10-7:30-0111110,
 *                               21:10-7:30-0111110,
 *                               21:10-7:30-0111110,
 *                               21:10-7:30-0111110]
 *
 * Slot payload storage:
 *   - `time_section`    : "HH:MM-HH:MM"           (start–end, 24h)
 *   - `weekdays_mask`   : 7-char '0'/'1' string   (Sun..Sat). NULL when
 *                         mode === 'SILENCETIME'.
 *   - `is_enabled`      : BOOLEAN, mirrors whether this slot is part
 *                         of the active schedule. Slots with empty
 *                         `time_section` are stored with is_enabled=false
 *                         so the count of "active" slots is queryable
 *                         as `SELECT COUNT(*) WHERE device_id=? AND is_enabled=true`.
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

      // 1..4 — the on-wire slot position.
      slot_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 4 },
      },

      // "HH:MM-HH:MM" (24h, dash between start and end).
      // NULL when the slot is empty / disabled.
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
        defaultValue: true,
      },

      // Last wire-protocol packet that was sent to the watch for this
      // slot. Useful for diagnostics / resend operations.
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

    // One row per (device, slot_index).
    await queryInterface.addIndex(
      "DeviceSilenceTimes",
      ["device_id", "slot_index"],
      {
        name: "devicesilencetimes_device_id_slot_index_unique",
        unique: true,
      }
    );

    // Helpful for "give me every enabled slot on this device".
    await queryInterface.addIndex(
      "DeviceSilenceTimes",
      ["device_id", "is_enabled"],
      { name: "devicesilencetimes_device_id_is_enabled_idx" }
    );

    // Helpful for "give me every slot on this device".
    await queryInterface.addIndex(
      "DeviceSilenceTimes",
      ["device_id", "slot_index"],
      { name: "devicesilencetimes_device_id_slot_index_idx" }
    );
  },

  async down(queryInterface /*, Sequelize */) {
    await queryInterface.dropTable("DeviceSilenceTimes");
  },
};

"use strict";

/**
 * Creates the `DeviceAutoAnswers` table — server-side mirror of the
 * watch's auto-answer (ACALL) whitelist (slots 1..3 per device).
 *
 *   - One row per (device_id, slot_index). Unique composite index so the
 *     server can safely upsert without race conditions.
 *   - slot_index is 1..3 (the firmware caps ACALL to 3 numbers).
 *   - phone_number is the full E.164-style digits string (country code
 *     included), e.g. "919999999999".
 *   - country_code is split out for analytics / display layers.
 *   - name is optional (e.g. "Dad", "Mom") so the mobile app can
 *     show a friendly list of whitelisted numbers.
 *
 * Mirrors the existing `DevicePhonebooks` table (PHBX phonebook, 1..30
 * slots) but is scoped to the auto-answer feature because:
 *   - PHBX is a generic phonebook the user dials from.
 *   - ACALL is the auto-answer whitelist — only these numbers are
 *     allowed to bypass the watch's manual-answer screen.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DeviceAutoAnswers", {
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
      slot_index: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      country_code: {
        type: Sequelize.STRING(10),
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

    // One row per (device, slot) — supports upsert by both columns.
    await queryInterface.addIndex(
      "DeviceAutoAnswers",
      ["device_id", "slot_index"],
      {
        name: "deviceautoanswers_device_id_slot_index_unique",
        unique: true,
      }
    );

    // Helpful secondary index for "give me all slots for a device".
    await queryInterface.addIndex(
      "DeviceAutoAnswers",
      ["device_id", "slot_index"],
      { name: "deviceautoanswers_device_id_slot_index_idx" }
    );
  },

  async down(queryInterface /*, Sequelize */) {
    await queryInterface.dropTable("DeviceAutoAnswers");
  },
};

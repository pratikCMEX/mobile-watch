"use strict";

/**
 * Creates the `DevicePhonebooks` table — server-side mirror of the
 * watch's PHBX phonebook (slots 1..30 per device).
 *
 *   - One row per (device_id, slot_index). Unique composite index so the
 *     server can safely upsert without race conditions.
 *   - `name` is hex-encoded on the wire (UCS-2 BE), but stored as the
 *     decoded UTF-8 string here so listing endpoints return readable
 *     names.
 *   - `phone_number` is digits-only on the wire (after country-code
 *     prefixing) and stored as digits-only here. Country code is split
 *     into its own column for analytics.
 *   - `photo` is an arbitrary opaque blob (hex/base64) used when the
 *     firmware supports avatars. Empty string = no photo.
 *
 * Created alongside the existing `EmergencyContacts` table (which holds
 * the SOS1/SOS2/SOS3 slots) because PHBX and SOS are different watch
 * features — same numbering scheme, but the SOS slots are limited to
 * 1..3 with priority semantics, while PHBX slots go up to 30.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("DevicePhonebooks", {
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
        validate: { min: 1, max: 30 },
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
      phone_number: {
        type: Sequelize.STRING(15),
        allowNull: true,
        defaultValue: null,
      },
      country_code: {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: null,
      },
      photo: {
        // Opaque blob (hex/base64). TEXT so we don't have to worry about
        // length on Postgres/SQLite/MySQL.
        type: Sequelize.TEXT,
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
      "DevicePhonebooks",
      ["device_id", "slot_index"],
      {
        name: "devicephonebooks_device_id_slot_index_unique",
        unique: true,
      }
    );

    // Helpful secondary index for "give me all slots for a device".
    await queryInterface.addIndex(
      "DevicePhonebooks",
      ["device_id", "slot_index"],
      { name: "devicephonebooks_device_id_slot_index_idx" }
    );
  },

  async down(queryInterface /*, Sequelize */) {
    await queryInterface.dropTable("DevicePhonebooks");
  },
};

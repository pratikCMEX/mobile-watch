"use strict";

/**
 * Add a `priority` column to EmergencyContacts so each device can have
 * up to 3 SOS slots (priority 1/2/3 corresponding to the watch's
 * SOS1/SOS2/SOS3 commands).
 *
 * Unique constraint on (device_id, priority) prevents duplicate slots.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("EmergencyContacts", "priority", {
      type: Sequelize.INTEGER,
      allowNull: true, // null for legacy rows / non-SOS contacts
      defaultValue: null,
      validate: {
        min: 1,
        max: 3,
      },
    });

    await queryInterface.addIndex(
      "EmergencyContacts",
      ["device_id", "priority"],
      {
        name: "emergency_contacts_device_priority_unique",
        unique: true,
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex(
      "EmergencyContacts",
      "emergency_contacts_device_priority_unique"
    );
    await queryInterface.removeColumn("EmergencyContacts", "priority");
  },
};

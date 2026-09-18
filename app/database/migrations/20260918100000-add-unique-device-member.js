"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // A user must not appear twice in the DeviceMembers table for the
    // same device, and a device must not list the same user twice.
    // This makes DeviceMembers a true many-to-many join between Users
    // and Devices (one watch ↔ many users, one user ↔ many watches).
    await queryInterface.addConstraint("DeviceMembers", {
      fields: ["device_id", "user_id"],
      type: "unique",
      name: "device_members_device_user_unique",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "DeviceMembers",
      "device_members_device_user_unique"
    );
  },
};
